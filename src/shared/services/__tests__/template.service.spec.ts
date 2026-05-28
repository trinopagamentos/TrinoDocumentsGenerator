import "reflect-metadata";
import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { TemplateService } from "@/shared/services/template.service.ts";
import { TemplateName } from "@/generator/dto/generate-document.job.ts";

// --- render: validação de template desconhecido ---

Deno.test("TemplateService.render: lança erro para template desconhecido", async () => {
	const service = new TemplateService();
	await assertRejects(
		() => service.render("template-invalido", {}),
		Error,
		"Template desconhecido: template-invalido",
	);
});

// --- render: compilação e renderização ---

Deno.test("TemplateService.render: compila e renderiza payment-receipt", async () => {
	const service = new TemplateService();
	await service.onModuleInit();
	const html = await service.render(TemplateName.PAYMENT_RECEIPT, {
		title: "Comprovante de pagamento",
		amount: "R$ 100,00",
		currentDate: "01/01/2025",
		transaction_type: "PIX",
		recipient_business_name: "Loja Teste",
		recipient_doc: "00.000.000/0001-00",
		recipient_doc_type: "CNPJ",
		source_name: "João Silva",
		source_doc: "000.000.000-00",
		source_doc_type: "CPF",
		transaction_id: "TXN-001",
		sac: "+55 11 0000-0000",
	});

	assertEquals(typeof html, "string");
	assertStringIncludes(html, "R$ 100,00");
	assertStringIncludes(html, "Loja Teste");
});

Deno.test("TemplateService.render: compila e renderiza reversal-receipt", async () => {
	const service = new TemplateService();
	await service.onModuleInit();
	const html = await service.render(TemplateName.REVERSAL_RECEIPT, {
		title: "Comprovante de estorno",
		amount: "R$ 50,00",
		currentDate: "01/01/2025",
		transaction_type: "Estorno PIX",
		applicant_name: "João Silva",
		applicant_doc: "000.000.000-00",
		applicant_doc_type: "CPF",
		recipient_name: "Maria Costa",
		recipient_doc: "111.111.111-11",
		recipient_doc_type: "CPF",
		transaction_id: "TXN-002",
		sac: "+55 11 0000-0000",
	});

	assertEquals(typeof html, "string");
	assertStringIncludes(html, "R$ 50,00");
});

// --- onModuleInit: pré-compilação de todos os templates ---

Deno.test("TemplateService.onModuleInit: pré-compila todos os 6 templates", async () => {
	const service = new TemplateService();
	await service.onModuleInit();

	const allTemplates = Object.values(TemplateName);
	for (const name of allTemplates) {
		const html = await service.render(name, {});
		assertEquals(typeof html, "string");
		assertEquals(html.length > 0, true, `Template ${name} produziu HTML vazio`);
	}
});

Deno.test("TemplateService.render: usa template pré-compilado após onModuleInit", async () => {
	const service = new TemplateService();
	await service.onModuleInit();

	const data = {
		title: "Comprovante",
		amount: "R$ 200,00",
		currentDate: "15/06/2025",
		transaction_type: "Saque",
		applicant_business_name: "Empresa XYZ",
		applicant_doc: "00.000.000/0001-00",
		applicant_doc_type: "CNPJ",
		applicant_pix_key: "empresa@xyz.com",
		recipient_business_name: "Banco ABC",
		recipient_doc: "11.111.111/0001-11",
		recipient_doc_type: "CNPJ",
		fee_amount: "R$ 2,00",
		fee_iof: "R$ 0,10",
		fee_cet: "1,5%",
		transaction_id: "TXN-003",
		sac: "+55 11 0000-0000",
	};

	const html1 = await service.render(TemplateName.WITHDRAW_RECEIPT, data);
	const html2 = await service.render(TemplateName.WITHDRAW_RECEIPT, data);

	assertEquals(html1, html2);
	assertStringIncludes(html1, "R$ 200,00");
});

// --- render: precompile on-demand quando cache não foi populado ---

Deno.test("TemplateService.render: pré-compila on-demand quando template não está em cache", async () => {
	const service = new TemplateService();
	await service.onModuleInit();

	// Limpa o cache para forçar o caminho de compilação on-demand dentro de render()
	(service as unknown as { compiled: Map<string, unknown> }).compiled.clear();

	const html = await service.render(TemplateName.PAYMENT_RECEIPT, { title: "X" });

	assertEquals(typeof html, "string");
	assertEquals(html.length > 0, true);
});

// --- render: partials header e footer são incluídos ---

Deno.test("TemplateService.render: HTML gerado é uma string não-vazia com estrutura HTML", async () => {
	const service = new TemplateService();
	await service.onModuleInit();

	const html = await service.render(TemplateName.TRANSFER_RECEIPT, {
		title: "Transferência",
		amount: "R$ 300,00",
		currentDate: "01/01/2025",
		transaction_type: "TED",
		recipient_business_name: "Destino Ltda",
		recipient_doc: "22.222.222/0001-22",
		recipient_doc_type: "CNPJ",
		source_name: "Origem S.A.",
		source_doc: "33.333.333/0001-33",
		source_doc_type: "CNPJ",
		transaction_id: "TXN-004",
		sac: "+55 11 0000-0000",
	});

	assertStringIncludes(html, "<");
	assertStringIncludes(html, ">");
	assertStringIncludes(html, "R$ 300,00");
});
