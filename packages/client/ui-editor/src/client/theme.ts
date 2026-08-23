/**
 * The editor's syntax theme, derived from the harness palette.
 *
 * The harness already owns a syntax palette: `ui-theme/src/styles/shiki.css`
 * publishes `--shiki-token-*` for every highlighted code block, in both light
 * and dark. Monaco cannot read CSS custom properties — its themes take literal
 * colors — so the values are resolved from the live document at theme-build
 * time. Code in the editor therefore matches code in a chat message instead of
 * introducing a second, competing palette.
 */

/** One Monaco token rule: a scope prefix painted with a resolved color. */
interface TokenRule {
  token: string
  foreground: string
  fontStyle?: string
}

/** The harness palette entries this theme reads, with their fallbacks. */
const PALETTE = {
  foreground: ['--shiki-foreground', '#e6e6e6'],
  background: ['--dsw-alias-bg-layer-1', '#1e1e1e'],
  comment: ['--shiki-token-comment', '#adb5bd'],
  keyword: ['--shiki-token-keyword', '#faa2c1'],
  string: ['--shiki-token-string', '#69db7c'],
  constant: ['--shiki-token-constant', '#4dabf7'],
  parameter: ['--shiki-token-parameter', '#ffa94d'],
  function: ['--shiki-token-function', '#b197fc'],
  punctuation: ['--shiki-token-punctuation', '#ced4da'],
} as const satisfies Record<string, readonly [string, string]>

/** A resolved palette: every entry a literal color Monaco accepts. */
export type ResolvedPalette = Record<keyof typeof PALETTE, string>

/**
 * Normalize a CSS color to the `#rrggbb` literal Monaco requires. Monaco
 * rejects `rgb()`, named colors, and the empty string, so anything it cannot
 * consume falls back rather than breaking theme registration.
 *
 * @param value - the raw computed value.
 * @param fallback - the color to use when `value` is unusable.
 * @returns a `#rrggbb` or `#rrggbbaa` literal.
 */
export function normalizeColor(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(trimmed)) return trimmed
  // `#abc` is valid CSS but not accepted by Monaco; expand it.
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed)
  if (short !== null) {
    const [, r = '0', g = '0', b = '0'] = short
    return `#${r}${r}${g}${g}${b}${b}`
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(trimmed)
  if (rgb !== null) {
    const [, r = '0', g = '0', b = '0'] = rgb
    const hex = (raw: string): string => Math.max(0, Math.min(255, Math.round(Number(raw))))
      .toString(16).padStart(2, '0')
    return `#${hex(r)}${hex(g)}${hex(b)}`
  }
  return fallback
}

/**
 * Resolve the harness palette from the live document.
 *
 * @param element - the element to resolve custom properties against; the
 *   editor host, so a scoped theme override still applies.
 * @returns the resolved palette.
 */
export function resolvePalette(element: Element): ResolvedPalette {
  const computed = getComputedStyle(element)
  const entries = Object.entries(PALETTE).map(([key, [property, fallback]]) => (
    [key, normalizeColor(computed.getPropertyValue(property), fallback)] as const
  ))
  return Object.fromEntries(entries) as ResolvedPalette
}

/**
 * Monaco token rules for the resolved palette. The scopes are prefixes, so a
 * language that reports `keyword.control` is covered by the `keyword` rule.
 *
 * @param palette - the resolved harness palette.
 * @returns the token rules.
 */
export function tokenRules(palette: ResolvedPalette): TokenRule[] {
  const strip = (color: string): string => color.replace('#', '')
  return [
    { token: 'comment', foreground: strip(palette.comment), fontStyle: 'italic' },
    { token: 'keyword', foreground: strip(palette.keyword) },
    { token: 'keyword.operator', foreground: strip(palette.punctuation) },
    { token: 'string', foreground: strip(palette.string) },
    { token: 'string.escape', foreground: strip(palette.parameter) },
    { token: 'number', foreground: strip(palette.constant) },
    { token: 'regexp', foreground: strip(palette.string) },
    { token: 'constant', foreground: strip(palette.constant) },
    { token: 'type', foreground: strip(palette.constant) },
    { token: 'type.identifier', foreground: strip(palette.constant) },
    { token: 'entity.name.function', foreground: strip(palette.function) },
    { token: 'function', foreground: strip(palette.function) },
    { token: 'variable', foreground: strip(palette.foreground) },
    { token: 'variable.parameter', foreground: strip(palette.parameter) },
    { token: 'attribute.name', foreground: strip(palette.function) },
    { token: 'attribute.value', foreground: strip(palette.string) },
    { token: 'tag', foreground: strip(palette.keyword) },
    { token: 'delimiter', foreground: strip(palette.punctuation) },
    { token: 'operator', foreground: strip(palette.punctuation) },
    { token: 'key', foreground: strip(palette.function) },
  ]
}

/** The theme name this module registers under. */
export const EDITOR_THEME = 'dsh-harness'

/**
 * Build the Monaco theme definition for a resolved palette.
 *
 * @param palette - the resolved harness palette.
 * @param dark - whether the page is on the dark palette.
 * @returns the theme definition Monaco's `defineTheme` accepts.
 */
export function buildTheme(palette: ResolvedPalette, dark: boolean): {
  base: 'vs' | 'vs-dark'
  inherit: boolean
  rules: TokenRule[]
  colors: Record<string, string>
} {
  return {
    // Inheriting keeps every scope this palette does not name painted by
    // Monaco's own defaults rather than falling back to plain foreground.
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: tokenRules(palette),
    colors: {
      'editor.background': palette.background,
      'editor.foreground': palette.foreground,
      'editorLineNumber.foreground': palette.comment,
      'editorLineNumber.activeForeground': palette.foreground,
      'editorIndentGuide.background': `${palette.punctuation}33`,
      'editorCursor.foreground': palette.function,
    },
  }
}

/**
 * Whether the page is currently on the dark palette.
 * @returns true when the dark palette is active.
 */
export function isDarkTheme(): boolean {
  return document.body.hasAttribute('data-ds-dark-theme')
}
