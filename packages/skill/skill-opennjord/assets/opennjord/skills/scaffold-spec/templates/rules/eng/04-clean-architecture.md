# Regra 4 — Clean Architecture

## Camada 1 — Princípio universal (agnóstico)

Separe o código em camadas com **fluxo de dependência apontando sempre para dentro**. Os nomes abaixo são o padrão recomendado; adapte ao idioma/framework do projeto, preservando o princípio.

### Camadas (de dentro pra fora)
1. **`domain/`** — modelo + ports (interfaces), regras de negócio puras. Testável sem framework nem IO.
2. **`application/`** — use cases que orquestram o domain via ports.
3. **`infrastructure/`** — adapters de IO (HTTP, SDK, FS, DB, framework) implementando os ports.
4. **`commands/`** (ou `controllers`/`handlers`/`actions`)** — ponte fina de entrada (HTTP, IPC, CLI, binding de UI). Desserializa input, chama application/domain, devolve resultado.
5. **`components/`** (UI) — apresentação.
6. **`routes/`** (ou `pages`)** — composition root do frontend (telas/rotas).

### Regras de dependência
- **O fluxo aponta sempre para dentro.**
  - Backend: `commands → application → domain`. `infrastructure → domain` **apenas** via traits/ports definidas em `domain`. Nada externo importa `domain`/`application`.
  - Frontend: `routes → components → <boundary de serviço>`. Nunca importa diretamente a implementação de IO.
- `domain/` e `application/` **nunca** importam `commands/`/`controllers` nem o próprio framework.
- `infrastructure/` **nunca** importa `commands/` nem componentes de UI.
- A UI **nunca** importa a camada de IO/backend diretamente — comunicação só via boundary definido (comando/action/endpoint contrato).
- `commands/` é a **única** camada que cita o framework E regras de negócio juntas (wiring). A injeção dos ports concretos acontece num composition root (`main`, `lib.rs`, container DI).

### Onde colocar o quê
- **Regra de negócio** (ex.: "se condição X, disparar ação Y depois de Z"): `domain/` (ou `application/` se orquestra ports).
- **Chamada de IO externo** (DB, HTTP, SDK, FS, processo): adapter em `infrastructure/`.
- **Renderização e estado de tela:** `components/` ou `routes/`.
- **Ponte de entrada** (handler/`#[command]`/controller/CLI): `commands/`. Mantenha **thin** — só desserializa, chama application/domain, devolve resultado.
- **Wiring/bootstrap** (registro de handlers, injeção de ports concretos): no composition root.

### Teste seco
Se um arquivo de `domain/` ou `application/` importa o framework de app/IO, um cliente HTTP, um SDK externo, ou executa processo, é **violação** — mover a chamada para `infrastructure/`.

### Motivação
Camadas com fluxo apontando para dentro tornam a regra de negócio independente de framework, DB e IO. Resultado: testes rápidos sem subir infra, troca de provedor sem cascade, clareza de onde cada mudança mora.

### Exceções aceitas
- **Monolito em migração** para a arquitetura em camadas: shims de re-export durante a transição são tolerados (marcados para remoção na fase final).
- **Edge functions / lambdas thin** que são intrinsicamente IO + framework: o handler pode conter wiring, mas a regra de negócio deve estar num módulo testável.

## Camada 2 — Preset por stack (escolha o do projeto)

> Veja `stacks/`. Substitua markers/roots pelos do projeto.

### Rust
Estrutura típica: `modules/<ctx>/{domain,application,infrastructure,commands}` por bounded context; composition root em `lib.rs`/`main.rs`.
```bash
# domain/application puros (sem framework, sem IO bruto)
rg -l 'tauri::|reqwest::|std::process::Command' <domain-root> <application-root>

# infrastructure não conhece camada de entrada
rg -l 'crate::.*::commands' <infrastructure-root>

# UI não importa backend/IO diretamente (ex. de backend dir: src-tauri, src-backend, server/)
rg -l '<backend_dir>' <ui-root>
```
Esperado: vazio.

### Node-TS
Estrutura típica: `src/<module>/{domain,application,infrastructure,controllers}` + `src/routes`/`src/pages`.
```bash
# domain/application sem IO/framework
rg -l 'express|fastify|axios|node:fs|fetch\(' <domain-root> <application-root>

# controllers não importados por infra/UI
rg -l "from '.*controllers'" <infrastructure-root>

# UI sem IO cru
rg -l "fetch\(|axios\(" <components-root>
```
Esperado: vazio.

### Python
Estrutura típica: `<pkg>/{domain,application,infrastructure,api}`.
```bash
rg -l 'import requests|from fastapi|from flask|import sqlalchemy' <domain-root> <application-root>
```
Esperado: vazio.

### Go
Estrutura típica: `internal/{domain,usecase,adapter,handler}` + `cmd/` entry.
```bash
rg -l '"net/http"|database/sql|"os/exec"' <internal-domain-root> <internal-usecase-root>
```
Esperado: vazio.

### C#
Estrutura típica: `/{Domain,Application,Infrastructure,Api}` (ou Features verticais com as 4 dentro).
```bash
rg -l 'using System.Net.Http|using Microsoft.EntityFrameworkCore|using MediatR' <Domain-root> <Application-root>
```
Esperado: vazio.

### KMP (Kotlin)
Estrutura típica: `commonMain/{domain,application,infrastructure}` + `androidMain`/`iosMain` como `infrastructure` de plataforma.
```bash
# commonMain sem imports de plataforma/IO
rg -l 'import io.ktor|import android\.|import platform\.' commonMain/<domain> commonMain/<application>
```
`expect/actual` é o boundary — `commonMain` declara o port, `androidMain`/`iosMain` fornecem o `actual`.

### Svelte/Angular/React
Frontend em MVVM/分层: `routes`/`pages` → `components` → `services` (boundary). Services chamam backend via API/IPC contract, não embutem IO nos componentes.
```bash
rg -l "fetch\(|axios\(|@tauri-apps/api/core" <components-root> <routes-root>
```
Esperado: vazio (IO só em `infrastructure/*-<tech>.ts`).

### RPA
Aplicável quando há scripts auxiliares: separar regra de negócio (validação, transformação) de chamadas de sistema/aplicação. Fluxo declarativo do vendor é o "controller"; scripts auxiliares que encapsulam regra vão num módculo à parte. Verificação manual.

## Camada 3 — Exemplo concreto (referência)

Bounded context `orders` (Rust):
```
modules/orders/
  domain/
    model.rs          # Order, OrderLine — structs puras
    ports.rs          # trait OrderRepository, trait PaymentGateway
  application/
    place_order.rs    # use case: orquestra Repository + PaymentGateway
  infrastructure/
    db/order_repo.rs  # impl OrderRepository (SQL)
    pay/stripe.rs     # impl PaymentGateway (HTTP)
  commands/
    place_order.rs    # #[tauri::command] / #[axum::handler] thin
```
`place_order.rs` (use case) depende de `OrderRepository`/`PaymentGateway`, nunca de SQL/Stripe. Trocar DB ou provedor = novo adapter; o use case não muda.

## Como verificar
```bash
# Escolha o preset da stack em Camada 2. Saída esperada: vazia.
# Adicional: rodar a skill check-rules (etapa Q00-check da esteira).
```
