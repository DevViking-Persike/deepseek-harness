# Preset de Stack — Angular (standalone + signals)

> Comando **real** da stack. Vale para Angular 17+ (standalone components, signals `signal()`,
> `computed()`, `effect()`). Aplica-se tanto a Angular CLI puro quanto a Nx monorepo.

## test_cmd

```bash
# Angular CLI (Jasmine + Karma ou Jest via builder):
ng test
# Headless (CI):
ng test --watch=false --browsers=ChromeHeadless

# Alternativa moderna: Vitest + jsdom (mais rápido, ESM-nativo):
npx vitest run

# Filtrar por arquivo:
ng test --include="**/foo.spec.ts"
```

Test runner depende do setup: Jasmine/Karma (default histórico) ou Jest/Vitest (comunidade
moderna). Para projetos novos, preferir **Vitest** pelo alinhamento com Vite/esbuild.

## cov_tool

Threshold **≥ 84%**. Com Karma/Jasmine: `--code-coverage`. Com Vitest: `@vitest/coverage-v8`.

```bash
# Karma:
ng test --code-coverage --watch=false
# Relatório: coverage/<projeto>/index.html

# Vitest:
npx vitest run --coverage
# Configura thresholds em vite.config.ts:
#   test: { coverage: { provider: 'v8', thresholds: { lines: 84, branches: 84 } } }
```

## mutation_tool

Threshold **≥ 84%**. **Stryker** com runner Angular/Vitest.

```bash
# Instala: npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner
# (para Karma: @stryker-mutator/karma-runner)
npx stryker run
# Relatório: .stryker-tmp/sandbox*/reports/mutation/html/index.html
```

`stryker.config.json`:
```json
{
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "mutator": { "excluded": ["**/*.spec.ts", "**/generated/**", "**/*.module.ts"] },
  "thresholds": { "high": 84, "low": 84, "break": 84 }
}
```

**Fallback:** se Stryker não cobrir (ex.: E2E com TestBed complexo), revisão manual de branches
em serviços/funções puras — documentar mutantes revisados no PR.

## lint_cmd

```bash
# ESLint angular (flat config):
ng lint
# Direto:
npx eslint src --max-warnings 0

# Biome como alternativa:
npx biome check src
```

## typecheck_cmd

```bash
# tsc puro (Angular usa tsconfig.json com strict):
npx tsc --noEmit

# ng build também tipa, mas é mais lento (gera artefato):
ng build --configuration development
```

## build_cmd

```bash
# Produção (otimizado, AOT):
ng build --configuration production
# Output: dist/<projeto>/

# Monorepo Nx:
npx nx build <app>
```

## run_dev_cmd

```bash
# Dev server com hot-reload:
ng serve
# Porta/cors:
ng serve --port 4200 --proxy-config proxy.conf.json

# Nx:
npx nx serve <app>
```

## file_glob

Arquivos sujeitos à Regra 1 (≤ 300 / teto 500 linhas):

- `**/*.ts` (component, service, directive, guard, pipe)
- `**/*.html` (templates de componente)

```bash
# Lista violações:
find src -name '*.ts' -o -name '*.html' | xargs wc -l | sort -rn | awk '$1 > 500'
```

## arch_violation_grep

Markers de framework/IO (Regra 3/4): **componentes (View) não injetam `HttpClient`, `localStorage`,
nem services de IO direto** — devem depender de uma facade/port (service de application) que
encapsula a chamada. Service de IO (infrastructure) implementa port; component injeta a port.

```bash
# Componente injetando HttpClient/IO direto = violação de DIP
rg -l "HttpClient|localStorage|sessionStorage|fetch\(" src --glob '*.component.ts'
# Esperado: vazio (essa lógica vive em service de infrastructure, abstraído por port).

# Template HTML com lógica de IO ou referência a types de infra:
rg -l "HttpClient|localStorage" src --glob '*.html'
# Esperado: vazio.

# Componente importando de pasta de infrastructure:
rg -l "from ['\"].*/infrastructure/" src --glob '*.component.ts'
# Esperado: vazio (componente depende de abstração em application/ports).
```

> `ex.:` `UsuarioFacade` (port injetada no componente via `inject(USUARIO_FACADE)`) encapsula
> chamadas a `UsuarioApiService` (infrastructure que injeta `HttpClient`). O template nunca vê
> `HttpClient`.

## conventions

- **Idioma:** pt-BR para UI/comentários/erros; inglês para identificadores (classe `PascalCase`,
  arquivo `kebab-case`, ex.: `usuario-form.component.ts`).
- **Standalone components (Angular 17+):** prefira `standalone: true` em vez de `NgModule`.
  Imports declarados no próprio componente.
- **Signals para estado reativo:** use `signal()`, `computed()`, `effect()` em vez de `BehaviorSubject`
  quando o consumo for template-local. State global complexo ainda pode usar NgRx/Signals Store.
- **Injeção moderna:** `inject(Dependency)` no campo da classe, em vez de constructor parameters.
- **OnPush:** todo componente de apresentação usa `ChangeDetectionStrategy.OnPush` (obrigatório
  com signals para performance).
- **Lazy loading:** rotas filhas com `loadComponent`/`loadChildren` para reduzir bundle inicial.
- **Typed forms:** `FormBuilder.nonNullable.group({...})` com tipos; nunca `any` em controls.
- **RxJS:** use `Observables` para streams; combine com signals via `toSignal()` na fronteira.
  Evite subscrição manual no componente — use pipe `| async` ou `toSignal`.
- **Testes:** `TestBed.configureTestingModule` com providers mockados (`provideMock`). Para
  signals, `TestBed.flushEffects()` após mutação. Casos tabelados com `it.each`.
- **Acessibilidade:** `role`, `aria-label`, touch target ≥ 44px. Labels associados via `for`/`id`
  ou `formControlName` em label wrapper.
- **Arquitetura:** `core/` (singletons, guards, interceptors), `shared/` (UI dumb, pipes, directives),
  `features/<feature>/{components,services,models}`. Feature não importa de outra feature diretamente
  — usa facade compartilhada.
