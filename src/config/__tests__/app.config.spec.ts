import { assertEquals, assertThrows } from "@std/assert";
import appConfig from "@/config/app.config.ts";

const REQUIRED_ENV: Record<string, string> = {
	REDIS_HOST: "localhost",
	S3_BUCKET_NAME: "test-bucket",
	AWS_REGION: "us-east-1",
};

/**
 * Sets all required env vars plus any extras, runs fn, then restores originals.
 * Pass `undefined` as a value to force-delete a key (test missing required vars).
 */
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
		assertEquals(config.redisHost, "localhost");
		assertEquals(config.s3BucketName, "test-bucket");
		assertEquals(config.awsRegion, "us-east-1");
	});
});

Deno.test("appConfig: lança erro quando REDIS_HOST está ausente", () => {
	withEnv({ REDIS_HOST: undefined }, () => {
		assertThrows(() => appConfig(), Error, "Missing required environment variable: REDIS_HOST");
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

Deno.test("appConfig: REDIS_PORT é convertido para number (padrão 6379)", () => {
	withEnv({}, () => {
		const config = appConfig();
		assertEquals(config.redisPort, 6379);
		assertEquals(typeof config.redisPort, "number");
	});
});

Deno.test("appConfig: REDIS_PORT customizado é convertido para number", () => {
	withEnv({ REDIS_PORT: "6380" }, () => {
		const config = appConfig();
		assertEquals(config.redisPort, 6380);
		assertEquals(typeof config.redisPort, "number");
	});
});

Deno.test("appConfig: REDIS_TLS='true' resulta em boolean true; outros valores resultam em false", () => {
	withEnv({ REDIS_TLS: "true" }, () => {
		assertEquals(appConfig().redisTls, true);
	});

	withEnv({ REDIS_TLS: "false" }, () => {
		assertEquals(appConfig().redisTls, false);
	});

	withEnv({ REDIS_TLS: "1" }, () => {
		assertEquals(appConfig().redisTls, false);
	});

	withEnv({ REDIS_TLS: undefined }, () => {
		assertEquals(appConfig().redisTls, false);
	});
});

Deno.test("appConfig: REDIS_PASSWORD string vazia torna-se undefined; valor definido é preservado", () => {
	withEnv({ REDIS_PASSWORD: "" }, () => {
		assertEquals(appConfig().redisPassword, undefined);
	});

	withEnv({ REDIS_PASSWORD: "super-secret" }, () => {
		assertEquals(appConfig().redisPassword, "super-secret");
	});
});

Deno.test("appConfig: LOCAL_CHROMIUM_PATH string vazia torna-se undefined; valor definido é preservado", () => {
	withEnv({ LOCAL_CHROMIUM_PATH: "" }, () => {
		assertEquals(appConfig().localChromiumPath, undefined);
	});

	withEnv({ LOCAL_CHROMIUM_PATH: "/usr/bin/chromium" }, () => {
		assertEquals(appConfig().localChromiumPath, "/usr/bin/chromium");
	});
});

Deno.test("appConfig: pdfGenerationQueue usa padrão 'pdf-generation' e aceita valor customizado", () => {
	withEnv({}, () => {
		assertEquals(appConfig().pdfGenerationQueue, "pdf-generation");
	});

	withEnv({ PDF_GENERATION_QUEUE: "minha-fila" }, () => {
		assertEquals(appConfig().pdfGenerationQueue, "minha-fila");
	});
});
