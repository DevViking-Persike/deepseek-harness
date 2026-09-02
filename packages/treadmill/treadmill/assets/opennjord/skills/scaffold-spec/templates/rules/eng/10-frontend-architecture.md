# Regra 10 — Arquitetura de frontend (MVVM + Atomic Design)

> **3 camadas:** Camada 1 (Princípio) define MVVM + Atomic de forma framework-neutra · Camada 2 (Preset por framework) mostra o mecanismo reativo/DI de cada um · Camada 3 traz um exemplo. Veja `_layer-guide.md`.

## Camada 1 — Princípio universal

O frontend segue **MVVM** (Model / ViewModel / View) combinado com **Atomic Design** para classificar a camada de View. Separa estado/regra (VM + Model) de apresentação (View): a UI fica testável sem IO, com fronteiras grepáveis e paralelismo seguro entre features.

### Camadas MVVM

| Papel | O que é | Onde mora | Arquivo |
|-------|---------|-----------|---------|
| **Model** | tipos/domínio puros, use cases, clients de IO (chamadas ao backend via boundary) | `domain/`, `application/`, `infrastructure/` | `.ts` |
| **ViewModel** | estado reativo + ações; orquestra o Model via **port injetado**; sem markup, sem IO direto | `presentation/view-models/<assunto>/` | `*-view-model.<ext>` |
| **View** | markup + binding + eventos; lê do VM, chama métodos do VM | `presentation/{pages,components}`, `shared/components` | componente |

- **VM recebe port** (interface em `application/ports/*-port.ts`); a implementação real fica em `infrastructure/*-<tech>.ts`. **VM nunca chama IO diretamente** (sem `invoke`/`fetch`/`axios` no VM).
- **Estado compartilhado:** VM instanciado no composition root e injetado por **contexto tipado** — não `export const x = createX()` global. VM escopado a uma subárvore vai por prop.
- **VM = factory function** por padrão (closure expondo estado reativo por getters). Classe só para herança/variações.

### Atomic (classificação da View)

| Nível | Conhece domínio/VM? | Onde mora |
|-------|---------------------|-----------|
| **Atom** | Não (primitivo puro) | `shared/components/atoms` |
| **Molecule** | Não (composição de atoms) | `shared/components/molecules` |
| **Organism** | Sim (recebe VM por prop/contexto) | `modules/<m>/presentation/components/<assunto>` |
| **Page** | Sim (obtém VMs, compõe organisms) | `modules/<m>/presentation/pages` |

Atom/molecule **nunca** importa domínio/VM/IO, e usa só tokens semânticos de CSS (sem hex, sem variável de cor crua). Precisou de tipo de domínio ou VM → é organism/page.

### Aliases (obrigatórios)
`<preencher: aliases/convensão de import do projeto>` — ex.: `$atoms`, `$molecules`, `$organisms`, `$shared`, `<alias de módulo de feature>`. **Proibido import relativo entre módulos** (`../../modules/...`); use sempre o alias.

### Casing
- Diretório de módulo e arquivos `.ts`/`.<ext>.ts`: **kebab-case**.
- Componente (`.svelte`/`.vue`/arquivo de componente): **PascalCase**.
- Identificador TS: **camelCase**/`PascalCase`.
- Sufixos padronizados: VM `*-view-model.<ext>`; port `*-port.ts`; infra `*-<tech>.ts` (ex.: `*-tauri.ts`, `*-api.ts`).

### Exceções aceitas
- Migração incremental: shims de re-export em paths antigos durante a transição (removidos na fase final), com comentário marcando a remoção.
- Singleton global de VM tolerado **apenas** em código legado ainda não invertido para contexto; novo código não cria singleton.
- Duplicação deliberada de primitivos (ex.: dois `Button` com estilos visuais distintos) requer **decisão de design** + verificação visual; consolidar quando a decisão for tomada.

## Camada 2 — Preset por framework

> Veja `stacks/frontend/`. O mecanismo reativo + DI muda por framework; o princípio MVVM não. Pule os não usados.

### Svelte 5 (runes + contexto tipado)
- **Estado reativo:** runes — `$state`, `$derived`, `$effect`, `$props`. **Sem stores Svelte** para estado local de componente.
- **VM:** factory function (`createFooViewModel(port)`) em `*-view-model.svelte.ts`; expõe runes por getters.
- **Injeção:** `svelte/context` com chave tipada (`Symbol` + `getter` tipado); o VM é criado no composition root da rota/layout e posto no contexto.
- **Port → infra:** VM recebe `FooPort` (interface); a implementação `*-tauri.ts` (ou `*-api.ts`) chama `invoke`/`fetch`.

### Angular (signals + inject)
- **Estado reativo:** **signals** (`signal()`, `computed()`, `effect()`) — não `BehaviorSubject` para estado de tela.
- **VM:** serviço/componente tipado; DI via `inject(FooPort)` (token de injeção). VM = classe `@Injectable()` ou componente presenter.
- **Port → infra:** `abstract class FooPort` + `providers: [{ provide: FooPort, useClass: FooTauriService }]` no composition root.

### React (hooks + context)
- **Estado reativo:** **hooks** (`useState`/`useReducer`/`useMemo`) — não classes para estado de tela.
- **VM:** hook `useFooViewModel(port)` que encapsula estado e ações; port injetada via `Context` tipado.
- **Port → infra:** `interface FooPort` + `FooTauriAdapter implements FooPort`; provider no composition root (`<FooPortContext.Provider value={...}>`).

## Camada 3 — Exemplo concreto

VM Svelte 5 consumindo port (sem IO direto):

```ts
// application/ports/foo-port.ts
export interface FooPort { load(id: string): Promise<Foo>; }

// presentation/view-models/foo/foo-view-model.svelte.ts
import type { FooPort } from '$<alias>/application/ports/foo-port';

export function createFooViewModel(port: FooPort) {
  let item = $state<Foo | null>(null);
  let loading = $derived(item === null);
  return {
    get item() { return item; },
    get loading() { return loading; },
    async load(id: string) { item = await port.load(id); },
  };
}
```
A View (`Foo.svelte`) só lê `vm.item`/`vm.loading` e chama `vm.load(id)` — nunca `invoke`/`fetch`.

## Como verificar

```bash
# View (componente) sem IO direto — deve vir vazio
<preencher: grep de 'invoke\(|fetch\(|axios|@tauri-apps/api|listen\(' nos arquivos de componente>

# ViewModel não importa View nem fala com infra direto — deve vir vazio
<preencher: grep de "from '.*\.(svelte|vue)'" nos *-view-model.*>
<preencher: grep de 'invoke\(|infrastructure/|fetch\(' nos *-view-model.*>

# Atoms/molecules sem domínio e sem cor crua — deve vir vazio
<preencher: grep de '<alias de módulo>|/domain/|invoke\(' em atoms + molecules>
<preencher: grep de '#[0-9a-fA-F]{3,6}|var\(--color-' em atoms + molecules>

# Sem VM singleton global (alvo) — deve vir vazio
<preencher: grep de '^export const \w+ = create\w+(Store|ViewModel)\(' na raiz do frontend>
```
Violação exige justificativa no commit/PR.
