---
name: scaffold-spec
description: >-
  Monta a base operacional .spec de um projeto e orquestra as skills da esteira
  (discovery, arquitetura, desenvolvimento, qa/qa-rpa, seguranca/redteam, deploy)
  para construir um projeto inteiro e bem estruturado. Cria cadência de sprints,
  MANIFEST, STATE, RUNBOOK, reference, integrations, rules, commands, tools e
  hooks. Use quando
  o usuário pedir "criar estrutura .spec", "scaffold spec", "montar um projeto do
  zero", "bootstrap operacional", "preparar projeto pra criar/refatorar/documentar
  um sistema", ou "/scaffold-spec [criar|refatorar|documentar]".
---

# Skill: scaffold-spec

Monta a **base operacional** de um projeto: o diretório `.spec/` (cadência de
sprints por disciplina + índice + estado + runbook), as **rules** de engenharia,
os **commands** do Claude Code e a **skill de deploy**. Generaliza o padrão
validado em produção. Funciona em projeto novo (greenfield) ou existente.

> **Princípio do projeto:** `rule` = fonte de verdade (conhecimento); `skill` =
> runbook que aplica. O `.spec/` é o manual operacional; roteadores como
> `CLAUDE.md` só apontam pra ele.

## Compatibilidade Claude Code + Codex

- **Fonte canônica única: `.opennjord/`** — rules, skills, commands, agents,
  hooks, tools, stacks e esteira vivem SÓ lá. `.claude/{rules,skills,commands,
  agents}` são symlinks por-subdiretório pra dentro de `.opennjord/*`;
  `.agents/skills` (onde o Codex de fato descobre skills — não `.codex/skills`)
  também symlinka pra `.opennjord/skills`. `.codex/` fica mínimo: só
  `config.toml` (se existir) + um README-ponte.
- `AGENTS.md` (raiz) é o arquivo REAL — índice mestre, lido nativamente pelo
  Codex e por 30+ ferramentas do padrão `agents.md`. `CLAUDE.md` (raiz) é
  **symlink → `AGENTS.md`** (padrão oficialmente suportado pelo Claude Code).
- Não crie cópias divergentes de `SKILL.md` nem `.claude/CLAUDE.md` (não deve
  existir — só `AGENTS.md`/`CLAUDE.md` na raiz); se precisar ajustar algo,
  ajuste a fonte em `.opennjord/**` e deixe os symlinks refletirem.
- Arquivos TOML não são necessários para skills Codex neste formato. Use
  `SKILL.md` com frontmatter YAML e, quando existir, `agents/openai.yaml`.
- **`.opennjord/agents/` é compartilhado com o runtime do orchestrator njord**
  (dual-write FS+DB de agentes por-projeto): o scaffold só instala os
  templates `.tpl` (inertes) + `README.md`; agentes reais `.md` — instanciados
  à mão ou gravados pelo njord — convivem no mesmo diretório sem conflito
  (extensões diferentes, descoberta ignora `.tpl`).

## Ecossistema — `scaffold-spec` é o hub

Esta skill **monta a base e relaciona todas as outras** para construir um projeto
inteiro e bem estruturado. Cada disciplina da esteira tem sua skill; o `scaffold`
as **instala** e o `RUNBOOK` as **invoca na ordem**:

```
/scaffold-spec [criar|refatorar|documentar]   ← monta .spec/ + rules + commands + skills + tools + hooks
        │
        ▼   a esteira, dirigida pelas skills (gates bloqueantes):
00  /discovery [negocio|dev|refatoracao]   → contexto (seletor de modos: skills/discovery/SKILL.md)
10  /arquitetura design                    → gate: a abordagem é sã?
20  /desenvolvimento                       → implementa (testes junto)
25  /review-codigo-subagents               → executa review técnico por lanes/subagents
10  /arquitetura review                    → gate: julga diff + achados da 25; 0 violação de camada
30  /qa-rpa  →  /qa                         → RPA front+back de cada tela → gate ratifica a matriz
40  /redteam  →  /seguranca                → pentest do próprio local/dev → gate confere cobertura
    /deploy                                → build → registry → apply → smoke
    .opennjord/tools/spec-check.sh          → valida a entrega (estrutura + links)
```

| Skill | Papel | Etapa |
|---|---|---|
| **scaffold-spec** | monta a base + orquestra (o **hub**) | — |
| `discovery` | levanta o contexto (3 modos — seletor em [`discovery/SKILL.md`](../discovery/SKILL.md)) | 00 |
| `arquitetura` | gate de **design** (antes) e **review** (depois do dev) | 10 |
| `desenvolvimento` | implementa conforme spec + plano | 20 |
| `review-codigo-subagents` | sprint de review de código por subagents independentes | 25 |
| `qa` / `qa-rpa` | gate de QA / **RPA front+back** automatizado de cada tela | 30 |
| `seguranca` / `redteam` | gate de segurança / **pentest** do próprio local-dev | 40 |
| `deploy` | sobe o projeto (build → apply → smoke) | transversal |

