# Etapa Q30 — revisão final do diff

> Review do diff completo do incremento: 0 violação de camada/dependência,
> lógica na camada certa, diff bate com ACs/ADR/plano. Fecha a esteira de
> qualidade. Complementa o command `/code-review` (bugs + cleanups).

## Definition of Ready

- Etapa Q20-test-cov-mutation concluída (testes verde, cov ≥84%, mutation ≥84%).
- Diff consolidado (commits granulares, sem WIP/resíduo).
- ACs/ADR/plano do `.spec/` acessíveis (critério de "bate com o plano").
- `stacks/<stack>.md` com os `arch_violation_grep` da stack.

## Checklist de atividades

### 1. Violações de camada/dependência (greps)
- Rodar todos os `arch_violation_grep` de `rules/eng/*` sobre o diff.
  - Interno importando externo (domain/application → SDK/IO/commands).
  - Frontend importando backend direto (em vez de via porta/invoke).
  - Infra importando commands/UI.
- Qualquer hit = violação bloqueante (voltar à Q10-refactor ou à Q20-test-cov-mutation conforme a natureza).

### 2. Lógica na camada certa
- Regra de negócio em `domain`/`application` (pura, testável sem IO).
- IO (HTTP, SDK, FS, DB) em `infrastructure` implementando ports de `domain`.
- Comando/Handler thin (só desserializa → chama application/domain → devolve).
- UI: estado/apresentação na View, regra no ViewModel/Model, IO via porta.
- Nada de SDK/UI/`invoke` dentro de domain/application.

### 3. Diff bate com ACs/ADR/plano
- Cada AC do incremento tem commit/código correspondente.
- Decisões estruturais refletem o ADR registrado (ou geraram novo ADR).
- Não há "outra coisa no meio" (feature extra não pedida = parar e perguntar).

### 4. Cleanups de qualidade (complementa `/code-review`)
- Reuso: há duplicação que vira helper? Função usada em 1 lugar que inlina?
- Eficiência: loop O(n²) que vira O(n)? IO redundante?
- Altitude: comentário que descreve o *quê* em vez do *porquê*? Nome genérico
  ("Manager"/"Helper"/"Util") que indica SRP fraco?
- Estes são **achados de review**, não bloqueantes por si; viram commit
  `refactor:` separado (Regra 6) se o autor concordar.

## Definition of Done

- Relatório de review com veredito por eixo:
  - Camadas: 0 violação.
  - Camada certa: conforme.
  - ACs/ADR: cobertos.
  - Cleanups: lista (aplicar ou deferir).
- Diff pronto para merge/release (ou lista explícita do que falta).
- Estado do incremento atualizado no `STATE` (etapa Q30 ✅).

## Gate (bloqueante)

- 0 violação de camada **E** lógica na camada certa **E** diff bate com ACs/ADR
  → `ok`, incremento **fechado**.
- Violação de camada ou descasamento com plano → `fail`:
  - Violação estrutural/camada → volta à **Q10-refactor**.
  - Falta de teste/cobertura exposta no review → volta à **Q20-test-cov-mutation**.
- **2× reprovado** → parar e pedir humano.

## Comandos (genéricos)

> Concretos em `stacks/<grupo>/<stack>.md`: `arch_violation_grep`, `lint_cmd`.

- Camadas: rodar cada `arch_violation_grep` sobre o diff (`git diff` + grep).
- Frontend: grep de `invoke(`/IO direto em componentes `.svelte`.
- Backend: grep de markers de framework de IO/SDK em `domain`/`application`.
- Plano: cruzar lista de ACs com arquivos do diff (cada AC tem código?).

## Composição graphify (opcional)

Análise de impacto pós-diff para confirmar que invariantes estruturais seguem íntegros:

```bash
graphify path "<novo módulo>" "<consumidor principal>"
graphify explain "<camada que mais mudou>"
```

Responde: o diff introduziu dependência cíclica? Domain passou a depender de
infra? Um organism passou a importar atom com domínio? Use para confirmar o que
os greps estruturais mostram — camada extra de confiança no review.

## Composição archify (opcional, modo documentar)

Use `archify validate` para a estrutura do JSON e `archify compare` para o delta
base/head já autorado. Depois confira nós/relações contra código, configs e ADRs:
Archify não inspeciona o repo. Sem a ferramenta, revise o diff do diagrama
manualmente. O gate continua sendo fidelidade doc↔código.

## Anti-patterns

- Aprovar com "looks fine" sem rodar os greps de camada.
- Tratar cleanup de qualidade como bloqueante (vira ruído; vire commit separado).
- Aceitar feature extra não pedida sem perguntar (scope creep).
- Não cruzar com ACs ("o código funciona" ≠ "entrega o que foi pedido").
- Pular o registro no `STATE` (o incremento precisa constar como fechado).
