# Regra 9 — UI responsiva (mobile-first)

Toda tela, rota e componente Svelte deve funcionar bem em **larguras de 360px até 1920px** sem quebrar layout, sem scroll horizontal indesejado e sem perder funcionalidade.

## Motivação
O njord-tauri é desktop hoje mas a UI será reaproveitada em janelas menores (split view, dock lateral) e em iterações futuras pode virar mobile. Layout fixo em px largos vai exigir refatoração inteira depois.

## Princípios

### 1. Mobile-first
Comece o CSS pensando em 360px de largura. Use `min-width` em media queries para **adicionar** comportamento em viewports maiores, nunca `max-width` removendo.

```css
/* RUIM — desktop-first */
.grid { grid-template-columns: 280px 1fr 340px; }
@media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }

/* BOM — mobile-first */
.grid { display: flex; flex-direction: column; gap: var(--space-3); }
@media (min-width: 1024px) {
  .grid { display: grid; grid-template-columns: 280px 1fr 340px; }
}
```

### 2. Sem largura/altura fixa em containers
Containers devem fluir. Use `flex`, `grid`, `auto`, `max-width`. Reserve `px` fixos pra ícones, avatares, botões.

```css
/* RUIM */
.sidebar { width: 320px; }

/* BOM */
.sidebar { width: 100%; max-width: 320px; }
```

### 3. Breakpoints padronizados (variáveis CSS)
Defina (uma única vez em `src/lib/theme/`) e reuse:
- `--bp-sm: 600px` — phones rotacionados
- `--bp-md: 900px` — tablets
- `--bp-lg: 1200px` — desktops
- `--bp-xl: 1600px` — telas grandes

```css
@media (min-width: 900px) { ... }
```

### 4. Touch targets ≥ 44px de lado
Botões, chips, switches: altura/largura efetiva ≥ 44px (incluindo padding). Não confie em hover state — pode ser touch.

### 5. Texto em `rem`/`em`, não `px`
Fonte base 16px. `rem` permite zoom acessível. `px` só pra borders e ícones.

### 6. Layouts 3-col viram stack
Em viewports < 1024px, layouts 3 colunas (ex.: `/notebooks/[id]`) devem virar stack vertical com prioridade clara (centro > esquerda > direita).

### 7. Sem overflow horizontal
`overflow-x: hidden` em `<body>` é band-aid. Achar a raiz: elemento com `width: 100vw + padding`, tabela sem `overflow-x: auto`, imagem sem `max-width: 100%`.

### 8. Inputs e formulários
- Inputs ocupam 100% da largura do container
- Labels acima do input (não ao lado em mobile)
- Botões agrupados viram vertical-stack em mobile

## Como aplicar

### Em código novo
- Começar mobile-first, breakpoints só pra expandir
- Reuse `var(--space-N)` pra spacing (tokens em `src/lib/theme/`)
- Container principal nunca tem largura fixa

### Em código existente
- Audite com a skill `/responsive-pass <rota>` — ela aplica checklist + sugere fix
- Refatore arquivo por arquivo, commit separado por componente

## Como verificar

### Manual (DevTools)
1. Abre o app no Chrome/Edge DevTools, modo responsivo
2. Testa em 4 viewports: 360×640, 768×1024, 1280×800, 1920×1080
3. Verifica:
   - Sem scroll horizontal em nenhum viewport
   - Botões clicáveis (≥ 44px)
   - Texto legível (sem corte, sem overflow)
   - Navegação acessível (sidebar colapsa em mobile)

### Grep automatizado
```bash
# Larguras fixas suspeitas em containers (ignora ícones/avatares)
rg 'width:\s*\d{3,}px' src/lib/components src/routes | grep -v 'icon\|avatar\|emoji'

# max-width media queries (anti-pattern desktop-first)
rg '@media.*max-width' src/

# Falta de responsive em components que tem layout
rg -L '@media' src/lib/components/notebooks/ src/routes/notebooks/
```

## Exceções aceitas
- Componentes de visualização inerentemente desktop (ex.: `MindMapCanvas` SVG com 50 nodes — pan/zoom em mobile fica fora do MVP)
- Tabelas densas (devem virar cards em mobile, mas pode ficar atrás de `overflow-x: auto` se urgente)
- Componentes vendored (ex.: `dados/redis/*`)

Violação exige justificativa no commit/PR.
