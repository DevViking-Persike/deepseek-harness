---
name: discovery
description: >-
  Conduz um discovery estruturado para gerar contexto antes de
  construir/refatorar/documentar. Três modos com seletor: negocio (porquê,
  usuário, valor, regras de negócio), desenvolvimento (escopo, NFR, segurança
  de 1ª classe, apresentação, direção arquitetural, aceitação) e refatoracao
  (não-regressão, bugs, performance, design). O seletor roda 1, 2, os 3 ou os 2
  primeiros na ordem canônica 1→2→3 e termina num Plano de Sprints aprovado.
  Pode criar subagents read-only para pesquisa, leitura de código, riscos e
  lacunas. Usa The Mom Test. Use quando o usuário pedir "fazer discovery",
  "discovery de negócio/desenvolvimento/refatoração", "levantar
  requisitos/contexto", "antes de começar a desenvolver", ou "/discovery
  [negocio|dev|refatoracao]". É a disciplina 00 da esteira .spec.
---

# Skill: discovery

Conduz o **discovery** (disciplina 00 da esteira) fazendo **boas perguntas** para
gerar um contexto que sustente as decisões seguintes. **Três modos** selecionáveis
(ordem canônica fixa **1=NEGÓCIO, 2=DESENVOLVIMENTO, 3=REFATORAÇÃO**):

| # | Modo | Gera | Alimenta |
|---|---|---|---|
| 1 | **negocio** | o **porquê**: outcome, usuário, dor, valor, riscos de produto + **regras/fluxo de negócio** | documentação de produto + justificativa de feature; abre o modo DEV (risco "viabilidade técnica"); sprints `criar` |
| 2 | **desenvolvimento** | o **como/escopo**: requisitos, NFR, **segurança (1ª classe)**, apresentação de dados, direção arquitetural, aceitação | gate 10 (design); review de código (25); ACs do QA (30); ACs de segurança do gate 40 |
| 3 | **refatoracao** | o **como melhorar** um sistema existente: não-regressão, bugs, performance, design/código | sprints `refatorar` (ACs de não-regressão) |

> **Seletor:** rode 1, 2, os 3 ou os 2 primeiros (negocio+dev) — ver `## Seletor
> de modos`. O **discovery-mode** (o que investigar) é ORTOGONAL ao **scaffold-mode**
> (`criar`/`refatorar`/`documentar` — como executar cada sprint). Defaults por
> scaffold-mode e desambiguação dos dois eixos estão no Seletor (fonte única).

## Como perguntar (método — The Mom Test)

A qualidade do discovery vem de **como** se pergunta. Regras:

1. **Fale do passado, não do futuro.** Pergunte o que a pessoa **já fez**, não o
   que ela faria. ("Me conta a **última vez** que…" › "Você usaria…?")
2. **Peça histórias e exemplos concretos**, não opiniões. Opinião e elogio são
   ruído; comportamento é dado.
3. **Pergunte "o quê" e "como", evite "por quê"** direto (gera racionalização).
4. **Não venda nem valide a sua ideia.** Não conte a solução antes de entender o
   problema — senão a pessoa só concorda.
5. **Cave o problema**: frequência, impacto, o que já tentaram, quanto custa hoje.
6. **Pergunte em ondas** (3–6 por vez), siga os follow-ups, não despeje tudo.

> Fontes: The Mom Test (Rob Fitzpatrick); Continuous Discovery / Opportunity
> Solution Tree (Teresa Torres); The Four Big Risks (Marty Cagan/SVPG); Jobs to be
> Done; NFRs (Volere/arc42).

---

## Subagents de discovery

Use subagents quando o discovery depender de investigação paralela que pode ser
feita sem bloquear a entrevista: leitura de código legado, inventário de
integrações, comparação de documentação, pesquisa de riscos, análise de NFR ou
levantamento de lacunas por domínio.

### Quando criar
- Contexto espalhado em muitos arquivos, módulos, docs ou sistemas.
- `refatorar` ou `documentar`, onde é preciso medir estado atual antes de decidir.
- Produto + desenvolvimento no mesmo incremento, separando oportunidade,
  viabilidade técnica e riscos.
- Risco alto de viés: pedir leituras independentes evita uma conclusão prematura.

### Passes recomendados
- **Produto/oportunidade:** sintetizar outcome, usuário, dor, evidências e lacunas.
- **Código/legado:** mapear módulos, fluxos, integrações, pontos frágeis e testes
  existentes. Read-only.
