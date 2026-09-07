import "reflect-metadata";
import { assertEquals, assertRejects } from "@std/assert";
import { assertSpyCalls, stub } from "@std/testing/mock";
import { Logger } from "@nestjs/common";
import { GeneratorProcessor } from "@/generator/generator.processor.ts";
import { TemplateName } from "@/generator/dto/generate-document.job.ts";
import type { GenerateDocumentJobData } from "@/generator/dto/generate-document.job.ts";

const FAKE_PDF_BYTES = new Uint8Array([37, 80, 68, 70, 45, 116, 101, 115, 116]); // %PDF-test
const FAKE_IMAGE_BYTES = new Uint8Array([80, 78, 71, 45, 116, 101, 115, 116]); // PNG-test
const FAKE_S3_URL = "https://test-bucket.s3.amazonaws.com/docs/file.pdf";
const RENDERED_HTML = "<html><head></head><body>rendered</body></html>";

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

function makeMockTemplateService(opts?: { renderedHtml?: string; throwError?: Error }) {
	return {
		render: (_name: string, _data: unknown): Promise<string> => {
			if (opts?.throwError) return Promise.reject(opts.throwError);
			return Promise.resolve(opts?.renderedHtml ?? RENDERED_HTML);
		},
	};
}

function makeMockTailwindService(opts?: { throwError?: Error }) {
	return {
		processHtml: (html: string): Promise<string> => {
			if (opts?.throwError) return Promise.reject(opts.throwError);
			return Promise.resolve(html);
		},
	};
}

const mockConfigService = { get: (_key: string) => false } as never;

function makeProcessor(overrides?: {
	skreen?: ReturnType<typeof makeMockSkreenService>;
	s3?: ReturnType<typeof makeMockS3Service>;
	template?: ReturnType<typeof makeMockTemplateService>;
	tailwind?: ReturnType<typeof makeMockTailwindService>;
}) {
	return new GeneratorProcessor(
		(overrides?.skreen ?? makeMockSkreenService()) as never,
		(overrides?.s3 ?? makeMockS3Service()) as never,
		(overrides?.template ?? makeMockTemplateService()) as never,
		(overrides?.tailwind ?? makeMockTailwindService()) as never,
		mockConfigService,
	);
}

const VALID_PAYMENT_RECEIPT_DATA = {
	title: "Comprovante de pagamento",
	currentDate: "01/01/2025",
	amount: "R$ 100,00",
	transaction_type: "PIX",
	recipient_business_name: "Loja Teste",
	recipient_doc: "00.000.000/0001-00",
	recipient_doc_type: "CNPJ",
	source_name: "João Silva",
	source_doc: "000.000.000-00",
	source_doc_type: "CPF",
	transaction_id: "TXN-001",
	sac: "+55 11 0000-0000",
};

function makeJob(data: { documentType: "pdf" | "image" } & Partial<GenerateDocumentJobData>) {
	return {
		id: "test-job-id-123",
		queueName: "generator",
		data: {
			userId: "user-abc",
			templateName: TemplateName.PAYMENT_RECEIPT,
			templateData: VALID_PAYMENT_RECEIPT_DATA,
			s3Key: "docs/user-abc/file.pdf",
			pdfOptions: undefined,
			imageOptions: undefined,
			metaData: undefined,
			...data,
		} as GenerateDocumentJobData,
	};
}

// --- Delegação ao SkreenService ---

Deno.test("GeneratorProcessor.process: job PDF chama skreenService.generatePdf", async () => {
	let generatePdfCalled = false;
	const mockSkreen = {
		generatePdf: (_html: string, _opts?: unknown): Promise<Uint8Array> => {
			generatePdfCalled = true;
			return Promise.resolve(FAKE_PDF_BYTES);
		},
		generateImage: (): Promise<Uint8Array> => Promise.resolve(FAKE_IMAGE_BYTES),
	};

	await makeProcessor({ skreen: mockSkreen }).process(makeJob({ documentType: "pdf" }) as never);

	assertEquals(generatePdfCalled, true);
});

