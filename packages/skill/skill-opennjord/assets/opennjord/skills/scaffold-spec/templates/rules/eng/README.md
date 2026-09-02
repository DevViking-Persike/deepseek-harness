# Regras de engenharia — índice

Cada arquivo neste diretório define uma regra de engenharia universal. Skills (`commands/`) e etapas da esteira (`esteira/stages/`) referenciam regras específicas. A instalação num projeto concreto escolhe o **preset de stack** (Camada 2) e preenche os `<preencher>`.

## Índice

| # | Regra | Verificação automatizada |
|---|-------|--------------------------|
| 1 | [Tamanho de arquivo (alvo ~300, teto ~500)](01-file-size.md) | sim (`find … wc -l … awk '$1>500'`) |
| 2 | [Testes unitários (≥ 84% cov + mutation)](02-unit-tests.md) | sim (cov + mutation tools por stack) |
| 3 | [SOLID](03-solid.md) | parcial (grep de markers de framework/IO) |
| 4 | [Clean Architecture](04-clean-architecture.md) | sim (grep de imports entre camadas) |
| 5 | [Simplicidade](05-simplicity.md) | não (code review) |
| 6 | [Refatoração contínua](06-continuous-refactoring.md) | não (disciplina + histórico git) |
| 7 | _Build e execução do app_ | _(a definir por stack — ver `stacks/`)_ |
| 8 | _Delegar execução ao usuário_ | não (disciplina) |
| 9 | _UI responsiva (mobile-first)_ | parcial (grep de larguras fixas + DevTools) |
| 10 | _Arquitetura de frontend (MVVM + Atomic)_ | parcial (grep de camadas) |
| 11 | _Repositório-fonte / paridade externa_ | não (referência) |

> Regras 07–11: o conjunto completo é 01–11. As regras 07–11 ainda não têm template neste diretório — são referenciadas por outros artefatos do `scaffold-spec` (esteira, runbooks) e serão adicionadas conforme a necessidade do projeto. As regras **01–06 são autocontidas e portáveis** hoje.

## Formato: 3 camadas

Cada regra segue uma estrutura de **3 camadas** para equilibrar princípio universal e prescrição concreta:

1. **Camada 1 — Princípio universal (agnóstico):** motivação, como aplicar e exceções. Neutro em linguagem/framework. Vale para qualquer stack.
2. **Camada 2 — Preset por stack:** comandos/markers concretos por stack (Rust, Node-TS, Python, Go, C#, KMP, Svelte/Angular/React, RPA). Só as stacks onde a regra tem comando/marker concreto. Veja `stacks/`.
3. **Camada 3 — Exemplo concreto:** um worked example curto.

E fecha com **Como verificar** (bash/verificação, concreto por stack quando couber).

### Marcadores `<preencher>`
`<preencher: o quês>` indicam campos a substituir ao instalar no projeto (ex.: roots de código, idioma do histórico, markers de framework). Regra: sempre descritivo, nunca `<>` nu.

## Exceções
Violação de qualquer regra exige **justificativa explícita** no commit/PR. Exceções aceitas por regra estão listadas no corpo de cada uma (ex.: código vendorizado na Regra 1, módulos banhados em SDK na Regra 2/3).

## Verificação conjunta (esteira)
A verificação de todas as regras roda na **etapa `Q00-check`** da esteira (`esteira/stages/Q00-check.md`) — gate bloqueante antes de qualquer merge. O runbook `commands/eng/check-rules.md` orquestra a auditoria manual + automatizada contra este diretório.

### Relação com skills
- `check-rules` — audita o repo contra todas as regras
- `refactor <arquivo>` — refatora um arquivo aplicando as regras relevantes
