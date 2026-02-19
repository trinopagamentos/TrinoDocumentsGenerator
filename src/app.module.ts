/**
 * @file app.module.ts
 * @description Módulo raiz da aplicação TrinoDocWorker.
 *
 * Responsável por compor e configurar todos os módulos da aplicação:
 * - {@link ConfigModule}: carrega e valida variáveis de ambiente de forma global
 * - {@link BullModule}: configura a conexão com o Redis para filas BullMQ
 * - {@link SharedModule}: provê serviços compartilhados (Puppeteer, S3)
 * - {@link PdfGenerationModule}: registra o processor e a fila de geração de documentos
 */

import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import type { ConnectionOptions } from "bullmq";
import { Cluster } from "ioredis";
import appConfig from "@/config/app.config";
import { SharedModule } from "@/shared/shared.module";
import { PdfGenerationModule } from "@/pdf-generation/pdf-generation.module";

/**
 * Módulo raiz que inicializa toda a árvore de dependências da aplicação.
 *
 * @remarks
 * A configuração do BullModule é feita de forma assíncrona (`forRootAsync`)
 * para que as credenciais do Redis sejam lidas do `ConfigService` após o
 * `ConfigModule` ter sido inicializado com as variáveis de ambiente.
 */
@Module({
	imports: [
		// Carrega appConfig como factory global; disponível via ConfigService em toda a aplicação
		ConfigModule.forRoot({
			isGlobal: true,
			load: [appConfig],
		}),

		// Configura o BullMQ com as credenciais do Redis vindas do ConfigService
		BullModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => {
				const host = config.getOrThrow<string>("redisHost");
				const port = config.getOrThrow<number>("redisPort");
				const password = config.get<string>("redisPassword");
				const tls = config.get<boolean>("redisTls");
				const clusterMode = config.get<boolean>("redisClusterMode");

				// ElastiCache em cluster mode exige ioredis.
				// Cluster para que os Lua scripts
				// do BullMQ operem em keys do mesmo hash slot (evita CROSSSLOT error)
				if (clusterMode) {
					const connection = new Cluster([{ host, port }], {
						// Necessário para ElastiCache: resolve endereços DNS diretamente
						dnsLookup: (address, callback) => callback(null, address),
						redisOptions: {
							...(password && { password }),
							...(tls && { tls: {} }),
						},
					});
					// Hash tag {bull} garante que todas as chaves da fila caiam no mesmo
					// slot do Redis Cluster, evitando o erro CROSSSLOT
					return { connection: connection as unknown as ConnectionOptions, prefix: "{bull}" };
				}

				return {
					connection: {
						host,
						port,
						...(password && { password }),
						...(tls && { tls: {} }),
					},
				};
			},
		}),

		// Módulo com serviços compartilhados (PuppeteerService, S3Service)
		SharedModule,
		// Módulo que registra a fila e o processor de geração de documentos
		PdfGenerationModule,
	],
})
export class AppModule {}
