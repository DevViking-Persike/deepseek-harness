# Regras de Fluxo de Desenvolvimento

> Como o trabalho atravessa a esteira de `.spec/sprints/` (Discovery → Arquitetura
> → Dev → Review de Código → QA → Segurança). Há **2 eixos ortogonais** — ver
> seção "Os 2 eixos" abaixo. Este arquivo detalha o eixo **scaffold-mode**
> (CRIAR/REFATORAR/DOCUMENTAR); o eixo **discovery-mode**
> (negocio/dev/refatoracao) é definido e detalhado na skill `discovery`
> (`skills/discovery/SKILL.md`, seção "Seletor de modos") — não repetido aqui.

## Os 2 eixos

O trabalho é governado por **dois eixos independentes**, escolhidos em
momentos diferentes:

| Eixo | Valores | Responde | Onde se escolhe |
|---|---|---|---|
| **scaffold-mode** | `criar` / `refatorar` / `documentar` | **como executar** cada sprint (ênfase de cada disciplina 00→40, ver tabelas abaixo) | `/scaffold-spec [criar\|refatorar\|documentar]` |
| **discovery-mode** | `negocio` / `dev` / `refatoracao` | **o que investigar** antes de executar (banco de perguntas da Discovery) | seletor de `/discovery`, com default por scaffold-mode |

Os eixos são **ortogonais**: combinações não-contíguas (ex.: scaffold-mode
`criar` com discovery-mode `{negocio, refatoracao}`) são permitidas — o
scaffold-mode não restringe quais discovery-modes podem rodar, só sugere o
default. A ordem canônica dos discovery-modes (negocio→dev→refatoracao) fixa
apenas a **sequência de execução** quando mais de um é selecionado.

## Regra de fan-in: 1 rodada de Discovery → N sprints

Uma rodada de Discovery (os discovery-modes selecionados, rodados em ordem
canônica) fecha com **um único artefato de consolidação**:
`.spec/discovery/plano-de-sprints-NN.md` — 1 linha por sprint derivado
(scaffold-mode do sprint + ACs + discoveries-fonte + ordem/dependências).

A partir daí, **cada sprint do plano é uma esteira própria**: não repete a
Discovery de rodada, mas **abre com um discovery-de-sprint escopado**
(`/discovery sprint <NN>` → `.spec/sprints/sprint-NN-<tema>/discovery-sprint.md`),
que aterra a linha do plano no código real e propõe as tasks; ele é a
**entrada do design gate (10a)** — sub-etapa da disciplina 00 (etiqueta `00s`),
não uma disciplina nova nem um gate próprio. O restante da esteira reaproveita
os artefatos da rodada compartilhada:

```
1 Discovery (negocio/dev/refatoracao) → plano-de-sprints-NN.md
        │
        ├─ sprint 1 → 00s discovery-de-sprint → 10 Arquitetura → 20 Dev → 25 → 10 Arq(review) → 30 → 40
        ├─ sprint 2 → 00s discovery-de-sprint → 10 Arquitetura → 20 Dev → 25 → 10 Arq(review) → 30 → 40
        └─ sprint N → 00s discovery-de-sprint → 10 Arquitetura → 20 Dev → 25 → 10 Arq(review) → 30 → 40
```

O **gate de saída da Discovery** é o "Plano de Sprints aprovado pelo usuário"
— bloqueante: só com o backlog fatiado (cada item com ACs verificáveis +
scaffold-mode definido) abre a 1ª Arquitetura.

## A esteira de um sprint (comum aos 3 scaffold-modes)

```
00 DISCOVERY (rodada) → [por sprint: 00s → 10 ARQ(design) → 20 DEV → 25 REVIEW → 10 ARQ(review) → 30 QA → 40 SEG] → release
```

- **Arquitetura é gate transversal** (roda 2×: valida o plano antes do dev e
  revisa o que o dev entregou). Cada gate é **bloqueante**: reprovou, volta uma casa.
- **`00s` (discovery-de-sprint) não é gate**: é a entrada do 10a — o 10a é quem
  reprova se o contexto não estiver aterrado ou task proposta ficar sem AC
  verificável. Fronteira: 00s = o QUÊ; camadas/contratos/ADR = 10a.
- **Mesmo `NN`** em todas as disciplinas de um incremento (rastreia ponta a ponta).
- Estado vivo em `.spec/STATE.md`; como rodar em `.spec/sprints/RUNBOOK.md`.
- **Discovery e Arquitetura expandem nas fases LionClaw** (PRD, Tech, Spec); o **DEV
  é o Execution**: o **Planner** materializa as tasks em
  `.spec/sprints/sprint-NN-<tema>/tasks/task-NN-<slug>.md` (template
  `desenvolvimento/templates/task.md`) **direto da tabela do discovery-de-sprint**
  (sem re-transcrição, enriquecendo com as decisões do 10a), o **Sprint
  Validator** é o gate do plano, e o loop **Coder/Evaluator** implementa e
  avalia cada task. Ver a tabela de mapeamento em `scaffold-spec/SKILL.md`.

### Convenção de artefatos por sprint (canônico × legado)

1. **Canônico:** `sprint-NN-<tema>/{README.md, discovery-sprint.md,
   tasks/task-NN-<slug>.md}`.
2. **Fallback de leitura (vale pra TODAS as skills da esteira):** discovery do
   sprint = `<sprint>/discovery-sprint.md` quando existir, senão os artefatos
   globais de `.spec/discovery/`; tasks = `<sprint>/tasks/` quando existir,
   senão `task-*.md` na raiz do dir do sprint (legado).
