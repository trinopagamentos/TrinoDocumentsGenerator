import "reflect-metadata";
import { assertEquals, assertRejects } from "@std/assert";
import type { SkreenOptions } from "@tadashi/skreen";
import { SkreenService } from "@/shared/services/skreen.service.ts";

const PDF_BYTES = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // %PDF-1.4
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header

function makeService(overrides?: {
	renderPdf?: (opts: SkreenOptions) => Promise<Uint8Array>;
	renderImage?: (opts: SkreenOptions) => Promise<Uint8Array>;
}): SkreenService {
	const service = new SkreenService();
	if (overrides?.renderPdf) service["_renderPdf"] = overrides.renderPdf;
	if (overrides?.renderImage) service["_renderImage"] = overrides.renderImage;
	return service;
}

// --- generatePdf ---

Deno.test("SkreenService.generatePdf: retorna Uint8Array com bytes do PDF", async () => {
	const service = makeService({ renderPdf: () => Promise.resolve(PDF_BYTES) });
	const result = await service.generatePdf("<html></html>");
	assertEquals(result instanceof Uint8Array, true);
	assertEquals(result, PDF_BYTES);
});

Deno.test("SkreenService.generatePdf: usa defaults quando options não é fornecido", async () => {
	let captured: SkreenOptions | undefined;
	const service = makeService({
		renderPdf: (opts) => {
			captured = opts;
			return Promise.resolve(PDF_BYTES);
		},
	});

	await service.generatePdf("<html></html>");

	assertEquals(captured?.width, 1200);
	assertEquals(captured?.height, 800);
	assertEquals(captured?.scale, 2.0);
	assertEquals(captured?.data, "<html></html>");
});

Deno.test("SkreenService.generatePdf: repassa opções corretamente para o renderer", async () => {
	let captured: SkreenOptions | undefined;
	const service = makeService({
		renderPdf: (opts) => {
			captured = opts;
			return Promise.resolve(PDF_BYTES);
		},
	});

	await service.generatePdf("<html></html>", { width: 800, height: 600, scale: 1.5 });

	assertEquals(captured?.width, 800);
	assertEquals(captured?.height, 600);
	assertEquals(captured?.scale, 1.5);
});

Deno.test("SkreenService.generatePdf: propaga erros do renderer", async () => {
	const service = makeService({
		renderPdf: () => Promise.reject(new Error("render failed")),
	});
	await assertRejects(() => service.generatePdf("<html></html>"), Error, "render failed");
});

// --- generateImage ---

Deno.test("SkreenService.generateImage: retorna Uint8Array com bytes da imagem", async () => {
	const service = makeService({ renderImage: () => Promise.resolve(PNG_BYTES) });
	const result = await service.generateImage("<html></html>");
	assertEquals(result instanceof Uint8Array, true);
	assertEquals(result, PNG_BYTES);
});

Deno.test("SkreenService.generateImage: usa height: 0 como default (auto-expand)", async () => {
	let captured: SkreenOptions | undefined;
	const service = makeService({
		renderImage: (opts) => {
			captured = opts;
			return Promise.resolve(PNG_BYTES);
		},
	});

	await service.generateImage("<html></html>");

	assertEquals(captured?.height, 0);
	assertEquals(captured?.width, 1200);
	assertEquals(captured?.scale, 2.0);
});

Deno.test("SkreenService.generateImage: repassa opções corretamente para o renderer", async () => {
	let captured: SkreenOptions | undefined;
	const service = makeService({
		renderImage: (opts) => {
			captured = opts;
			return Promise.resolve(PNG_BYTES);
		},
	});

	await service.generateImage("<html></html>", { width: 400, height: 300, scale: 1.0 });

	assertEquals(captured?.width, 400);
	assertEquals(captured?.height, 300);
	assertEquals(captured?.scale, 1.0);
});

Deno.test("SkreenService.generateImage: propaga erros do renderer", async () => {
	const service = makeService({
		renderImage: () => Promise.reject(new Error("image render failed")),
	});
	await assertRejects(() => service.generateImage("<html></html>"), Error, "image render failed");
});
