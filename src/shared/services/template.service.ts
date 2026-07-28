import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import Handlebars from "handlebars";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import type { TemplateName } from "@/generator/dto/generate-document.job.ts";

const TEMPLATE_FILES: Record<string, string> = {
	"payment-receipt": "payment-receipt.hbs",
	"reversal-receipt": "reversal-receipt.hbs",
	"withdraw-receipt": "withdraw-receipt.hbs",
	"anticipation-receipt": "anticipation-receipt.hbs",
	"transfer-receipt": "transfer-receipt.hbs",
	"comprovante": "comprovante.hbs",
	"employee-payments-export": "employee-payments-export.hbs",
};

@Injectable()
export class TemplateService implements OnModuleInit {
	private readonly logger = new Logger(TemplateService.name);
	private readonly templateDir = join(process.cwd(), "template");
	// deno-lint-ignore no-explicit-any
	private readonly compiled = new Map<string, Handlebars.TemplateDelegate<any>>();

	async onModuleInit(): Promise<void> {
		await this.registerPartial("header", "header.hbs");
		await this.registerPartial("footer", "footer.hbs");
		for (const [name, filename] of Object.entries(TEMPLATE_FILES)) {
			await this.precompile(name, filename);
		}
		this.logger.log("TemplateService: all templates and partials loaded");
	}

	/**
	 * Renderiza um template nomeado com os dados fornecidos.
	 *
	 * @param templateName - Chave de template (valor de {@link TemplateName})
	 * @param data - Dados passados ao Handlebars
	 * @returns HTML renderizado (com CDN tags, antes do processamento Tailwind)
	 * @throws Se templateName não estiver registrado
	 */
	async render(templateName: TemplateName | string, data: unknown): Promise<string> {
		let compiled = this.compiled.get(templateName);
		if (!compiled) {
			const filename = TEMPLATE_FILES[templateName];
			if (!filename) throw new Error(`Template desconhecido: ${templateName}`);
			compiled = await this.precompile(templateName, filename);
		}
		return compiled(data);
	}

	private async registerPartial(name: string, filename: string): Promise<void> {
		const content = await readFile(join(this.templateDir, filename), "utf8");
		Handlebars.registerPartial(name, content);
	}

	// deno-lint-ignore no-explicit-any
	private async precompile(name: string, filename: string): Promise<Handlebars.TemplateDelegate<any>> {
		const content = await readFile(join(this.templateDir, filename), "utf8");
		const fn = Handlebars.compile(content);
		this.compiled.set(name, fn);
		return fn;
	}
}
