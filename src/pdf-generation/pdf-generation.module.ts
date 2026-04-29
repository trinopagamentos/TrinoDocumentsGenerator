import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { SharedModule } from "@/shared/shared.module.ts";
import { PdfGenerationProcessor } from "@/pdf-generation/pdf-generation.processor.ts";

@Module({
	imports: [
		BullModule.registerQueueAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				name: config.get<string>("pdfGenerationQueue", "pdf-generation"),
			}),
		}),
		SharedModule,
	],
	providers: [PdfGenerationProcessor],
})
export class PdfGenerationModule {}
