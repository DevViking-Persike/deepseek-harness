# Gates bloqueantes da esteira de qualidade

> Cada etapa tem **um** critério bloqueante. Reprovado → volta uma casa.
> Reprovado **2× no mesmo gate** → **parar e pedir humano**.

## Tabela de gates

| Etapa | Critério bloqueante (DoR → DoD) | Reprovado | 2× reprovado |
|-------|--------------------------------|-----------|--------------|
| **Q00-check** | 0 violação **bloqueante** contra `rules/eng/*` (tamanho >teto, SOLID, camada, `unwrap` em path de falha, frontend importando backend). Violações **pequenas** (ex.: arquivo na zona 300–500) são warning, não bloqueiam. | Vai ao Q10-refactor com a lista | Parar e pedir humano |
| **Q10-refactor** | `cargo check`/`tsc`/lint verde **E** 0 violação bloqueante restante **E** Regra 6 respeitada (1 commit = 1 motivo; bug pré-existente = parar e perguntar). | Volta ao Q00-check (re-auditar) | Parar e pedir humano |
| **Q20-test-cov-mutation** | Cobertura ≥ **84%** por pacote/módulo testável **E** eficácia de mutation ≥ **84%** **E** suíte de testes verde **E** nenhum teste desabilitado para passar. | Volta ao Q10-refactor (faltou rede de segurança/cobertura) | Parar e pedir humano |
| **Q30-review** | 0 violação de camada/dependência (greps de `rules/eng/*` vazios) **E** lógica na camada certa (domain puro, IO em infrastructure, UI só via invoke/port) **E** diff bate com ACs/ADR/plano. | Volta ao Q20 ou Q10 conforme a natureza do achado | Parar e pedir humano |

## Regra de fluxo

```
Q00 (audit) ──ok──> Q10 (refactor) ──ok──> Q20 (test+mut) ──ok──> Q30 (review) ──ok──> FECHADO
  │                    │                        │                      │
  └─fail─> (vai ao Q10) └─fail─> (volta ao Q00)  └─fail─> (volta ao Q10) └─fail─> (volta ao Q20 ou Q10)
                  │                                                                 │
                  └──────────── 2× no MESMO gate ──> PARAR, pedir humano ──────────┘
```

## Semântica dos status

- `ok` — gate passou; avança.
- `fail` — gate reprovou; volta uma casa com a lista de achados.
- `block` — 2ª reprovação no mesmo gate; **para tudo**, escala para humano com
  o histórico das 2 tentativas.

## Exceções que NÃO bloqueiam

- Arquivo de teste que cresceu mas está na zona de atenção (300–500) — warning.
- Módulo com ≥80% de chamadas a SDK externo — threshold de cobertura aplicado
  só às funções puras (ver `rules/eng/02-unit-tests`).
- Exceções explicitamente listadas nas regras (entry point fino, tokens de
  design sem lógica, components de apresentação pura via snapshot).

## Nota de fronteira (processo × qualidade)

Os 4 gates acima são da esteira de **qualidade** (sobre um diff). Existe um
gate anterior, de **processo**, fora desta tabela: *"Plano de Sprints
aprovado"* (saída da disciplina 00-Discovery) — bloqueante, precede a
**1ª** esteira de qualidade de cada sprint derivado. Ele não é uma 5ª etapa
aqui; é o portão que decide "existe um diff para rodar Q00→Q30" antes de este
arquivo entrar em cena.

## Registro

Cada verificação de gate deve deixar rastro no `STATE.md` (ou equivalente do
projeto): etapa, status (`ok`/`fail`/`block`), contador da tentativa, achados.
Isso é o que diferencia "reprovado 1×" de "reprovado 2×".
