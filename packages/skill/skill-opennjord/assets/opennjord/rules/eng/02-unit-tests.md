# Regra 2 — Testes unitários + mutation

Toda função pública nova precisa de teste. Funções privadas relevantes também. Vale para Rust e para o frontend Svelte/TypeScript.

## Critérios (bloqueantes)
- Cobertura por pacote/módulo testável: **≥ 84%**
  - Rust: `cargo tarpaulin` (ou equivalente) por crate.
  - Frontend: `vitest` com cobertura via `vitest --coverage` por diretório.
- Eficácia de mutation testing: **≥ 84%**
  - Rust: `cargo mutants`.
  - Frontend: `stryker` (quando disponível); na ausência, reforçar testes via revisão manual de assertivas.
- **Mutation roda sempre junto com os testes**. Se a eficácia cair abaixo de 84%, o teste precisa ser fortalecido antes do commit.
- Quebra de teste bloqueia commit — nunca desabilite (`#[ignore]`, `it.skip`, `test.skip`) para passar CI.
- Filesystem em teste: usar `tempfile::TempDir` (Rust) ou `tmp` do `vitest`/`os.tmpdir()`. Nunca escreva fora do tempdir.
- Estilo table-driven quando há múltiplos casos (vetor de structs em Rust, `it.each` no `vitest`).

## Como verificar
```bash
# Rust
cargo test --manifest-path src-tauri/Cargo.toml
cargo tarpaulin --manifest-path src-tauri/Cargo.toml --out Stdout
cargo mutants --manifest-path src-tauri/Cargo.toml

# Frontend
npm run test
npm run test -- --coverage
```

Pacotes/módulos sem testes são violação automática — checar:
```bash
# Rust: módulos sem `#[cfg(test)] mod tests`
rg -L '#\[cfg\(test\)\]' src-tauri/src/

# Frontend: arquivos `.ts` sem `.test.ts` correspondente
find src/lib -name '*.ts' -not -name '*.test.ts' | while read f; do
  base="${f%.ts}"
  [ -f "$base.test.ts" ] || echo "sem teste: $f"
done
```

## Tratando mutantes sobreviventes
Quando `cargo mutants` (ou `stryker`) reporta um mutante vivo:
1. Abrir o arquivo na linha indicada.
2. Identificar qual condição não é coberta por teste.
3. Adicionar caso de teste que falharia se a condição invertesse.
4. Rodar mutation de novo — esperar eficácia ≥ 84%.

## Exceções aceitas (não contam para o threshold)
- `src-tauri/src/main.rs`: entry point fino. Lógica deve estar em `src-tauri/src/app/`.
- `src/routes/+layout.svelte` e wrappers de rota: composição pura.
- `src/lib/theme/`: tokens de design, sem lógica.
- Componentes Svelte de apresentação pura: testar via snapshot (`vitest`) se crescer.
- Módulos com ≥ 80% de chamadas a SDK externo (ex.: gateways de Docker, GitLab, Tauri APIs) — aplicar threshold apenas nas funções puras do módulo.
