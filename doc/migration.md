# TrinoCore → TrinoDocWorker: Guia de Migração

## O que mudou

O TrinoDocWorker migrou de Chromium headless (`puppeteer-core` + `@sparticuz/chromium`) para um
renderer WASM puro (`@tadashi/skreen`, baseado em Rust/Blitz/Vello). A mudança é transparente para o
fluxo principal (publicar job → aguardar resultado), mas algumas opções de renderização foram
removidas ou alteradas.

---

## Breaking changes nas opções de job

### `PdfOptions` — campos removidos

Os seguintes campos não existem mais e serão **ignorados silenciosamente** se enviados:

| Campo removido          | Equivalente skreen                                                       |
| ----------------------- | ------------------------------------------------------------------------ |
| `format`                | Controlado pelas dimensões `width`/`height` da viewport                  |
| `landscape`             | Troque `width` e `height` manualmente (ex: `width: 1123, height: 794`)   |
| `margin`                | Use `padding`/`margin` no próprio HTML via CSS                           |
| `tagged`                | Não suportado                                                            |
| `preferCSSPageSize`     | Não suportado                                                            |
| `printBackground`       | Sempre ativo — o renderer renderiza background por padrão                |
| `deviceScaleFactor`     | Renomeado para `scale`                                                   |

### `ImageOptions` — campos removidos

| Campo removido  | Equivalente skreen                     |
| --------------- | -------------------------------------- |
| `type`          | Somente PNG — não há opção de formato  |
| `quality`       | Não aplicável (PNG é lossless)         |
| `clip`          | Não suportado                          |
| `fullPage`      | Use `height: 0` (auto-expand)          |
| `deviceScaleFactor` | Renomeado para `scale`             |

---

## Novos campos disponíveis

Ambas as interfaces (`PdfOptions` e `ImageOptions`) agora aceitam:

```typescript
withTailwind?: boolean  // default: false
```

Quando `true`, o worker pré-processa o HTML com Tailwind CSS v4 **antes de renderizar**,
substituindo qualquer `<script src="@tailwindcss/browser">` por um `<style>` gerado no servidor.

> **Isso é necessário porque o renderer WASM não executa JavaScript.** Se o HTML usa Tailwind CDN,
> passe `withTailwind: true` — o TrinoCore não precisa fazer mais nada além disso.

---

## Interfaces atuais (referência)

```typescript
export interface PdfOptions {
  width?: number;          // default: 1200
  height?: number;         // 0 = auto-expand até 4000px; default: 800
  scale?: number;          // device-pixel ratio; default: 2.0
  fonts?: Uint8Array[];    // bytes TTF/OTF adicionais
  withTailwind?: boolean;  // pré-processar Tailwind CSS v4; default: false
}

export interface ImageOptions {
  width?: number;          // default: 1200
  height?: number;         // 0 = auto-expand até 4000px; default: 0
  scale?: number;          // device-pixel ratio; default: 2.0
  fonts?: Uint8Array[];    // bytes TTF/OTF adicionais
  withTailwind?: boolean;  // pré-processar Tailwind CSS v4; default: false
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

## Limitações do renderer WASM

| Aspecto             | Chromium (anterior)      | Skreen (atual)                              |
| ------------------- | ------------------------ | ------------------------------------------- |
| JavaScript no HTML  | Executado                | **Não executado**                           |
| Tailwind CDN        | Funciona nativamente     | Usar `withTailwind: true`                   |
| Fontes              | System fonts             | Apenas Inter embutida + `fonts` (Uint8Array) |
| Imagem: formatos    | PNG, JPEG, WebP          | **Somente PNG**                             |
| Imagem: altura máx  | Ilimitada                | **4000px lógicos** (`height: 0` = auto)     |
| Margens no PDF      | Via `margin` option      | Via CSS (`padding`, `margin`, `@page`)      |

### O HTML deve ser auto-contido

O renderer não carrega URLs externas. Todo CSS deve estar inline ou em `<style>`. Fontes da web
(Google Fonts, etc.) não são baixadas — use a fonte Inter embutida ou passe bytes de fonte via
`fonts`.

---

## Exemplos de migração

### PDF simples

```typescript
// Antes
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

// Depois — margens via CSS no HTML, format via width/height
await queue.add("generate", {
  documentType: "pdf",
  htmlContent: html, // <body style="margin: 37px"> ou @page { margin: 1cm } no <style>
  s3Key: "docs/receipt.pdf",
  userId: "user-123",
  pdfOptions: {
    width: 794,   // A4 em 96dpi ≈ 794×1123px
    height: 1123,
  },
});
```

### Imagem com Tailwind

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

// Depois — Tailwind CDN não funciona; passar withTailwind: true
await queue.add("generate", {
  documentType: "image",
  htmlContent: `<html>
    <head><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script></head>
    <body><div class="p-4 text-blue-500">Olá</div></body>
  </html>`,
  s3Key: "imgs/card.png",
  userId: "user-123",
  imageOptions: {
    height: 0,          // equivalente ao fullPage: true anterior
    withTailwind: true, // worker processa o Tailwind antes de renderizar
  },
});
```