> **Esteira de qualidade (transversal):** além da esteira de *processo* acima, o
> scaffold instala uma esteira de *qualidade de código* em `.opennjord/esteira/`
> (gates bloqueantes `Q00-check → Q10-refactor → Q20-test/cov/mutation → Q30-review`),
> com presets de stack em `.opennjord/stacks/` e templates de orquestração multi-agente
> em `.opennjord/agents/`. Roda autônoma sobre um diff/branch ou wired após
> `/desenvolvimento`, alimentando `/arquitetura review` e `/review-codigo-subagents`.
> Valide com `bash .opennjord/tools/esteira-check.sh`.

> **Relação bidirecional:** o `scaffold` instala e referencia todas; cada skill de
> etapa aponta de volta pra sua disciplina em `.spec/sprints/` e pras regras do projeto.
> Resultado: o projeto fica **íntegro da base à entrega validada**. O `RUNBOOK.md`
> gerado deve **invocar a skill de cada etapa** na ordem (ver blueprint no Passo 1).

## Fases do pipeline (LionClaw) → disciplinas da esteira

O orquestrador roda o pipeline com as **14 fases** do LionClaw, agrupadas em
**5 macro-stages**. A esteira `.spec/` é o **mesmo modelo em arquivos**: cada
macro-stage cai numa disciplina, e o **Execution é o que materializa as sprints de dev**.
Ao scaffoldar (modo `criar`/`refatorar`), o `.spec/sprints/` e o `RUNBOOK` devem refletir
esta expansão — não só as disciplinas nuas.

| Macro-stage LionClaw | Fases | Disciplina `.spec/` | Materializa |
|---|---|---|---|
| **1 Discovery** | Discovery | `00-discovery` | contexto (Mom Test / JTBD / 4 riscos) |
| **2 PRD** | PRD Generator → Validator → Completo | `00-discovery` (negócio) | PRD aprovado (gate no Validator) |
| **3 Tech** | Database, Backend, Frontend, Security (4 entrevistas de design) | `10-arquitetura` (design) | decisões técnicas por área (gate) |
| **4 Spec** | Spec Generation → Spec Enricher | `10-arquitetura` (saída) | a **SPEC-implementável** (gate no Enricher) |
| **5 Execution** | **Planner → Sprint Validator → Coder → Evaluator** | `20-desenvolvimento` → `25-review` | **as sprints** — Planner quebra em `NN`, Coder implementa e o **25 (review-codigo)** revisa cada uma antes de `30-qa`+`40-seg` |

> O **Spec Enricher** tem procedimento explícito na Fase 4 de
> `arquitetura/SKILL.md` e materializa `templates/arquitetura-de-sprint.md`: é a
> checagem objetiva de **SPEC-implementável** que destrava o Dev (20), sem criar
> outro nó entre `00s` e `10a`.

> **Chave do vínculo:** o **Planner** (Execution) transforma a SPEC nas **sprints de
> `20-desenvolvimento`** (`.spec/sprints/sprint-NN-<tema>/`, um `NN` por sprint); o **Sprint
> Validator** é o gate do plano; o loop **Coder/Evaluator** implementa e avalia cada sprint,
> que então passa pelo `25-review` (executor) + `10b` (gate) e fecha com `30-qa` +
> `40-seguranca`. É assim que "discovery + development viram
> as sprints de desenvolvimento" — o pipeline do orquestrador e o `.spec/` são um modelo só.
> Fases `conversation` (PRD Validator, as 4 Tech, Spec Enricher, Sprint Validator) são
> **gates bloqueantes** (`GateMode::Gated`); `auto` fluem sozinhas.

## Modo N/D/R → esteira derivada (+ foco opcional)

O **modo de discovery** (`negocio`/`dev`/`refatoracao`) não é só o que investigar —
ele **deriva a esteira de pipeline** que o orquestrador monta. Um **foco opcional**
(Segurança / Arquitetura / UI-Design) **injeta fases** numa esteira mais específica,
sem virar um "tipo" à parte. É assim que as pipelines especializadas (auditoria,
review de arquitetura) ficam alcançáveis a partir do modo, **sem uma tela de "tipo"**.

