#!/usr/bin/env bash
# Smoke não destrutivo da POC OpenViking. Não lê configs nem imprime segredos.
set -uo pipefail

ROOT="${1:-.}"
URL="${OPENVIKING_URL:-http://127.0.0.1:1933}"
DATA_DIR="${OPENVIKING_POC_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/openviking/esteira-poc}"
FAIL=0

ok() { printf 'OK:   %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1"; FAIL=1; }

ROOT_REAL=$(cd "$ROOT" 2>/dev/null && pwd -P) || {
  printf 'FAIL: projeto inacessível: %s\n' "$ROOT"; exit 2; }
[ -d "$ROOT_REAL/.spec" ] || {
  printf 'FAIL: .spec ausente; informe um projeto consumidor scaffoldado\n'; exit 2; }

case "$URL" in
  http://127.0.0.1:*|http://localhost:*) ok "endpoint restrito a loopback" ;;
  *) fail "endpoint fora de loopback não é permitido nesta POC" ;;
esac

if command -v python3 >/dev/null 2>&1; then
  ok "python3 disponível"
else
  fail "python3 ausente"
fi
if command -v openviking-server >/dev/null 2>&1; then
  ok "openviking-server disponível"
else
  fail "openviking-server ausente"
fi
if command -v ov >/dev/null 2>&1; then
  ok "CLI ov disponível"
else
  fail "CLI ov ausente"
fi
if command -v curl >/dev/null 2>&1; then
  ok "curl disponível"
else
  fail "curl ausente"
fi

DATA_PARENT=$(dirname "$DATA_DIR")
mkdir -p "$DATA_PARENT" 2>/dev/null || true
DATA_REAL=$(cd "$DATA_PARENT" 2>/dev/null && pwd -P)/$(basename "$DATA_DIR")
case "$DATA_REAL/" in
  "$ROOT_REAL"/*) fail "store da POC ficaria dentro do projeto" ;;
  *) ok "store proposto fora do projeto: $DATA_REAL" ;;
esac

for settings in "$ROOT_REAL/.claude/settings.json" "$ROOT_REAL/.claude/settings.local.json"; do
  if [ -f "$settings" ] && grep -q 'openviking-memory' "$settings" 2>/dev/null; then
    fail "plugin de memória automática referenciado em ${settings#$ROOT_REAL/}"
  fi
done

if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 3 "$URL/health" >/dev/null 2>&1; then
    ok "/health respondeu"
  else
    fail "/health indisponível"
  fi
fi

if [ "$FAIL" -eq 0 ]; then
  printf 'POC_CHECK: READY\n'
else
  printf 'POC_CHECK: NOT_READY\n'
fi
exit "$FAIL"
