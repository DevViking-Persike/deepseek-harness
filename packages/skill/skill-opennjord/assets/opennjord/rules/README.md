# Regras de engenharia — njord-tauri

Cada arquivo aqui define uma regra. Skills (`.claude/commands/`) referenciam regras específicas.

| # | Regra | Verificação automatizada |
|---|-------|--------------------------|
| 1 | [Tamanho de arquivo (alvo ~300, teto ~500)](eng/01-file-size.md) | sim |
| 2 | [Testes unitários (≥ 84% cov + mutation)](eng/02-unit-tests.md) | sim |
| 3 | [SOLID](eng/03-solid.md) | parcial (grep de violações) |
| 4 | [Clean Architecture](eng/04-clean-architecture.md) | sim (grep de imports) |
| 5 | [Simplicidade](eng/05-simplicity.md) | não (code review) |
| 6 | [Refatoração contínua](eng/06-continuous-refactoring.md) | não (disciplina) |
| 7 | [Build e execução do desktop app](eng/07-build-and-run.md) | sim (`npm run tauri build`) |
| 8 | [Delegar execução ao usuário](eng/08-delegate-execution.md) | não (disciplina) |
| 9 | [UI responsiva (mobile-first)](eng/09-responsive-ui.md) | parcial (grep de larguras fixas + DevTools) |
| 10 | [Arquitetura de frontend (MVVM + Atomic)](eng/10-frontend-architecture.md) | parcial (grep de camadas) |
| 11 | [Repositório-fonte do DBX (paridade)](eng/11-external-parity-source.md) | não (referência) |

## Comandos
- `/check-rules` — audita o repo contra todas as regras
- `/refactor <arquivo>` — refatora um arquivo aplicando as regras relevantes
- `/responsive-pass <rota>` — audita e refatora UI aplicando Regra 9

Violação exige justificativa explícita no commit/PR.