| Modo | Foco | Esteira derivada | Fases | Racional |
|---|---|---|---|---|
| **Negócio** | — | **feature-first** | 14 (feature + cauda) | entregar valor a repo existente; discovery§negócio ≈ Feature Discovery |
| **Desenvolvimento** | — | **development** (base) | 14 | greenfield / build do zero (base canônica) |
| **Desenvolvimento** | **UI/Design** | **development + Open Design** | 17 | bloco de design (Design Plan → Studio → Lock) |
| **Refatoração** | — | **arch-review** | 11 | operar sobre código existente ≈ discovery§refatoração aprofundado |
| **Refatoração** / **Negócio** | **Segurança** | **security-audit** | 11 | auditoria estática repo-wide → spec de remediação |
| **Refatoração** / **Negócio** | **Arquitetura** | **arch-review** | 11 | review de arquitetura como foco transversal |

- **Precedência:** o foco, quando setado, **especializa** a base do modo.
- **Guarda por modo:** `UI/Design` só sob **Desenvolvimento**; `Segurança`/`Arquitetura`
  só sob **Refatoração** ou **Negócio-se-repo-existente** — o wizard **não** oferece
  combinações sem sentido (ex.: greenfield + Segurança).
- O modo escolhido **semeia** os discovery-modes (`[modo]` + refino opcional); modo =
  discovery-mode = **seletor de esteira** (mesmo vocabulário nativo N/D/R).

### Focos injetam fases, não são um "tipo"

Um **foco** especializa a esteira acrescentando/trocando fases da cabeça; ele **não**
é uma disciplina nova nem uma skill nova. Em particular, o **foco Segurança** é
distinto das duas skills de segurança da disciplina 40:

> **Fonte única da taxonomia dos 3 atores de segurança:**
> `review-codigo-subagents/SKILL.md` (Fronteira / Foco Segurança). A tabela
> abaixo é o eco local, não a definição.

| Ator | O que é | Quando | Disciplina |
|---|---|---|---|
| **foco Segurança** (esteira) | análise **estática** repo-wide → gera tasks de remediação (spec) | design-time, ao derivar a esteira | 25 (lane Segurança em escopo de repo) |
| `/redteam` | exploração **dinâmica** do ambiente vivo (PoC de invasão) | pós-dev, ambiente local/dev | 40 |
| `/seguranca` | **gate** que confere cobertura/severidade contra os invariantes | último portão antes do release | 40 |

O "Security Audit" da esteira **reusa** a lane Segurança da disciplina 25 (ampliando o
escopo de *diff* para *repo*), **não** cria um 4º conceito. Idem foco Arquitetura: é a
esteira `arch-review`, que **reusa** o gate `/arquitetura` — não uma skill à parte.

## Entrada — MODO

> **Dois eixos ORTOGONAIS** (não confundir) — **fonte única:**
> `rules/fluxo-desenvolvimento.md` ("Os 2 eixos"). Resumo: o **scaffold-mode**
> abaixo (`criar`/`refatorar`/`documentar`) diz **como executar** cada sprint; o
> **modo N/D/R** (`negocio`/`dev`/`refatoracao`, seção anterior) diz **o que
> investigar / qual esteira derivar**. `refatorar` aparece nos dois eixos com
> sentidos diferentes.

A skill aceita um modo em ARGUMENTS (default: perguntar):

| Modo | Quando | Ênfase da esteira |
|---|---|---|
| **criar** | sistema novo (greenfield) | Discovery (escopo) → Arquitetura (design do zero) → Dev → QA → Segurança |
| **refatorar** | sistema existente | Discovery = inventário do estado atual + metas + critérios de **não-regressão**; Arquitetura = atual×alvo; Dev incremental; QA pesado em regressão; Segurança = re-auditoria |
| **documentar** | sistema existente sem docs | subfluxo interno `D00–D50`: evidência → modelagem → validação → preview → entrega → drift; "Dev" vira **escrever docs**; produz `reference/` + mapa de arquitetura |

Se o usuário não passou o modo, **pergunte qual** antes de gerar (muda os
critérios de aceitação e a ênfase).

## Edição DeepSeek Harness — o que muda neste ambiente

Quando esta skill roda dentro do DeepSeek Harness (aba **Esteira**, botão
"Instalar Esteira neste projeto", ou `/scaffold-spec` no chat), a instalação
do método já vive no harness: skills, rules, commands, agents e tools são
servidos pelo pacote `@deepseek-ai/dsh-skill-opennjord` para todo projeto.
Portanto, neste ambiente:

- **Crie no projeto somente** o `.spec/` (Passo 1) e `docs/adrs/` (ADRs numerados
  `NNNN-<tema>.md`; se `docs/adr/` ou `docs/adrs/` já existir, reuse).
- **Não crie** `.opennjord/`, `.claude/`, `.codex/`, `.agents/`, symlinks,
  `settings.json` de hooks nem `CLAUDE.md` roteador — os Passos 2 e 3 abaixo
  **não se aplicam**. Se o projeto já tiver essas pastas de uma instalação
  antiga, deixe-as como estão e não as referencie no `MANIFEST.md`.
