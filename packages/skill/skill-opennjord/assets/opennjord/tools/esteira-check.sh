#!/usr/bin/env bash
# esteira-check.sh — valida a esteira de qualidade (templates de engenharia do scaffold-spec).
#
# 4 frentes:
#   1. Agnosticidade LLM  — sem $ARGUMENTS / !`cmd` / allowed-tools no CORPO dos runbooks.
#   2. Resíduo njord       — src-tauri/dbx/surreal/$modules só como exemplo rotulado (ex.:).
#   3. Estrutura           — todo template ≤ 300 linhas; artefatos obrigatórios presentes.
#   4. Smoke install       — cp dos templates p/ tmpdir; arquivos esperados presentes.
#
# Uso:  bash esteira-check.sh [templates-dir]
#   Sem arg: valida os templates ao lado do script (manutenção do repo esteira-skills).
#   Com arg: valida o dir informado (ex.: .opennjord/skills/scaffold-spec/templates de um consumer).
# Requer: rg (ripgrep), find, wc, mktemp.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES="${1:-}"
if [ -z "$TEMPLATES" ]; then
  # Procura candidatos: repo-fonte (tools/ dentro de templates/) ou install consumer.
  for cand in "$SCRIPT_DIR/.." "$SCRIPT_DIR/../skills/scaffold-spec/templates" "$SCRIPT_DIR/../templates"; do
    if [ -f "$cand/_STYLE.md" ]; then TEMPLATES="$cand"; break; fi
  done
fi

[ -n "$TEMPLATES" ] && [ -d "$TEMPLATES" ] || {
  echo "FAIL: templates dir não encontrado (use: bash esteira-check.sh <templates-dir>)"; exit 2; }

FAIL=0
section() { printf '\n=== %s ===\n' "$1"; }
ok()      { printf 'OK:   %s\n' "$1"; }
fail()    { printf 'FAIL: %s\n' "$1"; FAIL=1; }

ENG_RULES="$TEMPLATES/rules/eng"
STACKS="$TEMPLATES/stacks"
ESTEIRA="$TEMPLATES/esteira"
AGENTS="$TEMPLATES/agents"
CMD="$TEMPLATES/commands/eng"
REFERENCE="$TEMPLATES/reference"
INTEGRATIONS="$TEMPLATES/integrations"
TOOLS_POLICY="$INTEGRATIONS/TOOLS-POLICY.md"
OPENVIKING="$INTEGRATIONS/openviking"
ROUTER="$TEMPLATES/router/AGENTS.md.tpl"

check_quality_stages() {
  root="$1"
  label="$2"
  missing=""
  legacy=""

  for f in Q00-check Q10-refactor Q20-test-cov-mutation Q30-review; do
    [ -f "$root/stages/$f.md" ] || missing="$missing $f.md"
  done
  for f in 00-check 10-refactor 20-test-cov-mutation 30-review; do
    [ ! -e "$root/stages/$f.md" ] || legacy="$legacy $f.md"
  done

  count=$(find "$root/stages" -maxdepth 1 -type f -name '*.md' 2>/dev/null | wc -l)
  count=$((count + 0))
  if [ -z "$missing" ] && [ -z "$legacy" ] && [ "$count" -eq 4 ]; then
    ok "$label: 4 etapas Q00–Q30 presentes; 0 nome legado"
  else
    fail "$label: contrato das etapas inválido (total=$count; ausentes:${missing:- nenhum}; legados:${legacy:- nenhum})"
  fi
}

# ---------- Frente 1 — Agnosticidade LLM ----------
section "Frente 1 — Agnosticidade LLM (corpo dos 4 runbooks)"
for f in check-rules refactor responsive-pass dead-code-cleansing; do
  file="$CMD/$f.md"
  [ -f "$file" ] || { fail "$f.md ausente"; continue; }
  # $ARGUMENTS e !`cmd` (dynamic context) são proibidos no corpo (sintaxe Claude-only).
  needle='$ARGUMENTS'; dynctx='!`'
  hits=$(grep -nF -e "$needle" -e "$dynctx" "$file" 2>/dev/null || true)
  [ -z "$hits" ] && ok "$f.md: corpo LLM-agnostic" || fail "$f.md tem tokens Claude no corpo:\n$hits"
done

# ---------- Frente 2 — Resíduo njord ----------
section "Frente 2 — Resíduo njord (só permitido em linha com 'ex.')"
# Linhas com src-tauri/dbx/surreal/$modules/$studio/tauri:: SEM 'ex.' são resíduo.
res=$(grep -rnE 'src-tauri|dbx|surreal|notebook_njord|\$modules|\$studio' \
  "$ENG_RULES" "$STACKS" "$ESTEIRA" "$AGENTS" "$CMD" "$INTEGRATIONS" 2>/dev/null \
  | grep -vE 'ex\.|exemplo|rotulad|ilustra|prescri' || true)
