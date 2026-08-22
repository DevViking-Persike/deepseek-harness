/**
 * Loads the Monaco editor from the host's own asset route.
 *
 * Monaco is a multi-file distribution and the plugin channel serves exactly one
 * file per plugin, so the editor is not bundled here: the host serves it under
 * `/monaco` and this module pulls it in through Monaco's AMD loader at first
 * use. Nothing is fetched until someone opens the tab.
 */

/** The subset of the Monaco API this plugin uses. */
export interface MonacoApi {
  editor: {
    create: (host: HTMLElement, options: Record<string, unknown>) => MonacoEditor
    setModelLanguage: (model: MonacoModel, language: string) => void
    setTheme: (theme: string) => void
    defineTheme: (name: string, theme: unknown) => void
  }
  languages: {
    setLanguageConfiguration: (languageId: string, configuration: unknown) => { dispose: () => void }
    getLanguages: () => { id: string }[]
  }
}

/** One editor instance. */
export interface MonacoEditor {
  getValue: () => string
  setValue: (value: string) => void
  getModel: () => MonacoModel | null
  onDidChangeModelContent: (listener: () => void) => { dispose: () => void }
  addCommand: (keybinding: number, handler: () => void) => void
  updateOptions: (options: Record<string, unknown>) => void
  layout: () => void
  dispose: () => void
}

/** One text model behind an editor. */
export interface MonacoModel {
  uri: unknown
}

/** The AMD loader Monaco's distribution installs on the page. */
interface AmdLoader {
  config: (options: { paths: Record<string, string> }) => void
  (modules: readonly string[], onLoad: (api: MonacoApi) => void, onError?: (error: unknown) => void): void
}

/** The globals Monaco's loader reads and writes on the page. */
interface MonacoWindow {
  require?: AmdLoader
  monaco?: MonacoApi
  MonacoEnvironment?: { getWorker: () => Worker }
}

/**
 * The page's Monaco globals. Monaco publishes itself on `window`, which is the
 * only handle its AMD loader offers.
 */
function monacoWindow(): MonacoWindow {
  return window as unknown as MonacoWindow
}

/** In-flight or settled load, so several tabs share one distribution. */
let pending: Promise<MonacoApi> | undefined

