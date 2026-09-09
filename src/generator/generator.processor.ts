/**
 * @file generator.processor.ts
 * @description Processor BullMQ responsável por consumir e processar os jobs da fila `generator`.
 *
 * Cada job contém um `templateName` e `templateData`. O processor renderiza o template
 * Handlebars, processa o CSS Tailwind inline e delega a geração do documento ao
 * {@link SkreenService} e o armazenamento ao {@link S3Service}.
 */

import fs from "node:fs/promises";
import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Job, UnrecoverableError } from "bullmq";
import * as v from "valibot";
import { SkreenService } from "@/shared/services/skreen.service.ts";
import { S3Service } from "@/shared/services/s3.service.ts";
import { TailwindInlineService } from "@/shared/services/tailwind-inline.service.ts";
import { TemplateService } from "@/shared/services/template.service.ts";
import { GenerateDocumentJobDataSchema } from "@/generator/dto/generate-document.job.ts";
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
		private readonly config: ConfigService,
	) {
		super();
	}

	async process(job: Job<GenerateDocumentJobData>): Promise<GenerateDocumentJobResult> {
		// Valida o payload recebido contra o schema Zod antes de processar.
		// Payload inválido é um erro permanente: não deve entrar no retry padrão da fila.
		const parseResult = v.safeParse(GenerateDocumentJobDataSchema, job.data);
		if (!parseResult.success) {
			this.logger.error({
				msg: "Invalid job payload",
				jobId: job.id,
				queue: job.queueName,
				issues: parseResult.issues,
			});
			throw new UnrecoverableError("Invalid GenerateDocumentJobData payload");
		}
		const data = parseResult.output;

		try {
			this.logger.log({
				msg: "Job started",
				jobId: job.id,
				queue: job.queueName,
				documentType: data.documentType,
				s3Key: data.s3Key,
				userId: data.userId,
			});

			// Etapa 1: resolver o HTML final
			const htmlContent = await this.resolveHtml(job.id, data);

			if (this.config.get<boolean>("debugSaveHtml")) {
				const debugPath = `/debug/${job.id}.html`;
				await fs.writeFile(debugPath, htmlContent, "utf-8");
				this.logger.debug({ msg: "HTML saved", path: debugPath, jobId: job.id });
			}

			// Etapa 2: renderizar o HTML em bytes binários (PDF ou imagem)
			const buffer = data.documentType === "pdf"
				? await this.skreenService.generatePdf(htmlContent, data.pdfOptions)
				: await this.skreenService.generateImage(htmlContent, data.imageOptions);

			this.logger.log({ msg: "Document generated", jobId: job.id, bytes: buffer.byteLength });

			// Etapa 3: enviar os bytes para o S3 e obter a URL pública
			const url = await this.s3Service.upload(data.s3Key, buffer, data.documentType);

			this.logger.log({ msg: "Uploaded to S3", jobId: job.id, s3Key: data.s3Key, url });

			const result: GenerateDocumentJobResult = {
				url,
				userId: data.userId,
				completedAt: new Date().toISOString(),
				...(data.metaData !== undefined && { metaData: data.metaData }),
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
	private async resolveHtml(jobId: string | undefined, data: GenerateDocumentJobData): Promise<string> {
		this.logger.log({ msg: "Rendering template", jobId, templateName: data.templateName });
		const rawHtml = await this.templateService.render(
			data.templateName,
			data.templateData,
		);
		return this.tailwindInlineService.processHtml(rawHtml);
	}
}
