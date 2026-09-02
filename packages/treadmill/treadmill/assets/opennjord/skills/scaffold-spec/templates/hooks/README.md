# Hooks recomendados para Claude Code (opt-in)

Hooks que ajudam a **entregar o projeto claro e funcionando** — validam a base
`.spec/` automaticamente. **Não são auto-aplicados** (mexer no `settings.json` é
intrusivo); instale conscientemente.

## O que fazem
- **PreToolUse (`njord-ask-permission`)** — guarda de arquivos das runs
  njord/esteira. NEGA acesso a paths sensíveis (chaves SSH, credenciais AWS,
  keychain, `~/.config/njord/secrets.yaml`) e PERGUNTA em escrita fora do
  workspace (numa run autônoma da esteira — `bypassPermissions` num worktree —
  isso vira bloqueio: o agente não escapa do worktree; interativo, o dono
  decide no prompt). Escrita em tmp e `~/.claude` segue liberada; no resto o
  hook fica em silêncio e o fluxo normal de permissão decide. Fail-open.
  Requer `python3` (stdlib apenas). Desligar pontualmente: `NJORD_HOOK_MODE=off`.
- **Stop** — ao terminar um turno, roda `spec-check.sh` (estrutura + links). Se
  falhar, imprime um aviso (não bloqueia).
- **PostToolUse (Write|Edit)** — ao editar um arquivo sob `.spec/`, revalida os
  links/estrutura na hora. Requer `jq`.

## Instalar
Mescle o conteúdo de `settings.hooks.json` no `.claude/settings.json` do projeto
(some o objeto `hooks`; **não** substitua o arquivo). No projeto há a skill
`update-config` para isso — ou edite à mão:

```bash
# pré-requisito da guarda: o script no canônico (o scaffold já copia; via python3,
# não precisa de chmod +x)
ls .opennjord/hooks/njord-ask-permission
# pré-requisito: a tool instalada em .opennjord/tools/spec-check.sh (NÃO symlinkado
# em .claude/ — o comando do hook aponta direto pro canônico via ${CLAUDE_PROJECT_DIR})
ls .opennjord/tools/spec-check.sh
# depois, adicione o bloco "hooks" de settings.hooks.json ao seu .claude/settings.json
```

> O bloco **PreToolUse** é o recomendado pra qualquer projeto que roda a
> esteira (guarda worktree + segredos). Dos hooks de spec, só o **Stop** já
> cobre o essencial (valida no fim de cada turno); o **PostToolUse** é mais
> imediato mas mais verboso — opcional.
