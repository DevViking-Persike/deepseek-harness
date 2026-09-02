---
name: check-rules
description: Auditar o repositório contra as regras em .claude/rules/
---

Rode uma auditoria do repositório contra as regras de engenharia em `.claude/rules/`.

Leia os arquivos de regras antes de começar:
- `.claude/rules/eng/01-file-size.md`
- `.claude/rules/eng/02-unit-tests.md`
- `.claude/rules/eng/03-solid.md`
- `.claude/rules/eng/04-clean-architecture.md`
- `.claude/rules/eng/05-simplicity.md`
- `.claude/rules/eng/06-continuous-refactoring.md`
- `.claude/rules/eng/07-build-and-run.md`
- `.claude/rules/eng/08-delegate-execution.md`

## Checagens

### Regra 1 — Tamanho (≤ 300 linhas)
```bash
find src src-tauri/src -type f \( -name '*.rs' -o -name '*.svelte' -o -name '*.ts' \) -exec wc -l {} + | sort -rn | awk '$1 > 300'
```
Liste violações ordenadas. Sugira split por responsabilidade (sem editar).

### Regra 2 — Testes
```bash
cd src-tauri && cargo test --lib
cd src-tauri && cargo test 2>&1 | grep -E 'test result|running 0 tests'
# Cobertura (se cargo-tarpaulin instalado):
cd src-tauri && cargo tarpaulin --out Stdout 2>&1 | tail -20
# Mutation (se cargo-mutants instalado):
cd src-tauri && cargo mutants --shard 1/4 2>&1 | tail -20
# Frontend (se vitest configurado):
npx vitest run --reporter=verbose 2>&1 | tail -10
```
Reporte pacotes < 84% de cobertura e eficácia de mutation < 84%.

### Regra 3 — SOLID (sinais automáticos)
```bash
# Gateways não devem importar tauri:
rg -l '\btauri::' src-tauri/src/gateways/ src-tauri/src/app/ 2>/dev/null
# UI Svelte não importa src-tauri:
rg -l '../src-tauri/' src/ 2>/dev/null
# Componentes Svelte gigantes (sinal de SRP fraco):
find src -name '*.svelte' -exec wc -l {} + | sort -rn | head -5
```
Qualquer hit é candidato a refatorar.

### Regra 4 — Clean Architecture (imports)
```bash
rg -l 'use crate::commands' src-tauri/src/gateways/ src-tauri/src/config/ 2>/dev/null
rg -l '@tauri-apps/api' src/lib/components/ 2>/dev/null
# Frontend só fala com backend via src/lib/api/, não direto:
rg -l "invoke\(" src/lib/components/ src/routes/ 2>/dev/null | xargs -I{} grep -L '$lib/api' {} 2>/dev/null
```
Hits significam violação ou exceção a justificar.

### Regra 5 — Simplicidade
- 5 maiores funções por linhas em Svelte/Rust — destacar (não editar):
```bash
awk '/^(pub )?(async )?fn |^pub fn / {fn=$0; lines=0} {lines++} /^}/ {if (fn) print FILENAME":"FNR-lines+1": "lines" linhas: "fn; fn=""}' src-tauri/src/**/*.rs 2>/dev/null | sort -t: -k3 -rn | head -5
```
- Amostragem de comentários que descrevem o *quê* em vez do *porquê*.

### Build sanity
```bash
cd src-tauri && cargo check --message-format=short
cd src-tauri && cargo clippy --all-targets -- -D warnings
npm run check
npm run build
```

## Formato do relatório

Markdown, uma seção por regra:
- ✅ conforme / ⚠️ violação pequena / ❌ bloqueante
- Contagem agregada no topo
- Top 3 próximos passos priorizados

**Não edite arquivos.** Para corrigir, o usuário chama `/refactor <arquivo>`.
