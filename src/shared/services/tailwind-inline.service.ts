import { Injectable, Logger } from "@nestjs/common";
import { transform } from "lightningcss";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

@Injectable()
export class TailwindInlineService {
	private readonly logger = new Logger(TailwindInlineService.name);
	private readonly cache = new Map<string, string>();

	/**
	 * Processa o HTML substituindo referências CDN do Tailwind/DaisyUI por CSS compilado inline.
	 *
	 * Fluxo:
	 * 1. Gera uma assinatura baseada nas classes CSS e na presença do DaisyUI
	 * 2. Compila o CSS via Tailwind v4 Node API (com cache em memória por assinatura)
	 * 3. Remove tags CDN do Tailwind e DaisyUI do HTML
	 * 4. Injeta `<style>` com o CSS compilado antes de `</head>`
	 *
	 * @param html - HTML bruto com referências CDN
	 * @returns HTML com CSS compilado inline, pronto para renderização
	 */
	async processHtml(html: string): Promise<string> {
		const cacheKey = this.buildCacheKey(html);
		let css = this.cache.get(cacheKey);
		if (!css) {
			this.logger.log(`[TailwindInline] cache miss key=${cacheKey.slice(0, 12)}…`);
			css = await this.compileCSS(html);
			this.cache.set(cacheKey, css);
		}
		return this.injectAndStrip(html, css);
	}

	/**
	 * Gera uma chave de cache baseada no conjunto de classes CSS únicas presentes no HTML,
	 * na presença do DaisyUI e no tema ativo (data-theme). Templates idênticos produzem a
	 * mesma chave independente dos dados dinâmicos.
	 */
	private buildCacheKey(html: string): string {
		const hasDaisyUi = html.includes("cdn.jsdelivr.net/npm/daisyui");
		const theme = this.extractDataTheme(html);
		const classes = new Set<string>();
		for (const match of html.matchAll(/class="([^"]+)"/g)) {
			for (const cls of match[1].split(/\s+/)) {
				if (cls) classes.add(cls);
			}
		}
		return `${hasDaisyUi ? "1" : "0"}:${theme}:${[...classes].sort().join(" ")}`;
	}

	/** Extrai o valor do primeiro atributo data-theme encontrado no HTML. */
	private extractDataTheme(html: string): string {
		const match = html.match(/data-theme="([^"]+)"/);
		return match ? match[1] : "";
	}

	/**
	 * Compila o CSS usando a API Node.js do Tailwind v4 e converte oklch() → rgb() via LightningCSS,
	 * garantindo compatibilidade com renderizadores que não suportam oklch.
	 *
	 * Usa `createRequire(import.meta.url)` para resolução de módulos relativa ao arquivo atual,
	 * sem depender do CWD do processo em runtime.
	 */
	private async compileCSS(html: string): Promise<string> {
		const hasDaisyUi = html.includes("cdn.jsdelivr.net/npm/daisyui");
		const theme = this.extractDataTheme(html);
		const nodeRequire = createRequire(import.meta.url);
		const pkgMain = nodeRequire.resolve("tailwindcss");
		const twDir = resolve(dirname(pkgMain), "..");
		const twCss = await readFile(resolve(twDir, "index.css"), "utf8");
		const daisyuiDirective = theme ? `@plugin "daisyui" {\n  themes: ${theme};\n}` : `@plugin "daisyui"`;
		const inputCss = hasDaisyUi ? `${daisyuiDirective}\n${twCss}` : twCss;

		const { compile } = await import("tailwindcss");
		const { build } = await compile(inputCss, {
			base: twDir,
			loadModule: hasDaisyUi
				? (id, _base) => {
					const filePath = nodeRequire.resolve(id);
					const mod = nodeRequire(id);
					return Promise.resolve({
						path: filePath,
						base: dirname(filePath),
						module: (mod as { default?: unknown }).default ?? mod,
					});
				}
				: undefined,
		});

		const candidates = [...new Set(html.match(/[\w\-:/[\]]+/g) ?? [])];
		const rawCss = build(candidates);

		// LightningCSS não converte oklch() dentro de custom properties (tokens opacos),
		// então fazemos a pré-conversão antes de passar pelo transform.
		const preConverted = rawCss.replace(
			/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+%?)?\s*\)/g,
			(_match, L: string, C: string, H: string) => {
				const l = L.endsWith("%") ? Number.parseFloat(L) / 100 : Number.parseFloat(L);
				const [r, g, b] = this.oklch2rgb(l, Number.parseFloat(C), Number.parseFloat(H));
				return `rgb(${r}, ${g}, ${b})`;
			},
		);

		// Chrome 80 não suporta oklch nem color-mix — LightningCSS converte e desempacota @supports
		const { code } = transform({
			filename: "style.css",
			code: Buffer.from(preConverted),
			targets: { chrome: 80 << 16 },
			errorRecovery: true,
		});

		return code.toString();
	}

	/**
	 * Converte oklch para rgb via oklab (intermediário).
	 * Implementa a conversão padrão: oklch → oklab → linear sRGB → sRGB com correção gamma.
	 */
	private oklch2rgb(L: number, C: number, H: number): [number, number, number] {
		const hRad = (H * Math.PI) / 180;
		const a = C * Math.cos(hRad);
		const b = C * Math.sin(hRad);

		const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
		const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
		const s_ = L - 0.0894841775 * a - 1.291485548 * b;

		const l = l_ * l_ * l_;
		const m = m_ * m_ * m_;
		const s = s_ * s_ * s_;

		const toSrgb = (x: number) => {
			const clamped = Math.max(0, Math.min(1, x));
			return Math.round((clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055) * 255);
		};

		return [
			toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
			toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
			toSrgb(-0.004196086 * l - 0.7034186147 * m + 1.707614701 * s),
		];
	}

	/**
	 * Remove as tags CDN do Tailwind e DaisyUI do HTML e injeta o CSS compilado como `<style>`.
	 */
	private injectAndStrip(html: string, css: string): string {
		const stripped = html
			.replace(/<link[^>]*cdn\.jsdelivr\.net\/npm\/daisyui[^>]*\/?>/g, "")
			.replace(/<script[^>]*cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser[^>]*><\/script>/g, "");
		const styleTag = `<style>${css}</style>`;
		return stripped.includes("</head>") ? stripped.replace("</head>", `${styleTag}</head>`) : styleTag + stripped;
	}
}
