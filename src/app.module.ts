import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import appConfig from "@/config/app.config.ts";
import { createBullMqModuleOptions } from "@/shared/utils/bullmq-connection.util.ts";
import { SharedModule } from "@/shared/shared.module.ts";
import { PdfGenerationModule } from "@/pdf-generation/pdf-generation.module.ts";

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [appConfig],
		}),
		BullModule.forRoot(createBullMqModuleOptions()),
		SharedModule,
		PdfGenerationModule,
	],
})
export class AppModule {}
