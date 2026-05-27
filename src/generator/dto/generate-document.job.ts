/**
 * @file generate-document.job.ts
 * @description DTOs (Data Transfer Objects) para os jobs de geração de documentos.
 *
 * Define as interfaces de entrada e saída dos jobs processados pela fila
 * BullMQ `generator`. Estes contratos são compartilhados entre o
 * API Core (produtor) e o TrinoDocWorker (consumidor).
 */

/**
 * Opções de renderização para geração de documentos PDF via Skreen.
 *
 * @remarks
 * Todos os campos são opcionais; o `SkreenService` aplica valores
 * padrão sensatos para cada campo não informado.
 * O PDF é gerado via `fulgur` CLI (nativo), com suporte a múltiplas páginas
 * e texto selecionável. Tamanho de página e margens são controlados aqui,
 * estilos adicionais devem ser definidos via CSS no HTML.
 */
export interface PdfOptions {
	/**
	 * Tamanho da página.
	 * @defaultValue "A4"
	 */
	pageSize?: "A4" | "A3" | "Letter";

	/**
	 * Margem uniforme em milímetros.
	 * @defaultValue 20
	 */
	marginMm?: number;

	/**
	 * Título do documento escrito nos metadados do PDF.
	 */
	title?: string;

	/**
	 * Autor do documento escrito nos metadados do PDF.
	 */
	author?: string;
}

/**
 * Opções de renderização para geração de imagens PNG via Skreen.
 *
 * @remarks
 * O renderer WASM produz exclusivamente imagens PNG.
 * A altura padrão é `0` (auto-expand), que ajusta automaticamente
 * ao conteúdo renderizado (máx 4000px lógicos).
 */
export interface ImageOptions {
	/**
	 * Largura da viewport em pixels lógicos.
	 * @defaultValue 1200
	 */
	width?: number;

	/**
	 * Altura da viewport em pixels lógicos.
	 * Use `0` para expandir automaticamente até a altura do conteúdo (máx 4000px).
	 * @defaultValue 0
	 */
	height?: number;

	/**
	 * Device-pixel ratio aplicado ao bitmap de saída.
	 * @defaultValue 2.0
	 */
	scale?: number;

	/**
	 * Fontes adicionais a embutir na renderização (bytes raw TTF/OTF).
	 * Complementa a fonte Inter embutida por padrão.
	 */
	fonts?: Uint8Array[];
}

/**
 * Payload do job publicado na fila `generator` pelo API Core.
 *
 * @remarks
 * O campo `pdfOptions` deve ser informado quando `documentType === "pdf"`,
 * e `imageOptions` quando `documentType === "image"`. Ambos são opcionais
 * pois o `SkreenService` possui defaults para todos os parâmetros.
 */
export interface GenerateDocumentJobData {
	/** ID do usuário solicitante (repassado no result para o API Core) */
	userId: string;

	/** Tipo de saída: PDF ou imagem PNG */
	documentType: "pdf" | "image";

	/** HTML já renderizado pelo API Core, pronto para ser processado pelo Skreen */
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
