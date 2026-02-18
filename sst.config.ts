// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

const WORKER_BASE_NAME = "TrinoDocWorker";

const getName = (...args: string[]) => [WORKER_BASE_NAME, ...args].join("_");

// VPC da Trino (compartilhada com o TrinoCore — criada manualmente na AWS)
const vpcId = "vpc-0ab2766d24f135104";
const publicSubnets = ["subnet-0e48564b4ebf17019", "subnet-0202cc44fb2076fa3", "subnet-03d3af5f8e16ac6ad"];
const privateSubnets = ["subnet-0d13602f7ce20b220", "subnet-0b3ded358aa66ad2e", "subnet-09a398774aabf81d4"];
const vpsSecurityGroup = "sg-008bd8b15d6fd793e";

/**
 * Configurações de ambiente:
 *
 * production / stage
 *   - Redis compartilhado com o TrinoCore (BullMQ)
 *     Configurar via: sst secret set TrinoDocWorker_RedisPassword "<password>"
 *   - ECS no cluster do TrinoCore (sem load balancer — worker puro)
 *   - S3 próprio para os documentos gerados
 *   - Dentro da VPC da Trino
 *
 * outros (development, dev)
 *   - redis local (docker-compose)
 *   - sem ECS
 */

// Endpoints do ElastiCache Redis (cluster mode, TLS obrigatório)
const REDIS_HOSTS = {
	production: "clustercfg.product-trinocoreredisv2cluster-fbathhrz.xocefy.use1.cache.amazonaws.com",
	stage: "clustercfg.st-trinocoreredisv2stagecluster-snadbukh.xocefy.use1.cache.amazonaws.com",
};

const protectedStages = ["production", "stage"];

// ARN do cluster ECS do TrinoCore (reutilizado pelo worker para economizar recursos)
const TRINO_CORE_CLUSTER_ARN = {
	production: "arn:aws:ecs:us-east-1:841162676072:cluster/trino-core-production-TrinoCoreClusterCluster-bchmhrtf",
	stage: "arn:aws:ecs:us-east-1:841162676072:cluster/trino-core-stage-TrinoCoreClusterCluster-cofrkcwx",
};

export default $config({
	app(input) {
		return {
			name: "trino-doc-worker",
			removal: protectedStages.includes(input?.stage) ? "retain" : "remove",
			home: "aws",
			providers: {
				aws: {
					profile: "trino",
				},
			},
		};
	},
	async run() {
		const { default: process } = await import("node:process");
		const prodStages = ["production", "prod"];
		const stagingStages = ["stage"];
		const isProd = prodStages.includes($app.stage.toLowerCase());
		const isStaging = stagingStages.includes($app.stage.toLowerCase());
		const isCloud = isProd || isStaging;

		// * ============ Redis (compartilhado com o TrinoCore) ============
		// ! O worker consome filas BullMQ do mesmo Redis onde o TrinoCore publica
		// ! Configurar antes do deploy:
		// !   sst secret set TrinoDocWorker_RedisPassword "<password>"
		const redisPasswordSecret = new sst.Secret(getName("RedisPassword"));

		const REDIS_HOST = isProd ? REDIS_HOSTS.production : isStaging ? REDIS_HOSTS.stage : "localhost";

		// * ============ S3 (bucket compartilhado com o TrinoCore) ============
		// ! O nome físico do bucket é publicado pelo TrinoCore via SSM
		// ! Certifique-se de que o TrinoCore já foi deployado no mesmo stage antes de deployar o worker
		const { value: trinoBucketName } = await aws.ssm.getParameter({
			name: `/trino-core/${$app.stage}/s3-bucket-name`,
		});
		const bucket = sst.aws.Bucket.get(getName("Bucket"), trinoBucketName);

		// * ============ ECS Cluster (reutiliza o cluster do TrinoCore) ============
		const clusterArn = isProd ? TRINO_CORE_CLUSTER_ARN.production : TRINO_CORE_CLUSTER_ARN.stage;

		const cluster = sst.aws.Cluster.get(getName("Cluster"), {
			id: clusterArn,
			vpc: {
				id: vpcId,
				securityGroups: [vpsSecurityGroup],
				loadBalancerSubnets: [...publicSubnets],
				containerSubnets: [...publicSubnets, ...privateSubnets],
			},
		});

		// * ============ Worker image ============
		let image: string | undefined;
		let version = process.env.APP_VERSION ?? "not-defined";

		if (isStaging && process.env.IMG_REPO_STAGING && process.env.IMG_VERSION_STAGING) {
			image = `${process.env.IMG_REPO_STAGING}:${process.env.IMG_VERSION_STAGING}`;
			version = process.env.IMG_VERSION_STAGING ?? "not-defined";
		}

		if (isProd && process.env.IMG_REPO_PROD && process.env.IMG_VERSION_PROD) {
			image = `${process.env.IMG_REPO_PROD}:${process.env.IMG_VERSION_PROD}`;
			version = process.env.IMG_VERSION_PROD ?? "not-defined";
		}

		// * ============ Worker Service (sem load balancer — consumer puro) ============
		const workerName = isProd ? getName("Service") : getName("Service_STAGE");
		const worker = new sst.aws.Service(workerName, {
			image,
			cluster,
			link: [bucket, redisPasswordSecret],
			environment: {
				NODE_ENV: isCloud ? "production" : "development",
				STAGE: $app.stage,
				APP_VERSION: version,
				REDIS_HOST,
				REDIS_PORT: "6379",
				REDIS_TLS: isCloud ? "true" : "false",
				...(isCloud && { REDIS_PASSWORD: redisPasswordSecret.value }),
				S3_BUCKET_NAME: bucket.name,
				AWS_REGION: "us-east-1",
				PDF_GENERATION_QUEUE: "pdf-generation",
				LOCAL_CHROMIUM_PATH: isCloud ? "" : (process.env?.LOCAL_CHROMIUM_PATH ?? ""),
			},
			scaling: {
				min: 1,
				max: isProd ? 3 : 1,
				cpuUtilization: 70,
				memoryUtilization: 70,
			},
			capacity: !isProd ? "spot" : undefined,
			dev: {
				command: "deno task dev",
			},
			wait: isProd,
			transform: {
				service(args) {
					args.networkConfiguration = {
						...args.networkConfiguration,
						assignPublicIp: true,
						subnets: [...publicSubnets, ...privateSubnets],
					};
				},
			},
		});

		return {
			worker: worker.urn,
			isProd,
			image: image ?? "image not defined",
			redis: REDIS_HOST,
			version,
			bucketName: bucket.name,
			bucketArn: bucket.arn,
		};
	},
});