- **NFR/riscos:** levantar performance, segurança, confiabilidade, compliance,
  dependências externas e spikes necessários.
- **Docs/operabilidade:** comparar README, runbooks, scripts e realidade do código,
  marcando stale, ausente ou não verificável.

### Contrato de cada subagent
Ao criar um subagent, dê escopo estreito, indique arquivos/diretórios permitidos e
peça saída em Markdown com:
- Evidências com caminho e linha quando houver.
- Lacunas e perguntas que precisam de usuário.
- Riscos e premissas separadas de fatos observados.
- Nenhuma edição de arquivo, nenhum comando destrutivo e nenhum acesso a produção.

Não use subagents para substituir a entrevista com o usuário. Consolide os
achados como **evidência auxiliar** e deixe claro o que foi confirmado pelo
usuário, o que veio do código/docs e o que ainda é hipótese.

> **OpenViking opcional (POC):** antes de abrir lanes, uma consulta MCP explícita
> pode recuperar ADRs, discoveries e arquiteturas relacionados. Trate o recall
> como candidato não confiável: abra a fonte atual, confirme `path:linha` e descarte
> conteúdo stale. Sem servidor, use busca/leitura direta; a ausência nunca bloqueia
> Discovery nem altera o gate do Plano.

---

## Seletor de modos

Roda **antes dos bancos**. Decide QUAIS modos rodar e em que sequência.

### Gramática de ARGUMENTS
`/discovery [negocio|dev|refatoracao]...` — aceita **múltiplos** (separados por
espaço ou vírgula), rodados sempre na **ordem canônica 1→2→3**. Aliases:

- `all` = os 3 (`negocio dev refatoracao`).
- `1 2` = os dois primeiros (`negocio dev`); `1`/`2`/`3` = índices dos modos.
- Nomes longos e de transição: `desenvolvimento`→`dev`, `produto`→`negocio`.
- `/discovery sprint <NN>` roda o **Discovery de sprint** (sub-fluxo fora da
  ordem canônica N→D→R — detalha 1 linha do plano já aprovado; ver seção
  `## Discovery de sprint`).

### Menu interativo
Se ARGUMENTS vier vazio **e** não houver scaffold-mode, pergunte ao usuário qual
combinação quer: (1) só negócio, (2) só dev, os 3, ou os 2 primeiros (negócio+dev).

### Execução não-interativa (headless / `/loop`)
Sem humano na sessão: o **modo deriva do scaffold-mode** (mapa "Default por
scaffold-mode" abaixo) — **sem menu**. A **entrevista Mom Test vira "ler os
artefatos existentes + preencher a seção §Lacunas"** do doc (não inventa
respostas — marca o que falta). A saída **sempre faz PARK no gate do Plano de
Sprints** (`awaiting: humano:plano`): o plano é aprovação humana obrigatória,
nunca auto-aprovado.

### Default por scaffold-mode (mapa único — LINKE daqui, não repita)
> Esta é a **fonte única** do mapa modo×scaffold-mode. `scaffold-spec` aponta pra cá.

| scaffold-mode | discovery-modes default | override |
|---|---|---|
| `criar` | `[negocio, dev]` | sempre permitido |
| `refatorar` | `[refatoracao]` (refactor puro); se há feature nova junto → `[dev, refatoracao]` | sempre permitido |
| `documentar` | `[negocio]` (doc de produto); eng-reversa técnica → `[dev]` | sempre permitido |

### Desambiguação dos dois eixos (ORTOGONAIS)
> **Fonte única:** `rules/fluxo-desenvolvimento.md` ("Os 2 eixos"). Resumo aqui:
- **scaffold-mode** (`criar`/`refatorar`/`documentar`) = **como executar** cada sprint.
- **discovery-mode** (`negocio`/`dev`/`refatoracao`) = **o que investigar** antes.

Os eixos são independentes: combinações não-contíguas (ex.: `{negocio, refatoracao}`)
são permitidas — a ordem canônica só fixa a **sequência de execução**, não restringe
a combinação. Detalhe e racional completos na fonte.

### Do modo ao pipeline derivado (LINK — não repetir)
O modo escolhido não é só "o que investigar": ele também **deriva a esteira de
pipeline** (feature-first / development / arch-review / security-audit), e um **foco**
opcional (Segurança / Arquitetura / UI-Design) injeta fases numa esteira mais
específica. A tabela canônica **Modo N/D/R → esteira derivada (+ foco)** vive em
`scaffold-spec/SKILL.md` (seção "Modo N/D/R → esteira derivada") — **fonte única**,
não repetida aqui. Aqui o modo é o **seletor**; lá ele vira a esteira.

