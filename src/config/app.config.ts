/**
 * @file app.config.ts
 * @description Factory de configuração da aplicação.
 *
 * Valida a presença das variáveis de ambiente obrigatórias e retorna
 * um objeto tipado com todas as configurações necessárias para execução
 * do worker (Redis, S3, Chromium, etc.).
 *
 * Esta função é registrada como factory no {@link ConfigModule} e seus
 * valores ficam disponíveis via {@link ConfigService} em toda a aplicação.
 */

import process from "node:process";

/**
 * Interface que descreve o formato do objeto de configuração da aplicação.
 *
 * @remarks
 * Todos os campos são lidos de variáveis de ambiente e possuem valores
 * padrão seguros para desenvolvimento local, exceto os campos marcados
 * como `undefined` que são genuinamente opcionais.
 */
export interface AppConfig {
	/** Host do servidor Redis (ex: `localhost` ou endereço do ElastiCache) */
	redisHost: string;

	/** Porta do servidor Redis. Padrão: `6379` */
	redisPort: number;

	/** Senha do Redis. `undefined` quando a instância não requer autenticação */
	redisPassword: string | undefined;

	/** Habilita TLS na conexão com o Redis (ex: ElastiCache com TLS ativo) */
	redisTls: boolean;

	/** Nome do bucket S3 onde os documentos gerados serão armazenados */
	s3BucketName: string;

	/** Região AWS do bucket S3 (ex: `us-east-1`, `sa-east-1`) */
	awsRegion: string;

	/** Nome da fila BullMQ para processamento de documentos. Padrão: `pdf-generation` */
	pdfGenerationQueue: string;

	/**
	 * Caminho absoluto para o executável do Chromium instalado localmente.
	 * Quando definido, ignora o binário do `@sparticuz/chromium`.
	 * Útil para desenvolvimento local onde o Chrome já está instalado.
	 */
	localChromiumPath: string | undefined;

	/** Ambiente de execução atual (ex: `development`, `production`) */
	nodeEnv: string;
}

/**
 * Factory de configuração registrada no ConfigModule do NestJS.
 *
 * Valida as variáveis de ambiente obrigatórias antes de retornar o
 * objeto de configuração. Lança um erro imediatamente se alguma
 * variável obrigatória estiver ausente, evitando falhas silenciosas
 * em tempo de execução.
 *
 * @returns {AppConfig} Objeto de configuração preenchido com valores do ambiente
 * @throws {Error} Se alguma das variáveis obrigatórias não estiver definida
 *
 * @example
 * // Registrar no módulo raiz:
 * ConfigModule.forRoot({ load: [appConfig] })
 *
 * // Consumir via ConfigService:
 * const host = configService.getOrThrow<string>('redisHost');
 */
export default (): AppConfig => {
	// Variáveis de ambiente que devem estar presentes em qualquer ambiente de execução
	const required = ["REDIS_HOST", "S3_BUCKET_NAME", "AWS_REGION"];

	// Valida antecipadamente para falhar rápido (fail-fast) na inicialização
	for (const key of required) {
		if (!process.env[key]) {
			throw new Error(`Missing required environment variable: ${key}`);
		}
	}

	const config = {
		redisHost: process.env.REDIS_HOST ?? "localhost",
		redisPort: Number.parseInt(process.env.REDIS_PORT ?? "6379", 10),
		// Converte string vazia para undefined (sem senha)
		redisPassword: process.env.REDIS_PASSWORD || undefined,
		// Interpreta a string "true" como booleano
		redisTls: process.env.REDIS_TLS === "true",
		s3BucketName: process.env.S3_BUCKET_NAME ?? "trino-doc-worker-bucket",
		awsRegion: process.env.AWS_REGION ?? "us-east-1",
		pdfGenerationQueue: process.env.PDF_GENERATION_QUEUE ?? "pdf-generation",
		// Converte string vazia para undefined (usar binário do @sparticuz/chromium)
		localChromiumPath: process.env.LOCAL_CHROMIUM_PATH || undefined,
		nodeEnv: process.env.NODE_ENV ?? "production",
	}

	return config;
};
