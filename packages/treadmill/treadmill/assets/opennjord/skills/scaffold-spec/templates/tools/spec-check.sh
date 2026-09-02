#!/usr/bin/env bash
# spec-check.sh — valida a base operacional `.spec/` + a ponte de config
# canônica (`.opennjord/` <-> `.claude`/`.codex`/`.agents`). Checa: arquivos
# obrigatórios presentes em `.opennjord/`, symlinks da ponte íntegros (não
# dirs/arquivos reais divergentes), links .md internos não-quebrados, e avisa
# se o STATE.md parece desatualizado. Exit 1 se houver erro.
# Uso: ./spec-check.sh            (roda na raiz do projeto)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd || pwd)"
[ -d "$ROOT/.spec" ] || ROOT="$(pwd)"
cd "$ROOT"
err=0; warn=0
red(){ printf '\033[31m%s\033[0m\n' "$*"; }; grn(){ printf '\033[32m%s\033[0m\n' "$*"; }; yel(){ printf '\033[33m%s\033[0m\n' "$*"; }

# 1) arquivos obrigatórios (baseline de um scaffold recém-criado — discovery/
#    arquitetura/plano/qa/sprints/sprint-NN-* são populados incrementalmente,
#    não exigidos no dia 1; fonte canônica de config = .opennjord/)
req=(.spec/MANIFEST.md .spec/STATE.md .spec/sprints/RUNBOOK.md .spec/reference/README.md
     .opennjord/rules/README.md .opennjord/rules/eng/01-file-size.md .opennjord/rules/eng/02-unit-tests.md
     .opennjord/rules/eng/03-solid.md .opennjord/rules/eng/04-clean-architecture.md
     .opennjord/rules/eng/05-simplicity.md .opennjord/rules/eng/06-continuous-refactoring.md
     .opennjord/rules/eng/07-build-and-run.md .opennjord/rules/eng/08-delegate-execution.md
     .opennjord/rules/eng/09-responsive-ui.md .opennjord/rules/eng/10-frontend-architecture.md
     .opennjord/rules/eng/11-external-parity-source.md
     .opennjord/rules/seguranca.md .opennjord/rules/fluxo-desenvolvimento.md
     .opennjord/integrations/TOOLS-POLICY.md
     .opennjord/commands/check-rules.md .opennjord/commands/refactor.md
     .opennjord/commands/responsive-pass.md .opennjord/commands/dead-code-cleansing.md)
for f in "${req[@]}"; do
  [ -f "$f" ] || { red "FALTA: $f"; err=1; }
done

# 1b) cada sprint-NN-<tema>/ de desenvolvimento tem README.md; convenção
#     canônica nova (discovery-sprint.md + tasks/) é WARN-only — sprints
#     históricas em layout legado não quebram o check
while IFS= read -r d; do
  [ -f "$d/README.md" ] || { red "FALTA: $d/README.md"; err=1; }
  if ls "$d"/task-*.md >/dev/null 2>&1; then
    yel "AVISO: ${d#./} tem task-*.md na raiz — tasks fora de tasks/ (layout legado; novas sprints usam tasks/)."; warn=1
  fi
  if [ -d "$d/tasks" ] && [ ! -f "$d/discovery-sprint.md" ]; then
    yel "AVISO: ${d#./} tem tasks/ mas não tem discovery-sprint.md ao lado (novas sprints abrem com /discovery sprint <NN>)."; warn=1
  fi
done < <(find .spec/sprints -mindepth 1 -maxdepth 1 -type d -name 'sprint-*' 2>/dev/null)

# 1c) ponte .opennjord <-> .claude/.codex/.agents — symlinks íntegros, não cópias
is_symlink_to_opennjord() {
  local path="$1" target
  [ -L "$path" ] || return 1
  target="$(readlink "$path")"
  case "$target" in *.opennjord*) return 0 ;; *) return 1 ;; esac
}
for d in rules skills commands agents; do
  p=".claude/$d"
  [ -e "$p" ] || { red "FALTA (symlink): $p"; err=1; continue; }
  is_symlink_to_opennjord "$p" || { red "DRIFT: $p deveria ser symlink -> ../.opennjord/$d (achei dir/arquivo real)"; err=1; }
done
if [ -e .agents/skills ]; then
  is_symlink_to_opennjord .agents/skills || { red "DRIFT: .agents/skills deveria ser symlink -> ../.opennjord/skills"; err=1; }
