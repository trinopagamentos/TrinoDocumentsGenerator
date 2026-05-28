// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

import { execSync } from "node:child_process";
import process from "node:process";

const WORKER_BASE_NAME = "TrinoDocWorker";

const getName = (...args: string[]) => [WORKER_BASE_NAME, ...args].join("_");

// VPC da Trino (compartilhada com o TrinoCore — criada manualmente na AWS)
const vpcId = "vpc-0ab2766d24f135104";
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

// Descobre o configuration endpoint do ElastiCache do TrinoCore via tags SST.
// Evita endpoints hardcoded que ficam obsoletos quando o cluster é recriado.
function lookupRedisHost(stage: string): string {
	const arns: string[] = JSON.parse(
		execSync(
			`aws resourcegroupstaggingapi get-resources --profile trino --region us-east-1 ` +
				`--resource-type-filters elasticache:replicationgroup ` +
				`--tag-filters Key=sst:app,Values=trino-core Key=sst:stage,Values=${stage} ` +
				`--query 'ResourceTagMappingList[].ResourceARN' --output json`,
			{ encoding: "utf-8" },
		),
	);

	if (arns.length === 0) throw new Error(`Redis cluster not found for stage: ${stage}`);

	const groupId = arns[0].split(":replicationgroup:")[1];

	const address: string = JSON.parse(
		execSync(
			`aws elasticache describe-replication-groups --profile trino --region us-east-1 ` +
				`--replication-group-id ${groupId} ` +
				`--query 'ReplicationGroups[0].ConfigurationEndpoint.Address' --output json`,
			{ encoding: "utf-8" },
		),
	);

	return address;
}

type StageConfig = {
	isProtected: boolean;
	isProd: boolean;
	isCloud: boolean;
	publicSubnets: string[];
	privateSubnets: string[];
	clusterArn: string;
	imageRepo?: string;
	imageVersion?: string;
	minTasks: number;
	maxTasks: number;
	cpuUtilization: number;
	memoryUtilization: number;
	useSpotCapacity: boolean;
};

const stageConfigs: Record<string, StageConfig> = {
	production: {
		isProtected: true,
		isProd: true,
		isCloud: true,
		publicSubnets: ["subnet-0202cc44fb2076fa3", "subnet-0e48564b4ebf17019", "subnet-03d3af5f8e16ac6ad"],
		privateSubnets: ["subnet-09a398774aabf81d4", "subnet-0d13602f7ce20b220"],
		clusterArn: "arn:aws:ecs:us-east-1:841162676072:cluster/trino-core-production-TrinoCoreClusterCluster-bchmhrtf",
		imageRepo: process.env.IMG_REPO_PROD,
		imageVersion: process.env.IMG_VERSION_PROD,
		minTasks: 1,
		maxTasks: 3,
		cpuUtilization: 70,
		memoryUtilization: 70,
		useSpotCapacity: false,
	},
	stage: {
		isProtected: true,
		isProd: false,
		isCloud: true,
		publicSubnets: ["subnet-0202cc44fb2076fa3", "subnet-0e48564b4ebf17019", "subnet-03d3af5f8e16ac6ad"],
		privateSubnets: ["subnet-024d8604eda430324", "subnet-0da0dac7506bea59d", "subnet-0b3ded358aa66ad2e"],
		clusterArn: "arn:aws:ecs:us-east-1:841162676072:cluster/trino-core-stage-TrinoCoreClusterCluster-cofrkcwx",
		imageRepo: process.env.IMG_REPO_STAGING,
		imageVersion: process.env.IMG_VERSION_STAGING,
		minTasks: 1,
		maxTasks: 1,
		cpuUtilization: 70,
		memoryUtilization: 70,
		useSpotCapacity: true,
	},
	dev: {
		isProtected: false,
		isProd: false,
		isCloud: false,
		publicSubnets: [],
		privateSubnets: [],
		clusterArn: "",
		minTasks: 1,
		maxTasks: 1,
		cpuUtilization: 70,
		memoryUtilization: 70,
		useSpotCapacity: false,
	},
};

