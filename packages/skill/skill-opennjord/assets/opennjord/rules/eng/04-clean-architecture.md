# Regra 4 — Clean Architecture

## Camadas (de dentro pra fora)
1. `src-tauri/src/modules/<ctx>/domain/` — modelo + ports, regras de negócio puras (Rust, testáveis sem infra nem Tauri)
2. `src-tauri/src/modules/<ctx>/application/` — use cases que orquestram o domain via ports
3. `src-tauri/src/modules/<ctx>/infrastructure/` — adapters de IO (HTTP, SDK, FS, DB) implementando os ports; `src-tauri/src/gateways/db/` continua existindo só pra infra de DB transversal (bootstrap Surreal embedded)
4. `src-tauri/src/modules/<ctx>/commands/` — ponte Tauri (`#[tauri::command]` thin handlers)
5. `src/lib/components/` — componentes Svelte de UI
6. `src/routes/` — composition root do frontend (telas/rotas SvelteKit)

## Regras de dependência
- **Fluxo aponta sempre para dentro.**
  - Backend: `commands → application → domain`. `infrastructure → domain` apenas via traits (ports) definidas em `domain`. Nada externo importa `domain`/`application`.
  - Frontend: `routes → lib/components → invoke('cmd')`. Nunca importa direto de `src-tauri/`.
- `src-tauri/src/modules/<ctx>/{domain,application}/` nunca importam `commands/` do próprio context nem `tauri::`.
- `src-tauri/src/modules/<ctx>/infrastructure/` nunca importa `commands/` nem componentes Svelte.
- `src/` (frontend) nunca importa `src-tauri/` — comunicação só via `invoke`/eventos Tauri.
- `src-tauri/src/modules/<ctx>/commands/` é a única camada que cita Tauri E regras de negócio juntas (wiring); o `composition::repos::*` faz a injeção dos ports concretos.

## Onde colocar o quê
- **Regra de negócio** (ex.: "se branch é subtask, disparar pipeline depois do push"): `src-tauri/src/modules/<ctx>/domain/` (ou `application/` se orquestra ports).
- **Chamada ao Docker/GitLab/Git/FS**: adapter correspondente em `src-tauri/src/modules/<ctx>/infrastructure/`.
- **Renderização e estado de tela**: `src/lib/components/` ou `src/routes/`.
- **Comando Tauri (`#[tauri::command]`)**: `src-tauri/src/modules/<ctx>/commands/`. Mantenha thin — só desserializa input, chama `application`/`domain`, devolve resultado.
- **Wiring/bootstrap** (`tauri::Builder`, registros, injeção de repos concretos): `src-tauri/src/main.rs`, `src-tauri/src/lib.rs` ou `src-tauri/src/composition/`.

## Teste seco
Se `src-tauri/src/modules/<ctx>/{domain,application}/*.rs` importa `tauri::`, `reqwest::`, `std::process::Command`, ou qualquer SDK externo, é violação — mover a chamada para `infrastructure/`.

## Como verificar
```bash
# domain/application puros (sem Tauri, sem IO bruto)
rg -l 'tauri::|reqwest::|std::process::Command' src-tauri/src/modules/*/domain/ src-tauri/src/modules/*/application/

# infrastructure não conhece UI nem commands
rg -l 'crate::modules::.*::commands' src-tauri/src/modules/*/infrastructure/

# frontend não importa backend
rg -l 'src-tauri' src/
```
Saída esperada: vazia.
