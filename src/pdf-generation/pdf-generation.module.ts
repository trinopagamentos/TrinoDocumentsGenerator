/**
 * @file pdf-generation.module.ts
 * @description Módulo de feature responsável pela geração de documentos PDF e imagens.
 *
 * Registra a fila BullMQ `pdf-generation` com as políticas de retry e
 * retenção de jobs, e fornece o {@link PdfGenerationProcessor} como
 * consumer da fila.
 */

import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { SharedModule } from "@/shared/shared.module.ts";
import { PdfGenerationProcessor } from "@/pdf-generation/pdf-generation.processor.ts";

/**
 * Módulo de feature que encapsula toda a lógica de consumo da fila de geração de documentos.
 *
 * @remarks
 * A fila é registrada via `registerQueueAsync` para que o nome possa ser
 * lido dinamicamente do `ConfigService` (variável `PDF_GENERATION_QUEUE`).
 *
 * **Políticas de job configuradas:**
 * - `attempts`: 3 tentativas antes de mover o job para a fila de falhas
 * - `backoff`: espera exponencial com delay inicial de 5 segundos (5s → 10s → 20s)
 * - `removeOnComplete`: mantém os últimos 100 jobs concluídos no Redis
 * - `removeOnFail`: mantém os últimos 50 jobs com falha para análise
 */
@Module({
	imports: [
		// Registra a fila com configurações dinâmicas vindas do ConfigService
		BullModule.registerQueueAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				name: config.get<string>("pdfGenerationQueue", "pdf-generation"),
				defaultJobOptions: {
					// Número máximo de tentativas antes de declarar o job como falho
					attempts: 3,
					backoff: {
						// Estratégia exponencial: cada retry dobra o tempo de espera
						type: "exponential",
						delay: 5000, // delay inicial em ms (5s, 10s, 20s...)
					},
					// Limita o histórico de jobs concluídos para evitar crescimento ilimitado no Redis
					removeOnComplete: 100,
					// Mantém os últimos 50 jobs falhos para debugging e reprocessamento manual
					removeOnFail: 50,
				},
			}),
		}),
		// Importa os serviços compartilhados (PuppeteerService e S3Service)
		SharedModule,
	],
	// Registra o processor que consome os jobs da fila
	providers: [PdfGenerationProcessor],
})
export class PdfGenerationModule {}
