# Commit Rules

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
2. `deno task fmt:chk` — lint (auto-fix com `deno fmt` se necessário, re-checar)
3. `deno task test` — testes + cobertura
4. `git add <arquivos>` — staging explícito (nunca `git add .` sem revisar)
5. `git commit` — commit com mensagem detalhada no formato Conventional Commits

**Pare no commit — não faça push nem abra PR.** Para isso, use o `pr-manager`.

---

## Caveats

- Use `git add` explícito para arquivos específicos — nunca `git add .` ou `git add -A` sem revisar.
- Verificar `git status` e `git diff --stat` antes de commitar para entender o escopo das mudanças.
- Se houver arquivos não rastreados que pareçam intencionalmente excluídos, confirmar com o usuário antes de stagear.
- Nunca incluir arquivos sensíveis (`.env`, credenciais, secrets).
