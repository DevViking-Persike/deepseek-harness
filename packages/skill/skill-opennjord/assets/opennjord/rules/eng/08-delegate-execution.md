# Regra 8 — Delegar execução de comandos ao usuário

Output de comando roda direto no contexto do Claude. Em tarefas longas, isso queima tokens sem agregar valor quando o resultado não influencia a próxima decisão.

Preferência: **pedir pro usuário rodar** comandos cujo output não muda o que eu vou fazer em seguida.

## Delego (pede pro usuário rodar)

- Testes interativos da UI que exigem julgamento humano (cliques, navegação por fluxo, layout em viewports diferentes, animação, percepção de UX).
- Aberturas de browser, IDE, editor de texto.
- Mutation testing completo (`cargo mutants`, `stryker`) quando só quero confirmar que passou depois de uma refatoração pequena.

## Executo eu mesmo (incluindo background quando longo)

- `cargo check` — preciso do erro exato pra corrigir.
- `cargo test` (suites unitárias rápidas) — preciso ver qual teste falhou e por quê.
- `npm run check` (svelte-check + tsc) — orienta correção de tipos.
- `npm run build` (build do frontend só) — verifica que SvelteKit compila.
- `npm run test` (vitest run) — rápido, output orienta próximo passo.
- `npm run tauri dev` — rodo em background (`run_in_background: true`) e consulto a saída pra confirmar compilação + boot da janela. Não consigo interagir visualmente, mas detecto erro de compilação Rust, panic no startup, e listeners Tauri que falham.
- `npm run tauri build` — rodo em background quando preciso validar bundle.
- `cargo build --release` — idem.
- `git status`, `git diff`, `git log` antes de commitar — preciso decidir o que stagear e como redigir a mensagem.
- Greps, Reads, Globs — investigação que me orienta.
- Commits e pushes quando o usuário já aprovou o escopo em linguagem natural.
- Comandos curtos cujo output redireciona o próximo passo.

## Formato ao delegar

Sempre explícito sobre o que esperar:

> "Roda `npm run tauri dev` e me fala se a tela de Repositórios abriu sem erro. Se deu erro no console, cola o stack trace inteiro."

Não fica ambíguo ("você pode testar") — fica instrução direta ("roda X, me diz Y").

## Quando em dúvida

Se o comando é rápido e o output é pequeno, rodo eu. Se é lento ou o output é grande e só importa o veredito (passou/falhou), delego.
