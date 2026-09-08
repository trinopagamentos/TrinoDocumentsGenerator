import { assertEquals } from "@std/assert";
import { Cluster } from "ioredis";
import {
	buildClusterOptions,
	BULLMQ_CLUSTER_PREFIX,
	createBullMqConnection,
	createBullMqModuleOptions,
	parseRedisUrl,
} from "@/shared/utils/bullmq-connection.util.ts";

function withRedisUrl(url: string, fn: () => void): void {
	const original = Deno.env.get("REDIS_URL");
	Deno.env.set("REDIS_URL", url);
	try {
		fn();
	} finally {
		original ? Deno.env.set("REDIS_URL", original) : Deno.env.delete("REDIS_URL");
	}
}

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

Deno.test("parseRedisUrl: porta ausente na URL usa o padrão 6379", () => {
	withRedisUrl("redis://localhost", () => {
		const result = parseRedisUrl();
		assertEquals(result.port, 6379);
	});
});

Deno.test("parseRedisUrl: sem senha na URL, password é undefined", () => {
	withRedisUrl("redis://localhost:6379", () => {
		const result = parseRedisUrl();
		assertEquals(result.password, undefined);
	});
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

Deno.test("buildClusterOptions: clusterRetryStrategy aplica backoff limitado a 2000ms", () => {
	const options = buildClusterOptions();
	assertEquals(options.clusterRetryStrategy?.(1), 102);
	assertEquals(options.clusterRetryStrategy?.(1000), 2000);
});

Deno.test("buildClusterOptions: dnsLookup repassa o endereço recebido sem resolver", () => {
	const options = buildClusterOptions();
	let received: string | null | undefined;
	options.dnsLookup?.("10.0.0.1", (_err, address) => {
		received = address as string;
	});
	assertEquals(received, "10.0.0.1");
});

// --- createBullMqConnection ---

Deno.test("createBullMqConnection: redis:// standalone sem senha retorna {host, port}", () => {
	withRedisUrl("redis://localhost:6379", () => {
		const connection = createBullMqConnection();
		assertEquals(connection, { host: "localhost", port: 6379 });
	});
});

Deno.test("createBullMqConnection: redis:// standalone com senha inclui password", () => {
	withRedisUrl("redis://:my-secret@localhost:6379", () => {
		const connection = createBullMqConnection();
		assertEquals(connection, { host: "localhost", port: 6379, password: "my-secret" });
	});
});

Deno.test("createBullMqConnection: rediss:// retorna instância de Cluster", () => {
	withRedisUrl("rediss://:secret@my-cluster.cache.amazonaws.com:6379", () => {
		const connection = createBullMqConnection();
		try {
			assertEquals(connection instanceof Cluster, true);
		} finally {
			(connection as Cluster).disconnect();
		}
	});
});

// --- createBullMqModuleOptions ---

Deno.test("createBullMqModuleOptions: standalone não inclui prefix e define defaultJobOptions", () => {
	withRedisUrl("redis://localhost:6379", () => {
		const options = createBullMqModuleOptions();
		assertEquals("prefix" in options, false);
		assertEquals(options.defaultJobOptions.attempts, 3);
		assertEquals(options.defaultJobOptions.backoff, { type: "exponential", delay: 5000 });
		assertEquals(options.defaultJobOptions.removeOnComplete, { age: 24 * 3600, count: 1000 });
		assertEquals(options.defaultJobOptions.removeOnFail, { age: 7 * 24 * 3600 });
	});
});

Deno.test("createBullMqModuleOptions: cluster inclui prefix {bull}", () => {
	withRedisUrl("rediss://my-cluster.cache.amazonaws.com:6379", () => {
		const options = createBullMqModuleOptions();
		try {
			assertEquals(options.prefix, BULLMQ_CLUSTER_PREFIX);
		} finally {
			(options.connection as Cluster).disconnect();
		}
	});
});
