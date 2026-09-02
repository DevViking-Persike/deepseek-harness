<!--
========================================================
ADAPTER OPCIONAL — Claude Code (descomente ao instalar em .claude/commands/)
--------------------------------------------------------
description: Identificar e remover código morto, exports não usados e caminhos inalcançáveis.
========================================================
Corpo abaixo é markdown puro, portável para qualquer LLM.
========================================================
-->

# Limpeza de código morto

Identifique e remova código morto, exports não usados, tipos órfãos e caminhos
inalcançáveis do codebase. **Human-in-the-loop**: nenhuma remoção acontece sem
confirmação explícita do humano.

## Pré-requisitos

- Todas as mudanças pendentes commitadas ou stashed (working tree limpo).
- Crie um branch dedicado para a limpeza.
- Verifique que o projeto compila e passa nos testes antes de começar
  (veja `stacks/` para `typecheck_cmd`, `test_cmd`, `build_cmd`).

Se o projeto tiver ferramenta dedicada de detec de código não usado (ex.:
`knip`, `ts-prune`, `unimported`, `deadcode` para Go, `PEP 8` linters com
regras de unused), **use-a** na Fase 1. Se não tiver, a identificação é manual
via `grep`/`find` conforme abaixo.

## Fase 1 — Identificar arquivos não usados

1. Liste candidatos a arquivo não usado. Para cada extensão relevante do seu
   stack:

   ```bash
   find src -name '*.ts' -not -name '*.test.ts'
   find src -name '*.svelte'   # ou *.vue, *.jsx
   find src -name '*.go' -o -name '*.py' -o -name '*.rs'
   ```

2. Para cada candidato, verifique se há import em algum outro arquivo:

   ```bash
   grep -rl "<nome-do-arquivo-sem-extensao>" src
   ```

3. Documente: número de candidatos, imports não resolvidos, caminhos dos
   arquivos potencialmente órfãos.

## Fase 2 — Verificar arquivos não usados

4. Para cada arquivo órfão, confirme que é realmente não usado:

   - Busque por imports do nome do arquivo: `grep -r "filename" src`.
   - Busque por exports nomeados: `grep -r "ExportedName" src`.
   - Busque por imports dinâmicos (`import(...)`, `require(...)`, reflexão).
   - **CRÍTICO para barrel files (`index.ts`/`mod.rs`)**:
     - Verifique se os módulos filhos são usados em outro lugar.
     - Se os filhos são usados, **atualize os imports para apontar direto
       aos filhos primeiro**.
     - Só delete o barrel file depois de atualizar todos os imports.

5. **[human-in-the-loop]** Apresente a lista consolidada para confirmação.

## Fase 3 — Analisar exports não usados

6. Analise exports sistematicamente por pasta:

   ```bash
   grep -rn '^export ' src   # TS/JS
   grep -rn '^pub ' src      # Rust
   ```

7. Para cada export, verifique se há consumidor. Identifique tipos órfãos
   (`export type`, `export interface`, `pub struct` sem referência).

## Fase 4 — Identificar padrões de código morto

8. Busque por:

   - Arquivos vazios: `find src -type f -size 0`.
   - Código após `return`/`throw` (inalcançável).
   - Parâmetros de função nunca lidos.
   - Variáveis/constantes declaradas e nunca referenciadas.

   ```bash
   # Imports nomeados nunca usados (se o linter não pegar):
   grep -rn '^import ' src | head -40
   ```

## Fase 5 — Gerar relatório

9. Produza um relatório com:
   - Arquivos não usados.
   - Exports não usados.
   - Tipos não usados.
   - Locais de código morto (linha + categoria).
   - Estatística resumida (contagem por categoria).

10. Salve temporariamente como `UNUSED_CODE_REPORT.md` (não commitar — é
    rascunho).

11. **[human-in-the-loop]** Revise o relatório com o humano.

## Fase 6 — Executar limpeza (com aprovação)

12. Delete arquivos não usados **após aprovação item a item**.
13. Remova exports não usados.
14. Remova definições de tipo não usadas.
15. Remova código morto (ramos inalcançáveis, parâmetros não lidos).

Após cada lote de remoções, rode typecheck + testes (veja `stacks/`) e corrija
qualquer erro antes de prosseguir.

## Fase 7 — Limpar diretórios vazios

16. Encontre diretórios vazios: `find src -type d -empty`.
17. Delete os diretórios vazios confirmados.

## Fase 8 — Verificação

18. Rode typecheck + lint + testes completos (veja `stacks/`). Corrija qualquer
    erro.
19. Repita a Fase 1 (grep/find manual ou ferramenta dedicada) para confirmar a
    redução de código morto.

## Fase 9 — Finalização

20. Commit com mensagem isolada:

    ```
    chore: remove código morto, exports e tipos não usados
    ```

21. Delete o relatório temporário (`UNUSED_CODE_REPORT.md`).

## Diretrizes

**Faça:**

- Sempre crie um branch de backup antes de começar.
- Documente todos os achados antes de deletar.
- Verifique cada arquivo/export/tipo é realmente não usado.
- Rode typecheck + testes após cada lote de remoção.
- Respeite os passos **[human-in-the-loop]** — nunca pule.

**Não faça:**

- Nunca delete arquivo sem verificação.
- Nunca pule os passos de confirmação humana.
- Nunca delete barrel file sem antes atualizar imports para os filhos.
- Nunca remova imports com side-effect (ex.: `import './polyfills'`,
    `import 'something.css'`).

## Resultado esperado

- Arquivos não usados: tipicamente 2–10 removidos.
- Tipos não usados: vários removidos.
- Diretórios vazios: 5–20 limpos.
- Redução de 0,1–1% no total de arquivos de código.

(Valores variam bastante por projeto — use como expectativa aproximada, não
como meta.)
