# Plano de Sprints NN — <tema> `[DISCOVERY · FAN-IN]`

> Consolidação (fan-in) da rodada de discovery: transforma os artefatos dos modos
> rodados (`.negocio.md` / `.dev.md` / `.refatoracao.md`) num backlog fatiado de
> sprints. **Gate de saída bloqueante:** só com este plano **aprovado pelo
> usuário** abre a 1ª Arquitetura (gate 10). Artefato canônico:
> `.spec/discovery/plano-de-sprints-NN.md`. Cada linha aprovada abre com um
> **discovery-de-sprint** (`.spec/sprints/sprint-NN-<tema>/discovery-sprint.md`)
> antes da Arquitetura do sprint.
>
> No njord, cada linha vira uma **run** iniciada no entry_point `arquitetura`
> (reaproveitando os artefatos do discovery compartilhado) — zero mudança de
> domínio para "N sprints".

## Rodada de discovery (origem)
- **Modos rodados:** <negocio / dev / refatoracao — na ordem canônica>
- **Artefatos-fonte:** <lista dos `.spec/discovery/discovery-NN-<tema>.<modo>.md>`
- **scaffold-mode base:** <criar / refatorar / documentar>

## Contrato da tabela (leia antes de editar)

A seção seguinte é **lida por máquina** (`derive_plan_backlog`, em
`src-tauri/src/modules/orchestrator/infrastructure/esteira_cursor/plan_backlog.rs`).
O parser é *fail-closed*: qualquer desvio abaixo recusa o plano inteiro — não
corrige, não adivinha. Ao instanciar este template, copie a seção **byte a byte**
e mexa só nas linhas de dados.

- **Heading exato e único** no arquivo: `## Tabela do plano` (nem `###`, nem
  sufixo, nem emoji). A seção termina no próximo heading `## `.
- **Uma única tabela** dentro da seção, e ela é a **primeira coisa não-vazia**
  depois do heading — nenhum parágrafo, nota ou blockquote entre o heading e o
  cabeçalho da tabela. Notas explicativas vão **antes** do heading (como esta) ou
  depois da tabela, em linhas que não comecem com `|`.
- **Exatamente 5 colunas**, nesta ordem e com estes rótulos literais:
  `NN`, `scaffold-mode`, `Objetivo / ACs resumidos`, `Fontes históricas`,
  `Depende de`. Coluna a mais/a menos ou rótulo renomeado = plano recusado.
- **Separador** com no mínimo 3 traços por coluna (`|---|---|---|---|---|`);
  alinhamento com `:` é aceito.
- **Coluna `NN`** = id de sprint no formato `RR-SS` (dois dígitos, hífen, dois
  dígitos — ex.: `46-01`). É esse id que casa o diretório
  `.spec/sprints/sprint-<NN>-<slug>/` e a sprint ativa do cursor.
- **Sprint entregue fora da esteira** (manual): sufixo `✅` na célula `NN`
  (ex.: `46-01 ✅`). A aba Planos deriva "Entregue", bloqueia re-disparo e
  destrava quem depende dela. A sprint **ativa** no cursor não pode vir marcada.
- **`Objetivo / ACs resumidos`** também alimenta o *slug* do diretório da sprint
  quando ele ainda não existe (minúsculas, não-alfanumérico vira `-`) — escreva
  a primeira frase pensando nisso.
- **`Depende de`** aceita ids de sprint separados por vírgula, ou `—` quando não
  há dependência. A ordem de execução é a **ordem das linhas** (não existe coluna
  `ordem`).

## Tabela do plano

| NN | scaffold-mode | Objetivo / ACs resumidos | Fontes históricas | Depende de |
|---|---|---|---|---|
| 46-01 | criar | **<Título curto do incremento>.** <ACs verificáveis, uma frase por AC.> | <negocio\|dev\|refat + arquivo> | — |
| 46-02 | refatorar | **<Título curto do incremento>.** <ACs verificáveis.> | <artefato-fonte> | 46-01 |

## Notas de sequenciamento
- **Dependências:** <o que precisa entrar antes de quê e por quê>
- **Riscos de ordem:** <acoplamentos que forçam a sequência>

## DoD do Plano de Sprints (gate de saída da Discovery)
- [ ] Seção `## Tabela do plano` única, com as 5 colunas canônicas intactas
- [ ] Todo sprint tem **ACs verificáveis** + `scaffold-mode` (criar/refatorar/documentar)
- [ ] Toda linha aponta suas **fontes históricas**
- [ ] Dependências coerentes com a ordem das linhas (sem ciclo)
- [ ] **Aprovado pelo usuário** (gate bloqueante) → libera a 1ª Arquitetura

> Pós-aprovação: cada sprint inicia por `/discovery sprint <NN>`.
