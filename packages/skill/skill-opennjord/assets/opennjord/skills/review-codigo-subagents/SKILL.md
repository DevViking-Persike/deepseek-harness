---
name: review-codigo-subagents
description: >-
  Roda a sprint 25 de review de código da esteira, construindo uma pipeline
  genérica com subagents independentes e adaptando lanes ao projeto, ao diff e às
  regras locais. Use quando o usuário pedir "review de código", "pipeline de
  review", "rodar subagents de review", "auditar regras", "revisar antes de QA",
  "revisar antes de merge/refatoração" ou "/review-codigo-subagents". Read-only
  por padrão; correções exigem confirmação separada.
---

# Skill: review-codigo-subagents (disciplina 25)

Orquestra a **sprint 25 — Review de Código** por subagents. Roda depois de
`/desenvolvimento`, **antes** do gate `/arquitetura review` (10b) — a 25 executa
os achados por lane; o 10b consome/julga. A skill não
assume stack, framework, arquitetura ou ferramenta específica: primeiro descobre
o projeto, depois escolhe lanes de análise, executa subagents read-only e
consolida um relatório priorizado.

> **Fronteira:** a disciplina 25 é **EXECUÇÃO** por lanes — produz os achados
> que o gate `/arquitetura review` (10b) depois julga (aprovado/reprovado); a
> 25 não substitui o gate. A **lane Segurança/privacidade** desta pipeline é
> análise **ESTÁTICA** do diff (secret scan, authz por leitura de código,
> superfície de risco); a exploração **DINÂMICA** do ambiente vivo é da
> disciplina **40** (`/seguranca` + `/redteam`) — não se sobrepõem.
>
> **Foco Segurança (esteira derivada) = esta lane em escopo de REPO.** Quando o
> pipeline é derivado com **foco Segurança** (o "Security Audit" das fases
> LionClaw — ver `scaffold-spec/SKILL.md`), a lane Segurança **amplia o escopo
> de *diff* para *repo*** (fan-out por tag/área, read-only) e **gera tasks de
> remediação** (spec). Isso **REUSA** esta lane 25 — **não** cria uma skill nem
> um 4º conceito. A taxonomia dos atores de segurança fica assim: **(1)** lane
> estática 25 (diff **ou** repo, quando foco Segurança) → tasks; **(2)**
> `/redteam` dinâmico (40) → PoC; **(3)** `/seguranca` gate (40) → veredito. O
> "Security Audit" LionClaw é o caso **(1)** em escopo de repo, não um ator novo.

## Objetivo

Criar um processo repetível para responder:

- O diff ou escopo está correto?
- Há violação das regras locais do projeto?
- Existem riscos de arquitetura, testes, segurança, operação ou UX?
- O que bloqueia merge/refatoração e o que pode virar backlog?
- Quais próximos passos têm maior impacto?

## Entrada e saída da sprint

**Entrada (Definition of Ready):**

- Diff pronto do `/desenvolvimento` (validação local verde).
- Plano/spec/ADR relevantes disponíveis em `.spec/`.
- Regras locais disponíveis em `.claude/rules/` ou equivalente do projeto.
- Comandos de validação identificados ou lacuna registrada.

**Saída (Definition of Done):**

- Relatório arquivado em `.spec/sprints/sprint-NN-<tema>/review-codigo.md`.
- Veredito geral `PASS`, `PASS_WITH_WARNINGS` ou `FAIL`.
- **Linha final grepável:** `VERDICT: PASS` (inclui `PASS_WITH_WARNINGS` — os
  warnings ficam listados acima) | `VERDICT: FAIL`. O gate 10b e o `/qa` leem
  esta linha; **AWAITING não é VERDICT**.
- Achados com evidência, severidade e próximo passo.
- Comandos executados/não executados registrados.
- `.spec/STATE.md` atualizado + upsert no `esteira-state.yaml`. `FAIL` → os
  achados viram tasks (Dev/Arquitetura conforme a causa); a 25 **nunca edita código**.

## Contrato enumerável (46-03 — obrigatório)

O review deixa de ser prosa auditável só por leitura: o artefato
`review-codigo.md` precisa passar no validador mecânico
`cargo run --bin review_verdict -- <arquivo>` (exit 0). O contrato:

1. **Denominador antes das lanes.** Rode
   `scripts/review-enumerate.sh <base>` e cite o espaço mecânico (arquivos,
   hunks, sinks). Toda lane declara o SEU denominador a partir dele.
2. **Toda lane termina com linha tipada:**
   `LANE: <nome> — COMPLETE|INCOMPLETE_CONTEXT|INFRA_ERROR (n/D)`.
   `COMPLETE` exige `n == D`; verificou menos, o número diz.