- O `MANIFEST.md` aponta as disciplinas para os comandos `/discovery`,
  `/arquitetura`, `/desenvolvimento`, `/review-codigo-subagents`, `/qa`,
  `/qa-rpa`, `/seguranca`, `/redteam` e `/deploy`, sem caminho de skill local.
- Decisões de arquitetura (ADRs) ficam em `docs/adrs/`; `.spec/arquitetura/`
  guarda os reviews e gates de cada sprint e referencia o ADR por número.

## Passo 1 — Gerar o esqueleto `.spec/`

Crie esta árvore na raiz do projeto-alvo (não sobrescreva o que já existir sem
confirmar). É a estrutura **flat validada em produção** — pastas de topo por
DISCIPLINA (documentos avulsos, nomeados por tema, não aninhados por `NN`
compartilhado) + `sprints/` reservado especificamente para os incrementos de
**desenvolvimento**:

```
.spec/
├── MANIFEST.md              # mapa read-first (índice de tudo)
├── STATE.md                 # diário narrativo humano (espelho, append)
├── esteira-state.yaml       # cursor machine-readable do tick (/loop) — FONTE de decisão
├── discovery/               # discovery por tema — um .md por assunto/rodada (+ plano-de-sprints-NN.md)
│   └── <tema-ou-sprint-NN>.md
├── arquitetura/             # decisões/ADRs/reviews de arquitetura
│   └── <tema-ou-sprint-NN>.md
├── plano/                   # planos técnicos avulsos (quando não cabem em discovery/arquitetura)
│   └── <tema>.md
├── qa/
│   └── sprint-NN-<tema>/    # evidências de QA/RPA por sprint
├── reference/               # docs, ADRs e diagramas versionados
│   ├── README.md
│   ├── memory/                # criado somente por POCs aprovadas; não é lido pelo tick
│   └── diagrams/<tipo>-NN-<tema>/
└── sprints/
    ├── README.md            # framework das 6 disciplinas + fluxo da esteira
    ├── RUNBOOK.md           # como rodar a esteira (ordem + gates bloqueantes)
    └── sprint-NN-<tema>/    # 1 dir por sprint/incremento de desenvolvimento
        ├── README.md                # README-do-sprint: objetivo, escopo, progresso
        ├── discovery-sprint.md      # discovery-de-sprint (00s) — entrada do 10a
        └── tasks/task-NN-<slug>.md  # tasks materializadas pelo Planner
```

> A instância `sprint-NN-<tema>/` é **criada por sprint via RUNBOOK, não pelo
> scaffold**; layouts legados (tasks na raiz do dir, sem `discovery-sprint.md`)
> permanecem válidos pra histórico — ver a convenção canônico × legado em
> `rules/fluxo-desenvolvimento.md`.

> `discovery/`, `arquitetura/`, `plano/`, `qa/` e as instâncias `sprint-NN-*`
> são **populados incrementalmente** pela esteira — o scaffold cria a base
> (MANIFEST, STATE, RUNBOOK, reference, READMEs), não instâncias vazias nem
> `_TEMPLATE-*.md` por disciplina (os moldes vivem nas skills de etapa).

### Conteúdo de cada arquivo (blueprint)

**`MANIFEST.md`** — ponto de entrada único. Seções: *Bootstrap de sessão* (ordem
de leitura: MANIFEST → `esteira-state.yaml` (cursor) → STATE → RUNBOOK → sprint
ativa); *Regra-mãe* (1 parágrafo — o que governa o escopo, preencher com o
contrato/escopo do projeto); *Mapa do `.spec/`* (tabela caminho→papel, cobrindo
`esteira-state.yaml` e cada pasta de disciplina — `discovery/`, `arquitetura/`,
`plano/`, `qa/`, `sprints/`, `reference/`); *Regras de execução* (tabela apontando
`.opennjord/rules/*` — mesma fonte pra Claude Code e Codex, via
`.claude/rules`/`AGENTS.md`); *Maquinário de validação* (comandos de
teste/build/lint do projeto, + **`dev_server`** — comando/URL que sobe o ambiente
vivo pro `/qa-rpa` —, **`redteam_target`** — alvo do `/redteam`, restrito a
localhost/127.0.0.1/rede privada — e a **linha do `deploy`**, abaixo).
**Materializado** de `scaffold-spec/templates/spec/MANIFEST.md` (copie e preencha
os `<...>`).

> **Contrato de runtime — a linha do `deploy` é literal.** O runtime da esteira
> procura no `.spec/MANIFEST.md` a string exata
> ``- **`deploy`:** **skip**`` (comparação por `contains`, não por parse de
> Markdown). Com ela, a etapa `deploy` transiciona direto para `done` — sem a
> parada humana H6; sem ela, o tick tenta **executar** o deploy. E o próprio
> `.spec/MANIFEST.md` é **pré-requisito de preflight**: sem o arquivo, o pipeline
> canônico recusa disparar. Logo: não reescreva a linha (nem troque crases,
> asteriscos ou ordem) — o texto ao redor pode mudar, a string não. O template já
> vem com ela e com o comentário do porquê.