[ -z "$res" ] && ok "0 resíduo njord (fora de 'ex.')" || fail "resíduo njord encontrado:\n$res"

# ---------- Frente 3 — Estrutura ----------
section "Frente 3 — Estrutura (≤300 linhas + artefatos obrigatórios)"
over=""
for d in "$ENG_RULES" "$STACKS" "$ESTEIRA" "$AGENTS" "$CMD" "$REFERENCE" "$INTEGRATIONS"; do
  [ -d "$d" ] || { fail "dir ausente: $d"; continue; }
  while IFS= read -r f; do
    lines=$(wc -l < "$f")
    [ "$lines" -gt 300 ] && over="$over\n$f: $lines linhas"
  done < <(find "$d" -type f \( -name '*.md' -o -name '*.tpl' \))
done
[ -z "$over" ] && ok "todos os templates ≤ 300 linhas" || fail "arquivos >300:$over"

[ -f "$TEMPLATES/_STYLE.md" ] && ok "_STYLE.md presente" || fail "_STYLE.md ausente"
for r in 01-file-size 02-unit-tests 03-solid 04-clean-architecture 05-simplicity \
         06-continuous-refactoring 07-build-and-run 08-delegate-execution \
         09-responsive-ui 10-frontend-architecture 11-external-parity-source; do
  [ -f "$ENG_RULES/$r.md" ] || fail "rules/eng/$r.md ausente"
done
{ [ -f "$ENG_RULES/README.md" ] && [ -f "$ENG_RULES/_layer-guide.md" ]; } \
  && ok "rules/eng: índice + _layer-guide presentes" || fail "rules/eng: README/_layer-guide ausentes"
[ -f "$ESTEIRA/RUNBOOK.md" ] && ok "esteira/RUNBOOK presente" || fail "esteira/RUNBOOK ausente"
check_quality_stages "$ESTEIRA" "esteira/stages na fonte"
[ -f "$AGENTS/README.md" ] && ok "agents/README presente" || fail "agents/README ausente"
[ -f "$REFERENCE/README.md" ] && ok "reference/README presente" || fail "reference/README ausente"
[ -f "$TOOLS_POLICY" ] && ok "integrations/TOOLS-POLICY.md presente" || fail "integrations/TOOLS-POLICY.md ausente"
[ -f "$ROUTER" ] && grep -q 'integrations/TOOLS-POLICY.md' "$ROUTER" 2>/dev/null \
  && ok "router aponta para TOOLS-POLICY.md" || fail "router sem ponte para TOOLS-POLICY.md"
grep -q 'integrations/TOOLS-POLICY.md' "$AGENTS/README.md" 2>/dev/null \
  && ok "agents/README propaga TOOLS-POLICY.md" || fail "agents/README sem TOOLS-POLICY.md"
for needle in Graphify OpenViking Archify 'path:linha' fallback 'nunca são gate' 'não instale'; do
  grep -qiF -- "$needle" "$TOOLS_POLICY" 2>/dev/null \
    || fail "TOOLS-POLICY.md sem contrato obrigatório: $needle"
done

for f in README.md RUNBOOK.md openviking-doctor.sh openviking-ingest.sh poc-report.md.tpl; do
  [ -f "$OPENVIKING/$f" ] || fail "integrations/openviking/$f ausente"
done
if [ -x "$OPENVIKING/openviking-doctor.sh" ] && [ -x "$OPENVIKING/openviking-ingest.sh" ]; then
  ok "OpenViking: scripts executáveis"
else
  fail "OpenViking: scripts sem bit executável"
fi
openviking_syntax=1
for script in "$OPENVIKING/openviking-doctor.sh" "$OPENVIKING/openviking-ingest.sh"; do
  bash -n "$script" 2>/dev/null || openviking_syntax=0
done
[ "$openviking_syntax" -eq 1 ] \
  && ok "OpenViking: sintaxe shell válida" || fail "OpenViking: sintaxe shell inválida"
decision_tokens=$(grep -rnE '^[[:space:]]*(VERDICT:|awaiting:|Status:[[:space:]]*entregue|\|[[:space:]]*NN[[:space:]]*✅[[:space:]]*\|)' \
  "$INTEGRATIONS" 2>/dev/null || true)