else
  red "FALTA (symlink): .agents/skills (é aqui que o Codex descobre skills, não .codex/skills)"; err=1
fi
if [ -e .claude/CLAUDE.md ] && [ ! -L .claude/CLAUDE.md ]; then
  red "DRIFT: .claude/CLAUDE.md existe como arquivo REAL — não deveria existir (só CLAUDE.md/AGENTS.md na raiz)"; err=1
fi
if [ -f .gitignore ] && ! grep -qxF '.claude/settings.local.json' .gitignore; then
  yel "AVISO: .claude/settings.local.json não está no .gitignore (é local/pessoal, nunca deveria versionar)."; warn=1
fi

# 2) links .md internos quebrados (dentro de .spec/). Tenta relativo ao
#    diretório do arquivo-fonte primeiro (convenção `./sibling.md`); se não
#    existir, tenta relativo à RAIZ do repo (convenção comum nos docs da
#    esteira: `.spec/MANIFEST.md`, `.claude/rules/x.md` já vêm root-relative).
while IFS= read -r src; do
  dir=$(dirname "$src")
  while IFS= read -r l; do
    case "$l" in http*|\#*|"") continue;; esac
    rel="${l%%#*}"
    t_local="$dir/$rel"
    [ -e "$t_local" ] || [ -e "$rel" ] || { red "LINK QUEBRADO: ${src#./} -> $l"; err=1; }
  done < <(grep -oE '\]\(([^)]+\.md)\)' "$src" 2>/dev/null | sed -E 's/\]\(([^)]+)\)/\1/')
done < <(find .spec -name '*.md' 2>/dev/null)

# 3) STATE.md desatualizado? (heurística: ainda com placeholders e sem incremento)
if [ -f .spec/STATE.md ] && grep -q 'nenhum incremento ativo' .spec/STATE.md; then
  yel "AVISO: .spec/STATE.md sem incremento ativo (ok se o projeto está recém-scaffoldado)."; warn=1
fi

# 4) AGENTS.md (o índice mestre real) aponta pro .spec?
if [ -f AGENTS.md ] && ! grep -q '.spec/MANIFEST.md' AGENTS.md; then
  yel "AVISO: AGENTS.md não aponta para .spec/MANIFEST.md (deveria ser o índice mestre)."; warn=1
fi

# 5) CLAUDE.md (raiz) precisa ser symlink -> AGENTS.md (zero drift, ver §2 da análise)
if [ -e CLAUDE.md ]; then
  if [ -L CLAUDE.md ]; then
    case "$(readlink CLAUDE.md)" in
      AGENTS.md) : ;;
      *) red "DRIFT: CLAUDE.md é symlink mas não aponta pra AGENTS.md"; err=1 ;;
    esac
  else
    red "DRIFT: CLAUDE.md deveria ser symlink -> AGENTS.md (achei arquivo real — risco de divergência)"; err=1
  fi
fi

# 6) AGENTS.md — checagem positiva dos 3 links de bootstrap + guard de tamanho
#    (índice mestre é ponteiro fino, não manual — e o Codex concatena com teto
#    de 32 KiB, então precisa ficar curto)
if [ -f AGENTS.md ]; then
  for bootstrap in '.spec/MANIFEST.md' '.spec/STATE.md' '.spec/sprints/RUNBOOK.md'; do
    grep -q "$bootstrap" AGENTS.md || { red "AGENTS.md SEM LINK DE BOOTSTRAP: $bootstrap"; err=1; }
  done
  grep -q '.opennjord/integrations/TOOLS-POLICY.md' AGENTS.md \
    || { red "AGENTS.md SEM POLÍTICA DE ROTEAMENTO: .opennjord/integrations/TOOLS-POLICY.md"; err=1; }
  lines=$(wc -l < AGENTS.md | tr -d ' ')
  if [ "$lines" -gt 60 ]; then
    yel "AVISO: AGENTS.md tem $lines linhas (> 60) — índice gordo, mova conteúdo pro .spec/ ou pra uma rule."; warn=1
  fi
fi

echo
[ "$err" = 0 ] && grn "spec-check: OK (estrutura íntegra, 0 link quebrado)${warn:+ — $warn aviso(s))}" \
              || red "spec-check: FALHOU — corrija os erros acima."
exit "$err"
