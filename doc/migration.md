# TrinoCore → TrinoDocWorker: Guia de Migração

## Renomeação da fila BullMQ (`pdf-generation` → `generator`)

A fila BullMQ foi renomeada para refletir que o worker gera tanto PDFs quanto imagens.

| Item                  | Antes                  | Depois           |
| --------------------- | ---------------------- | ---------------- |
| Nome da fila          | `pdf-generation`       | `generator`      |
| Variável de ambiente  | `PDF_GENERATION_QUEUE` | `GENERATOR_QUEUE` |

### Passos para migrar o TrinoCore

1. Atualize a variável de ambiente em todos os ambientes (staging e produção):
   ```sh
   # Remova a variável antiga
   PDF_GENERATION_QUEUE=pdf-generation  ❌

   # Adicione a nova
   GENERATOR_QUEUE=generator  ✅
   ```

2. Atualize a referência ao nome da fila no código do TrinoCore onde o job é publicado:
   ```typescript
   // Antes
   const queue = new Queue("pdf-generation", { connection });

   // Depois
   const queue = new Queue("generator", { connection });
   ```

3. Faça o deploy do TrinoDocWorker **antes** de migrar o TrinoCore para evitar jobs perdidos durante
   a transição. Como a fila anterior (`pdf-generation`) deixará de ser consumida, drene-a antes do
   cutover ou aguarde os jobs pendentes serem processados.

---

## Migração do renderer: Chromium headless → Skreen WASM

O TrinoDocWorker migrou de Chromium headless (`puppeteer-core` + `@sparticuz/chromium`) para um
renderer WASM puro (`@tadashi/skreen`, baseado em Rust/Blitz/Vello). A mudança é transparente para o
fluxo principal (publicar job → aguardar resultado), mas algumas opções de renderização foram
removidas ou alteradas.

---

## Breaking changes nas opções de job

### `PdfOptions` — interface completamente reescrita (skreen v3)

O PDF agora é gerado via binário nativo `fulgur` (texto selecionável, multi-página). A API de
`PdfOptions` mudou completamente: os campos de viewport (`width`, `height`, `scale`, `fonts`) foram
**removidos** e substituídos por opções de documento:

| Campo removido  | Situação                                                  |
| --------------- | --------------------------------------------------------- |
| `width`         | Removido — tamanho de página via `pageSize`               |
| `height`        | Removido — paginação automática pelo renderer             |
| `scale`         | Removido — não aplicável ao renderer nativo               |
| `fonts`         | Removido — fontes via CSS no HTML (`@font-face`)          |

Novos campos disponíveis em `PdfOptions`:

| Campo novo    | Tipo                          | Default | Descrição                            |
| ------------- | ----------------------------- | ------- | ------------------------------------ |
| `pageSize`    | `"A4" \| "A3" \| "Letter"`   | `"A4"`  | Tamanho da página                    |
| `marginMm`    | `number`                      | `20`    | Margem uniforme em milímetros        |
| `title`       | `string`                      | —       | Título nos metadados do PDF          |
| `author`      | `string`                      | —       | Autor nos metadados do PDF           |

### `ImageOptions` — campos removidos (skreen v2 → ainda válido)

| Campo removido  | Equivalente skreen                     |
| --------------- | -------------------------------------- |
| `type`          | Somente PNG — não há opção de formato  |
| `quality`       | Não aplicável (PNG é lossless)         |
| `clip`          | Não suportado                          |
| `fullPage`      | Use `height: 0` (auto-expand)          |
| `deviceScaleFactor` | Renomeado para `scale`             |

---

## Interfaces atuais (referência)

```typescript
export interface PdfOptions {
  pageSize?: "A4" | "A3" | "Letter";  // default: "A4"
  marginMm?: number;                   // margem uniforme em mm; default: 20
  title?: string;                      // metadados do PDF
  author?: string;                     // metadados do PDF
}

export interface ImageOptions {
  width?: number;          // default: 1200
  height?: number;         // 0 = auto-expand até 4000px; default: 0
  scale?: number;          // device-pixel ratio; default: 2.0
  fonts?: Uint8Array[];    // bytes TTF/OTF adicionais
}

export interface GenerateDocumentJobData {
  userId: string;
  documentType: "pdf" | "image";
  htmlContent: string;
  s3Key: string;
  pdfOptions?: PdfOptions;
  imageOptions?: ImageOptions;
  metaData?: Record<string, unknown>;
}
```

