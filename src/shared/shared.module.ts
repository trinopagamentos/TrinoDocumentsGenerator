/**
 * @file shared.module.ts
 * @description Módulo compartilhado que provê serviços de infraestrutura reutilizáveis.
 *
 * Serviços expostos:
 * - {@link SkreenService}: renderização de HTML para PDF e imagem
 * - {@link S3Service}: upload de arquivos no AWS S3
 * - {@link TailwindInlineService}: compilação de Tailwind/DaisyUI CSS inline
 * - {@link TemplateService}: renderização de templates Handlebars
 */

import { Module } from "@nestjs/common";
import { SkreenService } from "@/shared/services/skreen.service.ts";
import { S3Service } from "@/shared/services/s3.service.ts";
import { TailwindInlineService } from "@/shared/services/tailwind-inline.service.ts";
import { TemplateService } from "@/shared/services/template.service.ts";

const services = [SkreenService, S3Service, TailwindInlineService, TemplateService];

@Module({
	providers: [...services],
	exports: [...services],
})
export class SharedModule {}
