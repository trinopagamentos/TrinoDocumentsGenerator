# TrinoDocWorker

Worker assíncrono de geração de documentos da plataforma Trino. Consome jobs de uma fila BullMQ (Redis), renderiza HTML em PDF ou imagem via Puppeteer/Chromium headless e armazena o resultado no AWS S3.

## Visão geral

```
TrinoCore (API)  →  Redis (BullMQ)  →  TrinoDocWorker  →  AWS S3
                      pdf-generation       Puppeteer
                           queue           Chromium
```

O worker **não expõe nenhuma porta HTTP**. É um consumer puro que roda como um serviço ECS sem load balancer.

## Stack

| Tecnologia | Versão | Função |
|---|---|---|
| [Deno](https://deno.com) | 2.6.10 | Runtime TypeScript |
| [NestJS](https://nestjs.com) | 11 | Framework / DI / ciclo de vida |
| [BullMQ](https://docs.bullmq.io) | 5 | Consumo de filas Redis |
| [Puppeteer Core](https://pptr.dev) | 24 | Renderização headless |
| [@sparticuz/chromium](https://github.com/Sparticuz/chromium) | 143 | Binário Chromium para Linux/Docker |
| [AWS SDK S3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/) | 3 | Upload de arquivos |
| [SST](https://sst.dev) | 3 | Infraestrutura como código (IaC) |

## Estrutura do projeto

```
src/
├── main.ts                              # Bootstrap do worker (graceful shutdown)
├── app.module.ts                        # Módulo raiz (ConfigModule + BullModule)
├── config/
│   └── app.config.ts                   # Factory de configuração + validação de env vars
├── pdf-generation/
│   ├── pdf-generation.module.ts        # Registro da fila com políticas de retry
│   ├── pdf-generation.processor.ts     # Consumer BullMQ (pipeline: render → upload → result)
│   └── dto/
│       └── generate-document.job.ts    # Interfaces de entrada e saída dos jobs
└── shared/
    ├── shared.module.ts                # Módulo compartilhado
    └── services/
        ├── puppeteer.service.ts        # Geração de PDF e imagem via Chromium headless
        └── s3.service.ts              # Upload de arquivos no AWS S3
```

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `REDIS_HOST` | Sim | — | Host do servidor Redis |
| `REDIS_PORT` | Não | `6379` | Porta do Redis |
| `REDIS_PASSWORD` | Não | — | Senha do Redis (ElastiCache em produção) |
| `REDIS_TLS` | Não | `false` | Habilita TLS na conexão Redis (`true`/`false`) |
| `S3_BUCKET_NAME` | Sim | — | Nome do bucket S3 de destino |
| `AWS_REGION` | Sim | — | Região AWS do bucket S3 |
| `PDF_GENERATION_QUEUE` | Não | `pdf-generation` | Nome da fila BullMQ |
| `LOCAL_CHROMIUM_PATH` | Não | — | Caminho local do Chromium (desenvolvimento) |
| `NODE_ENV` | Não | `production` | Ambiente de execução |

## Desenvolvimento local

### Pré-requisitos

- [Deno](https://deno.com) >= 2.6
- [Docker](https://www.docker.com) (para o Redis local)
- Credenciais AWS configuradas (`~/.aws/credentials` ou variáveis de ambiente)

### 1. Suba o Redis local

```sh
deno task redis:local
```

Inicia um contêiner Redis 7 (Alpine) na porta `6379`. Na próxima execução, reutiliza o contêiner existente.

### 2. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
S3_BUCKET_NAME=meu-bucket-local
AWS_REGION=us-east-1
LOCAL_CHROMIUM_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

> **Dica:** `LOCAL_CHROMIUM_PATH` evita o download do Chromium pelo `@sparticuz/chromium` em desenvolvimento. Aponte para qualquer instalação local do Chrome/Chromium.

### 3. Execute o worker

```sh
# Modo produção (uma execução)
deno task start

# Modo desenvolvimento (reinicia ao salvar arquivos)
deno task dev
```

### Outros comandos úteis

```sh
deno task lint          # Linting via Deno
deno task typecheck     # Checagem de tipos TypeScript
deno task test          # Executa os testes
deno task biome:chk     # Verifica formatação/linting com Biome
deno task biome:fix     # Corrige formatação/linting com Biome
```

## Docker

### Build

```sh
docker build -t trino-doc-worker .
```

### Run

```sh
docker run --rm \
  -e REDIS_HOST=host.docker.internal \
  -e S3_BUCKET_NAME=meu-bucket \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=... \
  -e AWS_SECRET_ACCESS_KEY=... \
  trino-doc-worker
```

O Dockerfile usa `denoland/deno:2.6.10`, instala as dependências de sistema do Chromium, faz cache das dependências Deno e executa um warmup do worker durante o build para reduzir o cold start.

## Fila e contrato de jobs

### Nome da fila

```
pdf-generation
```

### Payload de entrada (`GenerateDocumentJobData`)

```typescript
{
  userId: string;           // ID do usuário solicitante
  documentType: "pdf" | "image";
  htmlContent: string;      // HTML completo já renderizado
  s3Key: string;            // Ex: "receipts/2024/uuid.pdf"
  pdfOptions?: {
    format?: "A4" | "Letter" | "Legal";   // padrão: "A4"
    landscape?: boolean;                   // padrão: false
    printBackground?: boolean;             // padrão: true
    margin?: { top?; right?; bottom?; left? }; // padrão: "10mm"
    tagged?: boolean;                      // padrão: true
    preferCSSPageSize?: boolean;           // padrão: true
  };
  imageOptions?: {
    type?: "png" | "jpeg" | "webp";       // padrão: "png"
    quality?: number;                      // 0–100, apenas jpeg/webp
    width?: number;                        // padrão: 320
    height?: number;                       // padrão: 1080
    deviceScaleFactor?: number;            // padrão: 1
    isMobile?: boolean;                    // padrão: true
    clip?: { x; y; width; height };       // região customizada
    omitBackground?: boolean;              // padrão: false
  };
}
```

### Resultado (`GenerateDocumentJobResult`)

```typescript
{
  url: string;          // URL pública no S3
  userId: string;       // Repassado do payload de entrada
  completedAt: string;  // ISO 8601
}
```

### Políticas de retry

| Configuração | Valor |
|---|---|
| Tentativas máximas | 3 |
| Estratégia de backoff | Exponencial |
| Delay inicial | 5 segundos (5s → 10s → 20s) |
| Jobs concluídos retidos | 100 |
| Jobs com falha retidos | 50 |

## Deploy (SST)

O projeto usa [SST v3](https://sst.dev) para provisionar a infraestrutura na AWS.

### Ambientes

| Stage | Redis | ECS Cluster | Spot |
|---|---|---|---|
| `production` | ElastiCache (TLS) | TrinoCore Cluster | Não |
| `stage` | ElastiCache (TLS) | TrinoCore Cluster | Sim |
| `dev` / outros | Redis local | — | — |

### Configurar o secret do Redis antes do primeiro deploy

```sh
sst secret set TrinoDocWorker_RedisPassword "<password>"
```

### Deploy em staging

```sh
sst deploy --stage stage
```

### Deploy em produção

```sh
sst deploy --stage production
```

### Modo desenvolvimento com SST

```sh
deno task sst:dev
```

Conecta o worker local ao ambiente de nuvem configurado, permitindo debugar com filas e S3 reais.

### Scaling (produção)

| Configuração | Valor |
|---|---|
| Mínimo de instâncias | 1 |
| Máximo de instâncias | 3 |
| Scale-up por CPU | > 70% |
| Scale-up por memória | > 70% |