Deno.test("GeneratorProcessor.process: job image chama skreenService.generateImage", async () => {
	let generateImageCalled = false;
	const mockSkreen = {
		generatePdf: (): Promise<Uint8Array> => Promise.resolve(FAKE_PDF_BYTES),
		generateImage: (_html: string, _opts?: unknown): Promise<Uint8Array> => {
			generateImageCalled = true;
			return Promise.resolve(FAKE_IMAGE_BYTES);
		},
	};

	await makeProcessor({ skreen: mockSkreen }).process(
		makeJob({ documentType: "image", s3Key: "imgs/img.png" }) as never,
	);

	assertEquals(generateImageCalled, true);
});

// --- Pipeline de resolução de HTML ---

Deno.test("GeneratorProcessor.process: chama templateService.render com templateName e templateData do job", async () => {
	let capturedName: string | undefined;
	let capturedData: unknown;
	const mockTemplate = {
		render: (name: string, data: unknown): Promise<string> => {
			capturedName = name;
			capturedData = data;
			return Promise.resolve(RENDERED_HTML);
		},
	};

	const payload = { ...VALID_PAYMENT_RECEIPT_DATA, title: "Recibo de teste" };
	await makeProcessor({ template: mockTemplate }).process(
		makeJob({
			documentType: "pdf",
			templateName: TemplateName.PAYMENT_RECEIPT,
			templateData: payload as never,
		}) as never,
	);

	assertEquals(capturedName, TemplateName.PAYMENT_RECEIPT);
	assertEquals(capturedData, payload);
});

Deno.test("GeneratorProcessor.process: passa HTML do templateService para tailwindInlineService.processHtml", async () => {
	const templateHtml = "<html><body>do template</body></html>";
	let capturedHtml: string | undefined;

	const mockTailwind = {
		processHtml: (html: string): Promise<string> => {
			capturedHtml = html;
			return Promise.resolve(html);
		},
	};

	await makeProcessor({ template: makeMockTemplateService({ renderedHtml: templateHtml }), tailwind: mockTailwind })
		.process(
			makeJob({ documentType: "pdf" }) as never,
		);

	assertEquals(capturedHtml, templateHtml);
});

Deno.test("GeneratorProcessor.process: passa HTML processado pelo Tailwind para skreenService", async () => {
	const processedHtml = "<html><head><style>/* css */</style></head><body>ok</body></html>";
	let capturedHtml: string | undefined;

	const mockSkreen = {
		generatePdf: (html: string, _opts?: unknown): Promise<Uint8Array> => {
			capturedHtml = html;
			return Promise.resolve(FAKE_PDF_BYTES);
		},
		generateImage: (): Promise<Uint8Array> => Promise.resolve(FAKE_IMAGE_BYTES),
	};

	await makeProcessor({
		skreen: mockSkreen,
		tailwind: { processHtml: () => Promise.resolve(processedHtml) },
	}).process(makeJob({ documentType: "pdf" }) as never);

	assertEquals(capturedHtml, processedHtml);
});

// --- Upload no S3 ---

Deno.test("GeneratorProcessor.process: chama s3Service.upload com key, buffer e documentType corretos", async () => {
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

	await makeProcessor({ s3: mockS3 }).process(
		makeJob({ documentType: "pdf", s3Key: "receipts/file.pdf" }) as never,
	);

	assertEquals(capturedKey, "receipts/file.pdf");
	assertEquals(capturedBuffer, FAKE_PDF_BYTES);
	assertEquals(capturedType, "pdf");
});

// --- Resultado ---

Deno.test("GeneratorProcessor.process: resultado contém url, userId e completedAt (ISO 8601 válido)", async () => {
	const result = await makeProcessor({
		s3: makeMockS3Service({ url: "https://bucket.s3.amazonaws.com/doc.pdf" }),
	}).process(makeJob({ documentType: "pdf", userId: "user-xyz" }) as never);

	assertEquals(result.url, "https://bucket.s3.amazonaws.com/doc.pdf");
	assertEquals(result.userId, "user-xyz");
	assertEquals(typeof result.completedAt, "string");
	assertEquals(Number.isNaN(new Date(result.completedAt).getTime()), false);
});