export default $config({
	app(input) {
		const cfg = stageConfigs[input?.stage ?? "dev"] ?? stageConfigs.dev;
		return {
			name: "trino-doc-worker",
			removal: cfg.isProtected ? "retain" : "remove",
			home: "aws",
			providers: {
				aws: {
					profile: "trino",
				},
			},
		};
	},
	async run() {
		const stageConfig = stageConfigs[$app.stage.toLowerCase()] ?? stageConfigs.dev;
		const { isProd, isCloud } = stageConfig;

		// * ============ Redis (compartilhado com o TrinoCore) ============
		// ! O worker consome filas BullMQ do mesmo Redis onde o TrinoCore publica
		// ! Configurar antes do deploy:
		// !   sst secret set TrinoDocWorker_RedisPassword "<password>"
		const redisPasswordSecret = new sst.Secret(getName("RedisPassword"));

		const REDIS_HOST = isCloud ? lookupRedisHost($app.stage) : "localhost";

		// * ============ S3 (bucket compartilhado com o TrinoCore) ============
		// ! O nome físico do bucket é publicado pelo TrinoCore via SSM
		// ! Certifique-se de que o TrinoCore já foi deployado no mesmo stage antes de deployar o worker
		const { value: trinoBucketName } = await aws.ssm.getParameter({
			name: `/trino-core/${$app.stage}/s3-bucket-name`,
		});
		const bucket = sst.aws.Bucket.get(getName("Bucket"), trinoBucketName);

		// * ============ ECS Cluster (reutiliza o cluster do TrinoCore) ============
		const clusterName = getName("Cluster");
		const cluster = sst.aws.Cluster.get(clusterName, {
			id: stageConfig.clusterArn,
			vpc: {
				id: vpcId,
				securityGroups: [vpsSecurityGroup],
				loadBalancerSubnets: [...stageConfig.publicSubnets],
				containerSubnets: [...stageConfig.privateSubnets],
			},
		});

		// * ============ Worker image ============
		const image =
			stageConfig.imageRepo && stageConfig.imageVersion
				? `${stageConfig.imageRepo}:${stageConfig.imageVersion}`
				: undefined;
		const version = stageConfig.imageVersion ?? "dev";

		// * ============ Worker Service (sem load balancer — consumer puro) ============
		const workerName = getName("Service");
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
				REDIS_CLUSTER_MODE: isCloud ? "true" : "false",
				...(isCloud && { REDIS_PASSWORD: redisPasswordSecret.value }),
				REDIS_URL: isCloud
					? redisPasswordSecret.value.apply(
						(pwd: string) => `rediss://:${encodeURIComponent(pwd)}@${REDIS_HOST}:6379`,
					)
					: "redis://localhost:6379",
				S3_BUCKET_NAME: bucket.name,
				AWS_REGION: "us-east-1",
				GENERATOR_QUEUE: "generator",
				LOCAL_CHROMIUM_PATH: isCloud ? "" : (process.env?.LOCAL_CHROMIUM_PATH ?? ""),
			},
			scaling: {
				min: stageConfig.minTasks,
				max: stageConfig.maxTasks,
				cpuUtilization: stageConfig.cpuUtilization,
				memoryUtilization: stageConfig.memoryUtilization,
			},
			capacity: stageConfig.useSpotCapacity ? "spot" : undefined,
			dev: {
				command: "deno task start:watch",
			},
			wait: isProd,
			transform: {
				service(args: aws.ecs.ServiceArgs) {
					args.networkConfiguration = {
						...args.networkConfiguration,
						assignPublicIp: false,
						subnets: [...stageConfig.publicSubnets, ...stageConfig.privateSubnets],
					};
				},
			},
		});

		return {
			worker: (worker as $util.ComponentResource).urn,
			isProd,
			image: image ?? "image not defined",
			redis: REDIS_HOST,
			version,
			bucketName: bucket.name,
			bucketArn: bucket.arn,
		};
	},
});
