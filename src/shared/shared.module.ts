/**
 * @file shared.module.ts
 * @description Módulo compartilhado que provê serviços de infraestrutura reutilizáveis.
 *
 * Centraliza o registro e a exportação de serviços que são utilizados por
 * múltiplos módulos da aplicação, evitando instanciação duplicada e
 * garantindo que o NestJS gerencie o ciclo de vida de cada serviço.
 *
 * Serviços expostos:
 * - {@link PuppeteerService}: renderização de HTML para PDF e imagem
 * - {@link S3Service}: upload de arquivos no AWS S3
 */

import { Module } from "@nestjs/common";
import { PuppeteerService } from "@/shared/services/puppeteer.service";
import { S3Service } from "@/shared/services/s3.service";

/** Lista de serviços gerenciados por este módulo (registrados e exportados) */
const services = [PuppeteerService, S3Service];

/**
 * Módulo compartilhado da aplicação.
 *
 * Importe `SharedModule` em qualquer feature module que precise de
 * `PuppeteerService` ou `S3Service`. O NestJS garantirá que apenas
 * uma instância de cada serviço seja criada (singleton por módulo).
 */
@Module({
	providers: [...services],
	exports: [...services],
})
export class SharedModule {}
