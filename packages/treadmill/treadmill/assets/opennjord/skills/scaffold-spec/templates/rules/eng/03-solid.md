# Regra 3 — SOLID

## Camada 1 — Princípio universal (agnóstico)

### SRP — Single Responsibility
Um arquivo, um motivo para mudar. Separar regras de negócio de I/O; separar UI de estado.

**Anti-exemplo:** componente/form de N centenas de linhas misturando apresentação, validação, chamada externa e persistência — cada uma deve estar em arquivo/módulo distinto (markup num, validação noutro, a chamada externa num adapter, a persistência num repositório).

### OCP — Open/Closed
Prefira injetar dependências (traits/interfaces/protocolos) a importar uma classe/struct concreta quando o ponto de extensão é previsível.

**Exemplo bom:** um gateway exposto via interface/trait — fácil de mockar nos testes, fácil de trocar de provider.

### LSP — Liskov
Interfaces pequenas; não quebre contratos em implementações. Se uma implementação precisa lançar/abortar em métodos da abstração, a abstração está errada.

### ISP — Interface Segregation
Uma interface/trait por papel. Evite interfaces "gordas" (`Client` com 15 métodos quando o consumidor usa 2).

**Exemplo:** criar `interface StackStarter { start(path, name): Result }` em vez de passar um `Client` inteiro de 15 métodos.

### DIP — Dependency Inversion
Camadas de alto nível (regras de negócio, componentes de tela) dependem de **abstrações**, não de SDKs ou APIs de framework diretamente.

A chamada concreta fica num adapter/infraestrutura (`infrastructure/`, `gateways/`); o consumidor declara a interface/trait de que precisa (`ports`, `domain/ports`). Componentes de UI chamam a camada de serviço via um boundary definido (comando, action, controller), nunca I/O direto (`fetch`, syscall, SDK cru).

> **Princípio universal:** a seta de dependência aponta **para dentro** (regra de negócio não conhece framework/IO).

### Motivação
SOLID reduz acoplamento, torna módulos testáveis isoladamente e cria pontos de extensão previsíveis. Cada letra ataca um smell: SRP (muitas responsabilidades), OCP (cascade de mudanças), LSP (abstrações quebradas), ISP (interfaces gigantes), DIP (camada de negócio vira escrava de SDK).

### Exceções aceitas
- **Hot paths de performance** onde a abstração custa overhead mensurável — justificar com benchmark.
- **Código de bootstrap/wiring** que inevitavelmente acopla framework + regras de composição (mas mesmo aí, mantenha o handler **thin** e a lógica num use case).
- **Banhados de SDK externo** (≥ 80% de chamadas a SDK): a inversão completa é refatoração futura — marque como dívida técnica explícita.

## Camada 2 — Markers por stack (grep de violações)

> SOLID é verificado por **markers de framework/IO** na camada interna, não por comando único. Veja `stacks/<stack>.md` → `arch_violation_grep`.

### Rust
```bash
# DIP: domain/application não devem chamar framework/IO diretamente
rg -l 'tauri::|reqwest::|std::process::Command' <domain-root> <application-root>
# DIP: domain/application nunca importam a camada de entrada (commands/handlers)
rg -l 'crate::.*::commands' <domain-root> <application-root>
```
Esperado: vazio. `trait` por papel (ISP); injetar `dyn Trait` (DIP/OCP).

### Node-TS
```bash
# DIP: componentes de UI sem IO direto
rg -l "fetch\(|@tauri-apps/api|axios\(" <ui-components-root>
# DIP: services não importam UI
rg -l "from '.*\.svelte'|from '.*\.vue'|from '.*\.jsx'" <service-root>
```
Esperado: vazio. Use `interface` por papel (ISP); injetar via construtor/contexto (DIP/OCP).

### Python
```bash
# DIP: domínio/services sem IO direto
rg -l 'import requests|from sqlalchemy|import django' <domain-root>
```
Use `Protocol` / `abc.ABC` por papel (ISP); injeção via construtor (DIP).

### Go
```bash
# DIP: packages internos sem import de SDK/IO cru
rg -l '"net/http"|database/sql|os/exec' <internal-domain-root>
```
Use `interface` por papel (ISP); aceitar interface, retornar struct (DIP/OCP).

### C#
```bash
# DIP: Domain/Application sem chamadas diretas de framework/IO
rg -l 'using System.Net.Http|using Microsoft.EntityFrameworkCore' <domain-root>
```
Use `interface` por papel (ISP); injeção via DI container (DIP/OCP).

### KMP (Kotlin)
```bash
# DIP: módulos comuns (commonMain) sem imports de plataforma/IO
rg -l 'import io.ktor|import android\.|import platform\.' <commonMain-root>
```
Use `interface` por papel (ISP); injetar via construtor (DIP/OCP). `expect/actual` é o boundary entre common e plataforma.

### Svelte/Angular/React
Markers de IO em componentes de UI (ver Node-TS). Web: estado reativo **local** via primitivo da stack (`$state`/`createSignal`/signals do Angular) — sem estado global para estado local. Componentes injetam services via contexto/DI, não importam a implementação de IO.

### RPA
Aplica principalmente SRP (cada fluxo/sequncia com uma responsabilidade) e DIP (scripts auxiliares não embutir chamadas de API concretas — preferir wrapper injetável para facilitar teste). Verificação manual na maior parte.

## Camada 3 — Exemplo concreto (referência)

**Anti-exemplo (SRP/DIP violados):** handler HTTP de 200 linhas que valida input, chama SDK de pagamento, grava em DB e monta a resposta HTTP.

**Refatorado:**
- `handler.ts` (controller thin) — desserializa, chama use case, devolve HTTP.
- `checkout_use_case.ts` — orquestra a regra via ports.
- `interface PaymentGateway { charge(...) }` (port em `domain/ports`).
- `stripe_adapter.ts` (infrastructure) — implementa `PaymentGateway`.
- `order_repository.ts` (infrastructure) — persistência.

O use case depende de `PaymentGateway` (abstração), não de Stripe. Trocar de provedor = novo adapter, zero mudança no use case (OCP).

## Como verificar
```bash
# Escolha o marker da stack em Camada 2. Saída esperada: vazia.
# Code review para SRP/LSP/ISP (sem automação infalível).
```