**`STATE.md`** — **diário narrativo humano** (append, espelho), **materializado**
de `scaffold-spec/templates/spec/STATE.md`. Campos:
incremento ativo (NN, tema, branch, etapa atual — narrada como prosa encadeada
pelos códigos da disciplina, ex.: `✅ 00 Discovery → ✅ 10 Arq(design) → 🟡 20
Dev → ⬜ 25 Review → ⬜ 10 Arq(review) → ⬜ 30 QA → ⬜ 40 Segurança`, atualizado
em); último resultado de validação; pendências e aguardando aprovação; histórico
de incrementos (mais recente primeiro). A prosa é **espelho**: a **fonte de
decisão do tick é o cursor `esteira-state.yaml`** — toda DoD "atualize o STATE"
vira **"upsert no yaml + 1 linha no STATE.md"**. **SEM coluna/casa pro `00s`**
(não é gate — avança por existência do `discovery-sprint.md`).

**`esteira-state.yaml`** — **cursor machine-readable**, fonte ÚNICA de decisão do
tick (o `/loop` lê/escreve por lookup, nunca por parse de prosa). Formato canônico:
**`schema: 2`**. Copie o template `scaffold-spec/templates/esteira-state.yaml` — que
é a **documentação viva do formato**, já em schema 2 — e preencha
`plano`/`atualizado`. (Quando o repo é instalado **pelo njord**, o cursor é *gerado
em código* na instalação, também em schema 2 e com `run_id` único; o gerador só
escreve se o arquivo **não existir** — reinstalar nunca zera um cursor com
progresso.)

Campos, na ordem em que o runtime regrava o arquivo: `schema`, `plano`,
`sprint_ativa`, `etapa`, `tentativa`, `awaiting` (`humano:<gate>` /
`ambiente:<etapa>`), `veredito` (`PASS|FAIL|null`), `atualizado`, `run_id`,
`revision`, `backlog`, `tasks`, `retry_stack`, `execution`, `last_receipt`.
As chaves opcionais (`sprint_ativa`, `awaiting`, `veredito`, `execution`,
`last_receipt`) precisam **existir com `null`** — chave ausente falha o parse.

**Etapas válidas** (vocabulário do runtime atual): `00-discovery`, `plano`, `00s`,
`10a`, `20`, `25`, `10b`, `30-qa-rpa`, `30-qa`, `40-redteam`, `40-seguranca`,
`deploy` — mais o terminal `done`. O vocabulário antigo (`20-dev`, `25-review`,
`40-seg`) **não é aceito**: o cursor é recusado no parse. Marcas `✅`/`Status:` em
plano/task são espelhos write-only; reconciliação plano→yaml **só no bootstrap**
(yaml ausente).

**`sprints/README.md`** — as 6 disciplinas (00 Discovery, 10 Arquitetura [gate
transversal], 20 Desenvolvimento, 25 Review de Código, 30 QA, 40 Segurança), o
fluxo da esteira
(`00 → 10-design → 20 → 25-review-codigo → 10-review → 30 → 40 → release`,
Arquitetura roda 2× como gate bloqueante), os handoffs (contrato entre
disciplinas) e a convenção de nomes: docs de disciplina avulsos por tema nas
pastas de topo; **instância de sprint** em
`sprints/sprint-NN-<tema>/{README.md, discovery-sprint.md, tasks/task-NN-<slug>.md}`,
com o **mesmo `NN` em toda a esteira** do incremento. O
**Discovery** (00) fecha com fan-in: emite `.spec/discovery/plano-de-sprints-NN.md`
(1 linha por sprint derivado — scaffold-mode + ACs + discoveries-fonte + ordem),
o backlog fatiado que o RUNBOOK consome a seguir.

**`reference/README.md`** — **materializado** de
`scaffold-spec/templates/reference/README.md`. É o índice de docs, ADRs e
`diagrams/<tipo>-NN-<tema>/`. No modo `documentar`, registra as fases internas
`D00–D50`, a evidência de código que sustenta cada diagrama e o fallback manual.
OpenViking opcionalmente recupera contexto histórico; Graphify descobre relações
do código; Archify valida/entrega a representação autorada. Nenhum é gate. A
política `.opennjord/integrations/TOOLS-POLICY.md` define quando os agentes devem
chamar cada ferramenta e qual fallback usar. O kit OpenViking mora em
`.opennjord/integrations/openviking/` e só cria `memory/` quando a POC for
executada explicitamente.

