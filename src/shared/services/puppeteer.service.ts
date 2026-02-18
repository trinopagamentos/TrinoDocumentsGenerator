/**
 * @file puppeteer.service.ts
 * @description Serviço de renderização de documentos via Puppeteer/Chromium headless.
 *
 * Abstrai o ciclo de vida do browser (launch → use → close) e expõe métodos
 * de alto nível para geração de PDF e captura de screenshot a partir de HTML.
 * Suporta tanto o Chromium local (desenvolvimento) quanto o binário fornecido
 * pelo pacote `@sparticuz/chromium` (produção em ECS/Lambda/Docker).
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import puppeteer, { type Browser, type ScreenshotOptions } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import type { ImageOptions, PdfOptions } from "@/pdf-generation/dto/generate-document.job.ts";
import { Buffer } from "node:buffer";

/**
 * Serviço injetável que gerencia a renderização headless via Puppeteer.
 *
 * @remarks
 * O browser é iniciado e encerrado a cada chamada de `generatePdf` ou
 * `generateImage` para garantir isolamento entre jobs e evitar vazamentos
 * de memória em ambientes de longa execução. A estratégia `try/finally`
 * assegura que o browser seja sempre fechado, mesmo em caso de erro.
 */
@Injectable()
export class PuppeteerService {
	private readonly logger = new Logger(PuppeteerService.name);

	/** @param config - ConfigService para leitura do `localChromiumPath` */
	constructor(private readonly config: ConfigService) {}

	/**
	 * Resolve o caminho do executável do Chromium a ser usado pelo Puppeteer.
	 *
	 * Prioriza o caminho local configurado via `LOCAL_CHROMIUM_PATH` (ideal para
	 * desenvolvimento). Caso não esteja definido, usa o binário do `@sparticuz/chromium`,
	 * que é otimizado para ambientes Linux serverless/containerizados.
	 *
	 * @returns Caminho absoluto para o executável do Chromium
	 */
	private async getExecutablePath(): Promise<string> {
		const localPath = this.config.get<string>("localChromiumPath");
		if (localPath) {
			this.logger.log({ msg: "Using local Chromium", path: localPath });
			return localPath;
		}
		// @sparticuz/chromium fornece o binário para Linux (ECS/Docker)
		const executablePath = await chromium.executablePath();
		this.logger.log({
			msg: "Using @sparticuz/chromium Chromium",
			path: executablePath,
		});
		return executablePath;
	}

	/**
	 * Renderiza um HTML em um arquivo PDF e retorna o conteúdo como `Buffer`.
	 *
	 * Abre um browser headless, carrega o HTML na página aguardando o evento
	 * `networkidle0` (todas as requisições concluídas) e gera o PDF com as
	 * opções fornecidas. O browser é encerrado ao final, seja em sucesso ou erro.
	 *
	 * @param html - HTML completo a ser renderizado (incluindo `<html>`, `<head>`, `<body>`)
	 * @param options - Opções de configuração do PDF (formato, margens, orientação, etc.)
	 * @returns Buffer contendo os bytes do PDF gerado
	 *
	 * @example
	 * const buffer = await puppeteerService.generatePdf('<html>...</html>', { format: 'A4' });
	 */
	async generatePdf(html: string, options?: PdfOptions): Promise<Buffer> {
		const executablePath = await this.getExecutablePath();

		// Desabilita o modo de renderização gráfica (GPU) — necessário em ambientes headless sem display
		chromium.setGraphicsMode = false;

		const chromiumArgs = chromium.args;
		const browser = await puppeteer.launch({
			args: puppeteer.defaultArgs({ args: chromiumArgs, headless: true }),
			executablePath,
			headless: true,
		});

		try {
			const page = await browser.newPage();
			// Aguarda networkidle0: garante que scripts e recursos externos foram carregados
			await page.setContent(html, { waitUntil: "networkidle0" });

			const pdf = await page.pdf({
				format: options?.format ?? "A4",
				landscape: options?.landscape ?? false,
				printBackground: options?.printBackground ?? true,
				margin: options?.margin ?? {
					top: "10mm",
					right: "10mm",
					bottom: "10mm",
					left: "10mm",
				},
				// Gera PDF acessível com tags semânticas (PDF/UA)
				tagged: options?.tagged ?? true,
				// Respeita o tamanho de página definido via @page no CSS
				preferCSSPageSize: options?.preferCSSPageSize ?? true,
			});

			return Buffer.from(pdf);
		} finally {
			// Garante o fechamento do browser mesmo em caso de erro na renderização
			await browser.close();
		}
	}

