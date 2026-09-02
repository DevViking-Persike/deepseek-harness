# Etapa Q00 — auditoria de regras (somente leitura)

> Auditoria do diff/repo contra `rules/eng/*`. **Não edita arquivos.** Se houver
> violação bloqueante → encaminha à etapa Q10-refactor. Implementa o mesmo
> propósito do command `/check-rules`, empacotado como etapa com gate.

## Definition of Ready

- Diff/branch a auditar identificado (ou escopo = repo inteiro).
- `rules/eng/*` instaladas (são a base de comparação).
- `stacks/<stack>.md` com os comandos concretos de verificação.
- Nenhuma edição em andamento (etapa é read-only).

## Checklist de atividades

1. **Regra 1 — Tamanho:** rodar o `file_glob` de verificação (ex.: `find ... -exec wc -l`).
   - Classificar: > teto = bloqueante; zona de atenção (alvo–teto) = warning.
2. **Regra 2 — Testes:** identificar módulos sem `#[cfg(test)]` / sem `.test.ts`.
   - Reportar pacotes sem testes (violação automática). Não roda cobertura aqui (é etapa Q20-test-cov-mutation).
3. **Regra 3 — SOLID (sinais):** rodar os greps de violação de DIP/SRP.
   - Ex.: domain/application importando SDK/framework de IO; classes/trait "gordas".
4. **Regra 4 — Clean Architecture:** rodar os `arch_violation_grep` da stack.
   - Camada interna importando commands/UI; frontend importando backend direto.
5. **Regra 5 — Simplicidade:** amostrar funções/blocos > 60 linhas; flags booleanas
   que mudam comportamento interno; wrappers que só repassam.
6. **Saúde do build (sinal, não bloqueante aqui):** `lint_cmd` + `typecheck_cmd`.
   - Erro de compilação = bloqueante (nem a Q10-refactor começa); warning = informação.

## Definition of Done

- Relatório markdown com uma seção por regra:
  - `conforme` / `warning` (pequena) / `bloqueante`.
  - Contagem agregada no topo.
  - Top 3 próximos passos priorizados.
- Lista explícita de arquivos para a Q10-refactor (os que têm violação bloqueante).
- Nenhum arquivo editado por esta etapa.

## Gate (bloqueante)

- **0 violação bloqueante** → `ok`, avança à Q10-refactor (ou direto à Q20-test-cov-mutation se a Q00-check
  não encontrou nada a refatorar).
- **≥1 violação bloqueante** → `fail`, encaminha à Q10-refactor com a lista.
- **2× reprovado** (após Q10-refactor tentar corrigir e Q00-check reauditar e ainda bloqueante)
  → parar e pedir humano.

## Comandos (genéricos)

> Comandos concretos por stack estão em `stacks/<grupo>/<stack>.md`:
> `file_glob`, `arch_violation_grep`, `lint_cmd`, `typecheck_cmd`.

- Tamanho: varrer `file_glob` e listar arquivos > teto.
- Camadas: rodar cada `arch_violation_grep` definido no preset.
- SOLID: greps de markers de framework/IO em `domain/`/`application/`.
- Build: `lint_cmd` e `typecheck_cmd` (só sinal de saúde).

## Composição graphify (opcional)

Antes de listar "arquivos para refatorar", entender o impacto ajuda a priorizar:

```bash
graphify query "quais módulos dependem dos arquivos com violação bloqueante?"
```

Útil para ordenar a fila da Q10-refactor (maior impacto primeiro) e antecipar
riscos de split. Não é obrigatório.

## Anti-patterns

- Editar arquivos nesta etapa (vira trabalho oculto sem rede de segurança).
- Tratar warning como bloqueante (infla a fila da Q10-refactor sem ganho real).
- Pular a classificação bloqueante vs. warning (vira só um relatório difuso).
- Rodar cobertura/mutation aqui (é papel da etapa Q20-test-cov-mutation; aqui é só auditoria estrutural).
- Reescrever greps que já existem no preset da stack (DRY — referencie `stacks/`).
