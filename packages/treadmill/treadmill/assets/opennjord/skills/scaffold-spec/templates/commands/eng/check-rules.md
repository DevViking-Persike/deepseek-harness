<!--
========================================================
ADAPTER OPCIONAL — Claude Code (descomente ao instalar em .claude/commands/)
--------------------------------------------------------
description: Auditar o repositório contra as regras em rules/eng/
========================================================
Corpo abaixo é markdown puro, portável para qualquer LLM.
========================================================
-->

# Auditoria de regras de engenharia

Rode uma auditoria do repositório contra as regras de engenharia declaradas em
`rules/eng/`. Este runbook **não edita arquivos** — apenas relata conformidade.
Para corrigir uma violação, use o runbook `refactor` sobre o arquivo-alvo.

Antes de começar, leia os arquivos de regra referenciados em cada seção abaixo.

## Como usar

Substitua os caminhos e comandos concretos pelos do seu stack (veja `stacks/`
para o comando exato de build/test/lint/typecheck). Os blocos de verificação
abaixo mostram o **princípio**; o comando real varia por linguagem.

---

## Regra 1 — Tamanho de arquivo (alvo ~300, teto ~500)

Arquivo de referência: `rules/eng/01-file-size.md`.

Verifique todos os arquivos de código-fonte contra o teto de linhas. Lista
violações ordenadas por tamanho (maiores primeiro). Sugira split por
responsabilidade — **não editar**.

Padrão de verificação (adapte as extensões ao seu stack):

```bash
# Exemplo genérico — troque as extensões e a raiz pelas do seu projeto.
find src -type f \( -name '*.rs' -o -name '*.svelte' -o -name '*.ts' \
  -o -name '*.py' -o -name '*.go' -o -name '*.kt' \) \
  -exec wc -l {} + | sort -rn | awk '$1 > 300'
```

Classifique cada hit: ≤300 confortável · 300–500 zona de atenção · >500 violação.

---

## Regra 2 — Testes unitários + mutation (≥ 84%)

Arquivo de referência: `rules/eng/02-unit-tests.md`.

Rode os comandos de teste, cobertura e mutation do seu stack (veja `stacks/`
para `test_cmd`, `cov_tool`, `mutation_tool`). Reporte:

- Pacotes/módulos com cobertura < 84%.
- Eficácia de mutation < 84% (se a ferramenta estiver disponível).
- Módulos sem `#[cfg(test)]` / sem arquivo `.test.ts` correspondente.

Grep de módulos sem teste (princípio — adapte o marcador à stack):

```bash
# Rust: módulos sem bloco de teste
grep -rL 'cfg(test)' src --include='*.rs'
# TS: arquivos .ts sem .test.ts correspondente
find src -name '*.ts' -not -name '*.test.ts' | while read f; do
  base="${f%.ts}"; [ -f "$base.test.ts" ] || echo "sem teste: $f"
done
```

---

## Regra 3 — SOLID (SRP/OCP/LSP/ISP/DIP)

Arquivo de referência: `rules/eng/03-solid.md`.

Sinais automáticos de violação (adapte os markers de framework/IO à sua stack;
veja `arch_violation_grep` em `stacks/`):

```bash
# Camada de domínio/aplicação não deve chamar SDK/IO/framework diretamente.
# Troque os marcadores (tauri::, reqwest::, subprocess, etc.) pelos do seu stack.
grep -rl 'tauri::\|reqwest::\|std::process::Command\|subprocess' \
  src/**/domain/ src/**/application/ 2>/dev/null

# Frontend não deve importar o backend diretamente (só via API/IPC).
# Troque 'src-backend' pelo dir de backend/IPC do projeto (ex.: src-tauri, server/, backend/).
grep -rl 'src-backend\|invoke(' src/components/ src/routes/ 2>/dev/null
```

Amostre as 5 maiores funções por linhas como sinal de SRP fraco. Qualquer hit é
candidato a refatoração.

---

## Regra 4 — Clean Architecture (fluxo de dependência)

Arquivo de referência: `rules/eng/04-clean-architecture.md`.

O fluxo de dependência deve apontar sempre para dentro:
`commands → application → domain`. Infra conhece domain só via ports (traits).
Frontend nunca importa código de backend.

