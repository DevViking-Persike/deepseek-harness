# Regra 3 — SOLID

## SRP — Single Responsibility
Um arquivo, um motivo para mudar. Separar regras de negócio de I/O, UI de estado.

Anti-exemplo: componente `AddProject.svelte` com 700+ linhas misturando form, validação, clone git e persistência — cada uma deve estar em arquivo/módulo distinto (ex.: `AddProject.svelte` para markup, `add_project.ts` para validação, comando Tauri `clone_repo` para git).

## OCP — Open/Closed
Prefira injetar dependências (traits em Rust, interfaces em TypeScript) a importar struct/classe concreta quando o ponto de extensão é previsível.

Exemplo bom: gateway `GitlabClient` exposto via trait — fácil mockar nos testes, fácil trocar provider.

## LSP — Liskov
Traits/interfaces pequenas; não quebre contratos em implementações. Se uma implementação precisa `panic!` ou `throw` em métodos da abstração, a abstração está errada.

## ISP — Interface Segregation
Uma trait/interface por papel. Evite traits "gordas" (`DockerClient` com 15 métodos quando o consumidor usa 2).

Exemplo: criar `trait StackStarter { fn start_project(&self, path: &str, name: &str) -> Result<()>; }` em vez de passar `DockerClient` inteiro.

## DIP — Dependency Inversion
Camadas de alto nível (`src-tauri/src/modules/<ctx>/{domain,application}`, componentes Svelte de tela) dependem de abstrações, não de SDKs ou APIs do Tauri diretamente.

Chamada concreta fica em `src-tauri/src/modules/<ctx>/infrastructure/` (ex.: `docker`, `gitlab`, `git`) ou em `src-tauri/src/gateways/db/` (infra de DB transversal); consumidor declara a trait/interface (`domain/ports`) de que precisa. Componentes Svelte chamam comandos Tauri via `invoke`, nunca `fetch`/IO direto.

## Como verificar
```bash
# domain/application não devem chamar Tauri APIs diretamente
rg -l 'tauri::' src-tauri/src/modules/*/domain/ src-tauri/src/modules/*/application/   # deve vir vazio

# domain/application nunca importam de `commands` (ponte Tauri)
rg -l 'crate::modules::.*::commands' src-tauri/src/modules/*/domain/ src-tauri/src/modules/*/application/   # deve vir vazio

# Frontend nunca importa de src-tauri/ (só via invoke)
rg -l 'src-tauri' src/                                       # deve vir vazio
```