---

## Modo NEGÓCIO — banco de perguntas

### 1. Outcome (resultado de negócio — a raiz)
- Que **resultado** queremos mover? (não a feature — o efeito: retenção, ativação, receita, custo, NPS…)
- Como esse resultado se liga à estratégia / North Star?
- Como saberemos que mexemos nele? (métrica + baseline atual)

### 2. Usuário & contexto
- Para **quem** é? (persona, papel, contexto de uso)
- Em que **situação** o problema aparece? (gatilho, frequência)

### 3. Oportunidade / problema (Opportunity Solution Tree + Mom Test)
- Qual **dor/necessidade/desejo** específico? (não a solução)
- **Como o usuário resolve isso hoje?** Me conta a **última vez** que precisou. (alternativas atuais)
- O que é **mais frustrante** nesse processo hoje? Quanto custa (tempo/dinheiro/risco)?
- O que já tentaram pra resolver? Por que não resolveu?

### 4. Jobs to be Done
- Quando [situação], o usuário quer [motivação], **pra** [resultado esperado]?
- O que ele está **ultimamente tentando realizar**?

### 5. Os 4 riscos (Cagan — matar antes de construir)
- **Valor:** ele vai **usar/pagar**? Que evidência temos? (não opinião — sinal de comportamento)
- **Usabilidade:** vai **conseguir usar**? onde costuma travar?
- **Viabilidade técnica:** dá pra **construir** com o time/stack/prazo? (passa pro modo desenvolvimento)
- **Viabilidade de negócio:** funciona pro **negócio**? (legal, financeiro, operacional, suporte, marca)

### 6. Sucesso & escopo
- Como é o **sucesso** em 1 frase? Qual a métrica (leading + lagging)?
- O que está **fora** de escopo agora? O que é a **menor fatia** que entrega valor (MVP/slice)?

### 7. Regras & Fluxo de negócio
- Quais **regras/políticas do negócio** governam isso? (o que o negócio exige/proíbe)
- Que **invariantes do domínio** (não-técnicos) sempre precisam valer?
- **Atores/papéis na ótica do negócio** — quem participa, quem decide/aprova?
- **Fluxo ponta-a-ponta:** do gatilho ao desfecho, passo a passo.
- **Estados e casos-limite do negócio:** exceções, desfechos alternativos.
- O que é **regulado/compliance no nível de negócio** (LGPD, contrato, obrigação legal)?

---

## Modo DESENVOLVIMENTO — banco de perguntas

### 1. Escopo
- O que o sistema **faz** (casos de uso principais)? O que **NÃO** faz?
- Qual a **menor fatia** entregável (vertical slice)? O que é baseline × aditivo?

### 2. Requisitos funcionais
- Entradas, saídas, regras de negócio, estados, caminhos de erro.
- Atores/papéis e o que cada um pode fazer (autorização).

### 3. NFR — atributos de qualidade (escolher os **top 3–5** e dar número)
> Segurança **saiu do NFR** — virou bloco de 1ª classe (bloco 7).

- **Performance/escala:** quantos usuários/req? latência alvo (p95)? volume de dados?
- **Disponibilidade/confiabilidade:** SLO? o que acontece em falha? recuperação?
- **Manutenibilidade:** quem mantém? testabilidade? observabilidade?
- **Compatibilidade/portabilidade:** plataformas, navegadores, integrações.
- **Usabilidade/acessibilidade/i18n** quando aplicável.

### 4. Restrições (constraints)
- **Stack/arquitetura** obrigatória ou existente? **Legado** a respeitar?
- **Integrações de terceiros** (limites, custos, SLAs, rate limits)?
- **Prazo, equipe, orçamento, legal/compliance.**

### 5. Premissas & riscos
- O que estamos **assumindo** (e qual premissa, se falsa, derruba o plano)?
- **Riscos** técnicos, de compliance (retrofitar compliance custa ~3× — desenhar antes), de dependência.
- O que precisa de **spike** (provar viabilidade antes de comprometer)?

### 6. Dependências & critérios de aceitação
- De quais sistemas/serviços/equipes depende?
- **Critérios de aceitação verificáveis** (Given/When/Then) — viram teste no QA.
- **Definition of Ready:** tudo acima respondido = pronto pra Arquitetura/Dev.

