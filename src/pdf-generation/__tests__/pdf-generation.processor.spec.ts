import "reflect-metadata";
import { assertEquals, assertRejects } from "@std/assert";
import { assertSpyCalls, stub } from "@std/testing/mock";
import { Logger } from "@nestjs/common";
import { Buffer } from "node:buffer";
import { PdfGenerationProcessor } from "@/pdf-generation/pdf-generation.processor.ts";
import type { GenerateDocumentJobData } from "@/pdf-generation/dto/generate-document.job.ts";

const FAKE_PDF_BUFFER = Buffer.from("%PDF-test");
const FAKE_IMAGE_BUFFER = Buffer.from("PNG-test");
const FAKE_S3_URL = "https://test-bucket.s3.amazonaws.com/docs/file.pdf";

function makeMockPuppeteerService(opts?: { throwOnPdf?: Error; throwOnImage?: Error }) {
	return {
		generatePdf: (_html: string, _options?: unknown): Promise<Buffer> => {
			if (opts?.throwOnPdf) return Promise.reject(opts.throwOnPdf);
			return Promise.resolve(FAKE_PDF_BUFFER);
		},
		generateImage: (_html: string, _options?: unknown): Promise<Buffer> => {
			if (opts?.throwOnImage) return Promise.reject(opts.throwOnImage);
			return Promise.resolve(FAKE_IMAGE_BUFFER);
		},
	};
}

function makeMockS3Service(opts?: { url?: string; throwError?: Error }) {
	return {
		upload: (_key: string, _buffer: Buffer, _type: string): Promise<string> => {
			if (opts?.throwError) return Promise.reject(opts.throwError);
			return Promise.resolve(opts?.url ?? FAKE_S3_URL);
		},
	};
}

function makeJob(data: { documentType: "pdf" | "image" } & Partial<GenerateDocumentJobData>) {
	return {
		id: "test-job-id-123",
		queueName: "pdf-generation",
		data: {
			userId: "user-abc",
			htmlContent: "<html><body>Olá</body></html>",
			s3Key: "docs/user-abc/file.pdf",
			pdfOptions: undefined,
			imageOptions: undefined,
			metaData: undefined,
			...data,
		} as GenerateDocumentJobData,
	};
}

Deno.test("PdfGenerationProcessor.process: job PDF chama puppeteerService.generatePdf", async () => {
	let generatePdfCalled = false;
	const mockPuppeteer = {
		generatePdf: (_html: string, _opts?: unknown): Promise<Buffer> => {
			generatePdfCalled = true;
			return Promise.resolve(FAKE_PDF_BUFFER);
		},
		generateImage: (): Promise<Buffer> => Promise.resolve(FAKE_IMAGE_BUFFER),
	};

	const processor = new PdfGenerationProcessor(mockPuppeteer as never, makeMockS3Service() as never);

	await processor.process(makeJob({ documentType: "pdf" }) as never);

	assertEquals(generatePdfCalled, true);
});

Deno.test("PdfGenerationProcessor.process: job image chama puppeteerService.generateImage", async () => {
	let generateImageCalled = false;
	const mockPuppeteer = {
		generatePdf: (): Promise<Buffer> => Promise.resolve(FAKE_PDF_BUFFER),
		generateImage: (_html: string, _opts?: unknown): Promise<Buffer> => {
			generateImageCalled = true;
			return Promise.resolve(FAKE_IMAGE_BUFFER);
		},
	};

	const processor = new PdfGenerationProcessor(mockPuppeteer as never, makeMockS3Service() as never);

	await processor.process(makeJob({ documentType: "image", s3Key: "imgs/img.png" }) as never);

	assertEquals(generateImageCalled, true);
});

Deno.test("PdfGenerationProcessor.process: chama s3Service.upload com key, buffer e documentType corretos", async () => {
	let capturedKey: string | undefined;
	let capturedBuffer: Buffer | undefined;
	let capturedType: string | undefined;

	const mockS3 = {
		upload: (key: string, buffer: Buffer, type: string): Promise<string> => {
			capturedKey = key;
			capturedBuffer = buffer;
			capturedType = type;
			return Promise.resolve(FAKE_S3_URL);
		},
	};

	const processor = new PdfGenerationProcessor(makeMockPuppeteerService() as never, mockS3 as never);

	const job = makeJob({ documentType: "pdf", s3Key: "receipts/file.pdf" });
	await processor.process(job as never);

	assertEquals(capturedKey, "receipts/file.pdf");
	assertEquals(capturedBuffer, FAKE_PDF_BUFFER);
	assertEquals(capturedType, "pdf");
});

Deno.test("PdfGenerationProcessor.process: resultado contém url, userId e completedAt (ISO 8601 válido)", async () => {
	const processor = new PdfGenerationProcessor(
		makeMockPuppeteerService() as never,
		makeMockS3Service({ url: "https://bucket.s3.amazonaws.com/doc.pdf" }) as never,
	);

	const result = await processor.process(makeJob({ documentType: "pdf", userId: "user-xyz" }) as never);

	assertEquals(result.url, "https://bucket.s3.amazonaws.com/doc.pdf");
	assertEquals(result.userId, "user-xyz");
	assertEquals(typeof result.completedAt, "string");
	const parsed = new Date(result.completedAt);
	assertEquals(Number.isNaN(parsed.getTime()), false);
});

Deno.test("PdfGenerationProcessor.process: metaData é incluído no resultado quando definido", async () => {
	const processor = new PdfGenerationProcessor(makeMockPuppeteerService() as never, makeMockS3Service() as never);

	const meta = { invoiceId: "INV-001", amount: 99.99 };
	const result = await processor.process(makeJob({ documentType: "pdf", metaData: meta }) as never);

	assertEquals(result.metaData, meta);
});

Deno.test("PdfGenerationProcessor.process: metaData NÃO existe no resultado quando undefined (spread condicional)", async () => {
	const processor = new PdfGenerationProcessor(makeMockPuppeteerService() as never, makeMockS3Service() as never);

	const result = await processor.process(makeJob({ documentType: "pdf", metaData: undefined }) as never);

	// O spread `...(x !== undefined && { key: x })` não adiciona a key quando undefined
	assertEquals("metaData" in result, false);
});

Deno.test("PdfGenerationProcessor.process: erro é re-thrown para o BullMQ gerenciar retry", async () => {
	const originalError = new Error("Chromium crashed");
	const processor = new PdfGenerationProcessor(
		makeMockPuppeteerService({ throwOnPdf: originalError }) as never,
		makeMockS3Service() as never,
	);

	await assertRejects(() => processor.process(makeJob({ documentType: "pdf" }) as never), Error, "Chromium crashed");
});

Deno.test("PdfGenerationProcessor.process: logger.error é chamado quando o job falha", async () => {
	const generateError = new Error("Render failed");
	const processor = new PdfGenerationProcessor(
		makeMockPuppeteerService({ throwOnPdf: generateError }) as never,
		makeMockS3Service() as never,
	);

	using loggerErrorStub = stub(Logger.prototype, "error", () => {});

	await assertRejects(() => processor.process(makeJob({ documentType: "pdf" }) as never), Error, "Render failed");

	assertSpyCalls(loggerErrorStub, 1);
});
