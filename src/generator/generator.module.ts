import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { SharedModule } from "@/shared/shared.module.ts";
import { GeneratorProcessor } from "@/generator/generator.processor.ts";

@Module({
	imports: [
		BullModule.registerQueueAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				name: config.get<string>("generatorQueue", "generator"),
			}),
		}),
		SharedModule,
	],
	providers: [GeneratorProcessor],
})
export class GeneratorModule {}
