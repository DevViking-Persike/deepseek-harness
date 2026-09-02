# _layer-guide — Como ler e autorar as 3 camadas

> Guia para autores de regras em `rules/eng/`. Define o contrato da estrutura **3 camadas** + `Como verificar`. Fonte normativa: `_STYLE.md` (seção "Regra — 3 camadas").

## Por que 3 camadas

Uma regra de engenharia tem duas partes que variam em frequência de mudança:
- **Princípio** (porquê) — raramente muda. Vale para qualquer stack.
- **Comando concreto** (como) — muda por stack e com o tempo.

Se você embute o comando concreto no corpo do princípio, a regra envelhece junto com a stack e vira particulares de um projeto. As 3 camadas **separam** o que é estável do que é volátil, e apontam para o preset de stack (em `stacks/`) que mantém o comando vivo.

## A estrutura

```markdown
# Regra N — <Nome>

> 3 camadas: ... (uma linha lembrando o molde)

## Camada 1 — Princípio universal (agnóstico)
Motivação · Como aplicar · Exceções aceitas   (linguagem/framework neutros)

## Camada 2 — Preset por stack (escolha o do projeto)
> Veja stacks/. Comandos concretos por stack relevante:
### Rust · ### Node-TS · ### Python · ### Go · ### C# · ### KMP · ### Svelte/Angular/React · ### RPA
<só as stacks onde a regra tem comando concreto; pule as irrelevantes>

## Camada 3 — Exemplo concreto (referência)
<um worked example curto>

## Como verificar
<bash/verificação; concreto por stack quando couber>
```

## Cada camada em detalhe

### Camada 1 — Princípio universal (obrigatória)
- **O quê:** o porquê da regra, framework-neutro. Se aplica a Rust, Node, Go, C#, Python, KMP — a qualquer projeto.
- **Contém:** motivação, como aplicar (em prosa, sem comando de stack), exceções aceitas.
- **Não contém:** nomes de ferramenta concreta (`cargo`, `vitest`), paths de projeto-fonte, aliases de um projeto só.
- **Placeholders:** quando um conceito precisa do valor do projeto-alvo, use `<preencher: o quê>` (ex.: `<preencher: dir de componentes>`).

### Camada 2 — Preset por stack
- **O quê:** o comando/mechanismo concreto por stack. É onde a regra toca o chão.
- **Referencia `stacks/`:** não reescreva o preset inteiro — aponte para ele e mostre **só o comando que importa para esta regra**. (Ex.: Regra 7 mostra `npm run tauri dev` / `go run` / `dotnet run`; o preset completo de testes/lint/etc. vive em `stacks/backend/*.md`.)
- **Inclua só stacks relevantes:** se a regra é de frontend (Regra 9/10), omita os blocos de backend. Se é de build (Regra 7), inclua todas as stacks que o projeto pode usar. **Pule as irrelevantes** — silêncio é melhor que ruído.
- **Comando é exemplo real da stack**, não placeholder. `<preencher: ...>` reserva só o que depende do projeto-alvo (paths, aliases, nome do binário).
- **Caso 100% universal:** se a regra não tem comando específico por stack (ex.: Regra 8 — delegar execução), declare explicitamente:
  > **Aplicável a qualquer stack — sem comando específico.** O princípio independe de linguagem/framework: <critério>.
  E pule os blocos `### Rust`/`### Node`/etc. (não invente preset onde não há).
- **Caso n/a:** se o preset por stack não se aplica (ex.: Regra 11 é um princípio, não um como-técnico), declare `**n/a — princípio, não há preset por stack.**` e explique.

### Camada 3 — Exemplo concreto
- **O quê:** **um** worked example curto, que mostra a regra viva.
- Pode ser um snippet de código (Regra 9: grid 3-col → stack), um fluxo de decisão (Regra 8: mesmo comando, dois casos, decisões diferentes), ou um cenário abstrato (Regra 11: portar tela de repo-fonte).
- Mantenha curto — 1 exemplo é suficiente. Mais vira tutorial.

### Como verificar
- Sempre presente. Comando(s) `bash`/grep que detectam violação.
- Use `<preencher: ...>` onde o path/marcador depende do projeto-alvo. Ex.: `<preencher: grep de framework/IO em domain e application>`.
- Quando couber, dê o comando concreto por stack (ex.: Regra 4 lista markers de framework por linguagem).

## Placeholders — regras

- **Sempre** `<preencher: o quê>` descritivo. **Nunca** `<>` nu.
- No **corpo da regra** (Camadas 1/3) e no **Como verificar**: placeholders reservam o que depende do projeto-alvo.
- Na **Camada 2** (preset) e em **`stacks/`**: comandos são **exemplo real da stack**, não placeholder. Só vira placeholder o que é do projeto-alvo (path, nome de binário, alias).

## Anti-patterns

- ❌ Embutir comando de stack no corpo da Camada 1 (use Camada 2 → preset).
- ❌ Citar particulares de um projeto-fonte como prescrição — só `ex.:` rotulado.
- ❌ Inventar preset para regra 100% universal (use a declaração "aplicável a qualquer stack").
- ❌ Mais de um exemplo na Camada 3 (vira tutorial).
- ❌ `<preencher>` sem descrever o quê (`<>` nu é erro).

## Quando uma regra é 100% universal

Reconheça pelo critério: **"o output muda minha próxima decisão?" independe de stack?** Se sim, não há preset — declare na Camada 2:

> **Aplicável a qualquer stack — sem comando específico.** O princípio independe de <eixo>: <critério em uma linha>.

Exemplo (Regra 8 — delegar execução): o critério é "o output do comando muda a próxima ação do agente?", que independe de linguagem. Logo, Camada 2 sem blocos `### Rust`/`### Node`.

## Índice das regras neste pacote

| # | Regra | Tem Camada 2? |
|---|-------|---------------|
| 01 | Tamanho de arquivo | sim (file_glob por stack) |
| 02 | Testes unitários + mutation | sim (test/cov/mutation por stack) |
| 03 | SOLID | parcial (markers por stack) |
| 04 | Clean Architecture | sim (camadas/markers por stack) |
| 05 | Simplicidade | não (code review) |
| 06 | Refatoração contínua | não (disciplina) |
| 07 | Build & Run | sim (build/run por stack) |
| 08 | Delegar execução | não (100% universal) |
| 09 | UI responsiva | sim (tokens por framework) |
| 10 | Arquitetura de frontend | sim (mecanismo reativo/DI por framework) |
| 11 | Fonte de paridade externa | n/a (princípio; **opcional/exótico**) |
