<!--
========================================================
ADAPTER OPCIONAL — Claude Code (descomente ao instalar em .claude/commands/)
--------------------------------------------------------
description: Auditar e refatorar UI responsiva (mobile-first) aplicando a regra de UI responsiva.
argument-hint: <rota/ou/componente-alvo.ext | "all">
========================================================
Corpo abaixo é markdown puro, portável para qualquer LLM.
O argumento <rota/componente-alvo> é descrito em prosa na próxima seção.
========================================================
-->

# Pass de UI responsiva (mobile-first)

Audite e refatore `<rota/componente-alvo>` aplicando a regra de UI responsiva
(declarada em `rules/eng/`, geralmente a `09-responsive-ui.md`). **Substitua
`<rota/componente-alvo>`** pelo caminho da rota ou componente que você quer
tornar responsivo (ex.: `src/routes/checkout/+page.svelte` ou
`src/components/OrderBook.svelte`).

Se `<rota/componente-alvo>` for `all`, escaneie em ordem: rotas principais →
rotas internas → componentes de feature → componentes compartilhados.

## Antes de mexer

1. Leia a regra de UI responsiva inteira (`rules/eng/09-responsive-ui.md`).
2. Leia o arquivo-alvo.
3. Liste anti-patterns encontrados (referencie linha + categoria):
   - Larguras fixas em containers (`width: 280px;` etc.).
   - `@media (max-width: ...)` (desktop-first invertido).
   - `grid-template-columns` com 3+ colunas sem fallback mobile.
   - Touch targets < 44px (botões/chips/switches).
   - Inputs com `width: <fixo>`.
   - Falta de breakpoint em rotas com layout multi-coluna.

## Fluxo de fix

### 1. Container raiz da rota/componente

- Troque `width: <px>` por `width: 100%; max-width: <px>`.
- Adicione `min-height: 0` em flex children que precisam rolar internamente.

### 2. Grids multi-coluna

Padrão **antes** (desktop-first, quebra em mobile):

```css
.grid { display: grid; grid-template-columns: 280px 1fr 340px; }
```

Padrão **depois** (mobile-first, expande em viewports maiores):

```css
.grid { display: flex; flex-direction: column; gap: var(--space-3); }
@media (min-width: 1024px) {
  .grid {
    display: grid;
    grid-template-columns: 280px 1fr 340px;
  }
}
```

### 3. Botões e ícones (touch targets)

- Garanta `min-height: 44px` (e `min-width: 44px` quando couber) em elementos
  interativos — botões, chips, switches, ícones clicáveis.
- Em mobile, ações secundárias (Excluir, Restaurar) podem virar menu/swipe;
  para MVP, mantenha visíveis mas respeitando 44px.

### 4. Formulários

- `input`, `select`, `textarea`: `width: 100%`.
- `<label>` acima do controle (não ao lado em mobile) — naturalmente já fica
  assim com `flex-direction: column`.

### 5. Tipografia

- Troque `font-size: 14px` por `font-size: 0.875rem` (= 14px com base 16).
- Troque `font-size: 12px` por `0.75rem`.
- **Mantenha `px`** em `border-width`, offsets de `box-shadow` e dimensões de
  ícones.

### 6. Sidebar / navegação

- Em < 900px, sidebar vira drawer (overlay) ou top-bar com hamburger.
- Use variáveis de breakpoint padronizadas (`--bp-sm`, `--bp-md`, `--bp-lg`,
  `--bp-xl`) definidas nos tokens de design do projeto.

## Validação

Após cada fix, rode o typecheck e os testes do stack (veja `stacks/`):

```bash
# Exemplos — substitua pelos comandos reais do seu stack.
# <typecheck_cmd>  ex.: npm run check | tsc --noEmit
# <test_cmd>       ex.: npm run test | vitest run
```

**Teste visual** no DevTools (ou equivalente) em modo responsivo, nestes
viewports:

- 360×640 (smartphone)
- 768×1024 (tablet)
- 1280×800 (laptop)
- 1920×1080 (desktop)

Confirme: sem scroll horizontal indesejado, touch targets ≥ 44px, texto legível
sem corte, navegação acessível.

## Commit

**Um commit por componente.** Mensagem (adapte o escopo ao projeto):

```
refactor(ui): <Componente> responsivo (mobile-first)

- Mobile-first com fallback grid em ≥ 1024px
- Larguras fixas → max-width
- Touch targets ≥ 44px

Refs: rules/eng/09-responsive-ui.md
```

## Não fazer

- Refactor de comportamento — **só CSS/layout**.
- Adicionar lib (ex.: Tailwind) sem aprovação.
- Tocar componentes vendored/de terceiro.
- Misturar com bugfix/feature — commit isolado (Regra 6).

## Output ao terminar

Lista de arquivos tocados + resumo das categorias de fix aplicadas +
screenshots/checklist do teste visual nos 4 viewports.
