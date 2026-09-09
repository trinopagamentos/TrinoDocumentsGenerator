import "reflect-metadata";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { TailwindInlineService } from "@/shared/services/tailwind-inline.service.ts";

// Acesso tipado aos métodos privados para testes unitários
type TailwindPrivate = {
	buildCacheKey(html: string): string;
	extractDataTheme(html: string): string;
	injectAndStrip(html: string, css: string): string;
	oklch2rgb(L: number, C: number, H: number): [number, number, number];
	compileCSS(html: string): Promise<string>;
	cache: Map<string, string>;
};

function asPrivate(service: TailwindInlineService): TailwindPrivate {
	return service as unknown as TailwindPrivate;
}

function makeServiceWithMockedCompile(mockCss = "/* mock */"): TailwindInlineService {
	const service = new TailwindInlineService();
	asPrivate(service).compileCSS = (_html: string): Promise<string> => Promise.resolve(mockCss);
	return service;
}

// --- extractDataTheme ---

Deno.test("TailwindInlineService.extractDataTheme: retorna o valor de data-theme quando presente", () => {
	const service = new TailwindInlineService();
	const result = asPrivate(service).extractDataTheme('<html data-theme="light">');
	assertEquals(result, "light");
});

Deno.test("TailwindInlineService.extractDataTheme: retorna string vazia quando data-theme ausente", () => {
	const service = new TailwindInlineService();
	const result = asPrivate(service).extractDataTheme("<html><body></body></html>");
	assertEquals(result, "");
});

Deno.test("TailwindInlineService.extractDataTheme: retorna o primeiro data-theme encontrado", () => {
	const service = new TailwindInlineService();
	const result = asPrivate(service).extractDataTheme('<div data-theme="dark"><span data-theme="light">');
	assertEquals(result, "dark");
});

// --- buildCacheKey ---

Deno.test("TailwindInlineService.buildCacheKey: chave sem DaisyUI começa com '0:'", () => {
	const service = new TailwindInlineService();
	const key = asPrivate(service).buildCacheKey('<div class="text-red-500">');
	assertEquals(key.startsWith("0:"), true);
});

Deno.test("TailwindInlineService.buildCacheKey: chave com DaisyUI começa com '1:'", () => {
	const service = new TailwindInlineService();
	const html = '<link href="https://cdn.jsdelivr.net/npm/daisyui"><div class="btn">';
	const key = asPrivate(service).buildCacheKey(html);
	assertEquals(key.startsWith("1:"), true);
});

Deno.test("TailwindInlineService.buildCacheKey: inclui data-theme na chave", () => {
	const service = new TailwindInlineService();
	const key = asPrivate(service).buildCacheKey('<html data-theme="dark"><div class="p-4">');
	assertStringIncludes(key, "dark");
});

Deno.test("TailwindInlineService.buildCacheKey: classes são ordenadas — HTML com mesmas classes produz a mesma chave", () => {
	const service = new TailwindInlineService();
	const key1 = asPrivate(service).buildCacheKey('<div class="p-4 text-red-500">');
	const key2 = asPrivate(service).buildCacheKey('<div class="text-red-500 p-4">');
	assertEquals(key1, key2);
});

Deno.test("TailwindInlineService.buildCacheKey: HTML com dados dinâmicos diferentes mas mesmas classes produz a mesma chave", () => {
	const service = new TailwindInlineService();
	const key1 = asPrivate(service).buildCacheKey('<div class="btn btn-primary">Olá</div>');
	const key2 = asPrivate(service).buildCacheKey('<div class="btn btn-primary">Mundo</div>');
	assertEquals(key1, key2);
});

// --- oklch2rgb ---

Deno.test("TailwindInlineService.oklch2rgb: oklch(0, 0, 0) → preto (0, 0, 0)", () => {
	const service = new TailwindInlineService();
	const [r, g, b] = asPrivate(service).oklch2rgb(0, 0, 0);
	assertEquals(r, 0);
	assertEquals(g, 0);
	assertEquals(b, 0);
});

Deno.test("TailwindInlineService.oklch2rgb: oklch(1, 0, 0) → branco (255, 255, 255)", () => {
	const service = new TailwindInlineService();
	const [r, g, b] = asPrivate(service).oklch2rgb(1, 0, 0);
	assertEquals(r, 255);
	assertEquals(g, 255);
	assertEquals(b, 255);
});

Deno.test("TailwindInlineService.oklch2rgb: resultado é sempre inteiros entre 0 e 255", () => {
	const service = new TailwindInlineService();
	const testCases: [number, number, number][] = [
		[0.5, 0.1, 90],
		[0.7, 0.15, 200],
		[0.3, 0.05, 45],
	];
	for (const [L, C, H] of testCases) {
		const [r, g, b] = asPrivate(service).oklch2rgb(L, C, H);
		assertEquals(Number.isInteger(r), true);
		assertEquals(Number.isInteger(g), true);
		assertEquals(Number.isInteger(b), true);
		assertEquals(r >= 0 && r <= 255, true);
		assertEquals(g >= 0 && g <= 255, true);
		assertEquals(b >= 0 && b <= 255, true);
	}
});

// --- injectAndStrip ---

Deno.test("TailwindInlineService.injectAndStrip: injeta <style> antes de </head>", () => {
	const service = new TailwindInlineService();
	const html = "<html><head></head><body></body></html>";
	const result = asPrivate(service).injectAndStrip(html, ".btn{color:red}");
	assertStringIncludes(result, "<style>.btn{color:red}</style></head>");
});

