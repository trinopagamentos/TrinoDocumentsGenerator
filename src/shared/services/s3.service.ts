/**
 * @file s3.service.ts
 * @description Serviço de armazenamento de arquivos no AWS S3.
 *
 * Encapsula a interação com o SDK da AWS para fazer upload de documentos
 * gerados (PDF e imagens) e retornar a URL pública de acesso ao arquivo.
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Buffer } from "node:buffer";

/**
 * Serviço injetável para upload de arquivos no AWS S3.
 *
 * @remarks
 * O `S3Client` é instanciado uma única vez no construtor e reutilizado
 * em todas as chamadas de `upload`, aproveitando o pool de conexões HTTP
 * interno do SDK da AWS.
 *
 * A URL retornada segue o formato público padrão do S3:
 * `https://{bucket}.s3.amazonaws.com/{key}`
 *
 * @example
 * const url = await s3Service.upload('path/to/file.pdf', buffer, 'pdf');
 * // => 'https://meu-bucket.s3.amazonaws.com/path/to/file.pdf'
 */
@Injectable()
export class S3Service {
	private readonly logger = new Logger(S3Service.name);

	/** Cliente AWS S3 reutilizado entre as chamadas */
	private readonly client: S3Client;

	/** Nome do bucket S3 lido da configuração da aplicação */
	private readonly bucket: string;

	/**
	 * @param config - ConfigService para leitura de `s3BucketName` e `awsRegion`
	 */
	constructor(private readonly config: ConfigService) {
		// Lança exceção imediatamente se as configurações obrigatórias não estiverem presentes
		this.bucket = config.getOrThrow<string>("s3BucketName");
		this.client = new S3Client({
			region: config.getOrThrow<string>("awsRegion"),
		});
	}

	/**
	 * Faz o upload de um buffer binário para o S3 e retorna a URL pública do arquivo.
	 *
	 * O `Content-Type` é definido automaticamente com base no `documentType`:
	 * - `"pdf"` → `application/pdf`
	 * - `"image"` → `image/png`
	 *
	 * @param key - Chave (caminho) do objeto no bucket S3. Ex: `"receipts/2024/uuid.pdf"`
	 * @param buffer - Conteúdo binário do arquivo a ser armazenado
	 * @param documentType - Tipo do documento para determinar o `Content-Type` do objeto
	 * @returns URL pública do objeto armazenado no formato `https://{bucket}.s3.amazonaws.com/{key}`
	 * @throws Propaga erros do SDK AWS em caso de falha de autenticação, permissão ou rede
	 */
	async upload(key: string, buffer: Buffer, documentType: "pdf" | "image"): Promise<string> {
		// Determina o Content-Type com base no tipo de documento
		const contentType = documentType === "pdf" ? "application/pdf" : "image/png";

		this.logger.log({
			msg: "Uploading to S3",
			bucket: this.bucket,
			key,
			bytes: buffer.length,
			contentType,
		});

		// Monta e envia o comando de upload via PutObject
		const command = new PutObjectCommand({
			Bucket: this.bucket,
			Key: key,
			Body: buffer,
			ContentType: contentType,
		});

		await this.client.send(command);

		// Constrói a URL pública no formato padrão do S3 (path-style virtual-hosted)
		const url = `https://${this.bucket}.s3.amazonaws.com/${key}`;

		this.logger.log({
			msg: "S3 upload successful",
			bucket: this.bucket,
			key,
			url,
		});

		return url;
	}
}
