import { Injectable, Logger } from "@nestjs/common";
import { skreen, skreenPdf } from "@tadashi/skreen";
import type { SkreenOptions, SkreenPdfOptions } from "@tadashi/skreen";
import type { ImageOptions, PdfOptions } from "@/generator/dto/generate-document.job.ts";

const ROBOTO_FONT = new URL("../../../fonts/Roboto-VariableFont.ttf", import.meta.url).pathname;

@Injectable()
export class SkreenService {
	private readonly logger = new Logger(SkreenService.name);

	protected _renderPdf: (opts: SkreenPdfOptions) => Promise<Uint8Array> = skreenPdf;
	protected _renderImage: (opts: SkreenOptions) => Promise<Uint8Array> = skreen;

	generatePdf(html: string, options?: PdfOptions): Promise<Uint8Array> {
		this.logger.log({ msg: "Rendering PDF" });
		return this._renderPdf({
			data: this.injectBaseStyles(html),
			pageSize: options?.pageSize ?? "A4",
			marginMm: options?.marginMm ?? 20,
			title: options?.title,
			author: options?.author,
			landscape: options?.landscape,
			language: options?.language,
			fonts: [ROBOTO_FONT, ...(options?.fonts ?? [])],
			css: options?.css,
			bookmarks: options?.bookmarks,
			tagged: options?.tagged,
			pdfUa: options?.pdfUa,
		});
	}

	generateImage(html: string, options?: ImageOptions): Promise<Uint8Array> {
		this.logger.log({ msg: "Rendering image" });
		return this._renderImage({
			data: this.injectBaseStyles(html),
			width: options?.width ?? 1200,
			height: options?.height ?? 0,
			scale: options?.scale ?? 2.0,
			fonts: [ROBOTO_FONT, ...(options?.fonts ?? [])],
		});
	}

	private injectBaseStyles(html: string): string {
		const style =
			`<style>html{background:white;font-family:Roboto,sans-serif}body{font-family:Roboto,sans-serif}</style>`;
		return html.includes("</head>") ? html.replace("</head>", `${style}</head>`) : style + html;
	}
}
