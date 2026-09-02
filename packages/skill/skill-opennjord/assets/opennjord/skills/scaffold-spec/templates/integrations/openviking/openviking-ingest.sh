#!/usr/bin/env bash
# Ingestão allowlist-first para a POC OpenViking. Dry-run é o default.
set -uo pipefail

MODE=dry-run
ROOT=.
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) MODE=dry-run ;;
    --apply) MODE=apply ;;
    -h|--help)
      echo "uso: $0 [--dry-run|--apply] <raiz-do-projeto>"; exit 0 ;;
    -*) echo "opção desconhecida: $1" >&2; exit 2 ;;
    *) ROOT="$1" ;;
  esac
  shift
done

ROOT_REAL=$(cd "$ROOT" 2>/dev/null && pwd -P) || {
  echo "FAIL: projeto inacessível: $ROOT" >&2; exit 2; }
[ -d "$ROOT_REAL/.spec" ] || {
  echo "FAIL: .spec ausente; informe um projeto consumidor scaffoldado" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || {
  echo "FAIL: python3 é obrigatório" >&2; exit 2; }

if [ "$MODE" = apply ]; then
  command -v ov >/dev/null 2>&1 || {
    echo "FAIL: CLI ov ausente" >&2; exit 2; }
fi

PROJECT=$(basename "$ROOT_REAL" | tr '[:upper:]_' '[:lower:]-' \
  | tr -cd 'a-z0-9.-' | sed 's/^[.-]*//; s/[.-]*$//')
[ -n "$PROJECT" ] || { echo "FAIL: nome de projeto inválido" >&2; exit 2; }
PARENT="viking://resources/esteira/$PROJECT"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

python3 - "$ROOT_REAL" >"$TMP" <<'PY'
from __future__ import annotations
import fnmatch, hashlib, re, sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
spec = root / ".spec"
allowed_roots = [spec / "reference", spec / "discovery", spec / "arquitetura"]
decision_names = {"esteira-state.yaml", "STATE.md", "review-codigo.md", "seguranca.md"}
deny_patterns = (
    ".env*", "*.pem", "*.key", "id_rsa*", "id_ed25519*",
    "secrets*", "*secret*", "credentials*", "*credential*",
)
decision_markers = re.compile(
    r"(?m)^[ \t]*(?:VERDICT:|awaiting:|Status:[ \t]*entregue|"
    r"\|[ \t]*NN[ \t]*✅[ \t]*\|)"
)

def relative(path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()

def denied_name(path: Path) -> bool:
    lower = path.name.lower()
    return any(fnmatch.fnmatch(lower, pattern.lower()) for pattern in deny_patterns)

def under(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False

records: list[tuple[str, str, str, str]] = []
for path in sorted(spec.rglob("*")):
    if not path.is_file() and not path.is_symlink():
        continue
    rel = relative(path)
    if "\n" in rel or "\t" in rel:
        records.append(("REJECTED", "-", rel.replace("\n", "?"), "unsafe-name"))
        continue
    if path.is_symlink():
        records.append(("REJECTED", "-", rel, "symlink"))
        continue
    resolved = path.resolve()
    if not under(resolved, root):
        records.append(("REJECTED", "-", rel, "outside-project"))
        continue
    parts_lower = {part.lower() for part in path.relative_to(spec).parts}
    if path.name in decision_names or "tasks" in parts_lower or "qa" in parts_lower:
        records.append(("REJECTED", "-", rel, "decision-bearing"))
        continue
    if denied_name(path) or ".ssh" in parts_lower or ".aws" in parts_lower:
        records.append(("REJECTED", "-", rel, "sensitive-path"))
        continue
    if "memory" in parts_lower:
        records.append(("REJECTED", "-", rel, "evaluation-output"))
        continue
    if path.suffix.lower() != ".md" or not any(under(resolved, ar.resolve()) for ar in allowed_roots if ar.exists()):
        continue
    data = path.read_bytes()
    if decision_markers.search(data.decode("utf-8", errors="replace")):
        records.append(("REJECTED", "-", rel, "decision-token"))
        continue
    digest = hashlib.sha256(data).hexdigest()
    records.append(("ALLOW", str(resolved), rel, digest))

for record in records:
    print("\t".join(record))
PY

COUNT=0
while IFS=$'\t' read -r STATUS ABS REL META; do
  [ -n "$STATUS" ] || continue
  if [ "$STATUS" = REJECTED ]; then
    printf 'REJECTED %-48s %s\n' "$REL" "$META"
    continue
  fi
  COUNT=$((COUNT + 1))
  if [ "$MODE" = dry-run ]; then
    printf 'WOULD_INGEST %-44s sha256=%s\n' "$REL" "$META"
  else
    printf 'INGESTING %-48s sha256=%s\n' "$REL" "$META"
    ov add-resource "$ABS" --wait --parent-auto-create "$PARENT" || {
      echo "FAIL: ingestão falhou para $REL" >&2; exit 1; }
  fi
done < "$TMP"

[ "$COUNT" -gt 0 ] || {
  echo "FAIL: allowlist vazia; nada foi ingerido" >&2; exit 1; }
printf 'POC_INGEST: mode=%s selected=%s parent=%s\n' "$MODE" "$COUNT" "$PARENT"
