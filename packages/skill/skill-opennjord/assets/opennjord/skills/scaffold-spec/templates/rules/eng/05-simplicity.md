# Regra 5 — Simplicidade

## Camada 1 — Princípio universal (agnóstico)

### Princípios
- **Não antecipe abstração.** 3 linhas duplicadas são melhores que uma abstração prematura.
- Sem flags booleanas que mudam comportamento interno da função — prefira duas funções (`start` vs `start_detached`).
- Sem camadas wrapper "por segurança" (trait → struct → trait → struct, ou store → derived → store). Uma indireção resolve.
- Sem comentários que descrevem o *quê* — só o *porquê* não-óbvio (bug conhecido, invariante sutil, workaround).
- Sem error handling para casos que não podem acontecer. Confie em garantias internas/framework.
- Sem backwards-compat shims para código ainda não lançado.

### Motivação
Cada indireção, flag e wrapper é carga cognitiva que o próximo desenvolvedor (ou você em 3 meses) precisa decifrar. Simplicidade não é "menos código a qualquer custo" — é "menos decisões para entender o comportamento". Abstração prematura grava a abstração errada em pedra.

### Sinais de que está complicado demais
- Função > 60 linhas.
- 3+ níveis de ifs aninhados.
- Componente de UI com lógica + markup somando > 200 linhas.
- Nome com "Manager", "Helper", "Util", "Service" genérico (geralmente indica SRP fraco).
- Teste precisa de 20 linhas de setup pra um caso — a função está fazendo muita coisa.

### Exceções aceitas
- **Primitivos de UI com estilos visualmente distintos** que parecem duplicados mas não são (ex.: botão *outlined* vs *filled*). Unificá-los exige decisão de design + verificação visual, não refactor mecânico.
- **Workarounds de bug de framework/SDB documentados** — o comentário explicando o *porquê* é obrigatório e o workaround é a simplicidade honesta.

## Camada 2 — Convenções por stack (markers)

> Simplicidade é verificada em code review (sem automação infalível). Os pontos abaixo são convenções de cada stack que facilitam a revisão.

### Rust
- Sem `unwrap()`/`expect()` em código que pode falhar em runtime real — propague com `?` e `Result`. `unwrap` só em testes ou onde há invariante provado.
- Sem `.clone()` defensivo "por segurança" — confirme a ownership.

### Node-TS
- Sem `any` em TypeScript. Tipe o retorno de chamadas de API com a forma exata (`interface`/`type` literal).
- Sem estado global singleton para estado local de componente.

### Python
- Sem `Any` em type hints (ou `# type: ignore`) sem justificativa.
- Sem `try/except Exception:` genérico — capture exceções específicas.

### Go
- Sem `panic`/`recover` para fluxo normal — retorne `error`.
- Sem `interface{}`/`any` quando o tipo é conhecido.

### C#
- Sem `dynamic` / cast `(T)obj` sem `as`+null-check quando pode falhar.
- Sem `async void` (exceto event handlers).

### KMP (Kotlin)
- Sem `!!` (force-unwrap) em código que pode receber null de plataforma.
- Sem `Any` sem tipo genérico.

### Svelte/Angular/React (web reativo)
- Sem **stores/singleton globais** para estado **local** de componente — use o estado reativo primitivo da stack:
  - Svelte 5: `$state`/`$derived` (runes).
  - Solid: `createSignal`/`createMemo`.
  - Angular: signals (`signal`/`computed`).
  - React: `useState`/`useMemo`.
- Sem bloco de lógica (script/handler) com mais de **~50 linhas** num componente — extraia helpers para um arquivo ao lado (`Foo` + `foo.ts`).

### RPA
- Sem "robô-faz-tudo" com 50+ atividades num único fluxo — dividir em subfluxos/subprocessos nomeados por responsabilidade.
- Sem variáveis booleanas de controle de fluxo ("jáProcessado") — prefira subfluxos separados (`ProcessarNovo` vs `ProcessarAtualizacao`).

## Camada 3 — Exemplo concreto (referência)

**Ruim (flag booleana + wrapper + unwrap):**
```rust
fn start_project(path: &str, name: &str, detached: bool) -> Result<()> {
    let cfg = load_config().unwrap();           // unwrap: pode falhar
    if detached { run_detached(path, name, &cfg) }
    else        { run_attached(path, name, &cfg) }
}
```

**Bom (duas funções, propaga erro, sem flag):**
```rust
fn start_project(path: &str, name: &str) -> Result<()> {
    let cfg = load_config()?;
    run_attached(path, name, &cfg)
}

fn start_project_detached(path: &str, name: &str) -> Result<()> {
    let cfg = load_config()?;
    run_detached(path, name, &cfg)
}
```

### Idioma
- `<preencher: idioma de UI/comentários>` (ex.: pt-BR) para mensagens de UI, comentários explicativos e textos de erro mostrados ao usuário.
- `<preencher: idioma de código>` (ex.: inglês) para identificadores (função, tipo, módulo) e mensagens de erro internas/log.

## Como verificar
Manual, no code review. Use os sinais ("complicado demais") como checklist. Sem automação infalível — julgamento.