Deno.test("TailwindInlineService.injectAndStrip: prepend <style> quando não há </head>", () => {
	const service = new TailwindInlineService();
	const html = "<body>Conteúdo</body>";
	const result = asPrivate(service).injectAndStrip(html, ".x{margin:0}");
	assertEquals(result.startsWith("<style>.x{margin:0}</style>"), true);
});

Deno.test("TailwindInlineService.injectAndStrip: remove tag <link> do CDN DaisyUI", () => {
	const service = new TailwindInlineService();
	const html =
		'<html><head><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui/dist/full.min.css"/></head></html>';
	const result = asPrivate(service).injectAndStrip(html, "");
	assertEquals(result.includes("cdn.jsdelivr.net/npm/daisyui"), false);
});

Deno.test("TailwindInlineService.injectAndStrip: remove tag <script> do CDN Tailwind browser", () => {
	const service = new TailwindInlineService();
	const html =
		'<html><head><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script></head></html>';
	const result = asPrivate(service).injectAndStrip(html, "");
	assertEquals(result.includes("cdn.jsdelivr.net/npm/@tailwindcss/browser"), false);
});

Deno.test("TailwindInlineService.injectAndStrip: preserva conteúdo original após remover CDN", () => {
	const service = new TailwindInlineService();
	const html =
		'<html><head><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script></head><body class="p-4">Conteúdo</body></html>';
	const result = asPrivate(service).injectAndStrip(html, "/* css */");
	assertStringIncludes(result, "Conteúdo");
	assertStringIncludes(result, 'class="p-4"');
});

// --- processHtml: comportamento com compileCSS mockado ---

Deno.test("TailwindInlineService.processHtml: retorna HTML com <style> injetado", async () => {
	const service = makeServiceWithMockedCompile(".btn{color:blue}");
	const html = "<html><head></head><body>Teste</body></html>";
	const result = await service.processHtml(html);
	assertStringIncludes(result, "<style>.btn{color:blue}</style>");
	assertStringIncludes(result, "Teste");
});

Deno.test("TailwindInlineService.processHtml: compileCSS chamado apenas uma vez para o mesmo HTML (cache hit)", async () => {
	let compileCalls = 0;
	const service = new TailwindInlineService();
	asPrivate(service).compileCSS = (_html: string): Promise<string> => {
		compileCalls++;
		return Promise.resolve("/* cached */");
	};

	const html = '<html><head></head><body class="text-red-500">X</body></html>';
	await service.processHtml(html);
	await service.processHtml(html);

	assertEquals(compileCalls, 1);
});

Deno.test("TailwindInlineService.processHtml: cache hit para HTML com mesmos estilos mas dados dinâmicos diferentes", async () => {
	let compileCalls = 0;
	const service = new TailwindInlineService();
	asPrivate(service).compileCSS = (_html: string): Promise<string> => {
		compileCalls++;
		return Promise.resolve("/* cached */");
	};

	await service.processHtml('<div class="btn btn-primary">Valor: R$ 100,00</div>');
	await service.processHtml('<div class="btn btn-primary">Valor: R$ 200,00</div>');

	assertEquals(compileCalls, 1);
});

Deno.test("TailwindInlineService.processHtml: compileCSS chamado novamente para HTML com classes diferentes (cache miss)", async () => {
	let compileCalls = 0;
	const service = new TailwindInlineService();
	asPrivate(service).compileCSS = (_html: string): Promise<string> => {
		compileCalls++;
		return Promise.resolve("/* css */");
	};

	await service.processHtml('<div class="text-red-500">A</div>');
	await service.processHtml('<div class="text-blue-500">B</div>');

	assertEquals(compileCalls, 2);
});

// --- compileCSS: compilação real via Tailwind v4 Node API (sem mock) ---

Deno.test({
	name: "TailwindInlineService.compileCSS: compila CSS real sem DaisyUI e converte oklch() para rgb()",
	fn: async () => {
		const service = new TailwindInlineService();
		const html = '<html><head></head><body class="text-red-500 p-4">Olá</body></html>';
		const css = await asPrivate(service).compileCSS(html);

		assertEquals(typeof css, "string");
		assertEquals(css.length > 0, true);
		// LightningCSS converte oklch() para rgb() — não deve sobrar oklch() no CSS final.
		assertEquals(css.includes("oklch("), false);
	},
	sanitizeResources: false,
	sanitizeOps: false,
});

Deno.test({
	name: "TailwindInlineService.compileCSS: compila CSS real com DaisyUI e tema ativo via loadModule",
	fn: async () => {
		const service = new TailwindInlineService();
		const html =
			'<html data-theme="dark"><head><link href="https://cdn.jsdelivr.net/npm/daisyui"></head><body class="btn btn-primary">Olá</body></html>';
		const css = await asPrivate(service).compileCSS(html);

		assertEquals(typeof css, "string");
		assertEquals(css.length > 0, true);
		assertStringIncludes(css, ".btn");
	},
	sanitizeResources: false,
	sanitizeOps: false,
});

Deno.test({
	name: "TailwindInlineService.processHtml: fluxo completo real (sem mock de compileCSS) injeta <style> compilado",
	fn: async () => {
		const service = new TailwindInlineService();
		const html = '<html><head></head><body class="text-blue-700">Real</body></html>';
		const result = await service.processHtml(html);

		assertStringIncludes(result, "<style>");
		assertStringIncludes(result, "Real");
	},
	sanitizeResources: false,
	sanitizeOps: false,
});
