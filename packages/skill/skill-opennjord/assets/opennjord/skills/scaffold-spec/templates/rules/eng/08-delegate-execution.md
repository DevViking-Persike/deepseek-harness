# Regra 8 — Delegar execução de comandos ao usuário

> **3 camadas:** esta regra é **100% universal** — não há preset por stack. Camada 1 já é o princípio completo; Camada 2 declara "aplicável a qualquer stack"; Camada 3 traz um exemplo. Veja `_layer-guide.md`.

## Camada 1 — Princípio universal

Output de comando roda direto no contexto do agente. Em tarefas longas, isso queima tokens sem agregar valor quando o resultado **não influencia a próxima decisão**.

Preferência: **pedir pro usuário rodar** comandos cujo output não muda o que o agente vai fazer em seguida.

### Delego (peço pro usuário rodar)
- Testes interativos da UI que exigem julgamento humano (cliques, navegação por fluxo, layout em viewports diferentes, animação, percepção de UX).
- Aberturas de browser, IDE, editor de texto.
- Mutation testing completo quando só quero confirmar que passou depois de uma refatoração pequena.
- Builds de distribuição longos (`.deb`/`.rpm`/`.apk`/`.app`) quando só importa o veredito "gerou sem erro".

### Executo eu mesmo (incluindo background quando longo)
- Typecheck/lint/check — preciso do erro exato para corrigir.
- Suites de testes unitários rápidos — preciso ver qual teste falhou e por quê.
- Build do frontend/backend em modo dev — rodo em background e consulto a saída para confirmar compilação + boot. Não consigo interagir visualmente, mas detecto erro de compilação, panic no startup, listener/rota que falha.
- `git status`, `git diff`, `git log` antes de commitar — preciso decidir o que stagear e como redigir a mensagem.
- Greps, Reads, Globs — investigação que me orienta o próximo passo.
- Commits e pushes quando o usuário já aprovou o escopo em linguagem natural.
- Comandos curtos cujo output redireciona o próximo passo.

## Camada 2 — Preset por stack

**Aplicável a qualquer stack — sem comando específico.** O princípio independe de linguagem/framework: o critério é "o output muda minha próxima decisão?".

## Camada 3 — Exemplo concreto

Dois casos, mesmo comando, decisões diferentes:

**Caso A — executo eu:** usuário pediu bugfix e disse "corrige e valida".
```bash
npm run test          # rodo eu: preciso ver qual teste falhou e o porquê
```

**Caso B — delego:** refatoração pequena já feita, só quero confirmar mutation verde.
> "Roda `cargo mutants --manifest-path <crate>` e me diz só se a eficácia ficou ≥ 84%. Se caiu, cola os mutantes sobreviventes."

## Formato ao delegar

Sempre explícito sobre o que esperar:

> "Roda `<cmd>` e me fala se `<resultado observável>`. Se deu erro, cola o stack trace inteiro."

Não fica ambíguo ("você pode testar") — fica **instrução direta** ("roda X, me diz Y").

## Como decidir quando em dúvida

Se o comando é rápido e o output é pequeno, rodo eu. Se é lento ou o output é grande e só importa o veredito (passou/falhou), delego.

## Como verificar

Não há verificação automatizada — é disciplina de execução do agente. Auto-auditar: "este comando que estou rodando muda minha próxima ação? Se não, delegar."
