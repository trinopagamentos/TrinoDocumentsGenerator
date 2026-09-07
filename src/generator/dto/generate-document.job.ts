/**
 * @file generate-document.job.ts
 * @description DTOs (schemas Zod) para os jobs de geração de documentos.
 *
 * Define os schemas de entrada e saída dos jobs processados pela fila
 * BullMQ `generator`. Estes contratos são compartilhados entre o
 * API Core (produtor) e o TrinoDocWorker (consumidor).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Opções de renderização
// ---------------------------------------------------------------------------

/**
 * Opções de renderização para geração de documentos PDF via Skreen.
 */
export const PdfOptionsSchema = z.object({
	/** @defaultValue "A4" */
	pageSize: z.enum(["A4", "A3", "Letter"]).optional(),
	/** Margem em mm. Aceita shorthand CSS: `"20"`, `"20 30"`, `"10 20 30"`, `"10 20 30 40"`. @defaultValue 20 */
	marginMm: z.union([z.number(), z.string()]).optional(),
	/** Título do documento nos metadados do PDF. */
	title: z.string().optional(),
	/** Autor do documento nos metadados do PDF. */
	author: z.string().optional(),
	/** Orientação paisagem. */
	landscape: z.boolean().optional(),
	/** Tag de idioma BCP 47, ex: `"pt-BR"`. */
	language: z.string().optional(),
	/** Caminhos absolutos para arquivos de fonte a embutir. */
	fonts: z.array(z.string()).optional(),
	/** Caminhos absolutos para arquivos CSS a incluir. */
	css: z.array(z.string()).optional(),
	/** Gerar outline a partir dos headings. */
	bookmarks: z.boolean().optional(),
	/** Habilitar árvore de estrutura para acessibilidade. */
	tagged: z.boolean().optional(),
	/** Conformidade PDF/UA-1 (implica `tagged` e `bookmarks`). */
	pdfUa: z.boolean().optional(),
});
export type PdfOptions = z.infer<typeof PdfOptionsSchema>;

/**
 * Opções de renderização para geração de imagens PNG via Skreen.
 */
export const ImageOptionsSchema = z.object({
	/** Largura da viewport em pixels lógicos. @defaultValue 1200 */
	width: z.number().optional(),
	/** Altura da viewport. Use `0` para auto-expand. @defaultValue 0 */
	height: z.number().optional(),
	/** Device-pixel ratio. @defaultValue 2.0 */
	scale: z.number().optional(),
	/** Fontes adicionais a embutir. Aceita caminhos de arquivo (string) ou bytes raw TTF/OTF (Uint8Array). */
	fonts: z.array(z.union([z.string(), z.instanceof(Uint8Array)])).optional(),
});
export type ImageOptions = z.infer<typeof ImageOptionsSchema>;

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
	EMPLOYEE_PAYMENTS_EXPORT = "employee-payments-export",
}

// ---------------------------------------------------------------------------
// Schemas de dados por template
// ---------------------------------------------------------------------------

export const PaymentReceiptDataSchema = z.object({
	title: z.string(),
	currentDate: z.string(),
	amount: z.string(),
	transaction_type: z.string(),
	recipient_business_name: z.string(),
	recipient_doc: z.string(),
	recipient_doc_type: z.string(),
	source_name: z.string(),
	source_doc: z.string(),
	source_doc_type: z.string(),
	transaction_id: z.string(),
	sac: z.string(),
});
export type PaymentReceiptData = z.infer<typeof PaymentReceiptDataSchema>;

export const ReversalReceiptDataSchema = z.object({
	title: z.string(),
	currentDate: z.string(),
	amount: z.string(),
	transaction_type: z.string(),
	applicant_name: z.string(),
	applicant_doc: z.string(),
	applicant_doc_type: z.string(),
	recipient_name: z.string(),
	recipient_doc: z.string(),
	recipient_doc_type: z.string(),
	transaction_id: z.string(),
	sac: z.string(),
});
export type ReversalReceiptData = z.infer<typeof ReversalReceiptDataSchema>;

export const WithdrawReceiptDataSchema = z.object({
	title: z.string(),
	currentDate: z.string(),
	amount: z.string(),
	applicant_business_name: z.string(),
	applicant_doc: z.string(),
	applicant_doc_type: z.string(),
	applicant_pix_key: z.string(),
	transaction_type: z.string(),
	recipient_business_name: z.string(),
	recipient_doc: z.string(),
	recipient_doc_type: z.string(),
	fee_amount: z.string(),
	fee_iof: z.string(),
	fee_cet: z.string(),
	transaction_id: z.string(),
	sac: z.string(),
});
export type WithdrawReceiptData = z.infer<typeof WithdrawReceiptDataSchema>;

export const AnticipationReceiptDataSchema = z.object({
	title: z.string(),
	currentDate: z.string(),
	amount: z.string(),
	applicant_name: z.string(),
	applicant_doc: z.string(),
	applicant_doc_type: z.string(),
	transaction_type: z.string(),
	transaction_id: z.string(),
	sac: z.string(),
});
export type AnticipationReceiptData = z.infer<typeof AnticipationReceiptDataSchema>;

export const TransferReceiptDataSchema = z.object({
	title: z.string(),
	currentDate: z.string(),
	amount: z.string(),
	transaction_type: z.string(),
	recipient_business_name: z.string(),
	recipient_doc: z.string(),
	recipient_doc_type: z.string(),
	source_name: z.string(),
	source_doc: z.string(),
	source_doc_type: z.string(),
	transaction_id: z.string(),
	sac: z.string(),
});
export type TransferReceiptData = z.infer<typeof TransferReceiptDataSchema>;

