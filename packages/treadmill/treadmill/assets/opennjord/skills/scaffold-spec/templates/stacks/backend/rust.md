# Preset backend — Rust

> Stack: Rust (cargo). Preset copiável; a Camada 2 das regras referencia estes
> comandos. Thresholds ≥ 84% (cobertura + mutation).

## test_cmd

```bash
cargo test
# workspace específico
cargo test --manifest-path Cargo.toml
```

## cov_tool

[cargo-tarpaulin](https://github.com/xd009642/tarpaulin). Threshold ≥ 84%.

```bash
cargo install cargo-tarpaulin
cargo tarpaulin --workspace --out Stdout -- --test-threads=2
```

Para falhar abaixo de 84%:

```bash
cargo tarpaulin --workspace --fail-under 84
```

Alternativa: [cargo-llvm-cov](https://github.com/taiki-e/cargo-llvm-cov)
(mais rápido em alguns cenários).

## mutation_tool

[cargo-mutants](https://github.com/sourcegraph/cargo-mutants). Threshold ≥ 84%.

```bash
cargo install cargo-mutants
cargo mutants --workspace
```

Mutantes sobreviventes abaixo de 84% de eficácia exigem reforço de testes antes
do commit. Se o workspace for muito grande e o custo de mutation no CI for
proibitivo, **fallback**: revisão manual de assertivas por borda (zero/empty/
overflow/`None`), registrada no PR.

## lint_cmd

[clippy](https://github.com/rust-lang/rust-clippy) com warnings como erro:

```bash
cargo clippy --all-targets -- -D warnings
```

## typecheck_cmd

Rust é estaticamente tipado; `cargo check` cobre verificação rápida sem gerar
binário:

```bash
cargo check --all-targets
```

## build_cmd

```bash
cargo build
# release
cargo build --release
```

## run_dev_cmd

```bash
cargo run
# binário específico
cargo run --bin <nome-do-binario>
```

## file_glob

Extensões/roots para a Regra 1 (tamanho, alvo ~300 / teto ~500):

```bash
find . -name '*.rs' -not -path './target/*' | xargs wc -l | sort -rn | awk '$1 > 500'
```

Ignore `target/` (build). Roots típicos: `src/` (crate raiz), `crates/*/src/`
(workspace), `src/domain/`, `src/application/`, `src/infrastructure/`.

## arch_violation_grep

Markers de IO/framework que **não** devem aparecer em `domain/` ou
`application/` (Regras 3/4 — DIP / Clean Architecture). Ajuste o path conforme
o projeto (`ex.:` rotulado).

```bash
# domínio/aplicação não chamam IO bruto ou SDK de framework
rg -l 'tauri::|reqwest::|std::process::Command|std::fs::|tokio::fs::' src/domain/ src/application/

# domínio/aplicação não importam a camada de commands/handlers
rg -l 'crate::.*::commands|crate::.*::handlers' src/domain/ src/application/

# Esperado: saída vazia.
```

Convenção típima Rust: crate raiz com módulos `domain/` (modelo + traits de
port), `application/` (use cases), `infrastructure/` (adapters que implementam
as traits de `domain/`), `commands/` ou `handlers/` (ponte de framework thin).
`infrastructure/` depende de `domain/` via trait, nunca o contrário.

## conventions

- **Idioma**: pt-BR para mensagens de usuário/comentários; inglês para
  identificadores (crate, módulo, tipo, função — `snake_case` para fn/variável,
  `PascalCase` para tipo/trait).
- **Erros**: propagar com `?` e `Result<T, E>`; nunca `unwrap()`/`expect()` em
  código que pode falhar em runtime real; usar `thiserror` para erros de
  domínio, `anyhow` para apps/binários.
- **Traits como ports**: defina a trait em `domain/` (ex.: `pub trait
  UserRepository { ... }`); a implementação concreta (IO/SDK) vive em
  `infrastructure/`. Domínio nunca importa `infrastructure/`.
- **Async**: `tokio` como runtime; funções `async fn` + `.await`; cuidado com
  `.lock()` e `await` misturados (hold curto, soltar antes de await).
- **Ownership**: preferir `&str`/`&[T]` em assinaturas; `String`/`Vec<T>` só
  quando há propriedade. Evitar `.clone()` em hot path — usar `Arc` quando fizer
  sentido compartilhar barato.
- **Testes**: módulo `#[cfg(test)] mod tests` no mesmo arquivo; estilo
  table-driven com `vec![...]` + `.iter().for_each`; `tempfile::TempDir` para
  filesystem; sem IO real em teste de domínio/aplicação.
- **Feature flags**: evitar flags booleanas que mudam comportamento interno
  (Regra 5 do projeto-fonte) — preferir duas funções distintas.
