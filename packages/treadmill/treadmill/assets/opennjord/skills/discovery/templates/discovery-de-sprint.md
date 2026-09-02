# Discovery de Sprint NN — <tema> `[DISCOVERY · SPRINT]`

> Detalhamento de **1 linha** do `plano-de-sprints-NN.md` antes de abrir a esteira
> do sprint. **Não repete** a Discovery de rodada — aterra a linha no código real e
> propõe a quebra em tasks. Artefato canônico:
> `.spec/sprints/sprint-NN-<tema>/discovery-sprint.md`.
> É a **entrada do design gate (10a)**: a Arquitetura reprova se o contexto não
> estiver aterrado ou se alguma task proposta ficar sem AC verificável. O Planner
> do `/desenvolvimento` materializa `tasks/task-NN-<slug>.md` direto da tabela §7,
> enriquecida pelas decisões do 10a — sem re-transcrição intermediária.

## 1. Linha do plano (origem)
- **NN · scaffold-mode:** <preencher: NN + criar|refatorar|documentar>
- **ACs da linha:** <preencher: copiados do plano-de-sprints-NN.md>
- **discoveries-fonte:** <preencher: artefatos .spec/discovery/ da rodada>

## 2. Contexto aterrado no código (o que JÁ existe — medido, não suposto)
| Path | Linhas/estado real | Relevância pro sprint |
|---|---|---|
| <preencher: arquivo/módulo> | <preencher: contagem/estado medido> | <preencher> |
- **Base git:** <preencher: branch + SHA em que as medições valem>

## 3. Gap central
<preencher: 1 parágrafo — modelo atual × alvo>

## 4. Escopo
- **Faz:** <preencher>
- **Não faz (fora de escopo nesta sprint):** <preencher>
- **Contratos/regras aplicáveis:** <preencher: referência a rules/ADRs — link, não transcrição>

## 5. Decisões abertas e lacunas (BLOQUEIAM o dev — cada uma com dono)
<preencher: Dn + dono, ou —. Decisões de design (camadas, contratos, ADR) NÃO entram aqui — são do 10a>

## 6. Riscos (pre-mortem)
| R | Risco | Mitigação (→ task/qa) |
|---|---|---|
| R1 | <preencher> | <preencher> |

## 7. Tasks propostas (o Planner materializa em `tasks/` após o 10a)
| Task | Objetivo | Depende de | Escopo de escrita (globs exclusivos) | AC resumido (verificável) | Spike? |
|---|---|---|---|---|---|
| 01 | <preencher> | <— ou NN> | <preencher> | <preencher: Dado/Quando/Então em 1 linha> | <sim\|não> |

> `Spike? sim` só pelos critérios da seção "Discovery de sprint" da skill — a
> investigação timeboxada mora na própria task, nunca em arquivo separado.
