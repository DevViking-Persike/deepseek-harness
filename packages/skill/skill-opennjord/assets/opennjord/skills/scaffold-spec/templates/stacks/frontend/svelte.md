# Preset de Stack — Svelte 5 (runes)

> Comando **real** da stack. Vale para SvelteKit ou SPA Svelte puro. Svelte 5 introduziu **runes**
> (`$state`, `$derived`, `$effect`, `$props`) como substituição das stores reativas para estado
> local de componente.

## test_cmd

```bash
# Roda todos os testes uma vez (CI-friendly):
npx vitest run
# Watch mode (desenvolvimento):
npx vitest
# Filtrar por arquivo/nome:
npx vitest run src/lib/foo.test.ts -t "renderiza botão"
```

Ferramenta: **Vitest** + `@testing-library/svelte` + `jsdom` (ou `happy-dom`) em `vite.config.ts`.

## cov_tool

Threshold **≥ 84%** por diretório. `@vitest/coverage-v8` (preferível, mais rápido) ou `coverage-istanbul`.

```bash
npx vitest run --coverage
# HTML: coverage/index.html
# Configura em vite.config.ts:
#   test: { coverage: { provider: 'v8', thresholds: { lines: 84, branches: 84, functions: 84, statements: 84 } } }
```

## mutation_tool

Threshold **≥ 84%**. **Stryker** (`@stryker-mutator/webpack` ou `@stryker-mutator/vitest-runner`).

```bash
# Instala: npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner
npx stryker run
# Relatório: .stryker-tmp/sandbox*/reports/mutation/html/index.html
```

Configure `stryker.config.json`:
```json
{
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "mutator": { "excluded": ["**/*.config.ts", "**/generated/**"] },
  "thresholds": { "high": 84, "low": 84, "break": 84 }
}
```

**Fallback:** se Stryker não estiver configurado, revisão manual de branches críticos (ler cada
`if`/`?:`/early return e confirmar teste que falharia ao inverter) — documentar no PR.

## lint_cmd

```bash
# ESLint (flat config):
npx eslint src --max-warnings 0
# Auto-corrigir:
npx eslint src --fix

# Alternativa: Biome (mais rápido, regras opintonadas):
npx biome check src
npx biome check src --write
```

## typecheck_cmd

```bash
# svelte-check cobre tipos de .svelte + .ts (incl. generics de runes):
npm run check
# Equivalente direto:
npx svelte-check --tsconfig ./tsconfig.json

# tsc puro (sem .svelte, só .ts):
npx tsc --noEmit
```

## build_cmd

```bash
# SvelteKit build (produção):
npm run build
# Output em build/ (adapter-node) ou .svelte-kit/output (adapter-static).

# SPA Svelte puro (Vite):
npx vite build
```

## run_dev_cmd

```bash
# SvelteKit dev (hot-reload):
npm run dev
# Em porta específica:
npm run dev -- --port 3000

# Preview do build de produção:
npm run preview
```

## file_glob

Arquivos sujeitos à Regra 1 (≤ 300 / teto 500 linhas):

- `**/*.svelte`
- `**/*.ts` (incl. `.svelte.ts` para runes modules)

```bash
# Lista violações:
find src -name '*.svelte' -o -name '*.ts' | xargs wc -l | sort -rn | awk '$1 > 500'
```

## arch_violation_grep

Markers de framework/IO (Regra 3/4): **componentes `.svelte` (View) não fazem IO direto** —
comunicam-se com backend via `invoke`/`fetch` abstraído em ViewModel/adapter.

```bash
# Componente chamando invoke/fetch/listen diretamente = violação de MVVM
rg -l "invoke\(|@tauri-apps/api|fetch\(|addEventListener\(" -g '*.svelte' src
# Esperado: vazio (essa lógica vive em ViewModel/infrastructure).

# Frontend importando backend = violação de fronteira (ex. de backend dir: src-tauri)
rg -l "from ['\"].*<backend_dir>" src
# Esperado: vazio.

# ViewModel chamando invoke direto (deveria ir por port injetado):
rg -l "invoke\(" src --glob '*view-model.svelte.ts'
# Esperado: vazio (VM depende de port, não de invoke concreto).
```

> `ex.:` um port `FooPort` em `application/ports/foo-port.ts`; implementação
> `FooTauriAdapter` em `infrastructure/foo-tauri.ts` chama `invoke`. O ViewModel recebe o port
> por injeção (não `import` o adapter).

## conventions

- **Idioma:** pt-BR para UI/comentários/erros; inglês para identificadores (componente `PascalCase`,
  arquivo `.ts`/`.svelte.ts` em `kebab-case`).
- **Runes para estado local:** use `$state`, `$derived`, `$effect`. **Proibido** Svelte stores
  (`writable`, `readable`) para estado local de componente — só para estado verdadeiramente global
  (toast, theme) quando justificado.
- **`<script>` ≤ 50 linhas:** extraia lógica para `*.ts` ao lado (`Foo.svelte` + `foo.ts`).
- **Componente > 200 linhas (script + markup):** extraia subcomponentes.
- **MVVM:** View (`.svelte`) lê do ViewModel (`*-view-model.svelte.ts`); VM chama Model via
  port injetado, nunca `invoke` direto. Estado compartilhado: VM via contexto Svelte tipado
  (`setContext`/`getContext`), não singleton global exportado.
- **Eventos:** Svelte 5 usa callbacks em vez de `createEventDispatcher`:
  `let { onSave }: { onSave: (item: T) => void } = $props()`.
- **Acessibilidade:** todo botão/link touch target ≥ 44px; labels associados a inputs via `for`/`id`.
- **Testes:** `@testing-library/svelte` com queries por role/label; snapshot só para apresentação
  pura. `it.each` para casos tabelados.
- **Svelte 5 MCP:** se disponível, use `svelte-autofixer` antes de finalizar componente — corrige
  erros comuns de runes automaticamente.
