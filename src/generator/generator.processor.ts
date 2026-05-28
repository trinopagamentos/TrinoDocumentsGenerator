/**
 * @file generator.processor.ts
 * @description Processor BullMQ responsável por consumir e processar os jobs da fila `generator`.
 *
 * Cada job contém um `templateName` e `templateData`. O processor renderiza o template
 * Handlebars, processa o CSS Tailwind inline e delega a geração do documento ao
 * {@link SkreenService} e o armazenamento ao {@link S3Service}.
 */

import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { SkreenService } from "@/shared/services/skreen.service.ts";
import { S3Service } from "@/shared/services/s3.service.ts";
import { TailwindInlineService } from "@/shared/services/tailwind-inline.service.ts";
import { TemplateService } from "@/shared/services/template.service.ts";
import type { GenerateDocumentJobData, GenerateDocumentJobResult } from "@/generator/dto/generate-document.job.ts";

/**
 * Consumer da fila BullMQ `generator`.
 *
 * Pipeline de execução:
 * 1. Renderiza o template Handlebars + compila CSS Tailwind inline
 * 2. Renderiza o HTML em bytes binários via {@link SkreenService}
 * 3. Faz upload no S3 via {@link S3Service}
 * 4. Retorna resultado com URL, userId e timestamp
 */
@Processor("generator", {
	lockDuration: 300_000,
	maxStalledCount: 1,
})
export class GeneratorProcessor extends WorkerHost {
	private readonly logger = new Logger(GeneratorProcessor.name);

	constructor(
		private readonly skreenService: SkreenService,
		private readonly s3Service: S3Service,
		private readonly templateService: TemplateService,
		private readonly tailwindInlineService: TailwindInlineService,
	) {
		super();
	}

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
			// Etapa 1: resolver o HTML final
			const htmlContent = await this.resolveHtml(job);

			// Etapa 2: renderizar o HTML em bytes binários (PDF ou imagem)
			const buffer = job.data.documentType === "pdf"
				? await this.skreenService.generatePdf(htmlContent, job.data.pdfOptions)
				: await this.skreenService.generateImage(htmlContent, job.data.imageOptions);

			this.logger.log({ msg: "Document generated", jobId: job.id, bytes: buffer.byteLength });

			// Etapa 3: enviar os bytes para o S3 e obter a URL pública
			const url = await this.s3Service.upload(job.data.s3Key, buffer, job.data.documentType);

			this.logger.log({ msg: "Uploaded to S3", jobId: job.id, s3Key: job.data.s3Key, url });

			const result: GenerateDocumentJobResult = {
				url,
				userId: job.data.userId,
				completedAt: new Date().toISOString(),
				...(job.data.metaData !== undefined && { metaData: job.data.metaData }),
			};

			this.logger.log({ msg: "Job completed", jobId: job.id, url });

			return result;
		} catch (err) {
			this.logger.error({
				msg: "Job failed",
				jobId: job.id,
				queue: job.queueName,
				error: err instanceof Error ? err.message : String(err),
				stack: err instanceof Error ? err.stack : undefined,
			});
			throw err;
		}
	}

	/**
	 * Resolve o HTML final: renderiza o template Handlebars e processa CSS inline.
	 */
	private async resolveHtml(job: Job<GenerateDocumentJobData>): Promise<string> {
		this.logger.log({ msg: "Rendering template", jobId: job.id, templateName: job.data.templateName });
		const rawHtml = await this.templateService.render(
			job.data.templateName,
			job.data.templateData,
		);
		return this.tailwindInlineService.processHtml(rawHtml);
	}
}