O `GenerateDocumentJobResult` não mudou:

```typescript
export interface GenerateDocumentJobResult {
  url: string;
  userId: string;
  completedAt: string;          // ISO 8601
  metaData?: Record<string, unknown>;
}
```

---

## Limitações dos renderers

| Aspecto                | Chromium (anterior)      | PDF — fulgur nativo (atual)                  | Imagem — WASM (atual)                       |
| ---------------------- | ------------------------ | -------------------------------------------- | ------------------------------------------- |
| JavaScript no HTML     | Executado                | **Não executado**                            | **Não executado**                           |
| Tailwind CDN           | Funciona nativamente     | Não suportado — use CSS inline               | Não suportado — use CSS inline              |
| Fontes                 | System fonts             | Via CSS `@font-face` no HTML                 | Inter embutida + `fonts` (Uint8Array)       |
| Formatos de saída      | PDF / PNG / JPEG / WebP  | **PDF multi-página, texto selecionável**     | **Somente PNG**                             |
| Tamanho de página/tela | Via `format` option      | `pageSize` (A4 / A3 / Letter)                | `width` × `height` em px lógicos           |
| Altura máxima          | Ilimitada                | Paginação automática                         | **4000px lógicos** (`height: 0` = auto)     |
| Margens                | Via `margin` option      | Via `marginMm` (mm uniforme)                 | Via CSS no HTML                             |

### O HTML deve ser auto-contido

O renderer não carrega URLs externas. Todo CSS deve estar inline ou em `<style>`. Para imagens, fontes
da web não são baixadas — use a fonte Inter embutida ou passe bytes de fonte via `fonts`. Para PDFs,
inclua `@font-face` com fontes em base64 ou data URI no próprio HTML.

---

## Exemplos de migração

### PDF simples

```typescript
// Antes (Chromium/puppeteer)
await queue.add("generate", {
  documentType: "pdf",
  htmlContent: html,
  s3Key: "docs/receipt.pdf",
  userId: "user-123",
  pdfOptions: {
    format: "A4",
    margin: { top: "1cm", bottom: "1cm" },
    printBackground: true,
  },
});

// Depois — pageSize e marginMm como opções; estilos adicionais via CSS no HTML
await queue.add("generate", {
  documentType: "pdf",
  htmlContent: html,
  s3Key: "docs/receipt.pdf",
  userId: "user-123",
  pdfOptions: {
    pageSize: "A4",   // "A4" | "A3" | "Letter"
    marginMm: 15,     // margem uniforme em mm (default: 20)
    title: "Recibo",  // opcional — metadados do PDF
  },
});
```

### Imagem com Tailwind

O renderer WASM não executa JavaScript, portanto Tailwind CDN não funciona. O CSS deve estar
pré-processado e inline no HTML antes de publicar o job.

```typescript
// Antes — Tailwind CDN funcionava porque Chromium executava o script
await queue.add("generate", {
  documentType: "image",
  htmlContent: `<html>
    <head><script src="https://cdn.tailwindcss.com"></script></head>
    <body><div class="p-4 text-blue-500">Olá</div></body>
  </html>`,
  s3Key: "imgs/card.png",
  userId: "user-123",
  imageOptions: { fullPage: true },
});

// Depois — CSS Tailwind deve estar inline (pré-processado pelo TrinoCore antes do job)
await queue.add("generate", {
  documentType: "image",
  htmlContent: `<html>
    <head><style>.p-4{padding:1rem}.text-blue-500{color:#3b82f6}</style></head>
    <body><div class="p-4 text-blue-500">Olá</div></body>
  </html>`,
  s3Key: "imgs/card.png",
  userId: "user-123",
  imageOptions: {
    height: 0,  // equivalente ao fullPage: true anterior
  },
});
```
