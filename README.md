# TrinoDocWorker

Worker assíncrono de geração de documentos da plataforma Trino. Consome jobs de uma fila BullMQ (Redis), renderiza HTML
em PDF ou imagem via Puppeteer/Chromium headless e armazena o resultado no AWS S3.

## Visão geral

```
TrinoCore (API)  →  Redis (BullMQ)  →  TrinoDocWorker  →  AWS S3
                      pdf-generation       Puppeteer
                           queue           Chromium
```

O worker **não expõe nenhuma porta HTTP**.\
É um consumer puro que roda como um serviço ECS sem load balancer.

## Stack

| Tecnologia                                                                      | Versão | Função                             |
| ------------------------------------------------------------------------------- | ------ | ---------------------------------- |
| [Deno](https://deno.com)                                                        | 2.6.10 | Runtime TypeScript                 |
| [NestJS](https://nestjs.com)                                                    | 11     | Framework / DI / ciclo de vida     |
| [BullMQ](https://docs.bullmq.io)                                                | 5      | Consumo de filas Redis             |
| [Puppeteer Core](https://pptr.dev)                                              | 24     | Renderização headless              |
| [@sparticuz/chromium](https://github.com/Sparticuz/chromium)                    | 143    | Binário Chromium para Linux/Docker |
| [AWS SDK S3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/) | 3      | Upload de arquivos                 |
| [SST](https://sst.dev)                                                          | 3      | Infraestrutura como código (IaC)   |

## Estrutura do projeto

```
src/
├── config/
│   └── app.config.ts                   # Factory de configuração + validação de env vars
|
├── pdf-generation/
│   ├── dto/
│   |   └── generate-document.job.ts    # Interfaces de entrada e saída dos jobs
│   ├── pdf-generation.module.ts        # Registro da fila com políticas de retry
│   └── pdf-generation.processor.ts     # Consumer BullMQ (pipeline: render → upload → result)
|
├── shared/
│   ├── services/
│   |    ├── puppeteer.service.ts       # Geração de PDF e imagem via Chromium headless
│   |    └── s3.service.ts              # Upload de arquivos no AWS S3
│   └── shared.module.ts                # Módulo compartilhado
|
├── app.module.ts                       # Módulo raiz (ConfigModule + BullModule)
└── main.ts                             # Bootstrap do worker (graceful shutdown)
```

## Variáveis de ambiente

| Variável               | Obrigatória | Padrão           | Descrição                                      |
| ---------------------- | ----------- | ---------------- | ---------------------------------------------- |
| `REDIS_HOST`           | Sim         | —                | Host do servidor Redis                         |
| `REDIS_PORT`           | Não         | `6379`           | Porta do Redis                                 |
| `REDIS_PASSWORD`       | Não         | —                | Senha do Redis (ElastiCache em produção)       |
| `REDIS_TLS`            | Não         | `false`          | Habilita TLS na conexão Redis (`true`/`false`) |
| `S3_BUCKET_NAME`       | Sim         | —                | Nome do bucket S3 de destino                   |
| `AWS_REGION`           | Sim         | —                | Região AWS do bucket S3                        |
| `PDF_GENERATION_QUEUE` | Não         | `pdf-generation` | Nome da fila BullMQ                            |
| `LOCAL_CHROMIUM_PATH`  | Não         | —                | Caminho local do Chromium (desenvolvimento)    |
| `NODE_ENV`             | Não         | `production`     | Ambiente de execução                           |

## Desenvolvimento local

### Pré-requisitos

- [Deno](https://deno.com) >= 2.6
- [Docker](https://www.docker.com) (para o Redis local)
- Credenciais AWS configuradas (`~/.aws/credentials` ou variáveis de ambiente)

### 1. Suba o Redis local

```sh
deno task redis:local
```

Inicia um contêiner Redis 7 (Alpine) na porta `6379`.\
Na próxima execução, reutiliza o contêiner existente.

### 2. Configure as variáveis de ambiente

Renomeie o arquivo `.env.example` para `.env`.

### 3. Execute o worker

```sh
# Modo produção (uma execução)
deno task start

# Modo watch local (reinicia ao salvar arquivos, sem SST)
deno task start:watch
```

### Modo desenvolvimento com SST

```sh
deno task dev
```

Conecta o worker local ao ambiente de nuvem configurado, permitindo debugar com filas e S3 reais.

### Outros comandos úteis

```sh
deno task lint          # Linting via Deno
deno task typecheck     # Checagem de tipos TypeScript
deno task test          # Executa os testes
deno task fmt           # Formata o código com deno fmt
deno task fmt:chk       # Verifica a formatação sem aplicar correções
```

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
    format?: "A4" | "Letter" | "Legal";    // padrão: "A4"
    landscape?: boolean;                   // padrão: false
    printBackground?: boolean;             // padrão: true
    margin?: { top?; right?; bottom?; left? }; // padrão: "10mm"
    tagged?: boolean;                      // padrão: true
    preferCSSPageSize?: boolean;           // padrão: true
  };
  imageOptions?: {
    type?: "png" | "jpeg" | "webp";        // padrão: "png"
    quality?: number;                      // 0–100, apenas jpeg/webp
    fullPage?: boolean;                    // padrão: true (apenas no modo fallback)
    width?: number;                        // padrão: 320
    height?: number;                       // padrão: 1080
    deviceScaleFactor?: number;            // padrão: 1
    hasTouch?: boolean;
    isLandscape?: boolean;
    isMobile?: boolean;                    // padrão: true
    clip?: { x; y; width; height };        // região customizada
    omitBackground?: boolean;              // padrão: false
  };
  metaData?: Record<string, unknown>;      // dados arbitrários repassados ao API Core
}
```

### Resultado (`GenerateDocumentJobResult`)

```typescript
{
  url: string;                            // URL pública no S3
  userId: string;                         // Repassado do payload de entrada
  completedAt: string;                    // ISO 8601
  metaData?: Record<string, unknown>;     // dados arbitrários repassados do payload
}
```

### Políticas de retry

| Configuração            | Valor                       |
| ----------------------- | --------------------------- |
| Tentativas máximas      | 3                           |
| Estratégia de backoff   | Exponencial                 |
| Delay inicial           | 5 segundos (5s → 10s → 20s) |
| Jobs concluídos retidos | 100                         |
| Jobs com falha retidos  | 50                          |

## Deploy (SST)

O projeto usa [SST v3](https://sst.dev) para provisionar a infraestrutura na AWS.

### Ambientes

| Stage        | Redis             | ECS Cluster       | Spot |
| ------------ | ----------------- | ----------------- | ---- |
| `production` | ElastiCache (TLS) | TrinoCore Cluster | Não  |
| `stage`      | ElastiCache (TLS) | TrinoCore Cluster | Sim  |
| `{user_dev}` | Redis local       | —                 | —    |

### Configurar o secret do Redis antes do primeiro deploy

```sh
sst secret set TrinoDocWorker_RedisPassword "<password>"
```

### Build e push da imagem Docker

O script `scripts/deploy-image.sh` lê a versão da última git tag, faz o build e envia a imagem para o ECR.

**1. Crie a tag git com a versão desejada**

```sh
# Staging (prefixo staging-)
git tag staging-1.2.0
git push origin staging-1.2.0

# Produção
git tag 1.1.1
git push origin 1.1.1
```

**2. Execute o script de deploy da imagem**

```sh
# Staging
deno task build:stage

# Produção
deno task build
```

O script resolve a versão automaticamente a partir da tag mais recente:

| Ambiente | Padrão de tag   | Imagem gerada                      |
| -------- | --------------- | ---------------------------------- |
| `stage`  | `staging-X.Y.Z` | `…/trino-doc-worker-staging:X.Y.Z` |
| `prod`   | `X.Y.Z`         | `…/trino-doc-worker:X.Y.Z`         |

O arquivo `.env` é atualizado com a versão resolvida para que o `sst deploy` utilize a imagem correta.

### Deploy em staging

```sh
deno task deploy:stage
```

### Deploy em produção

```sh
deno task deploy
```

### Scaling (produção)

| Configuração         | Valor |
| -------------------- | ----- |
| Mínimo de instâncias | 1     |
| Máximo de instâncias | 3     |
| Scale-up por CPU     | > 70% |
| Scale-up por memória | > 70% |

## Logs

Acompanhe os logs do serviço via CloudWatch em tempo real com o AWS CLI.

### Seguir logs em tempo real

```sh
# Staging
deno task logs:stage

# Produção
deno task logs:prod
```

### Seguir logs a partir de um tempo atrás

```sh
deno task logs:stage -- <since>
deno task logs:prod -- <since>
```

O parâmetro `<since>` aceita durações relativas:

| Exemplo                       | Descrição          |
| ----------------------------- | ------------------ |
| `deno task logs:stage -- 30m` | Últimos 30 minutos |
| `deno task logs:stage -- 1h`  | Última hora        |
| `deno task logs:stage -- 6h`  | Últimas 6 horas    |
| `deno task logs:stage -- 1d`  | Último dia         |

> [!NOTE]\
> Requer o perfil AWS `trino` configurado em `~/.aws/credentials` com permissão de leitura no CloudWatch Logs
> (`logs:FilterLogEvents`, `logs:DescribeLogStreams`).

## Dúvidas e suporte

Entre em contato com a Trino através do email [tecnologia@trinopagamentos.com](mailto:tecnologia@trinopagamentos.com)
