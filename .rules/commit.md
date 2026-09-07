# Commit Rules — TrinoCore

## Pre-Commit Checklist (obrigatório — sempre nesta ordem)

1. **Lint check**: `npm run biome:chk`
   - Se falhar, execute `npm run biome:fix` e re-cheque antes de prosseguir.
   - Nunca commitar se o lint ainda falhar após auto-fix.

2. **Testes**: `npm t -- --maxWorkers=4`
   - Se os testes falharem, pare e reporte as falhas. **Não commitar.**
   - Cobertura mínima: **50%** em statements, branches, functions e lines.
   - Se a cobertura estiver abaixo de 50% em qualquer métrica, avisar o usuário e não prosseguir sem confirmação explícita.

3. Somente após os dois checks passarem, prosseguir para o commit.

---

## Formato do Commit (Conventional Commits)

```
<type>(<scope>): <short description>

<body>
```

- **type**: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `ci`
- **scope**: nome do módulo afetado (ex: `announcement`, `withdraw`, `transfer`)
- **short description**: imperativo, minúsculas, sem ponto final
- **body**: explica **o quê** mudou e **por quê** — não apenas quais arquivos foram tocados
- Use bullet points no body listando as mudanças-chave
- Mensagens de commit em **inglês** (salvo solicitação explícita do usuário)

### Exemplo de commit bem estruturado

```
feat(announcement): add soft delete support

- Added `deletedDate` field to AnnouncementEntity
- Updated AnnouncementPrismaRepository to filter out soft-deleted records
- Added softDelete() method to IAnnouncementRepository interface
- Added unit tests for soft delete scenarios (coverage: 87%)
```

---

## Fluxo de Execução (ordem obrigatória)

1. `git status` + `git diff --stat` — entender o escopo das mudanças
2. `npm run biome:chk` — lint (auto-fix com `biome:fix` se necessário, re-checar)
3. `npm t -- --maxWorkers=4` — testes + cobertura
4. `git add <arquivos>` — staging explícito (nunca `git add .` sem revisar)
5. `git commit` — commit com mensagem detalhada no formato Conventional Commits

**Pare no commit — não faça push nem abra PR.** Para isso, use o `pr-manager`.

---

## Staging

- Use `git add` explícito para arquivos específicos — nunca `git add .` ou `git add -A` sem revisar.
- Verificar `git status` e `git diff --stat` antes de commitar para entender o escopo das mudanças.
- Se houver arquivos não rastreados que pareçam intencionalmente excluídos, confirmar com o usuário antes de stagear.
- Nunca incluir arquivos sensíveis (`.env`, credenciais, secrets).

---

## Tratamento de Erros

- Se `biome:chk` falhar: reportar os erros específicos, rodar `biome:fix`, re-checar e reportar o resultado.
- Se os testes falharem: listar cada teste falho com sua mensagem de erro. Perguntar ao usuário se quer corrigir primeiro.
- Se a cobertura estiver abaixo de 50%: exibir a tabela de cobertura e solicitar confirmação explícita para prosseguir.
- Sempre reportar o resumo final de cobertura de testes antes de commitar.
