# Regra 9 — UI responsiva (mobile-first)

> **3 camadas:** Camada 1 (Princípio) é universal para qualquer UI web · Camada 2 (Preset por framework) mostra onde moram tokens/breakpoints · Camada 3 traz um exemplo. Veja `_layer-guide.md`.

## Camada 1 — Princípio universal

Toda tela, rota e componente deve funcionar bem em **larguras de 360px até 1920px** sem quebrar layout, sem scroll horizontal indesejado e sem perder funcionalidade.

### Motivação
A UI pode ser reaproveitada em janelas menores (split view, dock lateral) e em iterações futuras pode virar mobile. Layout fixo em px largos vai exigir refatoração inteira depois.

### Princípios
1. **Mobile-first** — comece o CSS pensando em 360px. Use `min-width` em media queries para **adicionar** comportamento em viewports maiores, nunca `max-width` removendo.
2. **Sem largura/altura fixa em containers** — use `flex`, `grid`, `auto`, `max-width`. Reserve `px` fixos para ícones, avatares, botões.
3. **Breakpoints padronizados** (variáveis CSS, definidas uma única vez no design system):
   - `--bp-sm: 600px` · `--bp-md: 900px` · `--bp-lg: 1200px` · `--bp-xl: 1600px`
4. **Touch targets ≥ 44px** de lado (incluindo padding). Não confie em hover state — pode ser touch.
5. **Texto em `rem`/`em`, não `px`** — fonte base 16px; `rem` permite zoom acessível. `px` só para borders e ícones.
6. **Layouts 3-col viram stack** — em viewports < 1024px, viram stack vertical com prioridade clara (centro > esquerda > direita).
7. **Sem overflow horizontal** — `overflow-x: hidden` em `<body>` é band-aid. Achar a raiz: elemento com `width: 100vw + padding`, tabela sem `overflow-x: auto`, imagem sem `max-width: 100%`.
8. **Inputs e formulários** — inputs ocupam 100% da largura do container; labels acima do input (não ao lado em mobile); botões agrupados viram stack vertical em mobile.

### Exceções aceitas
- Componentes de visualização inerentemente desktop (ex.: canvas SVG denso com pan/zoom — fora do MVP em mobile).
- Tabelas densas (devem virar cards em mobile; pode ficar atrás de `overflow-x: auto` se urgente).
- Componentes vendored de terceiro.

## Camada 2 — Preset por framework

> Veja `stacks/frontend/`. Onde moram tokens/breakpoints em cada framework. Pule os não usados.

### Svelte (SvelteKit ou SPA)
- **Tokens/breakpoints:** `<preencher: src/lib/theme/>` — defina `--bp-*` e `--space-N` aqui, uma única vez; reuse via `var(--bp-md)`.
- **Componentes:** `<preencher: src/lib/components/>` (atoms/molecules) + `<preencher: src/routes/>` (pages).
- Svelte 5 runes (`$state`/`$derived`): estado local não afeta CSS — mas evite stores globais para estado só de layout.

### Angular
- **Tokens:** `<preencher: src/styles/>` (global) ou tokens em `theme/` injetados via `@Component({ stylesUrl })`.
- Use `breakpointObserver` do `@angular/cdk/layout` para lógica reativa por viewport (não apenas CSS).
- Componentes: `<preencher: src/app/<feature>/components/>`.

### React
- **Tokens:** `<preencher: src/styles/>` ou via design system (ex.: Tailwind `theme.screens`, styled-components theme).
- **Componentes:** `<preencher: src/components/>` (primitivos) + `<preencher: src/pages ou app/>` (rotas).
- Prefira media queries em CSS/SCSS; use `useMediaQuery` só quando a lógica de render depende do viewport.

> Mobile-first independe de framework: mesmo em Angular/React, comece em 360px e expanda com `min-width`.

## Camada 3 — Exemplo concreto

Grid 3 colunas que vira stack em mobile (mobile-first, qualquer framework):

```css
/* BOM — mobile-first: nasce stack, vira grid só em telas largas */
.grid { display: flex; flex-direction: column; gap: var(--space-3); }
@media (min-width: 1024px) {
  .grid { display: grid; grid-template-columns: 280px 1fr 340px; }
}
```
```css
/* RUIM — desktop-first: nasce grid e é removido em mobile (anti-pattern) */
.grid { grid-template-columns: 280px 1fr 340px; }
@media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
```

## Como verificar

### Manual (DevTools)
1. Abra o app no Chrome/Edge DevTools, modo responsivo.
2. Teste em 4 viewports: 360×640, 768×1024, 1280×800, 1920×1080.
3. Verifique: sem scroll horizontal; botões clicáveis (≥ 44px); texto legível; navegação acessível (sidebar colapsa em mobile).

### Grep automatizado
```bash
# Larguras fixas suspeitas em containers (ignora ícones/avatares)
<preencher: grep de 'width:\s*\d{3,}px' nos dirs de componentes> | grep -v 'icon\|avatar\|emoji'

# max-width media queries (anti-pattern desktop-first)
<preencher: grep de '@media.*max-width' na raiz do frontend>

# Componentes com layout que não declaram nenhum @media
<preencher: grep -L '@media' nos dirs de componentes de layout>
```
Violação exige justificativa no commit/PR.
