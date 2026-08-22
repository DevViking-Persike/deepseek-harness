/**
 * File-type icons for the tree.
 *
 * Icons are drawn as a short glyph plus a per-language color rather than
 * pulled from an icon font: a font is a second asset to serve and a second
 * license to carry, and at 12px a colored letterform reads as fast as a
 * pictogram. Colors are literal because they are language identity — the
 * TypeScript blue is the same on both palettes — not theme surface.
 */

/** One file-type mark: the glyph shown and the color it carries. */
export interface FileIcon {
  /** Short glyph, at most two characters. */
  readonly glyph: string
  /** Literal color; language identity does not change with the palette. */
  readonly color: string
}

/**
 * Default directory marks, used for a folder whose name carries no meaning of
 * its own.
 *
 * The tree draws folders as an inline SVG (`FolderGlyph`), so `glyph` is not
 * rendered for a directory — no text glyph both reads as a folder and accepts
 * a color. The field stays for a uniform shape, and `color` is what the row
 * actually uses.
 */
export const FOLDER_ICON: FileIcon = { glyph: '', color: '#c99a3f' }
export const FOLDER_OPEN_ICON: FileIcon = { glyph: '', color: '#e8b84b' }

/**
 * Folders whose name identifies their role, following the Material Icon Theme
 * convention (MIT, material-extensions/vscode-material-icon-theme): a project
 * tree is scanned by shape, and `src`, `tests`, and `node_modules` are found
 * far faster when each carries its own color than when every folder is amber.
 *
 * The table is deliberately shorter than the upstream one: only names that
 * actually recur across projects earn an entry, because a mark that fires
 * rarely costs recognition without repaying it.
 */
const FOLDER_BY_NAME: Readonly<Record<string, FileIcon>> = {
  src: { glyph: '', color: '#4dabf7' },
  source: { glyph: '', color: '#4dabf7' },
  lib: { glyph: '', color: '#4dabf7' },
  packages: { glyph: '', color: '#4dabf7' },
  app: { glyph: '', color: '#4dabf7' },
  components: { glyph: '', color: '#38d9a9' },
  views: { glyph: '', color: '#38d9a9' },
  pages: { glyph: '', color: '#38d9a9' },
  routes: { glyph: '', color: '#38d9a9' },
  test: { glyph: '', color: '#a9e34b' },
  tests: { glyph: '', color: '#a9e34b' },
  __tests__: { glyph: '', color: '#a9e34b' },
  spec: { glyph: '', color: '#a9e34b' },
  e2e: { glyph: '', color: '#a9e34b' },
  coverage: { glyph: '', color: '#a9e34b' },
  node_modules: { glyph: '', color: '#8b3a3a' },
  vendor: { glyph: '', color: '#8b3a3a' },
  dist: { glyph: '', color: '#f783ac' },
  build: { glyph: '', color: '#f783ac' },
  out: { glyph: '', color: '#f783ac' },
  target: { glyph: '', color: '#f783ac' },
  bin: { glyph: '', color: '#f783ac' },
  docs: { glyph: '', color: '#74c0fc' },
  doc: { glyph: '', color: '#74c0fc' },
  config: { glyph: '', color: '#ffa94d' },
  scripts: { glyph: '', color: '#ffd43b' },
  assets: { glyph: '', color: '#da77f2' },
  static: { glyph: '', color: '#da77f2' },
  public: { glyph: '', color: '#da77f2' },
  images: { glyph: '', color: '#da77f2' },
  styles: { glyph: '', color: '#4dabf7' },
  css: { glyph: '', color: '#4dabf7' },
  types: { glyph: '', color: '#3178c6' },
  '@types': { glyph: '', color: '#3178c6' },
  hooks: { glyph: '', color: '#38d9a9' },
  utils: { glyph: '', color: '#adb5bd' },
  helpers: { glyph: '', color: '#adb5bd' },
  store: { glyph: '', color: '#b197fc' },
  state: { glyph: '', color: '#b197fc' },
  api: { glyph: '', color: '#63e6be' },
  server: { glyph: '', color: '#63e6be' },
  db: { glyph: '', color: '#ffa94d' },
  database: { glyph: '', color: '#ffa94d' },
  migrations: { glyph: '', color: '#ffa94d' },
  docker: { glyph: '', color: '#2496ed' },
  k8s: { glyph: '', color: '#326ce5' },
  kubernetes: { glyph: '', color: '#326ce5' },
  '.github': { glyph: '', color: '#adb5bd' },
  '.git': { glyph: '', color: '#f14e32' },
  '.vscode': { glyph: '', color: '#4dabf7' },
  locales: { glyph: '', color: '#ffd43b' },
  i18n: { glyph: '', color: '#ffd43b' },
  logs: { glyph: '', color: '#868e96' },
  tmp: { glyph: '', color: '#868e96' },
  cache: { glyph: '', color: '#868e96' },
}

/** Fallback for a file whose type this table does not name. */
export const FILE_ICON: FileIcon = { glyph: '·', color: '#8a9199' }