### 7. Requisitos de Segurança (bloco de 1ª classe)
> Cada resposta **instancia** um invariante de `rules/seguranca.md` para este
> incremento e vira **AC que o gate 40 (seguranca/redteam) verifica na execução**.
> O discovery **captura**, não pentesta.

- **Superfície de ameaça:** endpoints/entradas expostas, atores hostis.
- **Dado sensível:** o que é sensível, classificação, o que **não** logar (§Dados).
- **Authn/Authz:** como autentica; authz por papel **deny-by-default** no servidor (§Auth).
- **Tenancy/isolamento:** multi-tenant? qual a fronteira de isolamento?
- **Auditoria/log:** o que audita; **append-only**; actor vem do usuário autenticado (§Dados).
- **LGPD/compliance:** bases legais, consentimento, minimização.
- **Manejo de segredos:** onde vivem; nunca no cliente/git/log (§Segredos).

### 8. Apresentação de dados & superfície UX
- **Tipo de apresentação:** dashboard / grid / relatório / API / realtime?
- **Volume & paginação:** quantos itens? paginação/scroll? filtros/ordenação?
- **Acessibilidade / i18n:** requisitos a11y, idiomas, formatos regionais.

### 9. Direção arquitetural
- **Decisões/restrições técnicas de extrema relevância a fechar ANTES do dev.**
- **Alternativas descartadas e por quê.**
- O que **alimenta o gate 10 (design)** — pontos que a Arquitetura precisa ratificar.

> Para **documentar técnico** (engenharia reversa): use **Diátaxis** — que docs
> faltam? tutorial (aprender), how-to (tarefa), reference (consulta), explicação
> (entender)?

---

## Modo REFATORAÇÃO — banco de perguntas

### 1. Alvo & motivação
- O que motiva? **smell / bug / perf / débito técnico?** Por que **agora**?
- Qual o **sintoma observável** hoje?

### 2. Estado atual / inventário
- Quais **módulos/arquivos/fluxos** são afetados? (use subagents read-only — ver
  `## Subagents`; sob demanda em incrementos pequenos)
- Que **testes cobrem** isso hoje?

### 3. Não-regressão
- Qual **comportamento a preservar** (contratos, saídas, efeitos observáveis)?
- Que **caracterização** (testes) fixa isso hoje? Onde há **lacuna** a cobrir antes de mexer?

### 4. Bugs (se houver)
- **Repro** determinístico? **Hipótese de causa-raiz**? **Comportamento correto esperado** (vira AC)?

### 5. Performance (se aplicável)
- **Baseline** medido hoje + **alvo** mensurável? **Hotspots**? Como **medir/profiling**?

### 6. Design / código
- **Acoplamento / violação de camada / complexidade**? Qual o **design-alvo**?

### 7. Raio de impacto & escopo
- O que **NÃO tocar**? Como **fatiar** em passos seguros e reversíveis?

### 8. Aceitação verificável (Given/When/Then)
- Não-regressão + bugfix + performance — cada um vira teste no QA.

---

## Como os modos encadeiam

1. **Ordem canônica:** rode os modos selecionados em **N→D→R** (1→2→3), pulando
   os não selecionados.
2. **Handoff entre modos:** cada modo grava **seu próprio artefato** em
   `.spec/discovery/` e **lê os anteriores** — o risco "viabilidade técnica" do
   NEGÓCIO abre o DEV; o inventário do REFATORAÇÃO referencia o escopo do DEV.
3. **Fan-in (consolidação):** ao fim de **todos** os modos, gere
   `.spec/discovery/plano-de-sprints-NN.md` (template `plano-de-sprints.md`) —
   1 linha por sprint derivado: `NN | scaffold-mode | ACs | discoveries-fonte |
   depende-de | ordem`. Numeração **NN fresco** por sprint; a coluna
   `discoveries-fonte` rastreia a rodada de origem.
4. **Gate de saída (bloqueante):** o **Plano de Sprints aprovado pelo usuário** é
   pré-condição da 1ª Arquitetura. Só com o backlog fatiado (cada item com ACs
   verificáveis + scaffold-mode) abre o gate 10. Aprovado o plano, cada sprint
   abre com o **discovery-de-sprint** (ver seção própria) antes do gate 10
   daquele sprint.
5. **No njord:** cada item do Plano vira uma run iniciada no entry_point
   `arquitetura`, reaproveitando os artefatos do discovery compartilhado — zero
   mudança de domínio para "N sprints". O Plano é output/Report da stage Discovery.

---

