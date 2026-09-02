---
name: arquitetura
description: >-
  Roda o gate de Arquitetura da esteira (disciplina 10) — design gate antes do
  desenvolvimento e review gate depois do desenvolvimento, validando plano,
  ADR, camadas e contratos. Use quando o usuário pedir "revisar arquitetura",
  "design gate", "review do que o dev fez", "validar a abordagem", ou
  "/arquitetura [design|review]". Gate bloqueante.
---

# Skill: arquitetura (gate transversal — disciplina 10)

Roda o gate de Arquitetura **2×** por incremento. Método em
`.spec/sprints/README.md`; regras em `.claude/rules/` quando rodar
no Claude Code, ou nas regras equivalentes do projeto quando rodar no Codex
(`rules/eng/03-solid.md`, `rules/eng/04-clean-architecture.md`,
`rules/seguranca.md`). Cada gate é **bloqueante**: reprovou → volta uma casa.

## Entrada
- `design` (antes do dev) ou `review` (depois do dev), em ARGUMENTS.
- Discovery aprovado — o do sprint (`discovery-sprint.md`) quando existir,
  fallback: ver `fluxo-desenvolvimento.md` — (design) ou branch/diff pronto (review).

## design gate (antes do dev) — procedimento

O `design` transforma o `discovery-sprint.md` (**QUÊ**) numa
**SPEC-implementável** (**COMO**). O Dev permanece bloqueado enquanto houver
lacuna de contexto, decisão ou viabilidade que impeça uma task de ser executada
com AC verificável. Execute as quatro fases abaixo; em incremento trivial, áreas
sem impacto podem ser marcadas como `não aplicável` com justificativa.

### Fase 1 — identificar lacunas por área

1. Leia integralmente o `discovery-sprint.md`: contexto aterrado, gap, escopo,
   decisões abertas, riscos e tasks propostas. Leia também os discoveries-fonte,
   regras e ADRs referenciados.
2. Classifique **Database**, **Backend**, **Frontend** e **Security** como:
   - **verde** — evidência suficiente para decidir o COMO;
   - **não aplicável** — sem impacto, com justificativa;
   - **lacuna resolúvel por código** — o repositório pode responder;
   - **lacuna irredutível** — depende de decisão humana.
3. Registre fatos observados com `path:linha`, separados de premissas, riscos e
   decisões abertas.

Áreas das quatro entrevistas técnicas LionClaw:
- **Database** — modelo de dados, migrações, integridade e índices;
- **Backend** — contratos/API, camadas e invariantes de domínio;
- **Frontend** — apresentação, estado e contrato com o backend;
- **Security** — superfície, authz e segredos, ancorado em `seguranca.md`.

> **Fronteira dura com o 00s:** AC faltante, escopo ambíguo ou outra lacuna do
> QUÊ não é resolvida pelo 10a. Feche com `VERDICT: FAIL`, identifique a lacuna e
> mande corrigir o `00s`. Camadas, contratos, ADRs e demais decisões do COMO são
> produzidos aqui; se vieram antecipados, valide/retrabalhe aqui.

### Fase 2 — investigar lacunas resolúveis com subagents read-only

Não lance subagents por padrão. Lance-os somente quando a Fase 1 encontrar
lacuna pesquisável, evidência espalhada ou áreas independentes que ganhem com
investigação paralela. Use no máximo uma lane por área aplicável.

Reutilize o contrato read-only da skill `discovery`:
- dê escopo estreito e indique arquivos/diretórios permitidos;
- forneça o trecho relevante do `discovery-sprint.md` e as regras/ADRs aplicáveis;
- exija Markdown com evidências `path:linha`, fatos, premissas, riscos, lacunas e
  perguntas restantes;
- proíba edição, comando destrutivo e acesso a produção.

Subagents **levantam evidências e alternativas**; não dão o veredito do 10a nem
decidem ADR, camada ou contrato. Consolide a saída de cada lane na seção da área
correspondente de `arquitetura-NN-<tema>.md` e reclassifique o que restou.

> **OpenViking opcional (POC):** consulte-o por MCP explícito somente para recuperar
> ADRs/decisões históricas candidatas. Não use plugin de auto-injeção, não aceite
> memória como fato e não permita que ela decida DN, camada, contrato ou veredito.
> Reabra cada fonte, confirme `path:linha` e use o contrato read-only acima. O kit
> e o fallback estão em `.opennjord/integrations/openviking/`.

### Fase 3 — perguntar decisões irredutíveis ao usuário

Pergunte somente o que código, documentação e subagents não conseguem decidir
com segurança: trade-off de produto, compatibilidade, custo, risco aceito,
1-way-door ou escolha estrutural sem autoridade registrada.

- Faça ondas de 3–6 perguntas, uma decisão por pergunta, com alternativas e
  trade-offs explícitos.
- Registre cada resposta como `## DN` (atual × alvo, alternativas, trade-offs e
  decisão).
- Em Refatoração ou foco Arquitetura, exija **≥3 DN completas** como critério de
  saída reforçado.
- Não repita perguntas respondidas pela Discovery e não transforme preferência
  técnica pesquisável em pergunta humana.

### Fase 4 — Spec Enricher: julgar implementabilidade

