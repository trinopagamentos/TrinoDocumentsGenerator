import "reflect-metadata";
import { assertEquals, assertRejects } from "@std/assert";
import { assertSpyCalls, stub } from "@std/testing/mock";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { Buffer } from "node:buffer";
import { PuppeteerService } from "@/shared/services/puppeteer.service";

const DUMMY_EXECUTABLE = "/usr/bin/chromium-test";

function makeConfig(localChromiumPath?: string) {
	return {
		get<T>(key: string): T | undefined {
			if (key === "localChromiumPath") return localChromiumPath as T | undefined;
			return undefined;
		},
	};
}

function makeMockPage(opts?: {
	pdfBytes?: Uint8Array;
	screenshotBytes?: Uint8Array;
	evaluateResult?: { width: number; height: number };
	throwOnPdf?: Error;
	throwOnScreenshot?: Error;
}) {
	return {
		setContent: (_html: string, _opts?: unknown): Promise<void> => Promise.resolve(),
		pdf: (_opts?: unknown): Promise<Uint8Array> => {
			if (opts?.throwOnPdf) return Promise.reject(opts.throwOnPdf);
			return Promise.resolve(opts?.pdfBytes ?? new Uint8Array([37, 80, 68, 70]));
		},
		screenshot: (_opts?: unknown): Promise<Uint8Array> => {
			if (opts?.throwOnScreenshot) return Promise.reject(opts.throwOnScreenshot);
			return Promise.resolve(opts?.screenshotBytes ?? new Uint8Array([137, 80, 78, 71]));
		},
		evaluate: (_fn: unknown): Promise<{ width: number; height: number }> =>
			Promise.resolve(opts?.evaluateResult ?? { width: 800, height: 600 }),
	};
}

function makeMockBrowser(page: ReturnType<typeof makeMockPage>) {
	let closed = false;
	return {
		newPage: (): Promise<ReturnType<typeof makeMockPage>> => Promise.resolve(page),
		close: (): Promise<void> => {
			closed = true;
			return Promise.resolve();
		},
		get wasClosed() {
			return closed;
		},
	};
}

// --- getExecutablePath (testado indiretamente via generatePdf) ---

Deno.test("PuppeteerService: usa localChromiumPath quando configurado", async () => {
	const page = makeMockPage();
	const browser = makeMockBrowser(page);
	let capturedExecPath: string | undefined;

	using launchStub = stub(puppeteer, "launch", (opts?: unknown) => {
		capturedExecPath = (opts as { executablePath?: string })?.executablePath;
		return Promise.resolve(browser as never);
	});

	const service = new PuppeteerService(makeConfig(DUMMY_EXECUTABLE) as never);
	await service.generatePdf("<html></html>");

	assertEquals(capturedExecPath, DUMMY_EXECUTABLE);
	assertSpyCalls(launchStub, 1);
});

Deno.test("PuppeteerService: usa chromium.executablePath como fallback quando localChromiumPath não está configurado", async () => {
	const REMOTE_PATH = "/tmp/chromium-bin";
	const page = makeMockPage();
	const browser = makeMockBrowser(page);
	let capturedExecPath: string | undefined;

	using _execPathStub = stub(chromium, "executablePath", () => Promise.resolve(REMOTE_PATH));
	using launchStub = stub(puppeteer, "launch", (opts?: unknown) => {
		capturedExecPath = (opts as { executablePath?: string })?.executablePath;
		return Promise.resolve(browser as never);
	});

	const service = new PuppeteerService(makeConfig(undefined) as never);
	await service.generatePdf("<html></html>");

	assertEquals(capturedExecPath, REMOTE_PATH);
	assertSpyCalls(launchStub, 1);
});

// --- generatePdf ---

Deno.test("PuppeteerService.generatePdf: chama page.setContent com waitUntil: networkidle0", async () => {
	const page = makeMockPage();
	const browser = makeMockBrowser(page);
	let capturedSetContentOpts: unknown;

	const origSetContent = page.setContent;
	page.setContent = (html: string, opts?: unknown): Promise<void> => {
		capturedSetContentOpts = opts;
		return origSetContent(html, opts);
	};

	using _execPathStub = stub(chromium, "executablePath", () => Promise.resolve(DUMMY_EXECUTABLE));
	using _launchStub = stub(puppeteer, "launch", () => Promise.resolve(browser as never));

	const service = new PuppeteerService(makeConfig() as never);
	await service.generatePdf("<html><body>teste</body></html>");

	assertEquals((capturedSetContentOpts as { waitUntil: string })?.waitUntil, "networkidle0");
});

Deno.test("PuppeteerService.generatePdf: passa opções mescladas para page.pdf", async () => {
	const page = makeMockPage();
	const browser = makeMockBrowser(page);
	let capturedPdfOpts: unknown;

	page.pdf = (opts?: unknown): Promise<Uint8Array> => {
		capturedPdfOpts = opts;
		return Promise.resolve(new Uint8Array([37, 80, 68, 70]));
	};

	using _execPathStub = stub(chromium, "executablePath", () => Promise.resolve(DUMMY_EXECUTABLE));
	using _launchStub = stub(puppeteer, "launch", () => Promise.resolve(browser as never));

	const service = new PuppeteerService(makeConfig() as never);
	await service.generatePdf("<html></html>", { format: "Letter", landscape: true });

	const opts = capturedPdfOpts as Record<string, unknown>;
	assertEquals(opts?.format, "Letter");
	assertEquals(opts?.landscape, true);
	// Defaults aplicados para opções não especificadas
	assertEquals(opts?.printBackground, true);
	assertEquals(opts?.tagged, true);
});