```bash
# Domain/application não importam de commands nem da camada de UI.
grep -rl 'crate::modules::.*::commands\|from ".*commands"' \
  src/**/domain/ src/**/application/ 2>/dev/null

# Frontend não fala com backend por outro caminho além da API declarada.
# Troque pelo dir de backend e pela SDK de IPC do projeto (ex.: src-tauri, @tauri-apps/api).
grep -rl 'src-backend\|<sdk-de-ipc>' src/components/ src/routes/ 2>/dev/null
```

Hits significam violação (ou exceção a justificar no commit).

---

## Regra 5 — Simplicidade

Arquivo de referência: `rules/eng/05-simplicity.md`.

Verificação manual (code review). Destaque:

- Funções/blocos de lógica > 60 linhas.
- 3+ níveis de `if` aninhados.
- Nomes genéricos ("Manager", "Helper", "Util", "Service" sem SRP).
- Comentários que descrevem o *quê* em vez do *porquê*.
- Flags booleanas que mudam comportamento interno da função.
- `unwrap()`/`expect()` em caminho que pode falhar em runtime real.

Amostragem de funções longas (princípio):

```bash
# Adapte à sua stack. Exemplo conceitual para localizar funções grandes.
grep -rn '^\s*\(pub \)\?\(async \)\?fn ' src --include='*.rs' | head -20
```

---

## Regra 6 — Refatoração contínua

Arquivo de referência: `rules/eng/06-continuous-refactoring.md`.

Verificação de disciplina (sem automação). Confirme no histórico recente:

- Commits seguem conventional commits com um motivo por commit.
- Bugfix e refatoração estão em commits separados.
- Não há `--no-verify` ou hooks pulados.

```bash
git log --oneline -20
```

---

## Regra 7 — Build e execução

Arquivo de referência: `rules/eng/07-build-and-run.md`.

Rode o build e o typecheck/lint do seu stack (veja `stacks/` para `build_cmd`,
`typecheck_cmd`, `lint_cmd`). Reporte falhas.

```bash
# Exemplos — substitua pelos comandos reais do seu stack.
# <build_cmd>      ex.: npm run build | cargo build | go build ./...
# <typecheck_cmd>  ex.: npm run check | tsc --noEmit
# <lint_cmd>       ex.: npm run lint | cargo clippy | golangci-lint run
```

---

## Regra 8 — Delegar execução ao usuário

Arquivo de referência: `rules/eng/08-delegate-execution.md`.

Sem automação. Confirme no fluxo de trabalho: comandos longos cujo output só
importa o veredito (passou/falhou) são delegados ao humano; comandos cujo output
orienta a próxima decisão são executados pelo agente.

---

## Regra 09 — UI responsiva (mobile-first)

Arquivo de referência: `rules/eng/09-responsive-ui.md` (se aplicável ao stack).

```bash
# Larguras fixas suspeitas em containers (ignora ícones/avatares).
grep -rn 'width:\s*[0-9]\{3,\}px' src/components src/routes \
  | grep -v 'icon\|avatar\|emoji'

# Media queries desktop-first (anti-pattern).
grep -rn '@media.*max-width' src/
```

Para corrigir, use o runbook `responsive-pass`.

---

## Regra 10 — Arquitetura de frontend (MVVM + Atomic)

Arquivo de referência: `rules/eng/10-frontend-architecture.md` (se aplicável).

```bash
# View (.svelte/.vue/.jsx) sem IO direto.
grep -rl 'invoke(\|fetch(\|@tauri-apps/api\|listen(' \
  src --include='*.svelte' --include='*.vue' --include='*.jsx'

# ViewModel não importa View nem fala infra direto.
grep -rl "from '.*\\.svelte'" src --include='*view-model*'
grep -rl 'invoke(\|infrastructure/' src --include='*view-model*'

# Atoms/molecules sem domínio nem cor crua.
grep -rl 'domain/\|invoke(' src/components/atoms src/components/molecules
grep -rn '#[0-9a-fA-F]\{3,6\}\|var(--color-' src/components/atoms
```

---

## Formato do relatório

Markdown, uma seção por regra. Use os marcadores:

- ✅ conforme
- ⚠️ violação pequena (atenção)
- ❌ bloqueante (violou teto/gate)

Inclua:

1. **Contagem agregada no topo** — total de ✅/⚠️/❌.
2. **Detalhe por regra** — lista de arquivos/linhas com a categoria da violação.
3. **Top 3 próximos passos priorizados** — o que refatorar primeiro (use
   `refactor` sobre o arquivo-alvo de maior impacto).

**Não edite arquivos.** Este runbook é somente-leitura.