Com as evidências e decisões consolidadas, verifique:
1. Cada task proposta tem AC verificável, escopo técnico delimitado e decisão de
   design associada.
2. Camadas, contratos, invariantes, dependências e estratégia de testes estão
   definidos para as áreas aplicáveis.
3. Dependência cross-módulo usa contrato explícito.
4. Decisão estrutural tem ADR em `.spec/reference/ADR-NNN` quando aplicável.
5. Nenhuma lacuna bloqueante ficou sem dono; incerteza de viabilidade virou
   spike timeboxado, nunca premissa silenciosa.

> **Modo documentar — D10:** escolha o tipo de diagrama (`architecture`,
> `workflow`, `sequence`, `dataflow` ou `lifecycle`) e ancore cada relação nas
> evidências da Fase 1/2. O Archify pode apoiar com `guide` e `validate`, mas recebe
> JSON/texto autorado e **não analisa o repositório**. Sem Archify, use
> Markdown + Mermaid/ASCII e preserve a mesma rastreabilidade `path:linha`.

Saída:
- `VERDICT: PASS` — SPEC implementável; segue para Dev.
- `VERDICT: FAIL` — listar correções; voltar ao 00s para lacuna do QUÊ ou
  corrigir o design para lacuna do COMO.
- Decisão humana pendente — registrar a pergunta e usar
  `awaiting: humano:10a`; **AWAITING não é VERDICT** e nunca autoriza o Dev.

> **Headless (`/loop`):** rode autonomamente as Fases 1, 2 e as checagens da
> Fase 4. Na Fase 3, não invente resposta: materialize as lacunas, faça PARK com
> `awaiting: humano:10a` e retome após a decisão. Só emita `VERDICT: PASS|FAIL`
> quando o gate puder concluir.

> **Expansão LionClaw (macro-stages Tech + Spec):** as Fases 1–3 operacionalizam
> as quatro entrevistas Tech; a Fase 4 materializa Spec Generation → Spec
> Enricher. A saída é a SPEC-implementável entregue ao Dev. Ver o mapa
> macro-stage→disciplina em `scaffold-spec/SKILL.md`.

> **Fronteira:** o review gate (10b) é um gate **fino** — julga camadas, ACs e
> ADR sobre o diff já pronto; não é onde o diff é produzido. Quem produz os
> achados de review por lane é a disciplina 25 (`/review-codigo-subagents`) —
> o 10b consome/julga esse resultado, não o refaz.

## review gate (depois do dev) — revisar o DIFF
> **DoR (10b):** relatório da 25 disponível em
> `.spec/sprints/sprint-NN-<tema>/review-codigo.md` + diff pronto do dev. A 25
> executa os achados por lane ANTES; o 10b consome/julga (ver Fronteira acima).

1. **0 violação de camada / direção de dependência** (lint de camadas verde).
2. Sem segredo vazando; nenhuma regra de `seguranca.md` quebrada.
3. Lógica na camada certa (não no controller/handler/componente).
4. Bate com os **critérios de aceitação** — do `discovery-sprint.md` do sprint
   quando presente, senão da Discovery.
5. Débito técnico **registrado** (não escondido).

> **Modo documentar — D50:** confira o JSON/HTML entregue contra código, configs e
> infraestrutura reais. Quando houver base/head, `archify compare` pode gerar o
> delta visual e receipt; divergência vira `.spec/reference/**/drift.md`. Sem
> Archify, faça diff manual. O critério do gate continua sendo fidelidade
> doc↔código, não disponibilidade da ferramenta.

→ Veredito: aprovado p/ QA, ou lista de correções (volta ao Dev).

## Saída
- Preencher `.spec/arquitetura/arquitetura-NN-<tema>.md` a partir de
  `templates/arquitetura-de-sprint.md`, incluindo matriz das quatro áreas,
  achados/evidências, `## DN`, decisões de camadas/contratos/ADRs, riscos,
  estratégia de testes, lacunas/donos e checklist do Spec Enricher.
- Atualizar `.spec/STATE.md` (status + veredito) + upsert no `esteira-state.yaml`.
  Reprovou 2× → parada (pedir humano).
- **Linha final grepável (headless):** `VERDICT: PASS` (aprovado) | `VERDICT: FAIL`
  (reprovado → lista de correções vira tasks). O relatório fica acima; o tick lê só
  esta linha. **AWAITING não é VERDICT** — é o campo `awaiting` no cursor.

> Para o review do diff, apoie-se em `/code-review` quando existir.
>
> **Humano-no-loop do 10b — com delegação (headless):** o gate de arquitetura é o
> humano-no-loop sobre o resultado, **mas** delega o caminho verde: se os itens
> **mecânicos** (1 grep de camada/direção + 2 secret scan) estão verdes **E** o
> `review-codigo.md` da 25 fecha com `VERDICT: PASS` (cobre o item 3 — lógica na
> camada — pela lane arquitetura da 25; o item 4/ACs é reconferido no QA 30) ⇒
> **auto-`VERDICT: PASS`**. **PARK humano (`awaiting: humano:10b`) só** em `FAIL`
> mecânico/da 25 **ou** decisão estrutural nova sem ADR.
