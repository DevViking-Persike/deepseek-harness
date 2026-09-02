# Regra 6 — Refatoração contínua

## Regra do escoteiro
Deixe o código melhor do que encontrou. Mas **no escopo apropriado** — nunca misture refatoração grande com bugfix/feature.

## Antes de adicionar feature
- Se o arquivo está > 280 linhas, refatorar primeiro (commit separado), feature depois.
- Se a função/componente alvo não tem teste, escrever teste de caracterização (cobre comportamento atual), só então modificar.

## Antes de refatorar
- `cargo test` (no crate alvo) e `npm run test` precisam passar.
- `cargo check` e `npm run check` (svelte-check) precisam passar.
- Testes existentes são contrato — não deletar. Se teste ficou obsoleto, substituir por equivalente no novo código.

## Commits
- Um motivo por commit. Mensagens em pt-BR, conventional commits:
  - `refactor: ...` para mudança estrutural sem mudar comportamento
  - `test: ...` para testes isolados
  - `fix: ...` para bugfix
  - `feat: ...` para nova feature
  - `docs: ...` para documentação/CLAUDE.md/rules
  - `chore: ...` para configuração de build, deps, tooling

## Bug descoberto no meio de refatoração
Parar, reportar ao usuário, perguntar se cria commit separado. **Não corrigir no mesmo commit** — ruído no histórico e dificulta revert.
