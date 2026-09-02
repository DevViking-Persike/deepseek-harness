# commands/eng/ — Runbooks de engenharia (LLM-agnostic)

Procedimentos passo-a-passo para auditoria, refatoração, responsividade e limpeza
de código morto. **Agnósticos de LLM e de stack**: rodam no Claude Code, Cursor,
Copilot, GPT ou Gemini.

## Portabilidade

Cada runbook nesta pasta tem duas partes:

1. **Corpo** (markdown puro) — o procedimento em si. Portável para qualquer LLM.
2. **Adapter opcional Claude Code** (bloco `<!-- ... -->` no topo) — frontmatter
   que ativa o runbook como *slash command* (`/check-rules`, `/refactor`, etc.)
   no Claude Code. Outros LLMs ignoram este bloco sem impacto.

### (a) Claude Code — instalar como slash command

Copie o arquivo `.md` para `.claude/commands/` no raiz do projeto (ou
`~/.claude/commands/` para uso global) e **descomente** o bloco `<!-- ... -->`
do topo. O comando fica disponível como `/<nome-do-arquivo>`:

```bash
cp commands/eng/check-rules.md   .claude/commands/check-rules.md
cp commands/eng/refactor.md      .claude/commands/refactor.md
cp commands/eng/responsive-pass.md .claude/commands/responsive-pass.md
cp commands/eng/dead-code-cleansing.md .claude/commands/dead-code-cleansing.md
# Edite cada um para descomentar o frontmatter <!-- ... --> do topo.
```

Snippet mínimo de frontmatter (descomente no topo de cada runbook ao instalar):

```markdown
<!--
---
description: <uma linha descrevendo o que o comando faz>
argument-hint: <preencher: dica do argumento, ex. caminho/do/arquivo.ext>
---
-->
```

### (b) Outros LLMs (Cursor / Copilot / GPT / Gemini)

Cole o **corpo** do runbook diretamente como prompt. Substitua `<arquivo-alvo>`
(presente em `refactor.md` e `responsive-pass.md`) pelo caminho real antes de
enviar. O bloco `<!-- ... -->` do topo pode ser apagado — ele é ruído para LLMs
não-Claude.

## Referências cruzadas

Os runbooks assumem que o projeto já tem:

- **`rules/eng/0N-*.md`** — regras de engenharia que os runbooks aplicam/auditam.
  O `check-rules.md` percorre cada uma; o `refactor.md` aplica 01/03/04/05/06;
  o `responsive-pass.md` aplica a regra de UI responsiva (09).
- **`stacks/<grupo>/<stack>.md`** — presets de comando concreto por stack
  (Rust, Node-TS, Python, Go, etc.). Sempre que um runbook diz "rode o comando
  de teste do seu stack", ele aponta para `stacks/`.

Se o projeto ainda não tem essas pastas, gere-as primeiro (via a skill
`scaffold-spec`) ou adapte os caminhos inline.

## Lista de runbooks

| Runbook | Faz o quê | Edita arquivos? |
|---------|-----------|-----------------|
| `check-rules.md` | Audita o repo contra `rules/eng/0N-*` e gera relatório | ❌ não (só relata) |
| `refactor.md` | Refatora `<arquivo-alvo>` aplicando as regras | ✅ sim |
| `responsive-pass.md` | Audita e refatora `<rota/componente>` mobile-first | ✅ sim (CSS/layout) |
| `dead-code-cleansing.md` | Identifica e remove código morto com aprovação humana | ✅ sim (após aprovação) |

## Convenções

- **Idioma**: pt-BR no corpo; inglês em identificadores de código.
- **Argumento**: `<arquivo-alvo>` ou `<rota/componente-alvo>` descrito em prosa
  no corpo — nunca `$ARGUMENTS` (que é sintaxe Claude-only).
- **Tamanho**: cada arquivo ≤ 300 linhas (a Regra 1 se aplica a nós mesmos).
- **graphify (opcional)**: onde entender impacto/relações ajuda, os runbooks
  citam `graphify query`/`path`/`explain` como apoio opcional — nunca obrigatório.
- **archify (opcional, modo documentar)**: comunica/valida diagramas autorados com
  `guide`/`validate`/`preview`/`deliver`/`compare`; não analisa código e sempre tem
  fallback Markdown + Mermaid/ASCII.
