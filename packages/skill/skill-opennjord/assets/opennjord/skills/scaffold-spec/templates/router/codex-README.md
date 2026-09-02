# Ponte Codex para a config canônica

`.opennjord/**` é a fonte canônica de contexto, regras, skills e agentes deste
projeto. Este diretório `.codex/` é só uma camada de compatibilidade — e o
Codex CLI, na prática, só lê `config.toml` daqui (se existir). Skills o Codex
descobre em `.agents/skills` (não em `.codex/skills`) — ver a raiz `AGENTS.md`.

## Referências

- Regras / skills / agentes / commands: fonte única em `.opennjord/**`
- Instruções do projeto: `AGENTS.md` (raiz) — o Codex lê nativamente, sem symlink
- Skills (Codex): `.agents/skills` → `../.opennjord/skills`

## Uso operacional

Para trabalho com agentes ou subagentes, siga sempre
`.opennjord/agents/README.md`: quando houver orquestração, dispare o Main
Orchestrator e deixe ele coordenar sub-orchestrators e workers. Workers
isolados só fazem sentido para tarefa micro (hotfix pequeno em um arquivo).

Para regras de engenharia e skills, consulte `.opennjord/rules/README.md` e
`.opennjord/skills/`, mas trate tudo como leitura da fonte canônica.

## Regra de edição

Não crie nem edite cópias duplicadas destas referências dentro de `.codex/`.
Quando uma instrução precisar mudar, edite a fonte canônica em
`.opennjord/**` ou `AGENTS.md`; os links deste diretório devem apenas apontar
para ela.
