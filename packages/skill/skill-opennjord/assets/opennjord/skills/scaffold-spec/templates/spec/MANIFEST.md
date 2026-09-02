# Spec Manifest — <preencher: nome do projeto>

Ponto de entrada operacional do `.spec/`. Toda sessão de esteira começa aqui.

## Bootstrap de sessão

1. Ler o roteador do agente (`AGENTS.md` / `CLAUDE.md` / equivalente).
2. Ler `.spec/MANIFEST.md` (este arquivo).
3. Ler `.spec/esteira-state.yaml` (cursor — fonte ÚNICA de decisão do tick).
4. Ler `.spec/STATE.md` (diário narrativo humano, append-only).
5. Ler `.spec/sprints/RUNBOOK.md` (contrato do tick e paradas).
6. Ler a sprint apontada por `sprint_ativa` no cursor (se `null`, nada a ler).

## Regra-mãe

<preencher: 1 parágrafo — o contrato que governa o escopo: stack, fonte de
verdade dos dados e o que não muda sem ADR>

## Mapa do `.spec/`

| Caminho | Papel |
|---|---|
| `.spec/esteira-state.yaml` | cursor machine-readable; decide o tick |
| `.spec/STATE.md` | diário narrativo humano (append-only) |
| `.spec/sprints/RUNBOOK.md` | contrato do tick e ordem canônica |
| `.spec/sprints/sprint-NN-<tema>/` | instância de sprint (README, discovery, tasks) |
| `.spec/discovery/` | disciplina 00 + `plano-de-sprints-NN.md` |
| `.spec/arquitetura/` | gates 10a/10b e ADRs derivados |
| `.spec/qa/` | relatórios da disciplina 30 |
| `.spec/reference/` | índice de docs, diagramas e ADRs |

## Regras de execução

Regras de engenharia em `<preencher: dir de regras, ex.: .claude/rules/>` —
mesma fonte para todos os agentes.

## Maquinário de validação

Campos que o tick consulta antes de executar cada etapa:

- **`dev_server`:** `<preencher: comando que sobe o ambiente vivo>` — webview em
  `<preencher: http://localhost:PORTA>` (alvo do `/qa-rpa`).
- **`redteam_target`:** `<preencher: alvo do /redteam — só localhost, 127.0.0.1
  ou rede privada>`.
<!-- CONTRATO DE RUNTIME — a linha logo abaixo não é prosa decorativa.
     O supervisor da esteira decide pular a etapa `deploy` por busca literal
     de substring no corpo deste arquivo (ex.: `prerequisitos_do_repo` em
     `commands/orchestrator/process_runtime.rs`, no host que roda o pipeline).
     Mantida como está: a etapa `deploy` fecha como `done`, sem parada humana.
     Apagada/reescrita: a etapa roda de verdade e exige a skill `deploy`
     instalada + aprovação humana (H6). Só altere quando o projeto realmente
     for publicar em algum ambiente — e apague o comentário junto. -->
- **`deploy`:** **skip** — <preencher: motivo, ex.: app desktop sem produção>.
- **`validacao_worker`:** `<preencher: comando de teste que gera o receipt>`
- Build/lint/teste padrão: `<preencher: comandos do projeto>`
