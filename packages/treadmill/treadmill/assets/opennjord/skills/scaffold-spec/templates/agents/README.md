# Agentes — convenção de orquestração multi-agente

> Templates agnósticos para orquestrar builds multi-agente em qualquer projeto.
> Instalados via `scaffold-spec` em `.opennjord/agents/` — fonte canônica única
> (Claude Code enxerga via `.claude/agents` → symlink; Codex, via `AGENTS.md`).

## Um diretório, dois produtores — sem conflito

`.opennjord/agents/` é compartilhado por duas origens que nunca colidem:

1. **Templates `.tpl` (este pacote)** — `main-orchestrator.md.tpl`,
   `sub-orchestrator.md.tpl`, `worker-{build,test,validate}.md.tpl`. Ficam
   **inertes**: a extensão `.tpl` não é descoberta como agent (`.md` é o
   contrato). Instancie sob demanda substituindo `{{...}}` (ver "Como
   instanciar" abaixo) — o resultado vira um `.md` novo no mesmo diretório.
2. **Agentes reais `.md`** — instanciados à mão a partir de um `.tpl`, OU
   gravados pelo **orchestrator do njord** (dual-write FS+DB, categoria
   `agent`, provenance `local`) quando este projeto é gerenciado por ele. As
   duas origens escrevem no MESMO `.opennjord/agents/<nome>.md` — não há
   necessidade de sincronizar nada à parte; editar pela UI do njord ou por
   fora convergem no mesmo arquivo.

## Regra principal — orchestrator-always

**Sempre que rodar mais de um agente, dispara o Main Orchestrator junto.**
Nunca invoque workers (build/test/validate) ou sub-orchestrators isoladamente.

Hierarquia obrigatória:

```
Main Orchestrator (Opus)
  └── Sub-Orchestrator por área (Opus)
        └── Workers BUILD → TEST → VALIDATE (Sonnet)
```

A exceção é **tarefa micro** (hotfix de 1 arquivo, edit único, sem coordenação
cross-área): roda direto, sem orquestrador. Critério: se cabe em 1 commit pequeno
sem pré-acordo de naming/migration/conflito, é direto. Se envolve 2+ áreas ou
depende de DAG, passa pelo Main.

## Por que (não é burocracia — é correção)

- **Coerência de contexto** — o Main lê o `{{context_file}}` (fonte da verdade:
  regras, naming, acceptance criteria, DoD) e propaga aos sub-agentes. Worker
  isolado sem orquestrador gera drift de naming, testes triviais, violação de
  regras no merge.
- **Coordenação de DAG** — dependências entre áreas (A→B,C; B→D; etc.) são
  gerenciadas só pelo Main. Spawnar Sub-Orch direto pode violar a ordem e gerar
  conflito de merge ou quebra de contrato.
- **Rebase/merge incremental controlado** — só o Main faz fast-forward na branch
  de integração (`{{branch}}`). Workers e Sub-Orchs ficam em worktree própria.
- **Auditoria** — cada commit tem 1 área = 1 sub-orch responsável. Sem
  orquestrador, rastreabilidade some e revert fica caro.

## Quando 1 agente basta

Tarefas micro NÃO precisam de orquestrador. Exemplos: corrigir typo, ajustar 1
função, add 1 teste isolado. Se a tarefa tocar 2+ áreas ou exigir acordo de
naming/contrato/migration entre áreas, sobe pro Main.

## Anti-padrões (não fazer)

- ❌ Invocar `worker-build` (ou equivalente) direto, sem Sub-Orch → drift de escopo.
- ❌ Invocar Sub-Orch sem passar pelo Main → DAG ignorado, merge conflita.
- ❌ Worker commitando sem aprovação do nível acima (Sub-Orch ou Main).
- ❌ Worker tocando arquivo fora da sua área (`{{area}}`) designada.
- ❌ Stub/marca temporária (`__STUB__`, `TODO-MERGE`, etc.) esquecido no PR final
  — o Main valida via `rg` no rebase final.
- ❌ Pular fases do DAG por pressa.

## Custo (atenção ao custo/benefício)

Orquestração completa consome ~**30×** mais tokens que um agente iterando sozinho.
Benefício: throughput ~**5×** e isolamento de contexto (cada worker vê só sua área).
Para tarefas pequenas, **não** use o sistema completo — custo/benefício negativo.

## Delegação de tools/hooks

O Main Orchestrator pode **autorizar um worker** (escopo explícito no prompt) a:
- Criar scripts em `.opennjord/tools/*.sh` (ex.: helper de validação específico).
- Adicionar entries de hook em `.claude/settings.json` (ex.: lint pós-edit — o
  `settings.json` fica de fato em `.claude/`, real, nunca symlink).

Sem essa autorização explícita, worker não cria tool nem hook — só edita código
da sua área. O escopo deve definir nome do arquivo, comportamento esperado e
quando o hook dispara.

## Roteamento de ferramentas externas

Antes de dividir áreas, o Main lê
`.opennjord/integrations/TOOLS-POLICY.md`. Quando houver gatilho de domínio e a
ferramenta já estiver disponível, deve executar uma chamada escopada:
OpenViking para contexto histórico, Graphify para relações do código e Archify
para diagramas autorados. Depois, confirma a evidência com `path:linha`.

Se a ferramenta estiver ausente, falhar ou tiver baixa confiança, o Main aplica
o fallback da política e continua. Nunca instala durante execução/gate/review,
nunca transforma integração em gate e propaga aos Sub-Orchestrators apenas a
rota escolhida e a evidência confirmada.

## Fluxo padrão (kick-off)

1. Spawnar **Main Orchestrator** com prompt contendo feature, ACs, branches,
   caminho do `{{context_file}}`.
2. Main lê o context file, `TOOLS-POLICY.md` e o blockers file.
3. Main cria/verifica worktrees + branch de integração.
4. Main spawna **Sub-Orchestrators** seguindo o DAG (paralelo onde permite).
5. Cada Sub-Orch spawna seus 3 Workers sequencialmente: **BUILD → TEST → VALIDATE**.
6. Workers devolvem JSON estruturado ao Sub-Orch; Sub-Orch consolida e devolve ao Main.
7. Main faz merge incremental na branch de integração após cada área DONE.
8. Bloqueios escalados via blockers file; Main reorganiza ondas ou pede intervenção.

## Templates disponíveis

| Template | Modelo | Papel |
|----------|--------|-------|
| `main-orchestrator.md.tpl` | Opus | Raiz: lê contexto, gerencia worktrees, DAG, merge incremental, PR final |
| `sub-orchestrator.md.tpl` | Opus | UMA área; coordena BUILD→TEST→VALIDATE; devolve JSON consolidado |
| `worker-build.md.tpl` | Sonnet | Implementa arquivos; garante check verde + Regra 1 |
| `worker-test.md.tpl` | Sonnet | Testes table-driven; cobre ≥84% |
| `worker-validate.md.tpl` | Sonnet | Mutation + checks estruturais (Clean Arch, tamanho, contratos) |

## Como instanciar

Substitua os marcadores `{{...}}` ao instanciar:
- `{{feature}}` — nome/descrição da feature ou refactor.
- `{{area}}` — slug da área (ex.: `auth`, `billing`, `ui-checkout`).
- `{{ac}}` — acceptance criteria (lista ou path p/ arquivo).
- `{{branch}}` — branch de integração base.
- `{{context_file}}` — path absoluto do arquivo de contexto da orquestração.
