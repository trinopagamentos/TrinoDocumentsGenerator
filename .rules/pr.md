# Pull Request Rules — TrinoCore

## Título do PR

- **Sempre em português (pt-BR)**
- Formato: `<type>(<task-id>): <descrição>`
  - Com task-id: `feat(86afq5mzd): adicionar suporte a exclusão suave nos anúncios`
  - Sem task-id: `feat: adicionar suporte a exclusão suave nos anúncios`
- Se o usuário **não fornecer** um `task-id`, omitir os parênteses — **nunca inventar ou deduzir** um task-id.
- Types válidos: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `ci`
- A descrição deve ser concisa, imperativa e em minúsculas após os dois-pontos.

---

## Body do PR

- **Sempre em português (pt-BR)**
- Deve conter exatamente estas três seções:

```markdown
## Resumo
<Um a dois parágrafos explicando o contexto geral e a motivação da mudança.>

## Funcionalidade
<Descrição detalhada do que foi implementado ou alterado. Use bullet points para clareza. Referencie módulos, arquivos ou camadas arquiteturais afetados.>

## Evidências
<Prova de que a implementação funciona. Inclua: resumo dos resultados dos testes, percentuais de cobertura, screenshots se aplicável, ou quaisquer passos de testes manuais realizados. Se executou os testes, cole a saída relevante.>
```

- Ser detalhado — os revisores devem entender o escopo completo do PR sem olhar o diff.
- Referenciar o task-id no body se foi fornecido.

---

## Branch e Fluxo de PR

- Branch base padrão: `main` — usar `gh pr create --base main` salvo instrução explícita do usuário.
- Verificar se há commits locais não publicados antes de criar o PR; fazer `git push` se necessário.

---

## Tratamento de Erros

- Se o `task-id` for ambíguo ou não fornecido, perguntar ao usuário antes de usar no título.
- Se a branch base parecer incorreta, confirmar com o usuário.
