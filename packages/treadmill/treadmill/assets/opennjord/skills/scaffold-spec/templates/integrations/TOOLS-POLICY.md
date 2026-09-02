# Política de roteamento — Graphify, OpenViking e Archify

> Política carregada pelos agentes a partir do `AGENTS.md`. As integrações são
> auxiliares, opcionais e nunca são gate ou nó do DAG.

## Regra de decisão

Quando houver **gatilho de domínio** e a ferramenta já estiver disponível no
runtime/registro do agente, faça uma chamada escopada antes de continuar. Não
chame ferramenta sem pergunta concreta e não instale dependências durante
execução, gate ou review.

Procedimento:

1. Formule uma pergunta objetiva que a ferramenta consegue responder.
2. Confirme disponibilidade sem instalar ou alterar configuração.
3. Execute uma chamada escopada e avalie o resultado antes de outra chamada.
4. Reabra código/documento atual e confirme cada fato com `path:linha`.
5. Em ausência, erro ou baixa confiança, aplique o fallback imediatamente.

A indisponibilidade nunca bloqueia nem reprova a esteira. Nenhuma ferramenta
substitui leitura direta, checks mecânicos, evidência ou decisão do gate.

## Tabela de roteamento

| Gatilho de domínio | Ferramenta e chamada | Fallback fail-soft |
|---|---|---|
| Discovery, D00, 00s ou 10a precisa localizar ADR, decisão ou contexto histórico relacionado | **OpenViking:** consulta MCP/CLI explícita e focada no tema | `rg`, índices Markdown, leitura direta e subagent read-only |
| Arquitetura, refatoração ou planejamento multiárea tem dúvida de impacto, dependência, caminho, ciclo ou direção de camada | **Graphify:** `query "<impacto>"`, `path "<A>" "<B>"` ou `explain "<conceito>"` | `arch_violation_grep`, busca de imports/referências e leitura direta |
| Q00–Q30 precisa priorizar ou corroborar o impacto estrutural de um diff | **Graphify:** uma consulta escopada aos módulos tocados | greps e checks da etapa; eles continuam sendo a fonte do gate |
| Modo `documentar`, D10–D50, precisa modelar ou validar diagrama a partir de JSON/texto autorado | **Archify:** `guide`, `validate`, `preview`, `deliver` ou `compare` conforme a fase | Markdown + Mermaid/ASCII, revisão manual de schema e `git diff` |
| Review 25, 10b ou QA 30 no modo `documentar` precisa conferir fonte, receipt ou delta já existente | **Archify:** `validate`/`compare` sobre os artefatos autorados | diff manual e registro de drift em `.spec/reference/` |

## Fronteiras por ferramenta

### OpenViking

- Recall é candidato não confiável; nunca é fato até a fonte ser reaberta.
- Use somente MCP/CLI explícito e o kit em `openviking/`.
- Nunca use plugin de auto-injeção/captura e nunca consulte para decidir cursor,
  DN, contrato ou resultado de gate.
- Store, configuração e credenciais permanecem fora do projeto e do Git.

### Graphify

- Use para relações do código atual, não para memória histórica nem diagramas.
- Restrinja a consulta ao módulo, caminho ou hipótese que motivou o gatilho.
- Graphify prioriza/corrobora; o código atual e os checks mecânicos prevalecem.

### Archify

- Use somente com JSON/texto de diagrama autorado; Archify não analisa o repo.
- Fora do modo `documentar`, só use se já existir fonte/receipt/delta a validar.
- Nunca instale Archify durante review/gate para satisfazer checklist.

## Controle de custo e excesso

- Uma chamada por hipótese/pergunta; só faça follow-up após avaliar a anterior.
- Microtarefa de um arquivo sem impacto estrutural usa leitura direta.
- Não encadeie ferramentas por rotina: escolha apenas a que corresponde ao
  gatilho. Uma tarefa pode não precisar de nenhuma.
- O Main Orchestrator registra a rota escolhida e propaga ferramenta ou fallback
  aos Sub-Orchestrators; workers recebem somente evidência já confirmada.
- Se ferramenta e fonte atual divergirem, a fonte atual e o check reproduzível
  prevalecem; registre a divergência como risco ou drift quando relevante.
