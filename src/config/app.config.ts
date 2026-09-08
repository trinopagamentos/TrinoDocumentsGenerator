import process from "node:process";

export interface AppConfig {
	/** URL de conexão com o Redis (ex: `redis://localhost:6379` ou `rediss://...` para cluster) */
	redisUrl: string;

	/** Nome do bucket S3 onde os documentos gerados serão armazenados */
	s3BucketName: string;

	/** Região AWS do bucket S3 (ex: `us-east-1`, `sa-east-1`) */
	awsRegion: string;

	/** Nome da fila BullMQ para processamento de documentos. Padrão: `generator` */
	generatorQueue: string;

	/** Ambiente de execução atual (ex: `development`, `production`) */
	nodeEnv: string;

	/** Quando `true`, salva o HTML final gerado em `/debug/<jobId>.html` (requer volume mount em Docker) */
	debugSaveHtml: boolean;

	/** Versão da aplicação injetada no deploy (ex: tag da imagem Docker). Padrão: `dev` */
	appVersion: string;
}

export default (): AppConfig => {
	const required = ["S3_BUCKET_NAME", "AWS_REGION"];

	for (const key of required) {
		if (!process.env[key]) {
			throw new Error(`Missing required environment variable: ${key}`);
		}
	}

	return {
		redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
		s3BucketName: process.env.S3_BUCKET_NAME ?? "trino-doc-worker-bucket",
		awsRegion: process.env.AWS_REGION ?? "us-east-1",
		generatorQueue: process.env.GENERATOR_QUEUE ?? "generator",
		nodeEnv: process.env.NODE_ENV ?? "production",
		debugSaveHtml: process.env.DEBUG_SAVE_HTML === "true",
		appVersion: process.env.APP_VERSION ?? "dev",
	};
};
