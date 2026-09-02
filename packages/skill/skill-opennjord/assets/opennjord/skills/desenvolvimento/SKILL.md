---
name: desenvolvimento
description: >-
  Roda a etapa de Desenvolvimento da esteira (disciplina 20), implementando
  conforme a spec aceita e o plano aprovado no gate de Arquitetura, com testes
  junto e validação local verde antes do review. Use quando o usuário pedir
  "implementar", "desenvolver o incremento", "codar a sprint NN", "começar o
  dev", ou "/desenvolvimento". Não começa sem plano aprovado.
---

# Skill: desenvolvimento (disciplina 20)

Implementa o incremento. Método em `.spec/sprints/README.md`;
regras em `.claude/rules/` quando rodar no Claude Code, ou nas regras equivalentes
do projeto quando rodar no Codex (`rules/eng/03-solid.md`,
`rules/eng/04-clean-architecture.md`, `rules/eng/02-unit-tests.md`,
`rules/seguranca.md`, `rules/fluxo-desenvolvimento.md`).

## Definition of Ready (não começar sem)
- **Artefatos de discovery** aceitos + critérios de aceitação (Discovery).
- **Discovery de sprint** aprovado quando existir (convenção e fallback: ver
  `fluxo-desenvolvimento.md`).
- Plano técnico aprovado (Arquitetura **10a design**):
  `.spec/arquitetura/arquitetura-NN-<tema>.md` com `VERDICT: PASS`, camadas,
  contratos, ADRs e nenhuma lacuna irredutível aberta. `FAIL` exige correção
  antes de codar; `awaiting: humano:10a` faz PARK e não inicia o Dev.

## Fluxo
1. **Planner** — materializa as tasks propostas no `discovery-sprint.md` em
   `.spec/sprints/sprint-NN-<tema>/tasks/task-NN-<slug>.md` (template
   `templates/task.md`), **direto da tabela** de tasks propostas (sem
   re-transcrição), enriquecendo com as decisões do design gate 10a; é o
   macro-stage **Execution** do pipeline.
2. **Sprint Validator** (gate do plano) — o plano de tasks é são antes de
   codar? **NÃO re-julga o mérito do AC** (isso é do 10a); valida a
   **fidelidade** — o AC da task materializada bate com o AC ratificado no 10a
   (diff mecânico) — mais **colisão de escopo de escrita** e **dependência
   declarada** no próprio arquivo. Reprovou → replaneja. (Ver o mapa
   Execution→sprints em `scaffold-spec/SKILL.md`.)
3. Implementar **por camada** (respeitar a direção de dependência), no **loop
   Coder ↔ Evaluator**: o Coder escreve o incremento, o Evaluator avalia; itera por
   rounds, com **gate humano no max-rounds** (não avança em fail silencioso).
4. **Testes junto** (não depois) — caminho feliz + erro; cobrir invariantes.
5. **Validação local verde** antes de pedir review: build + lint + teste + RPA
   (comandos no `.spec/MANIFEST.md`).
> **Guarda de idempotência (`/loop`):** antes de cada task, se o `## Resultado`
> marca `Status: entregue` (`templates/task.md`), **pule** essa task. Sob `/loop`,
> **1 tick = 1 task** (1 task = 1 commit) — o tick não varre a sprint de uma vez.
> Modo **refatorar**: mudanças pequenas/reversíveis + teste de caracterização
> antes de mexer (não-regressão). Modo **documentar**: o "dev" é escrever os docs
> e executar D20–D40. Archify é opcional: `validate` checa o JSON, `preview`
> permite revisão visual e `deliver` gera HTML + receipt em `.spec/reference/`.
> Ele não lê o código. Sem a ferramenta, use schema/revisão manual e
> Mermaid/ASCII; os gates seguintes continuam iguais.

## Definition of Done
- [ ] Tasks em `<sprint>/tasks/` · `## Resultado` (status + commit) preenchido
  em cada task entregue · [ ] testes novos verdes; sem regressão
- [ ] build/lint/teste verdes · [ ] validação local **PASS**
- [ ] diff pronto p/ review (Arquitetura 10b) · [ ] débito anotado
- [ ] `.spec/STATE.md` atualizado
- [ ] No modo documentar: fontes/entregas indexadas em `.spec/reference/README.md`
  e evidências `path:linha` preservadas; Archify ausente não bloqueia a entrega

## Anti-patterns
- ❌ Pedir review com build vermelho ou validação falhando.
- ❌ Lógica fora da camada certa. ❌ Refatoração + feature no mesmo incremento.
