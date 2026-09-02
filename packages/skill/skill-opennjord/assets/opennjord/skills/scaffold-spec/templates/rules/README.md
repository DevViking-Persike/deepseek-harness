# Regras de engenharia

Cada arquivo em `eng/` define uma regra em **3 camadas** (princípio universal →
preset por stack → exemplo). Skills e os runbooks em `../commands/eng/`
referenciam regras específicas. Veja `eng/_layer-guide.md` para autorar/ler as
camadas e `../stacks/` para os presets concretos de cada stack.

| # | Regra | Verificação automatizada |
|---|-------|--------------------------|
| 1 | [Tamanho de arquivo (alvo ~300, teto ~500)](eng/01-file-size.md) | sim |
| 2 | [Testes unitários (≥ 84% cov + mutation)](eng/02-unit-tests.md) | sim |
| 3 | [SOLID](eng/03-solid.md) | parcial (grep de markers) |
| 4 | [Clean Architecture](eng/04-clean-architecture.md) | sim (grep de imports) |
| 5 | [Simplicidade](eng/05-simplicity.md) | não (code review) |
| 6 | [Refatoração contínua](eng/06-continuous-refactoring.md) | não (disciplina) |
| 7 | [Build & Run do app](eng/07-build-and-run.md) | sim (comando de build da stack) |
| 8 | [Delegar execução ao usuário](eng/08-delegate-execution.md) | não (disciplina) |
| 9 | [UI responsiva (mobile-first)](eng/09-responsive-ui.md) | parcial (grep + DevTools) |
| 10 | [Arquitetura de frontend (MVVM + Atomic)](eng/10-frontend-architecture.md) | parcial (grep de camadas) |
| 11 | [Fonte de paridade externa (opcional)](eng/11-external-parity-source.md) | não (referência) |
| — | [Segurança](seguranca.md) | parcial |
| — | [Fluxo de desenvolvimento](fluxo-desenvolvimento.md) | não (disciplina) |

## Comandos instalados
- `/check-rules` — audita o repo contra todas as regras (runbook em `../commands/eng/`)
- `/refactor <arquivo>` — refatora um arquivo aplicando as regras relevantes
- `/responsive-pass <rota>` — audita e refatora UI aplicando Regra 9
- `/dead-code-cleansing` — identifica e remove código morto após confirmação

## Esteira de qualidade
As regras são **aplicadas** pela esteira de qualidade em `../esteira/` (gates
bloqueantes: `Q00-check → Q10-refactor → Q20-test/cov/mutation → Q30-review`). Valide
os templates com `bash .claude/tools/esteira-check.sh`.

Violação exige justificativa explícita no commit/PR.
