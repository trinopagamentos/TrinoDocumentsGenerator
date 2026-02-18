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
import appConfig from "@/config/app.config.ts";
import { SharedModule } from "@/shared/shared.module.ts";
import { PdfGenerationModule } from "@/pdf-generation/pdf-generation.module.ts";

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
			useFactory: (config: ConfigService) => ({
				connection: {
					host: config.getOrThrow<string>("redisHost"),
					port: config.getOrThrow<number>("redisPort"),
					// Inclui a senha apenas se estiver definida no ambiente
					...(config.get<string>("redisPassword") && { password: config.get<string>("redisPassword") }),
					// Habilita TLS somente quando REDIS_TLS=true
					...(config.get<boolean>("redisTls") && { tls: {} }),
				},
			}),
		}),

		// Módulo com serviços compartilhados (PuppeteerService, S3Service)
		SharedModule,
		// Módulo que registra a fila e o processor de geração de documentos
		PdfGenerationModule,
	],
})
export class AppModule {}
