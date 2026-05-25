/**
 * @file skreen.service.ts
 * @description Serviço de renderização de documentos via Skreen (WASM/Rust).
 *
 * Expõe métodos de alto nível para geração de PDF e captura de imagem PNG
 * a partir de HTML, usando o renderer WASM baseado em Blitz/Vello.
 * Não requer browser headless nem binários externos.
 */

import { Injectable, Logger } from "@nestjs/common";
import { skreen, skreenPdf, withTailwind } from "@tadashi/skreen";
import type { SkreenOptions } from "@tadashi/skreen";
import type { ImageOptions, PdfOptions } from "@/pdf-generation/dto/generate-document.job.ts";

/**
 * Serviço injetável que gerencia a renderização WASM via Skreen.
 *
 * @remarks
 * Não há ciclo de vida de browser — cada chamada é stateless e usa o
 * runtime WASM diretamente. O pre-processamento Tailwind é feito no host
 * quando `withTailwind: true`, pois o renderer não executa JavaScript.
 */
@Injectable()
export class SkreenService {
	private readonly logger = new Logger(SkreenService.name);

	// Referências às funções do renderer expostas como propriedades para facilitar testes.
	protected _renderPdf: (opts: SkreenOptions) => Promise<Uint8Array> = skreenPdf;
	protected _renderImage: (opts: SkreenOptions) => Promise<Uint8Array> = skreen;
	protected _withTailwind: (html: string) => Promise<string> = withTailwind;

	/**
	 * Renderiza um HTML em PDF e retorna o conteúdo como `Uint8Array`.
	 *
	 * @param html - HTML completo a ser renderizado
	 * @param options - Opções de configuração (viewport, escala, Tailwind, fontes)
	 * @returns Bytes do PDF gerado
	 */
	async generatePdf(html: string, options?: PdfOptions): Promise<Uint8Array> {
		const data = options?.withTailwind ? await this._withTailwind(html) : html;
		this.logger.log({ msg: "Rendering PDF", withTailwind: options?.withTailwind ?? false });
		return this._renderPdf({
			data,
			width: options?.width ?? 1200,
			height: options?.height ?? 800,
			scale: options?.scale ?? 2.0,
			fonts: options?.fonts,
		});
	}

	/**
	 * Renderiza um HTML em imagem PNG e retorna o conteúdo como `Uint8Array`.
	 *
	 * A altura padrão é `0` (auto-expand): o renderer ajusta automaticamente
	 * à altura do conteúdo, até o máximo de 4000px lógicos.
	 *
	 * @param html - HTML completo a ser renderizado
	 * @param options - Opções de configuração (viewport, escala, Tailwind, fontes)
	 * @returns Bytes da imagem PNG gerada
	 */
	async generateImage(html: string, options?: ImageOptions): Promise<Uint8Array> {
		const data = options?.withTailwind ? await this._withTailwind(html) : html;
		this.logger.log({ msg: "Rendering image", withTailwind: options?.withTailwind ?? false });
		return this._renderImage({
			data,
			width: options?.width ?? 1200,
			height: options?.height ?? 0,
			scale: options?.scale ?? 2.0,
			fonts: options?.fonts,
		});
	}
}
