# _STYLE.md — Contrato de autoria dos templates de engenharia

> **Artefato do repo-fonte, NÃO instala no consumidor.** Este arquivo não é
> copiado por nenhum `cp` do `scaffold-spec/SKILL.md` para o projeto-alvo —
> existe só aqui, para orientar quem escreve template neste repo.

> Fonte de verdade para **todos** que escrevem arquivos sob `scaffold-spec/templates/{rules,stacks,esteira,agents,commands,integrations,router}/`.
> Workers leem isto antes de produzir. O Main Orchestrator propaga estas regras.

## Objetivo do pacote
Empacotar as regras de engenharia + esteira gated + orquestração do projeto-fonte como **templates
agnósticos, detalhistas e portáveis** (rodam no Claude Code e em outros LLMs), instaláveis em qualquer
projeto via `scaffold-spec`. Específico onde pode ser (presets de stack), agnóstico onde precisa ser
(princípios universais).

## Princípios de estilo (valem para TODO arquivo)
1. **Idioma:** pt-BR para UI/comentários/erros; inglês para identificadores (função, tipo, módulo).
2. **Placeholders:** sempre `<preencher: o quê>` (descritivo — nunca `<>` nu). No corpo de presets/commands,
   comandos concretos são **exemplo real da stack**, não placeholder.
3. **Nunca citar particulares do projeto-fonte (njord) como prescrição** — só como exemplo rotulado `ex.:`.
   Tokens a evitar como fato: `src-tauri`, `tauri::`, `$modules`, `$studio`, `dbx`, `surreal`, `notebook_njord`.
4. **LLM-agnostic (corpo de runbook/command):** markdown puro. **PROIBIDO no corpo:** `$ARGUMENTS`,
   `` !`cmd` `` (dynamic context), `allowed-tools`. O argumento vira `<arquivo-alvo>` descrito em prosa;
   "rode git status antes" vira instrução normal, nunca auto-executável.
5. **Frontmatter Claude = adapter opcional**, isolado num bloco **comentado** (`<!-- ... -->` ou cerca
   `~~~`) no topo de `commands/eng/*.md`, + explicado uma vez em `commands/eng/README.md`. Outros LLMs ignoram.
6. **Tamanho:** cada arquivo ≤ 300 linhas (a Regra 1 se aplica a nós mesmos).
7. **Composição:** quando houver gatilho de domínio e disponibilidade, use a
   ferramenta correspondente como apoio **opcional e fail-soft**:
   - **openviking** recupera memória/contexto histórico; resultado é candidato não confiável;
   - **graphify** (`query`/`path`/`explain`) extrai impacto e relações do código real;
   - **archify** (`guide`/`validate`/`preview`/`deliver`/`compare`) comunica e valida
     diagramas autorados a partir de JSON/texto — não analisa o repositório.
   São complementares e nunca substituem evidência `path:linha`, fallback manual ou veredito de gate.
   A política instalada em `integrations/TOOLS-POLICY.md` define gatilhos e evita uso indiscriminado.
8. **Orquestração (regra do repo):** workers nunca rodam isolados; sempre via orchestrator que lê o
   contexto e propaga naming/ACs. Delegação de criação de tools/hooks a um worker é permitida com escopo explícito.

## Estrutura por tipo de arquivo

### Regra — `rules/eng/0N-<tema>.md` (3 camadas)
```markdown
# Regra N — <Nome>

## Camada 1 — Princípio universal (agnóstico)
Motivação · Como aplicar · Exceções aceitas   (linguagem/framework neutros)

## Camada 2 — Preset por stack (escolha o do projeto)
> Veja `stacks/`. Comandos concretos por stack relevante:
### Rust · ### Node-TS · ### Python · ### Go · ### C# · ### KMP · ### Svelte/Angular/React · ### RPA
<só as stacks onde a regra tem comando concreto; pule as irrelevantes>

## Camada 3 — Exemplo concreto (referência)
<um worked example curto>

## Como verificar
<bash/verificação; concreto por stack quando couber>
```

### Preset de stack — `stacks/<grupo>/<stack>.md`
Blocos curtos e copiáveis (sempre comando real da stack):
`test_cmd` · `cov_tool` · `mutation_tool` · `lint_cmd` · `typecheck_cmd` · `build_cmd` · `run_dev_cmd` ·
`file_glob` (extensões/roots p/ Regra 1) · `arch_violation_grep` (markers de framework/IO p/ Regra 3/4) ·
`conventions` (notas de idioma da stack: runes/Composition API/async runtime/etc.).

### Etapa da esteira de qualidade — `esteira/stages/QNN-<nome>.md`
`Definition of Ready` (entrada) · `Checklist de atividades` · `Definition of Done` (saída) ·
`Gate` (critério **bloqueante** — reprovou volta uma casa) · `Comandos` ·
`Composição externa (opcional, somente quando agrega)` · `Anti-patterns`.

### Template de agente — `agents/<nome>.md.tpl`
Frontmatter `name` · `model` (Opus p/ orchestrators, Sonnet p/ workers) · `tools` · `description`.
Corpo = prompt-base com marcadores `{{feature}}`, `{{area}}`, `{{ac}}`, `{{branch}}` a substituir.
Note a hierarquia obrigatória Main → Sub → Worker e a proibição de worker isolado.

### Runbook de command — `commands/eng/<nome>.md`
Procedimento passo-a-passo neutro. Argumento `<arquivo-alvo>` em prosa. Frontmatter Claude comentado no topo.

## Convenções de nome
- Diretório + `.ts`/`.svelte.ts`/`.md`: kebab-case. Componente `.svelte`: PascalCase.
- `.tpl` = template com marcadores `{{...}}` (gera arquivo final via substituição).
- Numeração de regra preserva `0N-`; etapa de qualidade usa o namespace `QNN-`.

## Anti-patterns (não fazer)
- ❌ Copiar a instância concreta do njord sem generalizar.
- ❌ Deixar `<preencher>` sem descrever o quê.
- ❌ Misturar refatoração grande com bugfix/feature (Regra 6) — um commit, um motivo.
- ❌ Worker escrevendo fora do seu diretório designado (colisão de path).
