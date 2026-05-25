import { assertEquals, assertThrows } from "@std/assert";
import appConfig from "@/config/app.config.ts";

const REQUIRED_ENV: Record<string, string> = {
	S3_BUCKET_NAME: "test-bucket",
	AWS_REGION: "us-east-1",
};

function withEnv(extra: Record<string, string | undefined>, fn: () => void): void {
	const all: Record<string, string> = { ...REQUIRED_ENV };
	const toDelete: string[] = [];

	for (const [k, v] of Object.entries(extra)) {
		if (v === undefined) {
			delete all[k];
			toDelete.push(k);
		} else {
			all[k] = v;
		}
	}

	const keysToTrack = [...new Set([...Object.keys(all), ...toDelete])];
	const saved: Record<string, string | undefined> = {};
	for (const key of keysToTrack) {
		saved[key] = Deno.env.get(key);
	}

	for (const [k, v] of Object.entries(all)) Deno.env.set(k, v);
	for (const k of toDelete) Deno.env.delete(k);

	try {
		fn();
	} finally {
		for (const [k, v] of Object.entries(saved)) {
			if (v === undefined) Deno.env.delete(k);
			else Deno.env.set(k, v);
		}
	}
}

Deno.test("appConfig: retorna config válida quando todas as env vars obrigatórias estão definidas", () => {
	withEnv({}, () => {
		const config = appConfig();
		assertEquals(config.s3BucketName, "test-bucket");
		assertEquals(config.awsRegion, "us-east-1");
	});
});

Deno.test("appConfig: lança erro quando S3_BUCKET_NAME está ausente", () => {
	withEnv({ S3_BUCKET_NAME: undefined }, () => {
		assertThrows(() => appConfig(), Error, "Missing required environment variable: S3_BUCKET_NAME");
	});
});

Deno.test("appConfig: lança erro quando AWS_REGION está ausente", () => {
	withEnv({ AWS_REGION: undefined }, () => {
		assertThrows(() => appConfig(), Error, "Missing required environment variable: AWS_REGION");
	});
});

Deno.test("appConfig: REDIS_URL padrão é redis://localhost:6379 quando não definido", () => {
	withEnv({ REDIS_URL: undefined }, () => {
		assertEquals(appConfig().redisUrl, "redis://localhost:6379");
	});
});

Deno.test("appConfig: REDIS_URL customizado é preservado", () => {
	withEnv({ REDIS_URL: "rediss://my-cluster:6379" }, () => {
		assertEquals(appConfig().redisUrl, "rediss://my-cluster:6379");
	});
});

Deno.test("appConfig: generatorQueue usa padrão 'generator' e aceita valor customizado", () => {
	withEnv({}, () => {
		assertEquals(appConfig().generatorQueue, "generator");
	});

	withEnv({ GENERATOR_QUEUE: "minha-fila" }, () => {
		assertEquals(appConfig().generatorQueue, "minha-fila");
	});
});
