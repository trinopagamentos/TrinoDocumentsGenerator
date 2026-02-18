/**
 * @file generate-document.job.ts
 * @description DTOs (Data Transfer Objects) para os jobs de geração de documentos.
 *
 * Define as interfaces de entrada e saída dos jobs processados pela fila
 * BullMQ `pdf-generation`. Estes contratos são compartilhados entre o
 * API Core (produtor) e o TrinoDocWorker (consumidor).
 */

/**
 * Opções de configuração para geração de documentos PDF via Puppeteer.
 *
 * @remarks
 * Todos os campos são opcionais; o `PuppeteerService` aplica valores
 * padrão sensatos para cada campo não informado.
 */
export interface PdfOptions {
	/**
	 * Tamanho da página do PDF.
	 * @defaultValue "A4"
	 */
	format?: "A4" | "Letter" | "Legal";

	/**
	 * Orienta a página no modo paisagem (horizontal).
	 * @defaultValue false
	 */
	landscape?: boolean;

	/**
	 * Inclui os backgrounds definidos via CSS no PDF gerado.
	 * @defaultValue true
	 */
	printBackground?: boolean;

	/**
	 * Margens da página PDF. Aceita qualquer unidade CSS válida (ex: `"10mm"`, `"1cm"`, `"20px"`).
	 * @defaultValue `{ top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" }`
	 */
	margin?: {
		top?: string;
		right?: string;
		bottom?: string;
		left?: string;
	};

	/**
	 * Gera PDF com tags de acessibilidade (PDF/UA).
	 * @defaultValue true
	 */
	tagged?: boolean;

	/**
	 * Usa o tamanho de página definido via `@page` no CSS em vez do `format`.
	 * @defaultValue true
	 */
	preferCSSPageSize?: boolean;
}

/**
 * Opções de configuração para geração de imagens (screenshot) via Puppeteer.
 *
 * @remarks
 * O `PuppeteerService` aplica auto-fit por padrão: quando `clip` não é
 * informado, as dimensões do conteúdo são detectadas automaticamente e
 * usadas como região de captura, evitando espaços em branco extras.
 */
export interface ImageOptions {
	/**
	 * Formato da imagem gerada.
	 * @defaultValue "png"
	 */
	type?: "png" | "jpeg" | "webp";

	/**
	 * Qualidade da compressão para formatos com perdas (`jpeg`, `webp`). Valor de 0 a 100.
	 * Ignorado para `png`.
	 * @defaultValue 80
	 */
	quality?: number;

	/**
	 * Captura a página inteira, incluindo conteúdo fora da viewport.
	 * Mutuamente exclusivo com `clip`; usado como fallback quando as
	 * dimensões do conteúdo não podem ser detectadas.
	 * @defaultValue true (apenas no modo fallback)
	 */
	fullPage?: boolean;

	/**
	 * Fator de escala do dispositivo (DPR — Device Pixel Ratio).
	 * Use `2` para imagens de alta resolução (Retina/HiDPI).
	 * @defaultValue 1
	 */
	deviceScaleFactor?: number;

	/** Simula suporte a touch na viewport. */
	hasTouch?: boolean;

	/** Simula orientação paisagem na viewport. */
	isLandscape?: boolean;

	/**
	 * Simula viewport de dispositivo móvel.
	 * @defaultValue true
	 */
	isMobile?: boolean;

	/**
	 * Largura da viewport em pixels.
	 * @defaultValue 320
	 */
	width?: number;

	/**
	 * Altura da viewport em pixels.
	 * @defaultValue 1080
	 */
	height?: number;

	/**
	 * Define uma região de captura customizada (crop).
	 * Quando informado, tem precedência sobre o auto-fit e o `fullPage`.
	 */
	clip?: {
		/** Posição X (pixels) do canto superior esquerdo da região de captura */
		x: number;
		/** Posição Y (pixels) do canto superior esquerdo da região de captura */
		y: number;
		/** Largura da região de captura em pixels */
		width: number;
		/** Altura da região de captura em pixels */
		height: number;
	};

	/**
	 * Remove o fundo branco padrão da captura, permitindo fundo transparente (PNG).
	 * @defaultValue false
	 */
	omitBackground?: boolean;
}

/**
 * Payload do job publicado na fila `pdf-generation` pelo API Core.
 *
 * @remarks
 * O campo `pdfOptions` deve ser informado quando `documentType === "pdf"`,
 * e `imageOptions` quando `documentType === "image"`. Ambos são opcionais
 * pois o `PuppeteerService` possui defaults para todos os parâmetros.
 */
export interface GenerateDocumentJobData {
	/** ID do usuário solicitante (repassado no result para o API Core) */
	userId: string;

	/** Tipo de saída: PDF ou imagem (PNG/JPEG/WebP) */
	documentType: "pdf" | "image";

	/** HTML já renderizado pelo API Core, pronto para ser processado pelo Puppeteer */
	htmlContent: string;

	/** Chave S3 de destino onde o arquivo será salvo. Ex: `"receipt/payment/uuid.png"` */
	s3Key: string;

	/** Opções específicas para PDF (apenas quando `documentType === "pdf"`) */
	pdfOptions?: PdfOptions;

	/** Opções específicas para imagem (apenas quando `documentType === "image"`) */
	imageOptions?: ImageOptions;

	/** Dados arbitrários repassados integralmente ao API Core no resultado do job */
	metaData?: Record<string, unknown>;
}

/**
 * Resultado retornado pelo processor após a conclusão bem-sucedida do job.
 *
 * @remarks
 * Este objeto é armazenado pelo BullMQ e pode ser consultado pelo API Core
 * para obter a URL do documento gerado e confirmar a conclusão da tarefa.
 */
export interface GenerateDocumentJobResult {
	/** URL pública do arquivo armazenado no S3 */
	url: string;

	/** ID do usuário solicitante, repassado do {@link GenerateDocumentJobData} */
	userId: string;

	/** Timestamp ISO 8601 do momento em que o job foi concluído */
	completedAt: string;

	/** Dados arbitrários repassados do {@link GenerateDocumentJobData}, devolvidos integralmente ao API Core */
	metaData?: Record<string, unknown>;
}
