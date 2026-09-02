# Agentes — convenção de uso

## Regra principal

**Sempre que rodar agentes, dispara o orquestrador junto.** Não invoque workers (build/test/validate) ou sub-orchestrators isolados.

Hierarquia obrigatória:

```
Main Orchestrator (Opus 4.7)
  └── Sub-Orchestrator de área (Opus 4.7)
        └── Workers BUILD → TEST → VALIDATE (Sonnet)
```

## Por que

- **Coerência de contexto**: o orquestrador lê `_orchestration/context.md` e propaga naming, ACs, DoD pros sub-agentes. Worker isolado sem orquestrador = drift de naming, testes triviais, Rule 1 violada no merge.
- **Coordenação de DAG**: dependências entre áreas (1→2,3,4,6,7; 2→3,5; etc.) são gerenciadas pelo Main. Spawnar Sub-Orch direto pode violar ordem.
- **Rebase incremental controlado**: só o Main faz `git merge --ff-only` em `feat/gh-integration-base`. Workers/Sub-Orchs ficam em worktree própria.
- **Auditoria**: cada commit tem 1 área = 1 sub-orch responsável. Sem orquestrador, rastreabilidade some.

## Quando rodar UM agente faz sentido

Tarefas micro (hotfix, edit de 1 arquivo) NÃO precisam de orquestrador. Critério: se cabe em 1 commit pequeno sem coordenação cross-área, é direto. Se envolve 2+ áreas ou pré-acordo de naming/migration/conflito, passa pelo Main.

## Agentes disponíveis

11 arquivos versionados em `.claude/agents/`:

| Agente | Modelo | Papel |
|--------|--------|-------|
| `github-main-orchestrator` | Opus | Coordena 7 sub-orchestrators, gerencia worktrees, rebase incremental |
| `github-sub-area-1-config` | Opus | Config multi-instância |
| `github-sub-area-2-cache` | Opus | DB cache SQLite + metadata |
| `github-sub-area-3-sync` | Opus | Gateway + commands sync |
| `github-sub-area-4-frontend-api` | Opus | Frontend API + cache layer TS |
| `github-sub-area-5-grouping` | Opus | Grouping + tag override |
| `github-sub-area-6-page` | Opus | Página /github redesenhada |
| `github-sub-area-7-dashboard` | Opus | Dashboard + Settings UI |
| `github-worker-build` | Sonnet | Implementa arquivos da área |
| `github-worker-test` | Sonnet | Testes table-driven |
| `github-worker-validate` | Sonnet | Mutation + Clean Arch + file size |

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

1. Spawnar **Main Orchestrator** com prompt contendo feature, ACs, branches.
2. Main lê `_orchestration/context.md` e `blockers.md`.
3. Main cria/verifica worktrees + branch de integração.
4. Main spawna **Sub-Orchestrators** seguindo DAG (paralelo onde permite).
5. Cada Sub-Orch spawna seus 3 Workers sequencialmente (BUILD → TEST → VALIDATE).
6. Workers devolvem JSON ao Sub-Orch; Sub-Orch consolida e devolve ao Main.
7. Main faz rebase incremental em `feat/gh-integration-base` após cada área DONE.
8. Bloqueios escalonados via `_orchestration/blockers.md`.

## Anti-padrões

- Invocar `github-worker-build` direto sem Sub-Orch (drift de escopo).
- Invocar `github-sub-area-N` sem passar pelo Main (DAG ignorado).
- Worker commitando sem aprovação do Sub-Orch.
- Worker tocando arquivo fora da área designada.
- Stub `__STUB__` esquecido em PR final — Main valida via `rg '__STUB__'` no rebase.

## Custo

29 agentes paralelos consomem ~30× mais tokens que um Claude iterando sozinho. Benefício: throughput ~5× e isolamento de contexto. Para tarefas pequenas, NÃO use o sistema completo — vai negativar custo/benefício.