**`sprints/RUNBOOK.md`** — **materializado** do template
`scaffold-spec/templates/sprints/RUNBOOK.md` (copie e ajuste os `<...>`). Traz o
**contrato do tick** (lê o cursor → `awaiting`? para e pinga → executa UMA
etapa/task → traduz veredito p/ `PASS|FAIL` → upsert no yaml + 1 linha no STATE +
marca espelhos), a **ordem canônica por sprint**
(`00s → 10a → 20 → 25 → 10b → 30-qa-rpa → 30-qa → 40-redteam → 40-seguranca →
deploy`), o **dono do `mkdir sprint-NN-<tema>/` (= 00s)**, a
alocação do `NN` (próxima linha SEM `✅` do plano), o fechamento (`| NN ✅ |`), o
contador `tentativa` (2ª reprovação ⇒ `awaiting: humano:<etapa>-2x`) e o protocolo
`awaiting` (paradas H0–H6). Regra dura: **00s avança por EXISTÊNCIA de
`discovery-sprint.md` — nunca dá VERDICT**. Em modo `/loop`, auto-commit **só** em
paths de estado/evidência (`.spec/**`) — nunca código sem gate.

**Documentos de disciplina** (`discovery/`, `arquitetura/`, `plano/`) — um
`.md` avulso por tema ou rodada, sem `_TEMPLATE` fill-in-the-blank nem
subdiretório por disciplina: o nome do arquivo já carrega o tema (ex.:
`discovery-NN-<tema>.md`) ou o `sprint-NN-<tema>` quando amarrado a um
incremento específico. Cada um cobre o que essa disciplina produz
(contexto/riscos para discovery; decisão/ADR/review para arquitetura), usando
os templates das skills de etapa e adaptado ao MODO escolhido (ver tabela de
modos).

**`sprints/sprint-NN-<tema>/README.md`** — Objetivo; Definition of Ready
(entrada); Escopo/Tasks; Definition of Done (saída); Anti-patterns. Um dir por
incremento de desenvolvimento — os demais artefatos da sprint
(`discovery-sprint.md`, `tasks/`, notas) vivem dentro do mesmo dir.

> Use o `.spec/` de referência (um projeto já estruturado) como referência de qualidade do
> conteúdo, **generalizando** o que for específico de domínio (regras fiscais,
> Zitadel, etc.) para placeholders `<...>`.

## Passo 2 — Instalar em `.opennjord/` (canônico) + espelhar `.claude`/`.codex`/`.agents`

A esteira é **dirigida por skills** (uma por etapa) que o `scaffold` orquestra.
Instale TUDO na fonte canônica `.opennjord/` e depois crie os symlinks
por-subdiretório que fazem Claude Code e Codex enxergarem o mesmo conteúdo sem
duplicar. Use sempre `-L` explícito no `cp` (materializa conteúdo real — o
default de `cp -R` diverge entre BSD/macOS e GNU/Linux quando a origem contém
um symlink):

