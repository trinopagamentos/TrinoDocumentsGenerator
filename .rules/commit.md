# Commit Rules — TrinoDocWorker

## Pre-Commit Checklist (obrigatório — sempre nesta ordem)

1. **Lint e formatação**: `deno task lint` e `deno task fmt:chk`
   - Se `fmt:chk` falhar, execute `deno task fmt` e re-cheque antes de prosseguir.
   - Se `deno task lint` ainda falhar após o `fmt`, corrija manualmente. Nunca commitar com lint quebrado.

2. **Testes**: `deno task test`
   - Se os testes falharem, pare e reporte as falhas. **Não commitar.**
   - Não há gate obrigatório de cobertura configurado neste projeto. Quando fizer sentido, rode
     `deno task test:coverage` e inclua o resultado como evidência no PR — sem bloquear o commit por percentual.

3. Somente após lint, formatação e testes passarem, prosseguir para o commit.

---

## Formato do Commit (Conventional Commits)

```
<type>(<scope>): <short description>

<body>
```

- **type**: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `ci`
- **scope**: nome do módulo afetado (ex: `generator`, `shared`, `config`)
- **short description**: imperativo, minúsculas, sem ponto final
- **body**: explica **o quê** mudou e **por quê** — não apenas quais arquivos foram tocados
- Use bullet points no body listando as mudanças-chave
- Mensagens de commit em **inglês** (salvo solicitação explícita do usuário)

### Exemplo de commit bem estruturado

```
feat(generator): add retry policy for transient S3 upload failures

- Added exponential backoff to S3Service.upload()
- Updated GeneratorProcessor to surface upload errors with job context
- Added unit tests for retry scenarios (deno task test)
```

---

## Fluxo de Execução (ordem obrigatória)

1. `git status` + `git diff --stat` — entender o escopo das mudanças
2. `deno task lint` e `deno task fmt:chk` — lint e formatação (auto-fix com `deno task fmt` se necessário, re-checar)
3. `deno task test` — testes
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

- Se `deno task fmt:chk` falhar: reportar os arquivos afetados, rodar `deno task fmt` e re-checar.
- Se `deno task lint` falhar: reportar os erros específicos e corrigir manualmente antes de prosseguir.
- Se os testes falharem: listar cada teste falho com sua mensagem de erro. Perguntar ao usuário se quer corrigir primeiro.
- Sempre reportar o resumo final de lint/formatação/testes antes de commitar.
