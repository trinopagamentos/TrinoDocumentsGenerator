# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
deno task start          # Run worker (production mode)
deno task start:watch    # Run worker with file watching (no SST)
deno task dev            # Run with SST dev (connects to cloud resources)
deno task test           # Run all tests
deno task typecheck      # TypeScript type checking
deno task lint           # Lint (deno lint)
deno task fmt            # Format code
deno task fmt:chk        # Check formatting without applying
deno task redis:local    # Start local Redis via Docker
```

Before committing, always run: `deno task lint && deno task fmt:chk && deno task typecheck && deno task test`

Run a single test file:

```sh
deno test -A src/generator/__tests__/generator.processor.spec.ts
```

## Architecture

**TrinoDocWorker** is a pure queue consumer — no HTTP server, no database. It reads jobs from a BullMQ queue backed by
Redis, renders HTML to PDF or image via `@tadashi/skreen`, uploads the result to S3, and returns the public URL as the
job result.

```
TrinoCore (API) → Redis (BullMQ: generator queue) → TrinoDocWorker → AWS S3
```

The app is bootstrapped with `NestFactory.createApplicationContext` (no HTTP binding). Entry point is `src/main.ts`.

### Key flows

**Job processing pipeline** (`src/generator/generator.processor.ts`):

1. `GeneratorProcessor.process()` receives a `GenerateDocumentJobData` job
2. Delegates to `SkreenService.generatePdf()` or `generateImage()` based on `documentType`
3. Calls `S3Service.upload()` with the resulting buffer
4. Returns `GenerateDocumentJobResult` with URL, userId, and completedAt

**Redis connection** (`src/shared/utils/bullmq-connection.util.ts`):

- `redis://` URL → standalone IORedis connection
- `rediss://` URL → IORedis `Cluster` with TLS (AWS ElastiCache)
- The `{bull}` key prefix is applied only in cluster mode

### Module structure

```
src/
├── config/app.config.ts                # Env var validation and typed config
├── generator/
│   ├── dto/generate-document.job.ts    # Job input/output types
│   ├── generator.module.ts             # BullMQ queue registration + retry policy
│   └── generator.processor.ts         # Job consumer
├── shared/
│   ├── services/skreen.service.ts      # PDF/image generation
│   ├── services/s3.service.ts          # S3 uploads
│   ├── utils/bullmq-connection.util.ts # Redis connection factory
│   └── shared.module.ts
└── app.module.ts                       # Root module (ConfigModule + BullModule)
```

## Infrastructure

Deployed as an ECS Fargate service via SST v4 (`sst.config.ts`). No load balancer — pure worker.

- `deno task build:stage` / `deno task build` — build and push Docker image to ECR
- `deno task deploy:stage` / `deno task deploy` — deploy via SST to stage/production
- `deno task logs:stage` / `deno task logs:prod` — tail CloudWatch logs (requires AWS profile `trino`)

Redis endpoints for each stage are in the `REDIS_HOSTS` constant in `sst.config.ts`. Update them when ElastiCache
clusters are recreated.

## External rules

@.rules/commit.md @.rules/pr.md
