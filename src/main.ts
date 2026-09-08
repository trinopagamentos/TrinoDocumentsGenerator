/**
 * @file main.ts
 * @description Ponto de entrada da aplicação TrinoDocWorker.
 *
 * Inicializa o contexto da aplicação NestJS no modo "worker" (sem servidor HTTP),
 * configura os níveis de log e registra handlers de sinal do sistema operacional
 * para garantir um encerramento gracioso (graceful shutdown) em ambientes de
 * produção (ex: ECS/Docker com SIGTERM no deploy).
 */

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { AppModule } from "@/app.module.ts";
import type { AppConfig } from "@/config/app.config.ts";
import process from "node:process";

/** Logger com contexto "Bootstrap" para identificar logs da inicialização */
const logger = new Logger("Bootstrap");

/**
 * Inicializa e executa o worker.
 *
 * Cria o contexto de aplicação NestJS (sem HTTP server),
 * aguarda a inicialização de todos os módulos e registra
 * os handlers de encerramento via SIGTERM e SIGINT.
 */
async function bootstrap() {
	// Cria o contexto da aplicação sem binding de porta HTTP
	const app = await NestFactory.createApplicationContext(AppModule, {
		logger: ["log", "warn", "error", "debug"],
	});

	// Dispara os lifecycle hooks (OnModuleInit, OnApplicationBootstrap, etc.)
	await app.init();

	const config = app.get(ConfigService<AppConfig>);
	logger.log(`Worker started (version ${config.get("appVersion")}) — consuming generator queue`);

	// Sinal enviado pelo orquestrador (Docker/ECS/Kubernetes) ao parar o contêiner
	process.on("SIGTERM", async () => {
		logger.log("SIGTERM received, shutting down gracefully...");
		await app.close();
		process.exit(0);
	});

	// Sinal enviado pelo terminal (Ctrl+C) em ambiente de desenvolvimento
	process.on("SIGINT", async () => {
		logger.log("SIGINT received, shutting down gracefully...");
		await app.close();
		process.exit(0);
	});
}

// Executa o bootstrap e encerra o processo com código de erro em caso de falha
bootstrap().catch((err) => {
	logger.error("Failed to start worker", err);
	process.exit(1);
});