Deno.test("GeneratorProcessor.process: metaData é incluído no resultado quando definido", async () => {
	const meta = { invoiceId: "INV-001", amount: 99.99 };
	const result = await makeProcessor().process(makeJob({ documentType: "pdf", metaData: meta }) as never);

	assertEquals(result.metaData, meta);
});

Deno.test("GeneratorProcessor.process: metaData NÃO existe no resultado quando undefined (spread condicional)", async () => {
	const result = await makeProcessor().process(makeJob({ documentType: "pdf", metaData: undefined }) as never);

	assertEquals("metaData" in result, false);
});

// --- Tratamento de erros ---

Deno.test("GeneratorProcessor.process: erro do templateService é re-thrown para o BullMQ", async () => {
	const renderError = new Error("Template render failed");

	await assertRejects(
		() =>
			makeProcessor({ template: makeMockTemplateService({ throwError: renderError }) }).process(
				makeJob({ documentType: "pdf" }) as never,
			),
		Error,
		"Template render failed",
	);
});

Deno.test("GeneratorProcessor.process: erro do skreenService é re-thrown para o BullMQ gerenciar retry", async () => {
	await assertRejects(
		() =>
			makeProcessor({ skreen: makeMockSkreenService({ throwOnPdf: new Error("Render failed") }) }).process(
				makeJob({ documentType: "pdf" }) as never,
			),
		Error,
		"Render failed",
	);
});

Deno.test("GeneratorProcessor.process: logger.error é chamado quando o job falha", async () => {
	using loggerErrorStub = stub(Logger.prototype, "error", () => {});

	await assertRejects(
		() =>
			makeProcessor({ skreen: makeMockSkreenService({ throwOnPdf: new Error("Render failed") }) }).process(
				makeJob({ documentType: "pdf" }) as never,
			),
		Error,
		"Render failed",
	);

	assertSpyCalls(loggerErrorStub, 1);
});

// --- Validação Zod ---

Deno.test("GeneratorProcessor.process: rejeita job com documentType inválido antes de chamar qualquer serviço", async () => {
	let skreenCalled = false;
	const mockSkreen = {
		generatePdf: (): Promise<Uint8Array> => {
			skreenCalled = true;
			return Promise.resolve(FAKE_PDF_BYTES);
		},
		generateImage: (): Promise<Uint8Array> => {
			skreenCalled = true;
			return Promise.resolve(FAKE_IMAGE_BYTES);
		},
	};

	const job = makeJob({ documentType: "fax" as never });

	await assertRejects(() => makeProcessor({ skreen: mockSkreen }).process(job as never));

	assertEquals(skreenCalled, false);
});

Deno.test("GeneratorProcessor.process: rejeita job com templateData incompleto para o templateName informado", async () => {
	const job = makeJob({
		documentType: "pdf",
		templateName: TemplateName.PAYMENT_RECEIPT,
		templateData: { title: "Faltando campos" } as never,
	});

	await assertRejects(() => makeProcessor().process(job as never));
});

Deno.test("GeneratorProcessor.process: erro não-Error (string) é re-thrown e stack é undefined no log", async () => {
	const mockSkreen = {
		generatePdf: (): Promise<Uint8Array> => Promise.reject("string-error"),
		generateImage: (): Promise<Uint8Array> => Promise.resolve(FAKE_IMAGE_BYTES),
	};

	using loggerErrorStub = stub(Logger.prototype, "error", () => {});

	await assertRejects(
		() => makeProcessor({ skreen: mockSkreen }).process(makeJob({ documentType: "pdf" }) as never),
	);

	assertSpyCalls(loggerErrorStub, 1);
});