```bash
S=.opennjord/skills/scaffold-spec/templates
mkdir -p .opennjord/{rules,commands,stacks,esteira,tools,skills,agents,hooks,integrations}

# rules de engenharia (3 camadas) + segurança/fluxo
cp -RL $S/rules/eng/. .opennjord/rules/eng/
cp -L $S/rules/seguranca.md $S/rules/fluxo-desenvolvimento.md $S/rules/README.md .opennjord/rules/ 2>/dev/null || true
# runbooks LLM-agnostic (ative o frontmatter comentado p/ Claude Code; cole como prompt em outros LLMs)
cp -RL $S/commands/eng/. .opennjord/commands/
# catálogo de stacks — Camada 2 das rules referencia estes comandos concretos
cp -RL $S/stacks/. .opennjord/stacks/
# esteira de qualidade de código (gates bloqueantes + stages + RUNBOOK)
cp -RL $S/esteira/. .opennjord/esteira/
# políticas/kits opcionais — arquivos estáticos; não instalam/configuram runtime ou MCP
cp -RL $S/integrations/. .opennjord/integrations/
# skills da esteira de processo — copiar do repo-fonte, ou já globais em ~/.claude/skills/
# (exceção: review-codigo-subagents NUNCA é global — a 25 é sempre instância por-projeto;
#  a cópia abaixo é obrigatória pra ela)
cp -RL .opennjord/skills/{discovery,arquitetura,desenvolvimento,qa,qa-rpa,seguranca,redteam,review-codigo-subagents} <dest>/.opennjord/skills/ 2>/dev/null || true
# skill de deploy (copiar a pasta para preservar agents/openai.yaml)
cp -RL $S/skills/deploy .opennjord/skills/
# templates de orquestração multi-agente — instalados como .tpl (INERTES: descoberta
# de agent ignora extensão != .md); README explica quando instanciar sob demanda
cp -RL $S/agents/. .opennjord/agents/
# hooks (template — mesclado em .claude/settings.json no Passo 3, nunca symlink)
cp -L $S/hooks/settings.hooks.json .opennjord/hooks/ 2>/dev/null || true
cp -L $S/hooks/README.md .opennjord/hooks/ 2>/dev/null || true
# guarda de arquivos das runs (recomendado pra rodar a esteira; invocado via python3,
# não precisa de chmod +x)
cp -L $S/hooks/njord-ask-permission .opennjord/hooks/ 2>/dev/null || true
# tools de validação
cp -L $S/tools/spec-check.sh $S/tools/esteira-check.sh .opennjord/tools/ && chmod +x .opennjord/tools/*.sh
# cursor + MANIFEST + STATE + RUNBOOK de PROCESSO materializados no .spec/
# (Passo 1 já criou a árvore; ajuste os <...> depois). O cursor é a fonte de
# decisão do tick /loop, sai em schema 2 e no vocabulário de etapas do runtime
# atual — e NUNCA é sobrescrito: cursor com progresso só muda por decisão
# consciente, não por reinstalar.
[ -e .spec/esteira-state.yaml ] || cp -L $S/esteira-state.yaml .spec/esteira-state.yaml 2>/dev/null || true
# MANIFEST/STATE do .spec/. Atenção: a linha de deploy do MANIFEST é CONTRATO DE
# RUNTIME — o tick a lê literalmente (ver o blueprint do MANIFEST no Passo 1).
[ -e .spec/MANIFEST.md ] || cp -L $S/spec/MANIFEST.md .spec/MANIFEST.md 2>/dev/null || true
[ -e .spec/STATE.md ] || cp -L $S/spec/STATE.md .spec/STATE.md 2>/dev/null || true
cp -L $S/sprints/RUNBOOK.md .spec/sprints/RUNBOOK.md 2>/dev/null || true
[ -e .spec/reference/README.md ] || cp -L $S/reference/README.md .spec/reference/README.md 2>/dev/null || true
# integrations não recebem symlink e nunca criam store/.mcp.json/hooks automaticamente

# ponte .claude/ (diretório REAL contendo symlinks relativos por-subdiretório)
mkdir -p .claude
for d in rules skills commands agents; do
  [ -e ".claude/$d" ] || ln -s "../.opennjord/$d" ".claude/$d"
done
# settings.json/settings.local.json NUNCA symlink — reais, ver Passo 3/hooks
[ -f .claude/settings.local.json ] || : > .claude/settings.local.json
grep -qxF '.claude/settings.local.json' .gitignore 2>/dev/null || echo '.claude/settings.local.json' >> .gitignore

# ponte .agents/ — é AQUI que o Codex de fato descobre skills (não .codex/skills)
mkdir -p .agents
[ -e .agents/skills ] || ln -s ../.opennjord/skills .agents/skills

# ponte .codex/ — mínima: o Codex só lê config.toml (opcional) daqui
mkdir -p .codex
cp -L $S/router/codex-README.md .codex/README.md
```

- **`rules/eng/`** — 11 regras de engenharia em **3 camadas** (princípio universal
  + preset por stack + exemplo) + `seguranca.md` + `fluxo-desenvolvimento.md`.
  Preencha placeholders `<preencher: ...>` conforme o projeto.
- **`stacks/`** — catálogo de presets (backend/frontend/mobile/RPA); a Camada 2
  das rules referencia estes comandos concretos.
- **`esteira/`** — esteira de qualidade de código (gates bloqueantes
  `Q00-check → Q10-refactor → Q20-test/cov/mutation → Q30-review` + `RUNBOOK`).
- **`commands/eng/`** — runbooks LLM-agnostic (`check-rules`, `refactor`,
  `responsive-pass`, `dead-code-cleansing`). Para Claude Code, ative o frontmatter
  comentado no topo de cada um; em outros LLMs, cole o corpo como prompt.
- **`agents/`** — templates de orquestração multi-agente (`main-orchestrator`,
  `sub-orchestrator`, `worker-{build,test,validate}`), instalados como `.tpl`
  (**inertes** — descoberta de agent só lê `.md`). **Não auto-instanciados** —
  instancie sob demanda substituindo `{{...}}` (ver `agents/README.md`). Este é
  o MESMO diretório onde o orchestrator do njord grava agentes de projeto reais
  (`.md`) quando o repo é gerenciado por ele — os dois convivem sem conflito.
- **`spec/`** — templates dos 2 arquivos de topo do `.spec/`: `MANIFEST.md` (já
  com a linha literal do `deploy` que o runtime lê — ver Passo 1) e `STATE.md`.
  Copiados **só se não existirem** no alvo.
