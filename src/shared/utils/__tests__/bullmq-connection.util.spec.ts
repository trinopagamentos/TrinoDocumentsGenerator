import { assertEquals } from "@std/assert";
import { buildClusterOptions, parseRedisUrl } from "@/shared/utils/bullmq-connection.util.ts";

// --- parseRedisUrl ---

Deno.test("parseRedisUrl: redis:// standalone não é cluster", () => {
	const original = Deno.env.get("REDIS_URL");
	Deno.env.set("REDIS_URL", "redis://localhost:6379");
	try {
		const result = parseRedisUrl();
		assertEquals(result.isCluster, false);
		assertEquals(result.host, "localhost");
		assertEquals(result.port, 6379);
	} finally {
		original ? Deno.env.set("REDIS_URL", original) : Deno.env.delete("REDIS_URL");
	}
});

Deno.test("parseRedisUrl: rediss:// é tratado como cluster (ElastiCache)", () => {
	const original = Deno.env.get("REDIS_URL");
	Deno.env.set("REDIS_URL", "rediss://:secret@my-cluster.cache.amazonaws.com:6379");
	try {
		const result = parseRedisUrl();
		assertEquals(result.isCluster, true);
		assertEquals(result.password, "secret");
	} finally {
		original ? Deno.env.set("REDIS_URL", original) : Deno.env.delete("REDIS_URL");
	}
});

// --- buildClusterOptions: verificação de certificado TLS ---

Deno.test("buildClusterOptions: não desabilita a verificação de certificado TLS", () => {
	const options = buildClusterOptions();
	const tls = options.redisOptions?.tls;

	assertEquals(typeof tls, "object");
	// rejectUnauthorized não pode ser explicitamente false — isso reabriria a
	// janela de MITM na conexão com o ElastiCache (achado de security review).
	assertEquals((tls as { rejectUnauthorized?: boolean })?.rejectUnauthorized, undefined);
	assertEquals((tls as { checkServerIdentity?: unknown })?.checkServerIdentity, undefined);
});

Deno.test("buildClusterOptions: repassa a senha quando informada", () => {
	const options = buildClusterOptions("my-password");
	assertEquals(options.redisOptions?.password, "my-password");
});

Deno.test("buildClusterOptions: omite password quando não informada", () => {
	const options = buildClusterOptions();
	assertEquals(options.redisOptions?.password, undefined);
});
