# Regra 11 — Repositório-fonte do DBX (paridade de features)

O **DBX** é a fonte de verdade para portar funcionalidades de gerenciamento de
banco para o njord (rota `/dados`).

> **Atenção — duas coisas distintas:**
> 1. **Fonte de paridade (read-only)** — o repo externo `/Volumes/HDX/Dev/dbx`,
>    consultado *só para entender comportamento/UX* ao implementar features. Não
>    é dependência de build.
> 2. **Dependência de build (`dbx-core`)** — desde a Sprint 15 é **vendorizada**
>    dentro do repo em `src-tauri/dbx-core/` (cópia versionada, igual ao
>    `mcp-host/`). É ela que o `cargo build` usa. O njord compila em qualquer
>    máquina sem precisar do repo externo.

## Caminho do repositório (fonte de paridade, read-only)

```
/Volumes/HDX/Dev/dbx
```

- **UI (Vue 3) — referência de comportamento/UX:** `/Volumes/HDX/Dev/dbx/apps/desktop/src/components/<área>/`
  (ex.: `connection/`, `editor/`, `grid/`, `transfer/`, `explain/`, `diff/`, `export/`, `import/`).
  É um app single-view (`App.vue`), sem rotas; "telas" = painéis/modais/componentes.
- **Motor (Rust) — drivers e capacidades:** a cópia vendorizada vive em
  `src-tauri/dbx-core/` (ex.: `src/models/connection.rs` define `DatabaseType` e
  `ConnectionConfig`; `src/db/<driver>.rs` os drivers; `src/schema.rs`
  `list_tables_core`). Dependência path em `src-tauri/Cargo.toml`
  (`dbx-core = { path = "dbx-core" }`). O equivalente upstream para comparação
  fica em `/Volumes/HDX/Dev/dbx/crates/dbx-core/`.

> **Drift:** ao precisar de uma capacidade nova do `dbx-core` upstream, copie a
> mudança do `/Volumes/HDX/Dev/dbx/crates/dbx-core/` para `src-tauri/dbx-core/`
> num commit separado (`chore: sync dbx-core vendorizado`). Os patches git do
> workspace do dbx (`[patch.crates-io]` gaussdb/mysql_async) **não** são usados
> pelo njord — não precisa portá-los.

## Como usar ao implementar paridade

1. Ler o componente Vue correspondente **só para entender o comportamento** — NÃO
   copiar código nem cores. Adaptar para Svelte 5 (runes) + tokens semânticos do njord.
2. Para um novo driver de banco: confirmar em `dbx-core` se há `DatabaseType` + driver
   (`src/db/`), depois espelhar o padrão dos runners njord
   (`plugins/datastore/src/infrastructure/dbx/<driver>_runner.rs`) e cobrir
   os match arms exaustivos em `commands/db.rs`, `commands/db_rich_query.rs`,
   `commands/db_rich_schema.rs` + `connection_mapper.rs` + `engine.rs`.
3. Respeitar os contratos: nome/forma serde dos comandos Tauri imutáveis; `DbKind`
   (TS em `src/lib/api/db/db.ts` e Rust em `modules/settings/domain/model/types.rs`)
   precisa casar em ambos os lados.

## Mapa de gap atual

A matriz DBX→njord (telas port/defer/skip) vive em
`.spec/sprints/sprint-11-dbx-visual-parity/gap-matrix.md`.

## Nota de portabilidade

O **build não depende mais** de caminho local: o `dbx-core` é vendorizado em
`src-tauri/dbx-core/` (path interno) desde a Sprint 15, então o njord compila em
qualquer máquina. O caminho `/Volumes/HDX/Dev/dbx` é apenas a **fonte de paridade
read-only** — existe só na máquina do autor; em outra máquina, ajustar este arquivo
se quiser consultar o upstream, mas isso **não bloqueia o build**. Docs antigas
citam `/home/victorpersike/Persike/dbx` (Linux) — considerar stale.