/** Load one script tag and resolve when the browser finished executing it. */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-dsh-monaco="${src}"]`)
    if (existing !== null) {
      if (existing.dataset.loaded === '1') {
        resolve()
        return
      }
      existing.addEventListener('load', () => { resolve() }, { once: true })
      existing.addEventListener('error', () => { reject(new Error(`failed to load ${src}`)) }, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.dataset.dshMonaco = src
    script.addEventListener('load', () => {
      script.dataset.loaded = '1'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => { reject(new Error(`failed to load ${src}`)) }, { once: true })
    document.head.appendChild(script)
  })
}

/**
 * Load Monaco once and reuse it afterwards.
 *
 * @param route - the host route the distribution is served under.
 * @returns the Monaco API.
 */
export function loadMonaco(route = '/monaco'): Promise<MonacoApi> {
  if (pending !== undefined) return pending
  pending = (async () => {
    const win = monacoWindow()
    if (win.monaco !== undefined) return win.monaco
    // Monaco runs its language services in web workers. Serving those workers
    // cross-origin is the usual friction, and Monaco itself degrades to
    // running them on the main thread when none is supplied — which keeps
    // highlighting, folding, find, and multi-cursor working. This editor does
    // no cross-file analysis, so that trade is the right one here.
    win.MonacoEnvironment = {
      getWorker: () => {
        throw new Error('dsh-ui-editor runs Monaco without workers')
      },
    }
    await loadScript(`${route}/loader.js`)
    const amd = win.require
    if (amd === undefined) throw new Error('monaco loader did not install its AMD require')
    amd.config({ paths: { vs: route } })
    return new Promise<MonacoApi>((resolve, reject) => {
      amd(['vs/editor/editor.main'], () => {
        const api = monacoWindow().monaco
        if (api === undefined) {
          reject(new Error('monaco loaded without publishing its API'))
          return
        }
        resolve(api)
      }, reject)
    })
  })().catch((error: unknown) => {
    // A failed load must not poison every later attempt: clear the cache so
    // reopening the tab retries instead of replaying the same rejection.
    pending = undefined
    throw error
  })
  return pending
}

/** Reset the cached load. Tests mount several pages in one process. */
export function resetMonacoForTests(): void {
  pending = undefined
}

/** File extension to Monaco language id, for the languages this editor opens. */
const LANGUAGES: Readonly<Record<string, string>> = {
  // TypeScript / JavaScript family
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  // .NET
  cs: 'csharp', csx: 'csharp', vb: 'vb', fs: 'fsharp', fsx: 'fsharp',
  razor: 'razor', cshtml: 'razor',
  // Systems
  rs: 'rust', go: 'go', c: 'c', h: 'c',
  cpp: 'cpp', cxx: 'cpp', cc: 'cpp', hpp: 'cpp', hxx: 'cpp', hh: 'cpp',
  m: 'objective-c', mm: 'objective-c', swift: 'swift', zig: 'plaintext',
  // JVM and friends
  java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', sc: 'scala',
  groovy: 'plaintext', dart: 'dart',
  // Scripting
  py: 'python', pyi: 'python', rb: 'ruby', php: 'php', pl: 'perl', pm: 'perl',
  lua: 'lua', r: 'r', jl: 'julia', ex: 'elixir', exs: 'elixir',
  clj: 'clojure', cljs: 'clojure', coffee: 'coffeescript',
  // Web
  html: 'html', htm: 'html', vue: 'html', svelte: 'html',
  css: 'css', scss: 'scss', less: 'less',
  hbs: 'handlebars', pug: 'pug', twig: 'twig', liquid: 'liquid',
  // Data and config
  json: 'json', jsonc: 'json', json5: 'json',
  // Source maps and lockfiles are JSON with an extension of their own.
  map: 'json', lock: 'json', webmanifest: 'json', 'code-workspace': 'json',
  babelrc: 'json', eslintrc: 'json', prettierrc: 'json', jshintrc: 'json',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini',
  xml: 'xml', xsd: 'xml', xsl: 'xml', svg: 'xml', plist: 'xml', csproj: 'xml',
  props: 'xml', targets: 'xml', sln: 'plaintext',
  // Query and markup
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  md: 'markdown', markdown: 'markdown', mdx: 'mdx', rst: 'restructuredtext',
  // Plain text still gets a language id: `plaintext` is a real Monaco language
  // with a theme background and line highlighting, whereas an unmapped file
  // falls through with none of that applied.
  txt: 'plaintext', text: 'plaintext', log: 'plaintext', csv: 'plaintext',
  tex: 'plaintext', proto: 'protobuf',
  // Shell and infrastructure
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  ps1: 'powershell', psm1: 'powershell', bat: 'bat', cmd: 'bat',
  dockerfile: 'dockerfile', tf: 'hcl', tfvars: 'hcl', hcl: 'hcl',
  bicep: 'bicep', sol: 'solidity',
}

/** Whole file names that carry a language regardless of extension. */
const LANGUAGES_BY_NAME: Readonly<Record<string, string>> = {
  // Dotfiles whose whole name is the type; several are JSON without saying so.
  '.babelrc': 'json',
  '.eslintrc': 'json',
  '.prettierrc': 'json',
  '.npmrc': 'ini',
  '.editorconfig': 'ini',
  '.gitattributes': 'plaintext',
  '.gitmodules': 'ini',
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  makefile: 'plaintext',
  gemfile: 'ruby',
  rakefile: 'ruby',
  '.gitignore': 'plaintext',
  '.env': 'shell',
  '.bashrc': 'shell',
  '.zshrc': 'shell',
}

/**
 * The Monaco language id for a path, by extension, else by whole file name for
 * the extensionless files a project keeps at its root.
 *
 * @param path - the file path.
 * @returns the language id, or `plaintext` when nothing matches.
 */
export function languageOf(path: string): string {
  const name = (path.split(/[/\\]/).pop() ?? '').toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot > 0) {
    const byExtension = LANGUAGES[name.slice(dot + 1)]
    if (byExtension !== undefined) return byExtension
  }
  return LANGUAGES_BY_NAME[name] ?? LANGUAGES[name] ?? 'plaintext'
}