export const AnticipationContractDataSchema = z.object({
	issueDate: z.string(),
	company: z.object({
		fullName: z.string(),
		document: z.string(),
		address: z.string(),
		phone: z.string(),
		email: z.string(),
		responsible: z.object({
			fullName: z.string(),
			document: z.string(),
		}),
	}),
	employee: z.object({
		fullName: z.string(),
		document: z.string(),
		cargo: z.string(),
		matricula: z.string(),
		dataAdmissao: z.string(),
	}),
	anticipation: z.object({
		amount: z.string(),
		dataSolicitacao: z.string(),
		dataLiberacao: z.string(),
		contaDeposito: z.string(),
	}),
	signatures: z.object({
		employee: z.object({ name: z.string() }),
		responsible: z.object({ name: z.string() }),
	}),
	/** SVG do QR code do colaborador (PF), com class="size-[250px]" aplicada */
	qrcode_pf: z.string(),
	/** SVG do QR code do responsável (PJ), com class="size-[250px]" aplicada */
	qrcode_pj: z.string(),
});
export type AnticipationContractData = z.infer<typeof AnticipationContractDataSchema>;

export const EmployeePaymentsExportDataSchema = z.object({
	title: z.string(),
	generatedAt: z.string(),
	companyName: z.string(),
	companyDocument: z.string(),
	startDate: z.string(),
	endDate: z.string(),
	totalRows: z.number(),
	totals: z.object({
		amount: z.string(),
		feeAmount: z.string(),
		finalAmount: z.string(),
	}),
	items: z.array(
		z.object({
			id: z.string(),
			createdDate: z.string(),
			status: z.string(),
			payerPreferredName: z.string(),
			paymentType: z.string(),
			amount: z.string(),
			feeAmount: z.string(),
			finalAmount: z.string(),
		}),
	),
});
export type EmployeePaymentsExportData = z.infer<typeof EmployeePaymentsExportDataSchema>;

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

const generateDocumentJobBaseShape = {
	/** ID do usuário solicitante (repassado no result para o API Core) */
	userId: z.string(),
	/** Tipo de saída: PDF ou imagem PNG */
	documentType: z.enum(["pdf", "image"]),
	/** Chave S3 de destino. Ex: `"receipt/payment/uuid.png"` */
	s3Key: z.string(),
	/** Opções específicas para PDF */
	pdfOptions: PdfOptionsSchema.optional(),
	/** Opções específicas para imagem */
	imageOptions: ImageOptionsSchema.optional(),
	/** Dados arbitrários repassados ao API Core no resultado */
	metaData: z.record(z.string(), z.unknown()).optional(),
};

/**
 * Schema do payload publicado na fila `generator` pelo API Core.
 *
 * O worker recebe `templateName + templateData`, renderiza o template Handlebars,
 * processa o CSS Tailwind inline e gera o documento final (PDF ou imagem).
 */
export const GenerateDocumentJobDataSchema = z.discriminatedUnion("templateName", [
	z.object({
		...generateDocumentJobBaseShape,
		templateName: z.literal(TemplateName.PAYMENT_RECEIPT),
		templateData: PaymentReceiptDataSchema,
	}),
	z.object({
		...generateDocumentJobBaseShape,
		templateName: z.literal(TemplateName.REVERSAL_RECEIPT),
		templateData: ReversalReceiptDataSchema,
	}),
	z.object({
		...generateDocumentJobBaseShape,
		templateName: z.literal(TemplateName.WITHDRAW_RECEIPT),
		templateData: WithdrawReceiptDataSchema,
	}),
	z.object({
		...generateDocumentJobBaseShape,
		templateName: z.literal(TemplateName.ANTICIPATION_RECEIPT),
		templateData: AnticipationReceiptDataSchema,
	}),
	z.object({
		...generateDocumentJobBaseShape,
		templateName: z.literal(TemplateName.TRANSFER_RECEIPT),
		templateData: TransferReceiptDataSchema,
	}),
	z.object({
		...generateDocumentJobBaseShape,
		templateName: z.literal(TemplateName.COMPROVANTE),
		templateData: AnticipationContractDataSchema,
	}),
	z.object({
		...generateDocumentJobBaseShape,
		templateName: z.literal(TemplateName.EMPLOYEE_PAYMENTS_EXPORT),
		templateData: EmployeePaymentsExportDataSchema,
	}),
]);
export type GenerateDocumentJobData = z.infer<typeof GenerateDocumentJobDataSchema>;

// ---------------------------------------------------------------------------
// Resultado do job
// ---------------------------------------------------------------------------

/**
 * Resultado retornado pelo processor após a conclusão bem-sucedida do job.
 */
export const GenerateDocumentJobResultSchema = z.object({
	/** URL pública do arquivo armazenado no S3 */
	url: z.string(),
	/** ID do usuário solicitante */
	userId: z.string(),
	/** Timestamp ISO 8601 de conclusão */
	completedAt: z.string(),
	/** Dados arbitrários repassados do payload de entrada */
	metaData: z.record(z.string(), z.unknown()).optional(),
});
export type GenerateDocumentJobResult = z.infer<typeof GenerateDocumentJobResultSchema>;