	/**
	 * Captura um screenshot de um HTML renderizado e retorna o conteúdo como `Buffer`.
	 *
	 * A estratégia de captura é determinada automaticamente em ordem de prioridade:
	 * 1. **Clip customizado** (`options.clip`): captura exatamente a região especificada
	 * 2. **Auto-fit**: detecta as dimensões reais do conteúdo via `scrollWidth/scrollHeight`
	 *    e usa como região de captura, eliminando espaços em branco extras
	 * 3. **Fallback `fullPage`**: usado quando as dimensões não podem ser detectadas
	 *
	 * @param html - HTML completo a ser renderizado (incluindo `<html>`, `<head>`, `<body>`)
	 * @param options - Opções de configuração da imagem (tipo, qualidade, viewport, clip, etc.)
	 * @returns Buffer contendo os bytes da imagem gerada (PNG, JPEG ou WebP)
	 *
	 * @example
	 * const buffer = await puppeteerService.generateImage('<html>...</html>', { type: 'png' });
	 */
	async generateImage(html: string, options?: ImageOptions): Promise<Buffer> {
		const executablePath = await this.getExecutablePath();

		// Desabilita o modo de renderização gráfica (GPU) — necessário em ambientes headless sem display
		chromium.setGraphicsMode = false;

		const chromiumArgs = chromium.args;
		// Configura a viewport antes do launch para que o layout seja calculado corretamente
		const browser: Browser = await puppeteer.launch({
			args: puppeteer.defaultArgs({ args: chromiumArgs, headless: true }),
			executablePath,
			headless: true,
			defaultViewport: {
				deviceScaleFactor: options?.deviceScaleFactor ?? 1,
				hasTouch: options?.hasTouch ?? false,
				isLandscape: options?.isLandscape ?? false,
				isMobile: options?.isMobile ?? true,
				width: options?.width ?? 320,
				height: options?.height ?? 1080,
			},
		});

		try {
			const page = await browser.newPage();

			// Aguarda `load` e `networkidle2` para garantir que imagens e fontes sejam carregadas
			await page.setContent(html, { waitUntil: ["load", "networkidle2"] });

			// Executa JavaScript no contexto do browser para obter as dimensões reais do conteúdo
			const contentDimensions = await page.evaluate(() => {
				// @ts-expect-error: runs in browser context where document is available
				const w = document.body.scrollWidth;
				// @ts-expect-error: runs in browser context where document is available
				const h = document.body.scrollHeight;
				return { width: w, height: h };
			});

			const screenshotOptions: ScreenshotOptions = {
				type: options?.type ?? "png",
				omitBackground: options?.omitBackground ?? false,
			};

			// Quality só é aplicável em formatos com perdas (JPEG e WebP)
			if (["jpeg", "webp"].includes(screenshotOptions?.type ?? "")) {
				screenshotOptions.quality = options?.quality ?? 80;
			}

			// Configurar clip ou fullPage (mutuamente exclusivos)
			if (options?.clip) {
				// Clip customizado fornecido pelo usuário — máxima precisão
				screenshotOptions.clip = options.clip;
				this.logger.log("✂️ Using custom clip:", options.clip);
			} else if (contentDimensions.width > 0 && contentDimensions.height > 0) {
				// Auto-fit: usar dimensões detectadas para fit perfeito (sem espaços extras)
				screenshotOptions.clip = {
					x: 0,
					y: 0,
					width: contentDimensions.width,
					height: contentDimensions.height,
				};
				this.logger.log("✂️ Auto-fit clip applied:", screenshotOptions.clip);
			} else {
				// Fallback: capturar página inteira se dimensões não detectadas
				screenshotOptions.fullPage = options?.fullPage ?? true;
				this.logger.log("📄 Using fullPage mode");
			}

			const screenshot = await page.screenshot(screenshotOptions);

			return Buffer.from(screenshot);
		} finally {
			// Garante o fechamento do browser mesmo em caso de erro na captura
			await browser.close();
		}
	}
}
