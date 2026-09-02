---
description: Auditar e refatorar UI responsiva aplicando Regra 9 (.claude/rules/09-responsive-ui.md). Mobile-first, breakpoints, sem larguras fixas.
argument-hint: <rota/ou/componente.svelte | "all">
---

Audite e refatore `$ARGUMENTS` aplicando a **Regra 9** (`.claude/rules/09-responsive-ui.md`).

Se `$ARGUMENTS` = `all`, escopa em ordem: `src/routes/notebooks/`, depois `src/routes/`, depois `src/lib/components/notebooks/`, depois `src/lib/components/`.

## Antes de mexer
1. Leia `.claude/rules/09-responsive-ui.md` inteiro.
2. Leia o arquivo alvo.
3. Liste anti-patterns encontrados (referencia linha + categoria):
   - Larguras fixas em containers (`width: 280px;` etc.)
   - `@media (max-width: ...)` (desktop-first invertido)
   - `grid-template-columns` com 3+ colunas sem fallback mobile
   - Touch targets < 44px
   - Inputs `width: <fixo>`
   - Falta de breakpoint em rotas com layout multi-coluna

## Fluxo de fix

### 1. Container raiz da rota/componente
- Substitui `width: <px>` por `width: 100%; max-width: <px>`
- Adiciona `min-height: 0` em flex children que precisam scrollar internamente

### 2. Grids multi-coluna
Padrão antes:
```css
.grid { display: grid; grid-template-columns: 280px 1fr 340px; }
```
Padrão depois (mobile-first):
```css
.grid { display: flex; flex-direction: column; gap: var(--space-3); }
@media (min-width: 1024px) {
  .grid {
    display: grid;
    grid-template-columns: 280px 1fr 340px;
  }
}
```

### 3. Botões e ícones
- Min-height: `44px` em buttons interativos (touch target)
- Em mobile, ações secundárias (Excluir, Restaurar) viram menu/swipe? Para MVP, mantém visível mas garante 44px.

### 4. Formulários
- `input`, `select`, `textarea`: `width: 100%`
- `<label>` acima do controle (não ao lado) — naturalmente já assim com `flex-direction: column`

### 5. Tipografia
- Trocar `font-size: 14px` por `font-size: 0.875rem` (= 14px com base 16)
- Trocar `font-size: 12px` por `0.75rem`
- Manter `px` em `border-width`, `box-shadow` offsets e ícones

### 6. Sidebar / navegação
- Em < 900px, sidebar vira drawer (overlay) ou top-bar com hamburger.
- Use `var(--bp-md)` (definir em `src/lib/theme/breakpoints.css` se não existir).

## Validação
Após cada fix:
```bash
npm run check
npm run test
```

Teste visual no DevTools modo responsivo:
- 360×640 (smartphone)
- 768×1024 (tablet)
- 1280×800 (laptop)
- 1920×1080 (desktop)

## Commit
Um commit por componente. Mensagem:
```
refactor(ui): <Component> responsivo (Regra 9)

- Mobile-first com fallback grid em ≥ 1024px
- Larguras fixas → max-width
- Touch targets ≥ 44px

Refs: .claude/rules/09-responsive-ui.md
```

## Não fazer
- Refactor de comportamento — só CSS/layout
- Adicionar lib (ex.: `tailwind`) sem aprovação
- Tocar componentes vendored (`dados/redis/*` ficam de fora)
- Misturar com bugfix/feature — commit isolado

## Output ao terminar
Lista de arquivos tocados + summary das categorias de fix aplicadas + screenshots/checklist do teste visual nos 4 viewports.
