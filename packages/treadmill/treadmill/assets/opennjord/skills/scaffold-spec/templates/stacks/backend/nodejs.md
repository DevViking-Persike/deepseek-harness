# Preset backend — Node.js + TypeScript

> Stack: Node.js (TypeScript). Preset copiável; a Camada 2 das regras referencia
> estes comandos. Thresholds ≥ 84% (cobertura + mutation).

## test_cmd

```bash
# vitest (preferível em projetos TS modernos)
npm test
# ou
pnpm test

# jest (legado)
npm test
```

## cov_tool

Via runner. Threshold ≥ 84%.

```bash
# vitest
vitest run --coverage --coverage.thresholds.lines=84

# jest
jest --coverage --coverageThreshold='{ "global": { "lines": 84 } }'
```

O runner falha se cobertura de linhas < 84%.

## mutation_tool

[Stryker](https://stryker-mutator.io/). Threshold ≥ 84%.

```bash
npm install -D @stryker-mutator/core
npx stryker run
```

Configurar `stryker.conf.json` com `thresholds: { high: 84, low: 84, break: 84 }`.
Se o projeto for muito grande e Stryker no CI for proibitivo, **fallback**:
revisão manual de assertivas por borda (undefined/null/empty/throw), registrada
no PR.

## lint_cmd

[ESLint](https://eslint.org/) ou [Biome](https://biomejs.dev/) (mais rápido):

```bash
# ESLint
npx eslint . --max-warnings=0

# Biome
npx biome check .
```

## typecheck_cmd

```bash
npx tsc --noEmit
# projeto com project references / path aliases:
npx tsc --noEmit -p tsconfig.json
```

## build_cmd

```bash
npm run build
# equivalente direto (ex.: esbuild / tsup / tsc)
npx tsup src/index.ts --dts
```

## run_dev_cmd

```bash
npm run dev
# típimo: tsx watch / nodemon / node --watch
npx tsx watch src/index.ts
```

## file_glob

Extensões/roots para a Regra 1 (tamanho, alvo ~300 / teto ~500):

```bash
find src -name '*.ts' -o -name '*.js' | xargs wc -l | sort -rn | awk '$1 > 500'
```

Ignora `dist/`, `build/`, `node_modules/`, `coverage/`. Roots típicos: `src/`
(produção), `test/` ou `tests/` (testes), `__tests__/`.

## arch_violation_grep

Markers de IO/framework que **não** devem aparecer em `domain/` (Regras 3/4).
Ajuste o path conforme o projeto (`ex.:` rotulado).

```bash
# domínio não faz IO direto nem chama fetch/SDK
rg -l 'fetch\(|axios|import .* from .*(http|fs|node-fetch|express|fastify)' src/domain/

# domínio/aplicação não importam camada de controllers/routes/infra
rg -l 'from .*/controllers|from .*/routes|from .*/infrastructure' src/domain/ src/application/

# Esperado: saída vazia.
```

Convenção típima Node/TS: `src/domain/` (entidades + interfaces de ports),
`src/application/` (use cases),`src/infrastructure/` (adapters de IO/DB/HTTP),
`src/controllers/` ou `src/routes/` (handlers HTTP). Frontend (quando houver)
nunca importa `src/` do backend.

## conventions

- **Idioma**: pt-BR para mensagens de usuário/comentários; inglês para
  identificadores (arquivo `kebab-case`, tipo/função `camelCase`/`PascalCase`).
- **Sem `any`**: sempre tipar; `invoke<T>` (quando aplicável) com a forma exata
  do retorno; usar `unknown` + type guard quando o tipo é desconhecido.
- **Strict mode**: `strict: true` em `tsconfig.json`; `noImplicitAny`,
  `strictNullChecks`, `noUncheckedIndexedAccess` ligados.
- **Imports**: preferir named imports; sem `import *`; path aliases (`@/`,
  `~/`) configurados em `tsconfig.json` para evitar `../../../`.
- **Async/await**: sempre `async`/`await`, nunca `.then()` encadeado em código
  de domínio; tratar erros com `try/catch` ou propagar.
- **Erros**: classes de erro customizadas (`class DomainError extends Error`);
  nunca lançar string (`throw "erro"`); `Result<T, E>` opcional em domínio puro.
- **Testes**: arquivo `*.test.ts` ao lado do módulo; `it.each` para casos
  múltiplos (table-driven); `describe` por unidade; sem IO real em teste de
  domínio — use mocks/fakes das interfaces.
- **E SMV**: se houver ViewModel/Store, factory function com runes (quando
  Svelte) ou closure exposta; nunca singleton global exportado direto
  (aplicável a stack Svelte no frontend).
