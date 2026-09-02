# Preset de Stack — React (function components + hooks)

> Comando **real** da stack. Vale para React 18+ (createRoot, concurrent features), Vite ou
> Next.js. Prefira **hooks** e estado local; estado global só quando compartilhado entre múltiplas
> subárvores (Zustand/Redux Toolkit/Jotai).

## test_cmd

```bash
# Vitest + jsdom (preferível, Vite-nativo, ESM):
npx vitest run
# Watch:
npx vitest

# Jest + jest-environment-jsdom (legado, CRA):
npx jest
# Filtrar:
npx vitest run src/foo.test.tsx -t "renderiza"
```

Ferramentas de asserção: `@testing-library/react` (queries por role/label), `user-event` para
interação, `msw` para mockar HTTP.

## cov_tool

Threshold **≥ 84%** por diretório. `@vitest/coverage-v8` ou `coverage-istanbul`.

```bash
npx vitest run --coverage
# HTML: coverage/index.html
# Configura thresholds em vite.config.ts:
#   test: { coverage: { provider: 'v8', thresholds: { lines: 84, branches: 84, functions: 84, statements: 84 } } }

# Jest:
npx jest --coverage --coverageThreshold='{"global":{"lines":84}}'
```

## mutation_tool

Threshold **≥ 84%**. **Stryker**.

```bash
# Instala: npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner
# (Jest: @stryker-mutator/jest-runner)
npx stryker run
# Relatório: .stryker-tmp/sandbox*/reports/mutation/html/index.html
```

`stryker.config.json`:
```json
{
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "mutator": { "excluded": ["**/*.config.ts", "**/generated/**", "**/*.stories.tsx"] },
  "thresholds": { "high": 84, "low": 84, "break": 84 }
}
```

**Fallback:** se Stryker indisponível, revisão manual de branches (ler cada `if`/`&&`/`??`/early
return e confirmar teste que falharia ao inverter) — documentar no PR.

## lint_cmd

```bash
# ESLint (flat config, React + hooks plugins):
npx eslint src --max-warnings 0
# Auto-fix:
npx eslint src --fix

# Biome (alternativa):
npx biome check src
npx biome check src --write
```

## typecheck_cmd

```bash
# tsc puro (React usa esbuild para transpilar, então --noEmit é o check):
npx tsc --noEmit

# Next.js:
npx next lint   # roda ESLint + tipos
```

## build_cmd

```bash
# Vite (SPA):
npx vite build
# Output: dist/

# Next.js (SSG/SSR):
npx next build
# Output: .next/

# CRA legado:
npm run build
```

## run_dev_cmd

```bash
# Vite dev (HMR):
npm run dev          # ou: npx vite

# Next.js dev:
npx next dev

# Porta específica:
npm run dev -- --port 3000
```

## file_glob

Arquivos sujeitos à Regra 1 (≤ 300 / teto 500 linhas):

- `**/*.tsx`
- `**/*.ts`

```bash
# Lista violações:
find src -name '*.tsx' -o -name '*.ts' | xargs wc -l | sort -rn | awk '$1 > 500'
```

## arch_violation_grep

Markers de framework/IO (Regra 3/4): **componentes (View) não fazem IO direto** (`fetch`, `localStorage`,
`window.api`, subscrição a service externo). Encapsule em hook customizado ou service/adaptador
injetado.

```bash
# Componente chamando fetch/IO direto = violação
rg -l "fetch\(|localStorage|sessionStorage|axios\.|window\.api" src --glob '*.tsx' --glob '*.ts' | \
  rg -v '\.test\.|\.spec\.|infrastructure/|adapter/|hooks/'
# Esperado: vazio (essa lógica vive em hooks/ customizados ou adapters).

# Componente importante de domínio concreto (sem injeção):
rg -l "import .* from ['\"].*/infrastructure/" src --glob '*.tsx'
# Esperado: vazio (componente depende de hook/adaptador abstraído).
```

> `ex.:` hook `useUsuarioService()` encapsula chamadas a `UsuarioApi` (adapter). O componente
> `UsuarioForm` chama `const { salvar } = useUsuarioService()`, nunca `fetch('/api/usuarios')`
> direto. Para teste, o hook é mockado via `vi.mock` ou provider de contexto.

## conventions

- **Idioma:** pt-BR para UI/comentários/erros; inglês para identificadores (componente `PascalCase`,
  arquivo `kebab-case.tsx`, ex.: `usuario-form.tsx` exportando `UsuarioForm`).
- **Function components + hooks:** sem class components. Estado local via `useState`/`useReducer`;
  efeitos via `useEffect` (preferir `useLayoutEffect` só para medição de DOM).
- **Hooks customizados para IO:** `useFoo()` encapsula fetch/subscription; componente não vê `fetch`.
- **Sem estado global para local:** `useState` no componente. Zustand/Redux só quando 3+ componentes
  não-relacionados precisam do mesmo slice.
- **Props tipadas:** interface explícita para props; nunca `any`. Eventos: `React.ChangeEvent<HTMLInputElement>`.
- **`useEffect` ≤ 30 linhas:** extraia lógica para hook nomeado (`useSyncUsuario`) se crescer.
- **Listas:** `key` estável (id, não índice) em `.map`.
- **Acessibilidade:** `role`, `aria-*`, touch target ≥ 44px. Inputs com `<label htmlFor>`.
- **Testes:** `@testing-library/react` com `render`, `screen.getByRole`, `userEvent.setup()`.
  `msw` para mockar APIs. `it.each` para casos tabelados. Snapshot só para UI pura e estável.
- **Code-splitting:** `React.lazy` + `Suspense` para rotas pesadas.
- **Error boundaries:** um por feature subtree, não só global.
- **Server Components (Next.js App Router):** `'use client'` só onde houver estado/evento; mantenha
  lógica de IO e fetch no server component, componente cliente recebe dados como props.
