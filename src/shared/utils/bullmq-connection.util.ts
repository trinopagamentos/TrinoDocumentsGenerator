import type { ConnectionOptions } from "bullmq";
import { Cluster, type ClusterOptions } from "ioredis";
import process from "node:process";

export const BULLMQ_CONFIG_KEY = "bullmq";
export const BULLMQ_CLUSTER_PREFIX = "{bull}";

export function parseRedisUrl() {
	const redisUrl = new URL(process.env?.REDIS_URL ?? "redis://localhost:6379");
	return {
		host: redisUrl.hostname,
		port: Number(redisUrl.port) || 6379,
		password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
		isCluster: redisUrl.protocol === "rediss:",
	};
}

export function buildClusterOptions(password?: string): ClusterOptions {
	return {
		dnsLookup: (address, callback) => callback(null, address),
		enableReadyCheck: true,
		clusterRetryStrategy: (times) => {
			return Math.min(100 + times * 2, 2000);
		},
		redisOptions: {
			connectTimeout: 20000,
			commandTimeout: 30000,
			maxRetriesPerRequest: null,
			protocol: 2,
			family: 4,
			keepAlive: 1,
			tls: {},
			...(password && { password }),
		},
		enableOfflineQueue: true,
		slotsRefreshTimeout: 15000,
		slotsRefreshInterval: 5000,
		scaleReads: "slave",
	};
}

export function createBullMqConnection(): ConnectionOptions {
	const { host, port, password, isCluster } = parseRedisUrl();
	if (isCluster) {
		return new Cluster([{ host, port }], buildClusterOptions(password));
	}
	return { host, port, ...(password && { password }) };
}

export function createBullMqModuleOptions() {
	const { isCluster } = parseRedisUrl();
	return {
		connection: createBullMqConnection(),
		...(isCluster && { prefix: BULLMQ_CLUSTER_PREFIX }),
		defaultJobOptions: {
			attempts: 3,
			backoff: {
				type: "exponential",
				delay: 5000,
			},
			removeOnComplete: {
				age: 24 * 3600,
				count: 1000,
			},
			removeOnFail: {
				age: 7 * 24 * 3600,
			},
		},
	};
}