[ -z "$decision_tokens" ] \
  && ok "Integrações: 0 token de decisão em início de linha" \
  || fail "Integrações: token decision-bearing encontrado:
$decision_tokens"

# ---------- Frente 4 — Smoke install ----------
section "Frente 4 — Smoke install (cp -L p/ tmpdir, layout .opennjord/ + ponte .claude)"
TMP="$(mktemp -d)"
mkdir -p "$TMP/.opennjord"/{rules/eng,commands,stacks,esteira,agents,integrations} "$TMP/.spec/reference"
cp -RL "$ENG_RULES/." "$TMP/.opennjord/rules/eng/" 2>/dev/null || true
cp -RL "$CMD/."       "$TMP/.opennjord/commands/" 2>/dev/null || true
cp -RL "$STACKS/."    "$TMP/.opennjord/stacks/" 2>/dev/null || true
cp -RL "$ESTEIRA/."   "$TMP/.opennjord/esteira/" 2>/dev/null || true
cp -RL "$AGENTS/."    "$TMP/.opennjord/agents/" 2>/dev/null || true
cp -RL "$INTEGRATIONS/." "$TMP/.opennjord/integrations/" 2>/dev/null || true
cp -L "$REFERENCE/README.md" "$TMP/.spec/reference/README.md" 2>/dev/null || true
check_quality_stages "$TMP/.opennjord/esteira" "esteira/stages no smoke install"
# ponte .claude/ — mesma mecânica (symlink relativo por-subdiretório) que o instalador real cria
mkdir -p "$TMP/.claude"
for d in rules commands agents; do ln -s "../.opennjord/$d" "$TMP/.claude/$d"; done
n_rules=$(find "$TMP/.opennjord/rules/eng" -name '[0-9]*-*.md' | wc -l)
{ [ "$n_rules" -ge 11 ] && [ -f "$TMP/.opennjord/esteira/RUNBOOK.md" ] && [ -d "$TMP/.opennjord/stacks/backend" ] \
  && [ -f "$TMP/.opennjord/agents/README.md" ] && [ -f "$TMP/.spec/reference/README.md" ] \
  && [ -f "$TMP/.opennjord/integrations/TOOLS-POLICY.md" ] \
  && [ -x "$TMP/.opennjord/integrations/openviking/openviking-ingest.sh" ] \
  && [ -f "$TMP/.opennjord/integrations/openviking/poc-report.md.tpl" ] \
  && [ -L "$TMP/.claude/rules" ] && [ -f "$TMP/.claude/rules/eng/01-file-size.md" ]; } \
  && ok "smoke: $n_rules rules + esteira + stacks + agents + reference + integrações instalados; ponte .claude resolve" \
  || fail "smoke: instalação incompleta (rules=$n_rules)"

# dry-run da POC: um Markdown permitido; segredo/cursor/task devem ser rejeitados.
POC="$TMP/poc-consumer"
mkdir -p "$POC/.spec"/{reference/memory,discovery,arquitetura,sprints/sprint-01/tasks}
printf '# ADR de teste\n' > "$POC/.spec/reference/ADR-001.md"
printf 'SECRET=x\n' > "$POC/.spec/reference/.env"
printf 'private\n' > "$POC/.spec/reference/server.key"
printf '# Resultado POC\n' > "$POC/.spec/reference/memory/openviking-poc.md"
printf 'schema: 1\n' > "$POC/.spec/esteira-state.yaml"
printf '# Arquitetura\n\nVERDICT: PASS\n' > "$POC/.spec/arquitetura/arquitetura-01.md"
printf '# task\n' > "$POC/.spec/sprints/sprint-01/tasks/task.md"
poc_out=$(bash "$TMP/.opennjord/integrations/openviking/openviking-ingest.sh" --dry-run "$POC" 2>&1)
if [ "$?" -eq 0 ]   && [ "$(printf '%s\n' "$poc_out" | grep -c '^WOULD_INGEST ')" -eq 1 ]   && [ "$(printf '%s\n' "$poc_out" | grep -c '^REJECTED ')" -eq 6 ]   && printf '%s\n' "$poc_out" | grep -q 'POC_INGEST: mode=dry-run selected=1'; then
  ok "OpenViking: dry-run rejeitou segredo, cursor, task, gate e relatório POC"
else
  fail "OpenViking: dry-run inseguro ou inesperado:
$poc_out"
fi
rm -rf "$TMP"

printf '\n'
if [ "$FAIL" -eq 0 ]; then echo "✅ esteira-check PASSOU (4 frentes)"; else echo "❌ esteira-check FALHOU"; fi
exit "$FAIL"
