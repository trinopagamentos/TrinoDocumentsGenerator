/**
 * @file generate-document.job.ts
 * @description DTOs para os jobs de geração de documentos.
 *
 * Define as interfaces de entrada e saída dos jobs processados pela fila
 * BullMQ `generator`. Estes contratos são compartilhados entre o
 * API Core (produtor) e o TrinoDocWorker (consumidor).
 */

// ---------------------------------------------------------------------------
// Opções de renderização
// ---------------------------------------------------------------------------

/**
 * Opções de renderização para geração de documentos PDF via Skreen.
 */
export interface PdfOptions {
	/** @defaultValue "A4" */
	pageSize?: "A4" | "A3" | "Letter";
	/** Margem em mm. Aceita shorthand CSS: `"20"`, `"20 30"`, `"10 20 30"`, `"10 20 30 40"`. @defaultValue 20 */
	marginMm?: number | string;
	/** Título do documento nos metadados do PDF. */
	title?: string;
	/** Autor do documento nos metadados do PDF. */
	author?: string;
}

/**
 * Opções de renderização para geração de imagens PNG via Skreen.
 */
export interface ImageOptions {
	/** Largura da viewport em pixels lógicos. @defaultValue 1200 */
	width?: number;
	/** Altura da viewport. Use `0` para auto-expand. @defaultValue 0 */
	height?: number;
	/** Device-pixel ratio. @defaultValue 2.0 */
	scale?: number;
	/** Fontes adicionais a embutir (bytes raw TTF/OTF). */
	fonts?: Uint8Array[];
}

// ---------------------------------------------------------------------------
// Enum de templates disponíveis
// ---------------------------------------------------------------------------

export enum TemplateName {
	PAYMENT_RECEIPT = "payment-receipt",
	REVERSAL_RECEIPT = "reversal-receipt",
	WITHDRAW_RECEIPT = "withdraw-receipt",
	ANTICIPATION_RECEIPT = "anticipation-receipt",
	TRANSFER_RECEIPT = "transfer-receipt",
	COMPROVANTE = "comprovante",
}

// ---------------------------------------------------------------------------
// Interfaces de dados por template
// ---------------------------------------------------------------------------

export interface PaymentReceiptData {
	title: string;
	currentDate: string;
	amount: string;
	transaction_type: string;
	recipient_business_name: string;
	recipient_doc: string;
	recipient_doc_type: string;
	source_name: string;
	source_doc: string;
	source_doc_type: string;
	transaction_id: string;
	sac: string;
}

export interface ReversalReceiptData {
	title: string;
	currentDate: string;
	amount: string;
	transaction_type: string;
	applicant_name: string;
	applicant_doc: string;
	applicant_doc_type: string;
	recipient_name: string;
	recipient_doc: string;
	recipient_doc_type: string;
	transaction_id: string;
	sac: string;
}

export interface WithdrawReceiptData {
	title: string;
	currentDate: string;
	amount: string;
	applicant_business_name: string;
	applicant_doc: string;
	applicant_doc_type: string;
	applicant_pix_key: string;
	transaction_type: string;
	recipient_business_name: string;
	recipient_doc: string;
	recipient_doc_type: string;
	fee_amount: string;
	fee_iof: string;
	fee_cet: string;
	transaction_id: string;
	sac: string;
}

export interface AnticipationReceiptData {
	title: string;
	currentDate: string;
	amount: string;
	applicant_name: string;
	applicant_doc: string;
	applicant_doc_type: string;
	transaction_type: string;
	transaction_id: string;
	sac: string;
}

export interface TransferReceiptData {
	title: string;
	currentDate: string;
	amount: string;
	transaction_type: string;
	recipient_business_name: string;
	recipient_doc: string;
	recipient_doc_type: string;
	source_name: string;
	source_doc: string;
	source_doc_type: string;
	transaction_id: string;
	sac: string;
}

export interface AnticipationContractData {
	issueDate: string;
	company: {
		fullName: string;
		document: string;
		address: string;
		phone: string;
		email: string;
		responsible: {
			fullName: string;
			document: string;
		};
	};
	employee: {
		fullName: string;
		document: string;
		cargo: string;
		matricula: string;
		dataAdmissao: string;
	};
	anticipation: {
		amount: string;
		dataSolicitacao: string;
		dataLiberacao: string;
		contaDeposito: string;
	};
	signatures: {
		employee: { name: string };
		responsible: { name: string };
	};
	/** SVG do QR code do colaborador (PF), com class="size-[250px]" aplicada */
	qrcode_pf: string;
	/** SVG do QR code do responsável (PJ), com class="size-[250px]" aplicada */
	qrcode_pj: string;
}

// ---------------------------------------------------------------------------
// Union discriminada de templates
// ---------------------------------------------------------------------------

export type TemplatePayload =
	| { templateName: TemplateName.PAYMENT_RECEIPT; templateData: PaymentReceiptData }
	| { templateName: TemplateName.REVERSAL_RECEIPT; templateData: ReversalReceiptData }
	| { templateName: TemplateName.WITHDRAW_RECEIPT; templateData: WithdrawReceiptData }
	| { templateName: TemplateName.ANTICIPATION_RECEIPT; templateData: AnticipationReceiptData }
	| { templateName: TemplateName.TRANSFER_RECEIPT; templateData: TransferReceiptData }
	| { templateName: TemplateName.COMPROVANTE; templateData: AnticipationContractData };

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

interface GenerateDocumentJobBase {
	/** ID do usuário solicitante (repassado no result para o API Core) */
	userId: string;
	/** Tipo de saída: PDF ou imagem PNG */
	documentType: "pdf" | "image";
	/** Chave S3 de destino. Ex: `"receipt/payment/uuid.png"` */
	s3Key: string;
	/** Opções específicas para PDF */
	pdfOptions?: PdfOptions;
	/** Opções específicas para imagem */
	imageOptions?: ImageOptions;
	/** Dados arbitrários repassados ao API Core no resultado */
	metaData?: Record<string, unknown>;
}

/**
 * Payload do job publicado na fila `generator` pelo API Core.
 *
 * O worker recebe `templateName + templateData`, renderiza o template Handlebars,
 * processa o CSS Tailwind inline e gera o documento final (PDF ou imagem).
 */
export type GenerateDocumentJobData = GenerateDocumentJobBase & TemplatePayload;

// ---------------------------------------------------------------------------
// Resultado do job
// ---------------------------------------------------------------------------

/**
 * Resultado retornado pelo processor após a conclusão bem-sucedida do job.
 */
export interface GenerateDocumentJobResult {
	/** URL pública do arquivo armazenado no S3 */
	url: string;
	/** ID do usuário solicitante */
	userId: string;
	/** Timestamp ISO 8601 de conclusão */
	completedAt: string;
	/** Dados arbitrários repassados do payload de entrada */
	metaData?: Record<string, unknown>;
}