3. **Estouro de contexto NUNCA vira PASS.** Lane que não coube no contexto
   declara `INCOMPLETE_CONTEXT (n/D)` e o resto do denominador vai para um
   SHARD novo (outra lane, com o restante como D) — ou o veredito é FAIL.
   `INFRA_ERROR` idem (subagent morreu ≠ verificou).
4. **Claims totalizantes exigem denominador na mesma linha.** "exaustivo",
   "100%", "todos os", "todo o espaço", "completo" sem `(n/D)` reprovam no
   linter do bin (exit 3).
5. **`VERDICT: PASS` só é coerente** com TODAS as lanes `COMPLETE (D/D)` —
   o bin recusa o resto (exit 1). O 10b/qa podem (e devem) rodar o bin antes
   de aceitar o artefato.

## Princípios

- **Pipeline antes de checklist fixo:** adapte lanes ao projeto e ao pedido.
- **Read-only por padrão:** review não edita, não deleta, não formata e não commita.
- **Evidência antes de opinião:** todo achado deve citar arquivo/linha, regra,
  comando, diff ou comportamento observável.
- **Subagents independentes:** cada lane tem escopo e saída próprios; o agente
  principal consolida e decide conflitos.
- **Regras locais vencem heurísticas:** priorize `.claude/rules/`, `.spec/`,
  ADRs, docs de arquitetura, CI e scripts do repo.
- **Sem segredo e sem produção:** não abrir segredos, não exfiltrar dados, não
  acessar produção e não executar ação destrutiva.

## Fases da pipeline

### 1. Intake

Defina o alvo do review:

- diff atual, branch, PR, pasta, módulo, arquivo ou incremento da `.spec` —
  `sprint-NN-<tema>/tasks/` e o `discovery-sprint.md` do sprint são insumos
  válidos;
- objetivo: pre-merge, pre-refatoração, regressão, arquitetura, segurança, UX,
  documentação, limpeza ou auditoria geral;
- restrições: read-only, comandos permitidos, ambiente local/dev, tempo e escopo.

Se o alvo não estiver claro, peça uma decisão antes de criar subagents.

### 2. Discovery do projeto

Antes de escolher lanes, levante sinais do projeto:

- regras locais: `.claude/rules/`, `.spec/`, `AGENTS.md`, `CLAUDE.md`, ADRs,
  READMEs, guias de contribuição;
- stack e tooling: manifests, lockfiles, scripts, CI, Makefile, task runners,
  Dockerfiles, workspaces e estrutura de módulos;
- superfície do review: arquivos alterados, áreas tocadas, dependências e testes
  relacionados.

Não hardcode comandos. Detecte os comandos reais do repo e só rode os que forem
seguros, locais e úteis para o próximo passo.

### 3. Seleção de lanes

Escolha lanes conforme o alvo. Use poucas lanes bem definidas em vez de muitos
subagents genéricos.

| Lane | Quando usar | Saída esperada |
|---|---|---|
| Escopo/diff | Sempre que houver branch, PR ou alteração local | O que mudou, risco de regressão e arquivos críticos |
| Regras locais | Sempre que existirem rules, ADRs ou contratos de arquitetura | Violações comprovadas e exceções a justificar |
| Arquitetura | Mudança cruza módulos, camadas, contratos ou dependências | Quebra de fronteira, acoplamento e plano de correção |
| Testes/validação | Qualquer mudança funcional ou refatoração | Cobertura do comportamento tocado e comandos de validação |
| Segurança/privacidade | Auth, dados sensíveis, IO externo, permissões, secrets, rede | Achados defensivos e próximos passos seguros |
| Operabilidade | Deploy, config, observabilidade, migração, jobs, scripts | Riscos de runtime, rollback e lacunas de runbook |
| UX/acessibilidade | UI, fluxo de usuário, layout, texto, interação | Problemas de uso, responsividade e acessibilidade |
| Código morto/deps | Limpeza, bundles grandes, exports suspeitos, dependências | Candidatos verificados; remoção só com aprovação |
| Documentação | Docs, onboarding, API, runbook, mudança comportamental | Docs stale/ausentes e atualização necessária |

> **Modo documentar — D50:** a lane Documentação compara afirmações, exemplos e
> diagramas com código/config/infra reais. Se já houver fontes Archify, pode rodar
> `validate`/`compare` em modo read-only; a ferramenta não prova fidelidade ao
> repo. Sem ela, faça diff manual e mantenha o mesmo padrão de evidência.

### 4. Contrato dos subagents

Cada subagent deve receber um prompt curto e autocontido:

```text
Você é um subagent de review read-only.

Alvo: <diff/pasta/módulo/arquivo>.
Lane: <escopo/diff | regras locais | arquitetura | testes | segurança | operabilidade | UX | código morto | documentação>.
Contexto obrigatório: <rules/docs/scripts relevantes>.

Restrições:
- Não editar, deletar, formatar, commitar, criar branch ou instalar ferramentas.
- Não acessar produção nem abrir segredos.
- Rodar apenas comandos locais/read-only necessários para evidência.
- Separar violação comprovada de suspeita não confirmada.

Saída em Markdown:
- Veredito da lane: PASS | WARN | FAIL.
- Achados por severidade com arquivo:linha e evidência.
- Comandos executados e resultado resumido, ou motivo para não rodar.
- Lacunas, falsos positivos possíveis e perguntas para o usuário.
- Top 3 recomendações da lane.
```

### 5. Execução

- Crie subagents em paralelo apenas quando as lanes forem independentes.
- Não duplique lanes; se duas lanes se sobrepõem, delimite claramente o foco.
- Enquanto subagents rodam, o agente principal pode fazer trabalho não sobreposto:
  checar status, ler rules, montar matriz de lanes e preparar consolidação.
- Não reproduza o trabalho dos subagents; integre os resultados.

### 6. Consolidação

Depois que os subagents terminarem:

1. Remova duplicidades.
2. Agrupe por severidade: `BLOCKER`, `HIGH`, `MEDIUM`, `LOW`, `INFO`.
3. Separe "violação comprovada" de "não confirmado".
4. Preserve divergências relevantes entre lanes.
5. Liste comandos executados, não executados e por quê.
6. Gere um veredito geral: `PASS`, `PASS_WITH_WARNINGS` ou `FAIL`.
7. Priorize no máximo 3 próximos passos.

### 7. Gate de ação

Se o usuário pediu só review, pare no relatório. Se pediu correção, transforme o
relatório em plano e peça confirmação antes de qualquer edição.

> **Exceção LIMITADA no modo `/loop`:** pode **persistir**
> `.spec/sprints/sprint-NN-<tema>/review-codigo.md` e **fazer upsert no
> `esteira-state.yaml`** SEM confirmação (é evidência de estado, não código).
> **NUNCA** edita código, cria commit de código, nem aplica correção — achados
> `FAIL` viram tasks pro Dev. Todo o resto da lista abaixo segue exigindo confirmação.

Peça confirmação antes de:

- editar, deletar, mover ou formatar arquivos;
- remover exports, barrels, dependências, snapshots ou migrations;
- criar branch, commit, tag, push ou relatório persistente no repo;
- instalar ferramentas;
- rodar comando destrutivo ou que escreva fora do workspace/cache temporário;
- aceitar exceção de arquitetura, segurança ou qualidade;
- transformar achados em refatoração automática.

## Heurísticas de validação

Use scripts do próprio projeto quando existirem. Exemplos por categoria:

- status/diff: `git status`, `git diff`, `git diff --check`;
- qualidade: lint, format check, static analysis, typecheck;
- testes: unit, integration, e2e, mutation/cobertura se já configurados;
- build: build local ou pacote afetado;
- segurança: secret scan local, dependency audit, regras de authz/privacidade;
- docs: links, comandos documentados, exemplos executáveis, diagramas e drift;
  `archify validate`/`compare` somente se já disponível — nunca instalar durante review.

Não instale ferramentas novas durante review sem aprovação. Se uma validação
importante não existir, registre a lacuna e sugira criação como próximo passo.

## Relatório final

```markdown
# Pipeline de Review de Código

## Resumo
- Veredito geral: PASS | PASS_WITH_WARNINGS | FAIL
- Alvo: <diff/branch/pasta/módulo>
- Lanes executadas: <...>
- Bloqueantes: <n> · Altos: <n> · Médios: <n> · Baixos: <n> · Infos: <n>

## Achados Comprovados
### BLOCKER
- <arquivo:linha> — <lane/regra> — <impacto> — <próximo passo>

### HIGH
- <arquivo:linha> — <lane/regra> — <impacto> — <próximo passo>

### MEDIUM
- <arquivo:linha> — <lane/regra> — <impacto> — <próximo passo>

### LOW
- <arquivo:linha> — <lane/regra> — <impacto> — <próximo passo>

## Não Confirmado
- <suspeita/lacuna> — <como confirmar>

## Validação
- <comando>: PASS | FAIL | NOT RUN — <resumo>

## Conflitos ou Exceções
- <divergência entre lanes ou regra local conflitante>

## Top 3 Próximos Passos
1. <...>
2. <...>
3. <...>
```

## Anti-patterns

- ❌ Começar por checks de uma stack específica sem descobrir o projeto.
- ❌ Subagents editarem arquivos durante review.
- ❌ Reportar achado sem evidência.
- ❌ Misturar review read-only com refatoração.
- ❌ Tratar suspeita como violação comprovada.
- ❌ Instalar ferramenta ou rodar comando destrutivo para completar uma lane.