Deno.test("PuppeteerService.generatePdf: fecha o browser no finally mesmo em caso de erro", async () => {
	const page = makeMockPage({ throwOnPdf: new Error("PDF render failed") });
	const browser = makeMockBrowser(page);

	using _execPathStub = stub(chromium, "executablePath", () => Promise.resolve(DUMMY_EXECUTABLE));
	using _launchStub = stub(puppeteer, "launch", () => Promise.resolve(browser as never));

	const service = new PuppeteerService(makeConfig() as never);

	await assertRejects(() => service.generatePdf("<html></html>"), Error, "PDF render failed");

	assertEquals(browser.wasClosed, true);
});

Deno.test("PuppeteerService.generatePdf: retorna Buffer com bytes do PDF", async () => {
	const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // %PDF-1.4
	const page = makeMockPage({ pdfBytes });
	const browser = makeMockBrowser(page);

	using _execPathStub = stub(chromium, "executablePath", () => Promise.resolve(DUMMY_EXECUTABLE));
	using _launchStub = stub(puppeteer, "launch", () => Promise.resolve(browser as never));

	const service = new PuppeteerService(makeConfig() as never);
	const result = await service.generatePdf("<html></html>");

	assertEquals(result instanceof Buffer, true);
	assertEquals(result.length, pdfBytes.length);
});

// --- generateImage ---

Deno.test("PuppeteerService.generateImage: usa options.clip quando fornecido (prioridade máxima)", async () => {
	const customClip = { x: 10, y: 20, width: 300, height: 150 };
	const page = makeMockPage();
	const browser = makeMockBrowser(page);
	let capturedScreenshotOpts: unknown;

	page.screenshot = (opts?: unknown): Promise<Uint8Array> => {
		capturedScreenshotOpts = opts;
		return Promise.resolve(new Uint8Array([137, 80, 78, 71]));
	};

	using _execPathStub = stub(chromium, "executablePath", () => Promise.resolve(DUMMY_EXECUTABLE));
	using _launchStub = stub(puppeteer, "launch", () => Promise.resolve(browser as never));

	const service = new PuppeteerService(makeConfig() as never);
	await service.generateImage("<html></html>", { clip: customClip });

	const opts = capturedScreenshotOpts as Record<string, unknown>;
	assertEquals(opts?.clip, customClip);
	assertEquals(opts?.fullPage, undefined);
});

Deno.test("PuppeteerService.generateImage: usa auto-fit clip quando contentDimensions > 0", async () => {
	const page = makeMockPage({ evaluateResult: { width: 800, height: 600 } });
	const browser = makeMockBrowser(page);
	let capturedScreenshotOpts: unknown;

	page.screenshot = (opts?: unknown): Promise<Uint8Array> => {
		capturedScreenshotOpts = opts;
		return Promise.resolve(new Uint8Array([137, 80, 78, 71]));
	};

	using _execPathStub = stub(chromium, "executablePath", () => Promise.resolve(DUMMY_EXECUTABLE));
	using _launchStub = stub(puppeteer, "launch", () => Promise.resolve(browser as never));

	const service = new PuppeteerService(makeConfig() as never);
	await service.generateImage("<html></html>");

	const opts = capturedScreenshotOpts as Record<string, unknown>;
	assertEquals(opts?.clip, { x: 0, y: 0, width: 800, height: 600 });
	assertEquals(opts?.fullPage, undefined);
});

Deno.test("PuppeteerService.generateImage: usa fullPage como fallback quando contentDimensions = 0", async () => {
	const page = makeMockPage({ evaluateResult: { width: 0, height: 0 } });
	const browser = makeMockBrowser(page);
	let capturedScreenshotOpts: unknown;

	page.screenshot = (opts?: unknown): Promise<Uint8Array> => {
		capturedScreenshotOpts = opts;
		return Promise.resolve(new Uint8Array([137, 80, 78, 71]));
	};

	using _execPathStub = stub(chromium, "executablePath", () => Promise.resolve(DUMMY_EXECUTABLE));
	using _launchStub = stub(puppeteer, "launch", () => Promise.resolve(browser as never));

	const service = new PuppeteerService(makeConfig() as never);
	await service.generateImage("<html></html>");

	const opts = capturedScreenshotOpts as Record<string, unknown>;
	assertEquals(opts?.fullPage, true);
	assertEquals(opts?.clip, undefined);
});

Deno.test("PuppeteerService.generateImage: fecha o browser no finally mesmo em caso de erro", async () => {
	const page = makeMockPage({ throwOnScreenshot: new Error("Screenshot failed") });
	const browser = makeMockBrowser(page);

	using _execPathStub = stub(chromium, "executablePath", () => Promise.resolve(DUMMY_EXECUTABLE));
	using _launchStub = stub(puppeteer, "launch", () => Promise.resolve(browser as never));

	const service = new PuppeteerService(makeConfig() as never);

	await assertRejects(() => service.generateImage("<html></html>"), Error, "Screenshot failed");

	assertEquals(browser.wasClosed, true);
});
