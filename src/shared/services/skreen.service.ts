import { Injectable, Logger } from "@nestjs/common";
import { skreen, skreenPdf } from "@tadashi/skreen";
import type { SkreenOptions } from "@tadashi/skreen";
import type { ImageOptions, PdfOptions } from "@/generator/dto/generate-document.job.ts";

@Injectable()
export class SkreenService {
	private readonly logger = new Logger(SkreenService.name);

	protected _renderPdf: (opts: SkreenOptions) => Promise<Uint8Array> = skreenPdf;
	protected _renderImage: (opts: SkreenOptions) => Promise<Uint8Array> = skreen;

	generatePdf(html: string, options?: PdfOptions): Promise<Uint8Array> {
		this.logger.log({ msg: "Rendering PDF" });
		return this._renderPdf({
			data: html,
			width: options?.width ?? 1200,
			height: options?.height ?? 800,
			scale: options?.scale ?? 2.0,
			fonts: options?.fonts,
		});
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
