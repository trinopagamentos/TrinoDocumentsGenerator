import "reflect-metadata";
import { assertEquals, assertRejects } from "@std/assert";
import { assertSpyCalls, stub } from "@std/testing/mock";
import { Logger } from "@nestjs/common";
import { PdfGenerationProcessor } from "@/pdf-generation/pdf-generation.processor.ts";
import type { GenerateDocumentJobData } from "@/pdf-generation/dto/generate-document.job.ts";

const FAKE_PDF_BYTES = new Uint8Array([37, 80, 68, 70, 45, 116, 101, 115, 116]); // %PDF-test
const FAKE_IMAGE_BYTES = new Uint8Array([80, 78, 71, 45, 116, 101, 115, 116]); // PNG-test
const FAKE_S3_URL = "https://test-bucket.s3.amazonaws.com/docs/file.pdf";

function makeMockSkreenService(opts?: { throwOnPdf?: Error; throwOnImage?: Error }) {
	return {
		generatePdf: (_html: string, _options?: unknown): Promise<Uint8Array> => {
			if (opts?.throwOnPdf) return Promise.reject(opts.throwOnPdf);
			return Promise.resolve(FAKE_PDF_BYTES);
		},
		generateImage: (_html: string, _options?: unknown): Promise<Uint8Array> => {
			if (opts?.throwOnImage) return Promise.reject(opts.throwOnImage);
			return Promise.resolve(FAKE_IMAGE_BYTES);
		},
	};
}

function makeMockS3Service(opts?: { url?: string; throwError?: Error }) {
	return {
		upload: (_key: string, _buffer: Uint8Array, _type: string): Promise<string> => {
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

Deno.test("PdfGenerationProcessor.process: job PDF chama skreenService.generatePdf", async () => {
	let generatePdfCalled = false;
	const mockSkreen = {
		generatePdf: (_html: string, _opts?: unknown): Promise<Uint8Array> => {
			generatePdfCalled = true;
			return Promise.resolve(FAKE_PDF_BYTES);
		},
		generateImage: (): Promise<Uint8Array> => Promise.resolve(FAKE_IMAGE_BYTES),
	};

	const processor = new PdfGenerationProcessor(mockSkreen as never, makeMockS3Service() as never);

	await processor.process(makeJob({ documentType: "pdf" }) as never);

	assertEquals(generatePdfCalled, true);
});

Deno.test("PdfGenerationProcessor.process: job image chama skreenService.generateImage", async () => {
	let generateImageCalled = false;
	const mockSkreen = {
		generatePdf: (): Promise<Uint8Array> => Promise.resolve(FAKE_PDF_BYTES),
		generateImage: (_html: string, _opts?: unknown): Promise<Uint8Array> => {
			generateImageCalled = true;
			return Promise.resolve(FAKE_IMAGE_BYTES);
		},
	};

	const processor = new PdfGenerationProcessor(mockSkreen as never, makeMockS3Service() as never);

	await processor.process(makeJob({ documentType: "image", s3Key: "imgs/img.png" }) as never);

	assertEquals(generateImageCalled, true);
});

Deno.test("PdfGenerationProcessor.process: chama s3Service.upload com key, buffer e documentType corretos", async () => {
	let capturedKey: string | undefined;
	let capturedBuffer: Uint8Array | undefined;
	let capturedType: string | undefined;

	const mockS3 = {
		upload: (key: string, buffer: Uint8Array, type: string): Promise<string> => {
			capturedKey = key;
			capturedBuffer = buffer;
			capturedType = type;
			return Promise.resolve(FAKE_S3_URL);
		},
	};

	const processor = new PdfGenerationProcessor(makeMockSkreenService() as never, mockS3 as never);

	const job = makeJob({ documentType: "pdf", s3Key: "receipts/file.pdf" });
	await processor.process(job as never);

	assertEquals(capturedKey, "receipts/file.pdf");
	assertEquals(capturedBuffer, FAKE_PDF_BYTES);
	assertEquals(capturedType, "pdf");
});

Deno.test("PdfGenerationProcessor.process: resultado contém url, userId e completedAt (ISO 8601 válido)", async () => {
	const processor = new PdfGenerationProcessor(
		makeMockSkreenService() as never,
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
	const processor = new PdfGenerationProcessor(makeMockSkreenService() as never, makeMockS3Service() as never);

	const meta = { invoiceId: "INV-001", amount: 99.99 };
	const result = await processor.process(makeJob({ documentType: "pdf", metaData: meta }) as never);

	assertEquals(result.metaData, meta);
});

Deno.test("PdfGenerationProcessor.process: metaData NÃO existe no resultado quando undefined (spread condicional)", async () => {
	const processor = new PdfGenerationProcessor(makeMockSkreenService() as never, makeMockS3Service() as never);

	const result = await processor.process(makeJob({ documentType: "pdf", metaData: undefined }) as never);

	// O spread `...(x !== undefined && { key: x })` não adiciona a key quando undefined
	assertEquals("metaData" in result, false);
});

Deno.test("PdfGenerationProcessor.process: erro é re-thrown para o BullMQ gerenciar retry", async () => {
	const originalError = new Error("Render failed");
	const processor = new PdfGenerationProcessor(
		makeMockSkreenService({ throwOnPdf: originalError }) as never,
		makeMockS3Service() as never,
	);

	await assertRejects(() => processor.process(makeJob({ documentType: "pdf" }) as never), Error, "Render failed");
});

Deno.test("PdfGenerationProcessor.process: logger.error é chamado quando o job falha", async () => {
	const generateError = new Error("Render failed");
	const processor = new PdfGenerationProcessor(
		makeMockSkreenService({ throwOnPdf: generateError }) as never,
		makeMockS3Service() as never,
	);

	using loggerErrorStub = stub(Logger.prototype, "error", () => {});

	await assertRejects(() => processor.process(makeJob({ documentType: "pdf" }) as never), Error, "Render failed");

	assertSpyCalls(loggerErrorStub, 1);
});
