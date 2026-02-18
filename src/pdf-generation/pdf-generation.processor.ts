/**
 * @file pdf-generation.processor.ts
 * @description Processor BullMQ responsável por consumir e processar os jobs da fila `pdf-generation`.
 *
 * Cada job contém um HTML pré-renderizado e metadados do documento. O processor
 * delega a renderização ao {@link PuppeteerService} e o armazenamento ao
 * {@link S3Service}, retornando a URL pública do arquivo gerado.
 */

import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { PuppeteerService } from "@/shared/services/puppeteer.service.ts";
import { S3Service } from "@/shared/services/s3.service.ts";
import type { GenerateDocumentJobData, GenerateDocumentJobResult } from "@/pdf-generation/dto/generate-document.job.ts";

/**
 * Consumer da fila BullMQ `pdf-generation`.
 *
 * Estende {@link WorkerHost} para integrar-se ao ciclo de vida gerenciado
 * pelo NestJS BullMQ. O método `process` é invocado automaticamente pelo
 * BullMQ a cada job disponível na fila.
 *
 * @remarks
 * Em caso de erro, a exceção é relançada para que o BullMQ possa aplicar
 * a política de retry/backoff configurada no {@link PdfGenerationModule}.
 * Após esgotar as tentativas, o job é movido para a Dead Letter Queue (DLQ).
 */
@Processor("pdf-generation")
export class PdfGenerationProcessor extends WorkerHost {
	private readonly logger = new Logger(PdfGenerationProcessor.name);

	/**
	 * @param puppeteerService - Serviço responsável por renderizar HTML em PDF ou imagem
	 * @param s3Service - Serviço responsável por fazer upload do documento no S3
	 */
	constructor(
		private readonly puppeteerService: PuppeteerService,
		private readonly s3Service: S3Service,
	) {
		super();
	}

	/**
	 * Processa um job de geração de documento.
	 *
	 * Pipeline de execução:
	 * 1. Determina o tipo de documento (`pdf` ou `image`)
	 * 2. Chama o `PuppeteerService` para renderizar o HTML em buffer binário
	 * 3. Faz upload do buffer no S3 via `S3Service`
	 * 4. Retorna o resultado com a URL pública, userId e timestamp de conclusão
	 *
	 * @param job - Job BullMQ contendo os dados de entrada do documento
	 * @returns Resultado com a URL do arquivo gerado, userId e timestamp
	 * @throws Relança qualquer exceção para que o BullMQ gerencie o ciclo de retry
	 */
	async process(job: Job<GenerateDocumentJobData>): Promise<GenerateDocumentJobResult> {
		this.logger.log({
			msg: "Job started",
			jobId: job.id,
			queue: job.queueName,
			documentType: job.data.documentType,
			s3Key: job.data.s3Key,
			userId: job.data.userId,
		});

		try {
			// Etapa 1: renderizar o HTML em buffer binário (PDF ou imagem)
			const buffer =
				job.data.documentType === "pdf"
					? await this.puppeteerService.generatePdf(job.data.htmlContent, job.data.pdfOptions)
					: await this.puppeteerService.generateImage(job.data.htmlContent, job.data.imageOptions);

			this.logger.log({
				msg: "Document generated",
				jobId: job.id,
				bytes: buffer.length,
			});

			// Etapa 2: enviar o buffer para o S3 e obter a URL pública
			const url = await this.s3Service.upload(job.data.s3Key, buffer, job.data.documentType);

			this.logger.log({
				msg: "Uploaded to S3",
				jobId: job.id,
				s3Key: job.data.s3Key,
				url,
			});

			// Etapa 3: montar e retornar o resultado do job
			const result: GenerateDocumentJobResult = {
				url,
				userId: job.data.userId,
				completedAt: new Date().toISOString(),
				...(job.data.metaData !== undefined && { metaData: job.data.metaData }),
			};

			this.logger.log({
				msg: "Job completed",
				jobId: job.id,
				url,
			});

			return result;
		} catch (err) {
			this.logger.error({
				msg: "Job failed",
				jobId: job.id,
				queue: job.queueName,
				error: err instanceof Error ? err.message : String(err),
				stack: err instanceof Error ? err.stack : undefined,
			});

			// Re-throw para BullMQ gerenciar retry/backoff/DLQ
			throw err;
		}
	}
}
