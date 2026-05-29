import { Injectable, Logger } from "@nestjs/common";
import { skreen, skreenPdf } from "@tadashi/skreen";
import type { SkreenOptions, SkreenPdfOptions } from "@tadashi/skreen";
import type { ImageOptions, PdfOptions } from "@/generator/dto/generate-document.job.ts";

@Injectable()
export class SkreenService {
	private readonly logger = new Logger(SkreenService.name);

	protected _renderPdf: (opts: SkreenPdfOptions) => Promise<Uint8Array> = skreenPdf;
	protected _renderImage: (opts: SkreenOptions) => Promise<Uint8Array> = skreen;

	generatePdf(html: string, options?: PdfOptions): Promise<Uint8Array> {
		this.logger.log({ msg: "Rendering PDF" });
		const useBuiltinFonts = options?.useBuiltinFonts ?? true;
		const data = useBuiltinFonts ? this.injectBuiltinFontFaces(html) : html;
		return this._renderPdf({
			data,
			pageSize: options?.pageSize ?? "A4",
			marginMm: options?.marginMm ?? 20,
			title: options?.title,
			author: options?.author,
			landscape: options?.landscape,
			language: options?.language,
			fonts: options?.fonts,
			css: options?.css,
			bookmarks: options?.bookmarks,
			tagged: options?.tagged,
			pdfUa: options?.pdfUa,
			useBuiltinFonts: options?.useBuiltinFonts,
		});
	}

	/**
	 * Injeta @font-face para Inter Regular e Bold no HTML antes de passar para o fulgur.
	 * Necessário no Alpine/musl onde fulgur não usa fontconfig — só carrega fontes via CSS @font-face.
	 * Os arquivos são extraídos pelo skreen em getBuiltinFontPaths() antes do fulgur ser invocado.
	 */
	private injectBuiltinFontFaces(html: string): string {
		const cacheDir = `${Deno.env.get("HOME") ?? "/tmp"}/.cache/skreen-fonts`;
		const style = `<style>
@font-face{font-family:'Inter';font-weight:400;src:url('file://${cacheDir}/Inter-Regular.ttf')}
@font-face{font-family:'Inter';font-weight:700;src:url('file://${cacheDir}/Inter-Bold.ttf')}
body,html{font-family:'Inter',sans-serif}
</style>`;
		return html.includes("</head>") ? html.replace("</head>", `${style}</head>`) : style + html;
	}

	generateImage(html: string, options?: ImageOptions): Promise<Uint8Array> {
		this.logger.log({ msg: "Rendering image" });
		return this._renderImage({
			data: html,
			width: options?.width ?? 1200,
			height: options?.height ?? 0,
			scale: options?.scale ?? 2.0,
			fonts: options?.fonts,
		});
	}
}
