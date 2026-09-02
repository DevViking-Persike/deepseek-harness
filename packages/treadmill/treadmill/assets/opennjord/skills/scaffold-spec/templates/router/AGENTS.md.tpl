# <projeto> — AGENTS.md (índice mestre)

<1 linha: o que é o projeto + stack>

> Fonte canônica de TODA config de agente: `.opennjord/`. `.claude/`, `.codex/`
> e `.agents/` são espelhos de compatibilidade (symlinks) — nunca edite por eles,
> edite a fonte em `.opennjord/**`.

## Bootstrap (ler nesta ordem)
1. [.spec/MANIFEST.md](.spec/MANIFEST.md) — o que existe e onde
2. [.spec/STATE.md](.spec/STATE.md) — onde a esteira parou
3. [.spec/sprints/RUNBOOK.md](.spec/sprints/RUNBOOK.md) — como avançar

## Esteira (disciplinas — sempre nesta ordem)
- 00 `/discovery` (modos: negocio | dev | refatoracao — seletor na skill) → `.spec/discovery/`
- 10 `/arquitetura [design|review]` → gate bloqueante
- 20 `/desenvolvimento`
- 25 `/review-codigo-subagents`
- 30 `/qa` + `/qa-rpa`
- 40 `/seguranca` + `/redteam` — último portão antes do release

## Mapa da config (`.opennjord/`)
| O que | Onde | Índice |
|---|---|---|
| Regras de engenharia | `.opennjord/rules/eng/` | `.opennjord/rules/README.md` |
| Segurança (invariantes) | `.opennjord/rules/seguranca.md` | — |
| Skills da esteira | `.opennjord/skills/` | 1 `SKILL.md` por skill |
| Commands | `.opennjord/commands/` | `.opennjord/commands/README.md` |
| Agentes (orquestração) | `.opennjord/agents/` | `.opennjord/agents/README.md` — regra: sempre via Main Orchestrator |
| Esteira de qualidade (por diff) | `.opennjord/esteira/` | `.opennjord/esteira/RUNBOOK.md` |
| Stack preset | `.opennjord/stacks/` | `.opennjord/stacks/README.md` |
| Tools de validação | `.opennjord/tools/` | `spec-check.sh`, `esteira-check.sh` |

## Composição externa
Quando houver gatilho de domínio e a ferramenta estiver disponível, siga
`.opennjord/integrations/TOOLS-POLICY.md`; ausência seleciona fallback, nunca gate.

## Ponte de compatibilidade (não editar pelos espelhos)
`.claude/{rules,skills,commands,agents}`, `.agents/skills` e `.codex/` (config)
apontam todos pra `.opennjord/*`. `CLAUDE.md` (raiz) é symlink pra este arquivo.

> Nada operacional aqui — se precisou detalhar, o lugar é o `.spec/` ou uma rule.
