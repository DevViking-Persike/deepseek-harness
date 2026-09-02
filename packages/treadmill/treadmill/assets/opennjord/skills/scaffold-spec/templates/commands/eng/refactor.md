<!--
========================================================
ADAPTER OPCIONAL — Claude Code (descomente ao instalar em .claude/commands/)
--------------------------------------------------------
description: Refatorar um arquivo aplicando as regras em rules/eng/
argument-hint: <caminho/do/arquivo-alvo.{rs,svelte,ts,...}>
========================================================
Corpo abaixo é markdown puro, portável para qualquer LLM.
O argumento <arquivo-alvo> é descrito em prosa na próxima seção.
========================================================
-->

# Refatorar um arquivo aplicando as regras

Refatore `<arquivo-alvo>` seguindo as regras de engenharia declaradas em
`rules/eng/`. **Substitua `<arquivo-alvo>` pelo caminho do arquivo** que você
quer refatorar (ex.: `src/modules/pedidos/application/checkout.rs` ou
`src/components/Checkout.svelte`).

Antes de começar, leia as regras relevantes:

- `rules/eng/01-file-size.md` (alvo ≤ 300 linhas)
- `rules/eng/03-solid.md` (SRP, DIP)
- `rules/eng/04-clean-architecture.md` (camadas)
- `rules/eng/05-simplicity.md` (anti-patterns)
- `rules/eng/06-continuous-refactoring.md` (ordem de trabalho)

## Fluxo

### 1. Leia o arquivo inteiro antes de propor mudança.

Se o arquivo pertence a um módulo maior, leia também os arquivos vizinhos para
entender as fronteiras de responsabilidade. Opcionalmente, use
`graphify path "<arquivo-alvo>" "<outro>"` para mapear dependências antes de
mexer. Se o módulo tiver diagrama versionado, no modo `documentar` use
`archify compare` opcionalmente para comunicar o delta depois do refactor; valide
o resultado contra o código. Sem Archify, atualize o `drift.md` manualmente.

### 2. Diagnóstico (antes de editar)

Identifique:

- **Linhas atuais vs alvo** — quanto excede 300, qual o split natural?
- **Responsabilidades distintas** — cada uma candidata a novo arquivo/módulo.
- **Imports violando camada** (Regra 4):
  - Domínio/aplicação importando SDK, IO ou framework? (veja
    `arch_violation_grep` em `stacks/`)
  - UI importando código de backend diretamente em vez da API declarada?
- **Funções/blocos de lógica > 60 linhas** (Regra 5).
- **Cobertura atual** — rode o teste do módulo (veja `stacks/` para `test_cmd`):
  - Antes de qualquer mudança estrutural, o teste existente deve passar.

### 3. Peça confirmação do plano ao humano.

Apresente o diagnóstico e o plano de split/movimentação. **Não comece a editar
sem confirmação** quando o escopo ultrapassa uma responsabilidade.

### 4. Execução (na ordem)

#### a. Rede de segurança (Regra 6)

- Função alvo sem teste → escreva **teste de caracterização** primeiro
  (captura o comportamento atual). Só então modifique.
- Rode os testes do módulo/pacote e confirme verde antes de qualquer mudança
  estrutural.
- Rode o typecheck/lint (veja `stacks/` para `typecheck_cmd`) e confirme verde.

#### b. Split por responsabilidade (Regras 1 e 3-SRP)

- Separe responsabilidades em arquivos distintos no mesmo módulo
  (`<feature>_<subresponsabilidade>.<ext>` ou submódulo).
- Extrai lógica de apresentação (ex.: `<script>` em Svelte, `setup()` em Vue)
  para um arquivo de helper ao lado (`<feature>.ts`).
- Responsabilidade de outra camada → mova para o módulo correto (Regra 4).
- **Preserve a API pública**, salvo escopo aprovado pelo humano.

#### c. Injeção de dependências (Regra 3-DIP)

- Substitua chamadas concretas a SDK/IO/subprocesso por traits/interfaces do
  consumidor (definidas em `domain/ports` ou equivalente).
- A struct/classe concreta permanece na camada de infraestrutura; o mock fica
  no teste.
- Frontend: nunca chame IPC/`invoke`/`fetch` direto de um componente — passe
  pela camada de API declarada.

#### d. Simplificação (Regra 5)

- Remova wrappers/flags booleanas que só repassam.
- Inline funções usadas em 1 lugar.
- Delete código morto (não comente).
- Estado local de componente: use o mecanismo reativo idiomático da stack
  (ex.: runes `$state` no Svelte 5), não stores globais.

### 5. Validação final

Rode a bateria completa do seu stack (veja `stacks/` para os comandos):

```bash
# Exemplos — substitua pelos comandos reais do seu stack.
# <test_cmd>        ex.: cargo test --lib | vitest run | pytest -q
# <lint_cmd>        ex.: cargo clippy -- -D warnings | npm run lint
# <typecheck_cmd>   ex.: npm run check | tsc --noEmit
# <build_cmd>       ex.: npm run build | cargo build | go build ./...
wc -l <arquivos-modificados>
```

Se o alvo tinha lógica de domínio pura, rode mutation testing no arquivo
(`mutation_tool` em `stacks/`) se a ferramenta estiver disponível, e reporte a
variação.

### 6. Relatório final

Entregue:

- **Antes/depois**: linhas, cobertura, eficácia de mutation.
- **Arquivos criados/removidos/modificados** (lista).
- **Mensagem de commit sugerida** — **não commitar sem pedido explícito**.

## Regras de comportamento

- **Nunca** remova testes para "simplificar". Teste é contrato.
- **Nunca** use `--no-verify` ou pule hooks.
- **Bug pré-existente descoberto no meio** → **pare e pergunte** ao humano
  (Regra 6). Não corrija no mesmo commit da refatoração.
- `<arquivo-alvo>` vazio, inexistente ou ambíguo → peça confirmação do alvo
  antes de prosseguir.
- Um commit, um motivo (Regra 6). Refatoração isolada de bugfix/feature.
