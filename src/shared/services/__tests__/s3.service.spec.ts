import "reflect-metadata";
import { assertEquals, assertRejects } from "@std/assert";
import { assertSpyCalls, stub } from "@std/testing/mock";
import { S3Client } from "@aws-sdk/client-s3";
import { Buffer } from "node:buffer";
import { S3Service } from "@/shared/services/s3.service";

// O AWS SDK v3 inicia leituras async de ~/.aws/credentials e ~/.aws/config durante a
// construção do S3Client. Redirecionar para /dev/null faz as leituras completarem
// imediatamente (conteúdo vazio), evitando "leaked async ops" no Deno test runner.
Deno.env.set("AWS_ACCESS_KEY_ID", "test-access-key-id");
Deno.env.set("AWS_SECRET_ACCESS_KEY", "test-secret-access-key");
Deno.env.set("AWS_CONFIG_FILE", "/dev/null");
Deno.env.set("AWS_SHARED_CREDENTIALS_FILE", "/dev/null");

function makeConfig(bucket = "test-bucket", region = "us-east-1") {
	return {
		getOrThrow<T>(key: string): T {
			const map: Record<string, unknown> = {
				s3BucketName: bucket,
				awsRegion: region,
			};
			if (!(key in map)) throw new Error(`Config key not found: ${key}`);
			return map[key] as T;
		},
	};
}

const DUMMY_BUFFER = Buffer.from("pdf-bytes");

Deno.test("S3Service.upload: PDF retorna URL correta no formato S3", async () => {
	using sendStub = stub(S3Client.prototype, "send", () => ({}));
	const service = new S3Service(makeConfig() as never);

	const url = await service.upload("docs/file.pdf", DUMMY_BUFFER, "pdf");

	assertEquals(url, "https://test-bucket.s3.amazonaws.com/docs/file.pdf");
	assertSpyCalls(sendStub, 1);
});

Deno.test("S3Service.upload: image retorna URL correta no formato S3", async () => {
	using sendStub = stub(S3Client.prototype, "send", () => ({}));
	const service = new S3Service(makeConfig() as never);

	const url = await service.upload("images/photo.png", DUMMY_BUFFER, "image");

	assertEquals(url, "https://test-bucket.s3.amazonaws.com/images/photo.png");
	assertSpyCalls(sendStub, 1);
});

Deno.test("S3Service.upload: PDF define ContentType como application/pdf", async () => {
	let capturedInput: Record<string, unknown> | undefined;
	using _sendStub = stub(S3Client.prototype, "send", (cmd: unknown) => {
		capturedInput = (cmd as { input: Record<string, unknown> }).input;
		return {};
	});
	const service = new S3Service(makeConfig() as never);

	await service.upload("file.pdf", DUMMY_BUFFER, "pdf");

	assertEquals(capturedInput?.ContentType, "application/pdf");
});

Deno.test("S3Service.upload: image define ContentType como image/png", async () => {
	let capturedInput: Record<string, unknown> | undefined;
	using _sendStub = stub(S3Client.prototype, "send", (cmd: unknown) => {
		capturedInput = (cmd as { input: Record<string, unknown> }).input;
		return {};
	});
	const service = new S3Service(makeConfig() as never);

	await service.upload("photo.png", DUMMY_BUFFER, "image");

	assertEquals(capturedInput?.ContentType, "image/png");
});

Deno.test("S3Service.upload: envia PutObjectCommand com Bucket, Key e Body corretos", async () => {
	let capturedInput: Record<string, unknown> | undefined;
	using _sendStub = stub(S3Client.prototype, "send", (cmd: unknown) => {
		capturedInput = (cmd as { input: Record<string, unknown> }).input;
		return {};
	});
	const service = new S3Service(makeConfig("my-bucket") as never);

	await service.upload("path/to/doc.pdf", DUMMY_BUFFER, "pdf");

	assertEquals(capturedInput?.Bucket, "my-bucket");
	assertEquals(capturedInput?.Key, "path/to/doc.pdf");
	assertEquals(capturedInput?.Body, DUMMY_BUFFER);
});

Deno.test("S3Service.upload: propaga erros do AWS SDK", async () => {
	using _sendStub = stub(S3Client.prototype, "send", () => {
		throw new Error("AccessDenied");
	});
	const service = new S3Service(makeConfig() as never);

	await assertRejects(() => service.upload("file.pdf", DUMMY_BUFFER, "pdf"), Error, "AccessDenied");
});

Deno.test("S3Service.upload: URL usa o nome do bucket da configuração", async () => {
	using _sendStub = stub(S3Client.prototype, "send", () => ({}));
	const service = new S3Service(makeConfig("production-docs") as never);

	const url = await service.upload("a/b/c/file.pdf", DUMMY_BUFFER, "pdf");

	assertEquals(url, "https://production-docs.s3.amazonaws.com/a/b/c/file.pdf");
});
