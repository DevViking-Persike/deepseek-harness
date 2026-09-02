# Regra 1 — Tamanho de arquivo

**Alvo ~300 linhas, teto ~500 linhas por arquivo `.rs`, `.svelte` ou `.ts`** (incluindo arquivos de teste, excluindo linhas em branco).

- **≤ 300**: confortável, sem ação.
- **300–500**: zona de atenção — aceitável, mas refatore quando for mexer no arquivo se a divisão for natural.
- **> 500**: violação — refatore antes de adicionar feature, ou justifique explicitamente no commit/PR.

## Motivação
Arquivo grande mistura responsabilidades, dificulta revisão e esconde acoplamento. O teto de ~500 dá folga para componentes/stores coesos sem virar desculpa para arquivos-monstro.

## Como aplicar
- Ao abrir um arquivo, se já passa de ~450 linhas, refatorar antes de adicionar feature.
- Split por responsabilidade:
  - Rust: `<feature>.rs`, `<feature>_<subresponsibility>.rs`, ou submódulo `<feature>/mod.rs` + arquivos.
  - Svelte: extrair subcomponentes `Foo.svelte` + `FooHeader.svelte`, e mover lógica para `foo.ts`.
  - TypeScript: split por responsabilidade `foo.ts`, `foo_validation.ts`.
- Teste também — se arquivo de teste crescer, dividir por cenário (`foo_happy_test.rs`, `foo_error_test.rs`, ou `foo.test.ts` + `foo.error.test.ts`).
- Componente Svelte: contar linhas do arquivo inteiro (`<script>`, markup, `<style>`). Passou de ~500, é hora de quebrar.

## Exceções aceitas
- `src-tauri/mcp-host/` — crate de infraestrutura do servidor MCP (host
  IDE/tools), mantido como unidade à parte. Isento desta regra por decisão
  explícita; auditorias (`/check-rules`) devem ignorá-lo.
- `src-tauri/dbx-core/` — crate **vendorizado** (cópia do `dbx-core` upstream,
  ver Regra 11). Código de terceiro, não nosso; isento desta regra. Auditorias
  (`/check-rules`) devem ignorá-lo.

## Como verificar
```bash
# Rust (app principal; mcp-host é exceção) — lista violações (> 500)
find src-tauri/src -name '*.rs' -not -path '*/target/*' -exec wc -l {} + | sort -rn | awk '$1 > 500'

# Svelte / TypeScript — lista violações (> 500)
find src -name '*.svelte' -o -name '*.ts' | xargs wc -l | sort -rn | awk '$1 > 500'
```