/** Extension (no dot, lowercase) to its mark. */
const BY_EXTENSION: Readonly<Record<string, FileIcon>> = {
  ts: { glyph: 'TS', color: '#3178c6' },
  mts: { glyph: 'TS', color: '#3178c6' },
  cts: { glyph: 'TS', color: '#3178c6' },
  tsx: { glyph: 'TX', color: '#3178c6' },
  js: { glyph: 'JS', color: '#f7df1e' },
  mjs: { glyph: 'JS', color: '#f7df1e' },
  cjs: { glyph: 'JS', color: '#f7df1e' },
  jsx: { glyph: 'JX', color: '#f7df1e' },
  json: { glyph: '{}', color: '#f7b93e' },
  md: { glyph: 'M', color: '#7cc5ff' },
  markdown: { glyph: 'M', color: '#7cc5ff' },
  css: { glyph: '#', color: '#2196f3' },
  scss: { glyph: '#', color: '#cf649a' },
  less: { glyph: '#', color: '#1d365d' },
  html: { glyph: '<>', color: '#e34c26' },
  yml: { glyph: 'Y', color: '#cb171e' },
  yaml: { glyph: 'Y', color: '#cb171e' },
  toml: { glyph: 'T', color: '#9c4221' },
  ini: { glyph: 'T', color: '#9c4221' },
  sh: { glyph: '$', color: '#89e051' },
  bash: { glyph: '$', color: '#89e051' },
  zsh: { glyph: '$', color: '#89e051' },
  py: { glyph: 'PY', color: '#3572a5' },
  rs: { glyph: 'RS', color: '#dea584' },
  go: { glyph: 'GO', color: '#00add8' },
  java: { glyph: 'JV', color: '#b07219' },
  rb: { glyph: 'RB', color: '#701516' },
  php: { glyph: 'PH', color: '#4f5d95' },
  c: { glyph: 'C', color: '#555555' },
  h: { glyph: 'H', color: '#555555' },
  cpp: { glyph: 'C+', color: '#f34b7d' },
  hpp: { glyph: 'H+', color: '#f34b7d' },
  sql: { glyph: 'SQ', color: '#e38c00' },
  xml: { glyph: '<>', color: '#0060ac' },
  svg: { glyph: '◇', color: '#ffb13b' },
  png: { glyph: '▣', color: '#a074c4' },
  jpg: { glyph: '▣', color: '#a074c4' },
  jpeg: { glyph: '▣', color: '#a074c4' },
  gif: { glyph: '▣', color: '#a074c4' },
  webp: { glyph: '▣', color: '#a074c4' },
  lock: { glyph: '◆', color: '#8a9199' },
  txt: { glyph: '≡', color: '#adb5bd' },
  text: { glyph: '≡', color: '#adb5bd' },
  log: { glyph: '≡', color: '#8a9199' },
  csv: { glyph: '⊞', color: '#4caf50' },
  map: { glyph: '{}', color: '#6c7680' },
}

/** Whole file names that carry their own identity regardless of extension. */
const BY_NAME: Readonly<Record<string, FileIcon>> = {
  'package.json': { glyph: '{}', color: '#cb3837' },
  'pnpm-lock.yaml': { glyph: '◆', color: '#f9ad00' },
  'tsconfig.json': { glyph: '{}', color: '#3178c6' },
  'dockerfile': { glyph: '▤', color: '#2496ed' },
  'docker-compose.yml': { glyph: '▤', color: '#2496ed' },
  'docker-compose.yaml': { glyph: '▤', color: '#2496ed' },
  'compose.yml': { glyph: '▤', color: '#2496ed' },
  'compose.yaml': { glyph: '▤', color: '#2496ed' },
  '.gitignore': { glyph: '±', color: '#f14e32' },
  '.env': { glyph: '=', color: '#edd54c' },
  'readme.md': { glyph: 'M', color: '#7cc5ff' },
  'license': { glyph: '§', color: '#d9c8a9' },
  'makefile': { glyph: '⚙', color: '#8a9199' },
}

/**
 * The mark for one tree row.
 *
 * @param name - the entry's base name.
 * @param directory - whether the entry is a directory.
 * @param expanded - whether an expanded directory is open.
 * @returns the glyph and color to paint.
 */
export function iconFor(name: string, directory: boolean, expanded = false): FileIcon {
  if (directory) {
    // A named folder keeps its own color in both states; only the glyph opens.
    const named = FOLDER_BY_NAME[name.toLowerCase()]
    if (named !== undefined) {
      return expanded ? { glyph: FOLDER_OPEN_ICON.glyph, color: named.color } : named
    }
    return expanded ? FOLDER_OPEN_ICON : FOLDER_ICON
  }
  const lower = name.toLowerCase()
  const byName = BY_NAME[lower]
  if (byName !== undefined) return byName
  const dot = lower.lastIndexOf('.')
  if (dot > 0) {
    const byExtension = BY_EXTENSION[lower.slice(dot + 1)]
    if (byExtension !== undefined) return byExtension
  }
  return FILE_ICON
}
