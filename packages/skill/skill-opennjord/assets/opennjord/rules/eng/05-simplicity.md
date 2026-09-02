# Regra 5 — Simplicidade

## Princípios
- **Não antecipe abstração.** 3 linhas duplicadas são melhores que uma abstração prematura.
- Sem flags booleanas que mudam comportamento interno da função — prefira duas funções (`start_project` vs `start_project_detached`).
- Sem camadas wrapper "por segurança" (trait → struct → trait → struct, ou store → derived → store). Uma indireção resolve.
- Sem comentários que descrevem o *quê* — só o *porquê* não-óbvio (bug conhecido, invariante sutil, workaround).
- Sem error handling para casos que não podem acontecer. Confie em garantias internas/framework.
- Sem backwards-compat shims para código ainda não lançado.

## Específico do stack
- Sem **stores Svelte** para estado local de componente — use `let` reativo (Svelte 5 runes: `$state`, `$derived`).
- Sem `<script>` com mais de **50 linhas** num componente Svelte — extraia helpers para `.ts` ao lado (`Foo.svelte` + `foo.ts`).
- Sem `unwrap()`/`expect()` em código que pode falhar em runtime real — propague com `?` e `Result`.
- Sem `any` em TypeScript. Tipe o retorno de `invoke<T>` com a forma exata.

## Idioma
- pt-BR: mensagens de UI, comentários explicativos e textos de erro mostrados ao usuário.
- Inglês: identificadores de código (nome de função, tipo, módulo, componente) e mensagens de erro internas/log.

## Sinais de que está complicado demais
- Função > 60 linhas (Rust ou TS).
- 3+ níveis de ifs aninhados.
- Componente Svelte com `<script>` + markup somando > 200 linhas.
- Nome com "Manager", "Helper", "Util", "Service" genérico (geralmente indica SRP fraco).
- Teste precisa de 20 linhas de setup pra um caso — função está fazendo muita coisa.

## Como verificar
Manual, no code review. Sem automação infalível — use julgamento.
