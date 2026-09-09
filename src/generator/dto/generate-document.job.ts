/**
 * @file generate-document.job.ts
 * @description DTOs (schemas Valibot) para os jobs de geração de documentos.
 *
 * Define os schemas de entrada e saída dos jobs processados pela fila
 * BullMQ `generator`. Estes contratos são compartilhados entre o
 * API Core (produtor) e o TrinoDocWorker (consumidor).
 */

import isSvg from "is-svg";
import * as v from "valibot";

// ---------------------------------------------------------------------------
// Validações de segurança reutilizáveis
// ---------------------------------------------------------------------------

/** Diretório de assets (fontes/CSS) que o worker tem permissão de ler do disco. */
const ALLOWED_ASSET_DIR = new URL("../../../fonts/", import.meta.url).pathname;

/** Caminho de arquivo local restrito ao diretório de assets do worker. */
const safeAssetPath = v.pipe(
	v.string(),
	v.check(
		(p) => p.startsWith(ALLOWED_ASSET_DIR) && !p.includes(".."),
		"caminho de asset fora do diretório permitido",
	),
);

/** Padrões de SVG que habilitam SSRF/local-file-read no renderizador headless. */
const UNSAFE_SVG_PATTERN = /<script|foreignObject|(?:xlink:href|href)\s*=\s*["'](?!#)/i;

/** SVG validado estruturalmente (`is-svg`) e sem vetores de SSRF/local-file-read. */
const qrcodeSvgSchema = v.pipe(
	v.string(),
	v.maxLength(20_000),
	v.check((s) => isSvg(s), "qrcode deve ser um <svg> válido"),
	v.check(
		(s) => !UNSAFE_SVG_PATTERN.test(s),
		"qrcode SVG não pode conter script, foreignObject ou referências externas",
	),
);

// ---------------------------------------------------------------------------
// Opções de renderização
// ---------------------------------------------------------------------------

/**
 * Opções de renderização para geração de documentos PDF via Skreen.
 */
export const PdfOptionsSchema = v.object({
	/** @defaultValue "A4" */
	pageSize: v.optional(v.picklist(["A4", "A3", "Letter"])),
	/** Margem em mm. Aceita shorthand CSS: `"20"`, `"20 30"`, `"10 20 30"`, `"10 20 30 40"`. @defaultValue 20 */
	marginMm: v.optional(v.union([v.number(), v.string()])),
	/** Título do documento nos metadados do PDF. */
	title: v.optional(v.string()),
	/** Autor do documento nos metadados do PDF. */
	author: v.optional(v.string()),
	/** Orientação paisagem. */
	landscape: v.optional(v.boolean()),
	/** Tag de idioma BCP 47, ex: `"pt-BR"`. */
	language: v.optional(v.string()),
	/** Caminhos absolutos para arquivos de fonte a embutir. Restrito ao diretório de assets do worker. */
	fonts: v.optional(v.array(safeAssetPath)),
	/** Caminhos absolutos para arquivos CSS a incluir. Restrito ao diretório de assets do worker. */
	css: v.optional(v.array(safeAssetPath)),
	/** Gerar outline a partir dos headings. */
	bookmarks: v.optional(v.boolean()),
	/** Habilitar árvore de estrutura para acessibilidade. */
	tagged: v.optional(v.boolean()),
	/** Conformidade PDF/UA-1 (implica `tagged` e `bookmarks`). */
	pdfUa: v.optional(v.boolean()),
});
export type PdfOptions = v.InferOutput<typeof PdfOptionsSchema>;

/**
 * Opções de renderização para geração de imagens PNG via Skreen.
 */
export const ImageOptionsSchema = v.object({
	/** Largura da viewport em pixels lógicos. @defaultValue 1200 */
	width: v.optional(v.number()),
	/** Altura da viewport. Use `0` para auto-expand. @defaultValue 0 */
	height: v.optional(v.number()),
	/** Device-pixel ratio. @defaultValue 2.0 */
	scale: v.optional(v.number()),
	/** Fontes adicionais a embutir. Aceita caminhos de arquivo (string) ou bytes raw TTF/OTF (Uint8Array). */
	fonts: v.optional(v.array(v.union([v.string(), v.instance(Uint8Array)]))),
});
export type ImageOptions = v.InferOutput<typeof ImageOptionsSchema>;

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

export const PaymentReceiptDataSchema = v.object({
	title: v.string(),
	currentDate: v.string(),
	amount: v.string(),
	transaction_type: v.string(),
	recipient_business_name: v.string(),
	recipient_doc: v.string(),
	recipient_doc_type: v.string(),
	source_name: v.string(),
	source_doc: v.string(),
	source_doc_type: v.string(),
	transaction_id: v.string(),
	sac: v.string(),
});
export type PaymentReceiptData = v.InferOutput<typeof PaymentReceiptDataSchema>;

export const ReversalReceiptDataSchema = v.object({
	title: v.string(),
	currentDate: v.string(),
	amount: v.string(),
	transaction_type: v.string(),
	applicant_name: v.string(),
	applicant_doc: v.string(),
	applicant_doc_type: v.string(),
	recipient_name: v.string(),
	recipient_doc: v.string(),
	recipient_doc_type: v.string(),
	transaction_id: v.string(),
	sac: v.string(),
});
export type ReversalReceiptData = v.InferOutput<typeof ReversalReceiptDataSchema>;

export const WithdrawReceiptDataSchema = v.object({
	title: v.string(),
	currentDate: v.string(),
	amount: v.string(),
	applicant_business_name: v.string(),
	applicant_doc: v.string(),
	applicant_doc_type: v.string(),
	applicant_pix_key: v.string(),
	transaction_type: v.string(),
	recipient_business_name: v.string(),
	recipient_doc: v.string(),
	recipient_doc_type: v.string(),
	fee_amount: v.string(),
	fee_iof: v.string(),
	fee_cet: v.string(),
	transaction_id: v.string(),
	sac: v.string(),
});
export type WithdrawReceiptData = v.InferOutput<typeof WithdrawReceiptDataSchema>;

export const AnticipationReceiptDataSchema = v.object({
	title: v.string(),
	currentDate: v.string(),
	amount: v.string(),
	applicant_name: v.string(),
	applicant_doc: v.string(),
	applicant_doc_type: v.string(),
	transaction_type: v.string(),
	transaction_id: v.string(),
	sac: v.string(),
});
export type AnticipationReceiptData = v.InferOutput<typeof AnticipationReceiptDataSchema>;

export const TransferReceiptDataSchema = v.object({
	title: v.string(),
	currentDate: v.string(),
	amount: v.string(),
	transaction_type: v.string(),
	recipient_business_name: v.string(),
	recipient_doc: v.string(),
	recipient_doc_type: v.string(),
	source_name: v.string(),
	source_doc: v.string(),
	source_doc_type: v.string(),
	transaction_id: v.string(),
	sac: v.string(),
});
export type TransferReceiptData = v.InferOutput<typeof TransferReceiptDataSchema>;

export const AnticipationContractDataSchema = v.object({
	issueDate: v.string(),
	company: v.object({
		fullName: v.string(),
		document: v.string(),
		address: v.string(),
		phone: v.string(),
		email: v.string(),
		responsible: v.object({
			fullName: v.string(),
			document: v.string(),
		}),
	}),
	employee: v.object({
		fullName: v.string(),
		document: v.string(),
		cargo: v.string(),
		matricula: v.string(),
		dataAdmissao: v.string(),
	}),
	anticipation: v.object({
		amount: v.string(),
		dataSolicitacao: v.string(),
		dataLiberacao: v.string(),
		contaDeposito: v.string(),
	}),
	signatures: v.object({
		employee: v.object({ name: v.string() }),
		responsible: v.object({ name: v.string() }),
	}),
	/** SVG do QR code do colaborador (PF), com class="size-[250px]" aplicada */
	qrcode_pf: qrcodeSvgSchema,
	/** SVG do QR code do responsável (PJ), com class="size-[250px]" aplicada */
	qrcode_pj: qrcodeSvgSchema,
});
export type AnticipationContractData = v.InferOutput<typeof AnticipationContractDataSchema>;

export const EmployeePaymentsExportDataSchema = v.object({
	title: v.string(),
	generatedAt: v.string(),
	companyName: v.string(),
	companyDocument: v.string(),
	startDate: v.string(),
	endDate: v.string(),
	totalRows: v.number(),
	totals: v.object({
		amount: v.string(),
		feeAmount: v.string(),
		finalAmount: v.string(),
	}),
	items: v.array(
		v.object({
			id: v.string(),
			createdDate: v.string(),
			status: v.string(),
			payerPreferredName: v.string(),
			paymentType: v.string(),
			amount: v.string(),
			feeAmount: v.string(),
			finalAmount: v.string(),
		}),
	),
});
export type EmployeePaymentsExportData = v.InferOutput<typeof EmployeePaymentsExportDataSchema>;

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------

const generateDocumentJobBaseShape = {
	/** ID do usuário solicitante (repassado no result para o API Core) */
	userId: v.string(),
	/** Chave S3 de destino. Ex: `"receipt/payment/uuid.png"` */
	s3Key: v.string(),
	/** Opções específicas para PDF */
	pdfOptions: v.optional(PdfOptionsSchema),
	/** Opções específicas para imagem */
	imageOptions: v.optional(ImageOptionsSchema),
	/** Dados arbitrários repassados ao API Core no resultado */
	metaData: v.optional(v.record(v.string(), v.unknown())),
};

/**
 * Schema do payload publicado na fila `generator` pelo API Core.
 *
 * O worker recebe `templateName + templateData`, renderiza o template Handlebars,
 * processa o CSS Tailwind inline e gera o documento final (PDF ou imagem).
 */
export const GenerateDocumentJobDataSchema = v.variant("templateName", [
	v.object({
		...generateDocumentJobBaseShape,
		documentType: v.picklist(["pdf", "image"]),
		templateName: v.literal(TemplateName.PAYMENT_RECEIPT),
		templateData: PaymentReceiptDataSchema,
	}),
	v.object({
		...generateDocumentJobBaseShape,
		documentType: v.picklist(["pdf", "image"]),
		templateName: v.literal(TemplateName.REVERSAL_RECEIPT),
		templateData: ReversalReceiptDataSchema,
	}),
	v.object({
		...generateDocumentJobBaseShape,
		documentType: v.picklist(["pdf", "image"]),
		templateName: v.literal(TemplateName.WITHDRAW_RECEIPT),
		templateData: WithdrawReceiptDataSchema,
	}),
	v.object({
		...generateDocumentJobBaseShape,
		documentType: v.picklist(["pdf", "image"]),
		templateName: v.literal(TemplateName.ANTICIPATION_RECEIPT),
		templateData: AnticipationReceiptDataSchema,
	}),
	v.object({
		...generateDocumentJobBaseShape,
		documentType: v.picklist(["pdf", "image"]),
		templateName: v.literal(TemplateName.TRANSFER_RECEIPT),
		templateData: TransferReceiptDataSchema,
	}),
	v.object({
		...generateDocumentJobBaseShape,
		documentType: v.picklist(["pdf", "image"]),
		templateName: v.literal(TemplateName.COMPROVANTE),
		templateData: AnticipationContractDataSchema,
	}),
	v.object({
		...generateDocumentJobBaseShape,
		documentType: v.picklist(["pdf", "image"]),
		templateName: v.literal(TemplateName.EMPLOYEE_PAYMENTS_EXPORT),
		templateData: EmployeePaymentsExportDataSchema,
	}),
]);
export type GenerateDocumentJobData = v.InferOutput<typeof GenerateDocumentJobDataSchema>;

// ---------------------------------------------------------------------------
// Resultado do job
// ---------------------------------------------------------------------------

/**
 * Resultado retornado pelo processor após a conclusão bem-sucedida do job.
 */
export const GenerateDocumentJobResultSchema = v.object({
	/** URL pública do arquivo armazenado no S3 */
	url: v.string(),
	/** ID do usuário solicitante */
	userId: v.string(),
	/** Timestamp ISO 8601 de conclusão */
	completedAt: v.string(),
	/** Dados arbitrários repassados do payload de entrada */
	metaData: v.optional(v.record(v.string(), v.unknown())),
});
export type GenerateDocumentJobResult = v.InferOutput<typeof GenerateDocumentJobResultSchema>;