3. **Sprints históricas não migram** — o layout legado permanece válido pra
   histórico; só sprints novas seguem o canônico.

---

## scaffold-mode CRIAR (sistema novo / greenfield)

Construir algo que não existe.

| Etapa | Ênfase |
|---|---|
| Discovery | escopo contra o contrato/objetivo; critérios de aceitação verificáveis; o que é **baseline** vs **aditivo** |
| Arquitetura (design) | desenho do zero: camadas, contratos, stack, ADR das decisões estruturais |
| Dev | implementar por camada + testes junto; build/lint verdes |
| Arquitetura (review) | o entregue bate com o design/ADR? 0 violação de camada |
| Review de Código | subagents auditam diff, regras locais, testes, segurança básica, operabilidade e lacunas antes do QA |
| QA | cobre cada critério de aceitação + caminho de erro |
| Segurança | invadir pelo navegador o que subiu (token, authz, audit, CSP) |

**DoD do incremento:** funciona, testado, sem violação de camada, review de
código sem `FAIL`, sem achado crítico de segurança.

---

## scaffold-mode REFATORAR (sistema existente)

Mudar a estrutura interna **sem mudar o comportamento observável**.

| Etapa | Ênfase |
|---|---|
| Discovery | **inventário do estado atual** (medido, não suposto); metas do refactor; **critérios de não-regressão** (o que NÃO pode mudar) |
| Arquitetura (design) | **atual × alvo**: o que muda, o que se preserva; plano incremental (Strangler Fig se grande); ADR se decisão estrutural |
| Dev | mudanças **pequenas e reversíveis**; testes de caracterização cobrindo o comportamento antes de mexer |
| Arquitetura (review) | a refatoração atingiu a meta sem violar camada nem vazar comportamento? |
| Review de Código | subagents focam regressão, acoplamento novo, dívida criada e candidatos a código morto/deps |
| QA | **regressão pesada**: a suíte/RPA prova que o comportamento observável é idêntico |
| Segurança | re-auditoria das superfícies tocadas |

**DoD do incremento:** meta de refactor atingida, **0 regressão** comprovada,
reversível.

> ❌ Anti-pattern: refatorar e adicionar feature no mesmo incremento — separar.

---

## scaffold-mode DOCUMENTAR (sistema existente sem/com pouca doc)

Tornar o sistema entendível e operável, sem mudar código. O trabalho documental
usa as fases internas `D00–D50` abaixo. Elas **não** são etapas do cursor, não
entram no DAG global e não criam uma quinta etapa na esteira Q.

| Fase documental | Disciplina | Ênfase |
|---|---|---|
| **D00 — inventário e evidências** | Discovery/00s | recuperar contexto histórico com OpenViking opcional; engenharia reversa de módulos, fluxos, integrações e infra reais; evidência `path:linha`; Graphify opcional para `query`/`path`/`explain` |
| **D10 — modelagem do diagrama** | Arquitetura (design/10a) | mapa vigente em `architecture`, `workflow`, `sequence`, `dataflow` ou `lifecycle`; Archify `guide` opcional; JSON sempre revisado contra as evidências |
| **D20 — validação estrutural** | Dev documental/20 | validar o JSON autorado com `archify validate --quality showcase --json`, ou revisar schema/consistência manualmente |
| **D30 — preview e revisão visual** | Dev documental/20 | conferir legibilidade, relações e rótulos com `archify preview`, ou Mermaid/ASCII; preview não é entrega |
| **D40 — entrega versionada** | Dev documental/20 | gerar docs, READMEs e runbooks; `archify deliver` opcional materializa HTML autossuficiente + receipt em `.spec/reference/` |
| **D50 — fidelidade, delta e drift** | Review 25 → Arquitetura 10b → QA 30 | comparar doc com código, validar comandos/links/renderização e usar `archify compare` opcionalmente quando houver base/head |
| — | Segurança/40 | documentar invariantes de segurança + uma passada `/security-review` |

**Fronteira OpenViking × Graphify × Archify:** OpenViking recupera contexto
histórico candidato; Graphify extrai relações do código real para o D00. Archify
recebe JSON/texto autorado no D10–D50 e **não analisa o repo**. Nenhum substitui
evidência `path:linha`, review 10b ou QA.

**Fallback obrigatório:** sem OpenViking, use busca/leitura direta, Graphify ou
subagents read-only. Sem Node ≥18, skill Archify ou `archify doctor` verde,
escreva a fonte e o diagrama manualmente (Markdown + Mermaid/ASCII), revise o
diff entre versões e execute os mesmos gates. Ausência das ferramentas nunca
reprova por si só.

**DoD do incremento:** doc fiel ao código atual, sem referência quebrada/stale,
verificável; diagramas indexados em `.spec/reference/README.md`; o roteador do
agente (`CLAUDE.md`, `AGENTS.md` ou equivalente) aponta para o `.spec/`.

> ❌ Anti-pattern: tratar doc histórica como verdade atual — validar contra o
> código; remover/arquivar o que está superado.

---

## Paradas obrigatórias (em qualquer scaffold-mode)

Pare e peça decisão humana quando:
1. Item fora do escopo/contrato sem aprovação escrita (registrar em `STATE.md`).
2. Ação destrutiva/irreversível ou deploy em **produção**.
3. Gate reprovado 2× seguidas na mesma etapa (não converge).
4. Decisão estrutural nova sem ADR.
5. Qualquer passo que exigiria abrir/expor segredo (`.claude/rules/seguranca.md`
   ou regra equivalente do projeto).
