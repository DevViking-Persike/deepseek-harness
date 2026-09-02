---
description: Refatorar um arquivo aplicando as regras em .claude/rules/
argument-hint: <caminho/do/arquivo.{rs,svelte,ts}>
---

Refatore `$ARGUMENTS` seguindo as regras em `.claude/rules/`.

Leia antes de começar:
- `.claude/rules/01-file-size.md` (alvo ≤ 300 linhas)
- `.claude/rules/03-solid.md` (SRP, DIP)
- `.claude/rules/04-clean-architecture.md` (camadas)
- `.claude/rules/05-simplicity.md` (anti-patterns)
- `.claude/rules/06-continuous-refactoring.md` (ordem de trabalho)

## Fluxo

### 1. Leia o arquivo inteiro antes de propor mudança.

### 2. Diagnóstico (antes de editar)
- Linhas atuais vs alvo
- Responsabilidades distintas (cada uma candidata a novo arquivo/módulo)
- Imports violando camada:
  - `.rs`: gateway importando `tauri::`? `commands::` referenciando outro `commands::`?
  - `.svelte`: importando `@tauri-apps/api/core` direto em vez de `$lib/api/*`?
- Funções/blocos `<script>` > 60 linhas
- Cobertura atual:
  - Rust: `cd src-tauri && cargo test --lib <module>::tests`
  - Frontend: `npx vitest run <arquivo>`

### 3. Peça confirmação do plano ao usuário.

### 4. Execução (na ordem)

**a. Rede de segurança**
- Função alvo sem teste → escrever teste de caracterização primeiro (regra 6).
- Rust: `cd src-tauri && cargo test --lib <pkg>` deve passar antes de qualquer mudança estrutural.
- Svelte: smoke test via `npm run check` deve passar.

**b. Split por responsabilidade**
- Rust: novos arquivos no mesmo módulo: `<feature>_<subresponsibility>.rs` ou submódulo
  (exemplo: `gateways/jira/{client,issues,mutations}.rs`).
- Svelte: extrair `<script>` lógico para `$lib/<feature>/helpers.ts`. Subcomponentes em `$lib/components/<feature>/`.
- Responsabilidade de outra camada → mover para módulo correto (regra 4).
- Preservar API pública, salvo escopo aprovado.

**c. Injeção de dependências (regra 3 DIP)**
- Substituir chamadas concretas a SDK/`std::process::Command` por traits do consumidor.
- Struct concreta permanece no gateway; mock via `mockito` ou trait fake em `#[cfg(test)]`.
- Frontend: nunca chamar `invoke()` direto de componente — passar via `$lib/api/*`.

**d. Simplificação (regra 5)**
- Remover wrappers/flags booleanas que só repassam.
- Inlinar funções usadas em 1 lugar.
- Deletar código morto (não comentar).
- Svelte 5: trocar stores `writable` por `$state` quando o estado é local de componente.

### 5. Validação final
```bash
cd src-tauri && cargo test --lib
cd src-tauri && cargo clippy --all-targets -- -D warnings
npm run check
npm run build
wc -l <arquivos_mexidos>
```
Se alvo era `gateways/`: rodar `cargo mutants --file <arquivo>` se a tool estiver instalada e reportar variação.

### 6. Relatório final
- Antes/depois: linhas, cobertura, eficácia
- Arquivos criados/removidos/modificados
- Mensagem de commit sugerida (não commitar sem pedido)

## Regras de comportamento
- **Nunca** remova testes para "simplificar".
- **Nunca** use `--no-verify` ou pule hooks.
- Bug pré-existente descoberto → parar e perguntar (regra 6).
- `$ARGUMENTS` vazio/inexistente → pedir confirmação do alvo.