## Discovery de sprint (detalhamento por linha do plano)

Depois do **Plano de Sprints aprovado**, cada sprint abre com
`/discovery sprint <NN>` → gera
`.spec/sprints/sprint-NN-<tema>/discovery-sprint.md` (template
`templates/discovery-de-sprint.md`). É uma **sub-etapa da disciplina 00
aplicada por sprint** (etiqueta `00s`) — não uma disciplina nova.

- **Aterrar, não re-entrevistar:** reusa o contrato de subagents read-only de
  `## Subagents de discovery` pra aterrar a linha do plano no código real
  (paths + linhas medidos, base git registrada). Não repete a entrevista da
  rodada: lê os artefatos `.spec/discovery/` e só **confronta lacunas** com o
  usuário.
- **Entrada do 10a, não gate próprio:** não tem DoD nem aprovação independente
  — pode rodar na mesma sessão que o design gate (10a) com **uma única
  aprovação**. O 10a **reprova** se o contexto não estiver aterrado ou se
  alguma task proposta ficar sem AC verificável.
- **Fronteira dura:** aqui é o **QUÊ** (escopo, ACs, riscos, tasks propostas);
  camadas, contratos e ADR são o **COMO** — pertencem ao 10a. Se o
  discovery-de-sprint antecipar decisão de design, a Arquitetura retrabalha.
- **Tasks direto da tabela:** o Planner do `/desenvolvimento` materializa
  `tasks/task-NN-<slug>.md` **direto da tabela de tasks propostas** (sem
  re-transcrição intermediária), enriquecendo cada task com as decisões do 10a.
- **Critérios de spike** (marcar `Spike? sim` exige ≥1): viabilidade técnica
  não provada; fonte externa não medida; decisão 1-way door aberta que só
  investigação resolve; escopo de escrita não delimitável sem ler o código.
  Spike = investigação **timeboxada registrada na própria task**
  (`## Resultado`), nunca arquivo de discovery separado — **não existe
  discovery-por-task**.
- **Fallback legado:** sprints antigas sem `discovery-sprint.md` usam os
  artefatos globais de `.spec/discovery/` — convenção de fallback declarada em
  `scaffold-spec/templates/rules/fluxo-desenvolvimento.md` (instalada no
  projeto como `rules/fluxo-desenvolvimento.md`).

---

## Como rodar

1. Rode o **seletor** (`## Seletor de modos`): resolva os discovery-modes a partir
   dos ARGUMENTS, do scaffold-mode (mapa default) ou do menu interativo. Fixe a
   ordem canônica 1→2→3.
2. Se o contexto exigir investigação paralela, crie subagents read-only antes ou
   durante as ondas de perguntas. Use os passes acima e continue a entrevista em
   paralelo quando não depender do resultado.
3. Faça as perguntas **em ondas** (use o método Mom Test). **Não** invente as
   respostas: se for entrevista real, conduza; se o usuário já tem o contexto,
   colete e **confronte lacunas** (aponte o que falta responder).
4. Para **cada modo** selecionado, **sintetize** um artefato próprio em
   `.spec/discovery/discovery-NN-<tema>.<modo>.md` usando o template do modo
   (`templates/discovery-negocio.md`, `templates/discovery-desenvolvimento.md`,
   `templates/discovery-refatoracao.md`). Cada modo lê os anteriores como handoff.
5. **Consolidação (fan-in):** ao fim de todos os modos, gere
   `.spec/discovery/plano-de-sprints-NN.md` (`templates/plano-de-sprints.md`) com
   o backlog fatiado (ver `## Como os modos encadeiam`).
6. **Gate da Discovery (DoD):** cada modo com seu artefato completo (escopo,
   aditivos aprovados, ACs verificáveis, riscos/NFR mapeados; segurança
   instanciada nos invariantes de `rules/seguranca.md` no modo DEV) **e** o
   **Plano de Sprints aprovado pelo usuário** (gate **bloqueante**). Só então
   abre a 1ª Arquitetura.

Exemplos preenchidos (o que é "bom"): `templates/EXEMPLOS.md`.

## Anti-patterns

- ❌ Perguntar opinião/hipótese ("você gostaria…?", "isso é útil?") — viola o Mom Test.
- ❌ Pular pra solução antes de entender a oportunidade/problema.
- ❌ NFR sem número ("rápido", "escalável") — exija alvo mensurável.
- ❌ Critério de aceitação não verificável.
- ❌ Fechar o discovery com premissa arriscada não validada nem marcada como risco.