- **`deploy/SKILL.md`** — runbook de deploy (build→registry→apply→smoke).
- **`tools/spec-check.sh`** + **`tools/esteira-check.sh`** — validam a entrega
  (`.spec/` + a ponte `.opennjord`/`.claude`/`.codex`/`.agents`) e a engenharia
  (agnosticidade LLM + estrutura + smoke install).
- **hooks** (`hooks/settings.hooks.json`) — `njord-ask-permission` (PreToolUse)
  é a guarda de arquivos das runs da esteira: nega paths sensíveis (SSH/AWS/
  keychain/`secrets.yaml`) e segura escrita fora do workspace (worktree); os
  demais rodam o `spec-check` automaticamente (Stop / PostToolUse). Comandos
  referenciam `${CLAUDE_PROJECT_DIR}/.opennjord/{hooks,tools}/...` (NÃO
  symlinkado — hooks apontam direto pro canônico). **Opt-in:** mesclar no
  `.claude/settings.json` (não auto-aplicar). No Codex, use validação manual
  ou mecanismo equivalente.

**Skills de etapa — a esteira chama em ordem:**
| Etapa | Skill |
|---|---|
| 00 Discovery | `/discovery [negocio\|dev\|refatoracao]` — 3 modos, seletor + mapa default×scaffold-mode em [`discovery/SKILL.md`](../discovery/SKILL.md) (não repetido aqui) |
| 10 Arquitetura | `/arquitetura [design\|review]` — gate 2× |
| 20 Desenvolvimento | `/desenvolvimento` |
| 25 Review de Código | `/review-codigo-subagents` — pipeline read-only por lanes/subagents |
| 30 QA | `/qa` (gate) + `/qa-rpa` (automação RPA front+back de cada tela) |
| 40 Segurança | `/seguranca` (gate) + `/redteam` (pentest autorizado do próprio local/dev) |

> Se as skills de etapa já estiverem **globais** (`~/.claude/skills/` ou
> `~/.codex/skills/`), não precisa copiar — só garanta que existem. O `RUNBOOK.md`
> invoca cada uma na etapa certa. **Exceção: `review-codigo-subagents` (25)
> nunca fica global** — instale-a sempre como instância do projeto em
> `.opennjord/skills/` (a cópia do Passo 2 acima já cobre isso).

## Passo 3 — Cabear o roteador do agente

**Não reescreva o roteador à mão.** Copie o template canônico (agora o
**índice mestre**, `AGENTS.md`) e preencha os `<...>`:

```bash
cp .opennjord/skills/scaffold-spec/templates/router/AGENTS.md.tpl AGENTS.md
# preencher <projeto>, <regra-mãe> etc. em AGENTS.md
ln -sf AGENTS.md CLAUDE.md
```

`AGENTS.md` **é o arquivo real** — fica na raiz porque é a única forma
garantida do Codex e das 30+ ferramentas do padrão `agents.md` o lerem.
`CLAUDE.md` (raiz) é **symlink pra `AGENTS.md`** — padrão oficialmente
suportado pelo Claude Code (`ln -s AGENTS.md CLAUDE.md`), zero drift entre os
dois. **Não crie `.claude/CLAUDE.md`** — o Claude Code aceita tanto
`./CLAUDE.md` quanto `./.claude/CLAUDE.md`; ter os dois é fonte de drift.

O template já traz, prontos e sem precisar redigitar: regra-mãe, bootstrap
(`MANIFEST.md` → `STATE.md` → `RUNBOOK.md`), a esteira 00→40 e o mapa da
config `.opennjord/`. Não adicione conteúdo operacional aqui — se precisou
detalhar, o lugar é o `.spec/` ou uma `rule`.

## Passo 4 — Fechar

- **Validar a entrega:** `bash .opennjord/tools/spec-check.sh` — deve dar OK (0
  link quebrado, arquivos obrigatórios presentes, symlinks íntegros). Corrija o
  que apontar.
- **Validar a engenharia:** `bash .opennjord/tools/esteira-check.sh` — valida
  agnosticidade LLM, resíduo de stack específica, estrutura (≤300 linhas) e
  smoke install dos templates de engenharia.
- Liste o que foi criado e o que tem placeholder `<...>` a preencher.
- Atualize `STATE.md` com o 1º incremento (ou deixe "nenhum ativo").
- Registre o que **não** rodou e por quê.
- **Não** commitar automaticamente — deixar para o usuário revisar.

## Anti-patterns

- ❌ Sobrescrever um `.spec/`/roteador existente sem confirmar.
- ❌ Gerar a esteira sem definir o MODO (criar/refatorar/documentar muda tudo).
- ❌ Copiar conteúdo específico de domínio de outro projeto
  para o projeto atual — generalize.
- ❌ Deixar o roteador gordo — ele só aponta; o manual vive no `.spec/`.
