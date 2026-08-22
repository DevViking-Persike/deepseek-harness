/**
 * Serves the Monaco editor distribution over a host HTTP route.
 *
 * The browser plugin system delivers exactly one file per plugin
 * (`/plugins/<id>/client.js`), and the dynamic bundler emits no extra chunks or
 * assets. Monaco is a multi-file distribution, so it reaches the page through a
 * route of its own instead: the files are read from the installed
 * `monaco-editor` package, which keeps the editor local — no CDN at runtime,
 * and no third-party origin in a tool that reads the user's source tree.
 * @module @deepseek-ai/dsh-host-monaco-assets
 */

import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'monaco-assets'

/** The HTTP carrier this route registers on. */
export const inject = ['webServer']

/** Plugin config: where the distribution is mounted. */
export interface Config {
  /** Absolute URL prefix the distribution is served under. */
  route?: string
}

export const Config: z<Config> = z.object({
  route: z.string().default('/monaco'),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/**
 * Content types of the file kinds Monaco's distribution contains. An unlisted
 * extension is served as an opaque download rather than guessed, so a wrong
 * type never makes the browser execute something as script.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
}

/**
 * Absolute path of the installed Monaco `min/vs` directory.
 * @returns the distribution root.
 */
export function monacoRoot(): string {
  const require = createRequire(import.meta.url)
  // The package's `exports` map hides its manifest, and its main entry already
  // resolves inside `min/vs`, so the distribution root is that entry's own
  // directory rather than a path assembled from the package root.
  return dirname(require.resolve('monaco-editor'))
}

/**
 * Resolve one request path inside the distribution root.
 *
 * @param root - the distribution root.
 * @param relative - the request path after the route prefix.
 * @returns the absolute file path, or undefined when it escapes the root.
 */
export function resolveAsset(root: string, relative: string): string | undefined {
  // Resolve first, then prove containment: `resolve` collapses every `..`,
  // so a traversal that escapes the root is caught by the prefix test rather
  // than by pattern-matching the request text.
  const target = resolve(root, `.${relative.startsWith('/') ? '' : '/'}${relative}`)
  return target === root || target.startsWith(root + sep) ? target : undefined
}

/**
 * Register the Monaco asset route.
 * @param ctx - Cordis context carrying the web server.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: ResolvedConfig): void {
  if (!config.route.startsWith('/') || config.route.endsWith('/')) {
    throw new Error('monaco-assets: route must be an absolute path without a trailing slash')
  }
  const root = monacoRoot()

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: config.route,
    handler: async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405)
        res.end()
        return
      }
      const raw = req.url ?? '/'
      let pathname: string
      try {
        pathname = decodeURIComponent(raw.split('?')[0] ?? '/')
      } catch {
        // A malformed percent-escape is a bad request, not a missing file.
        res.writeHead(400)
        res.end()
        return
      }
      const target = resolveAsset(root, pathname.slice(config.route.length))
      if (target === undefined) {
        res.writeHead(403)
        res.end()
        return
      }
      let bytes: Buffer
      try {
        bytes = await readFile(target)
      } catch {
        // Any read failure under the root is reported as absent: the browser
        // must not learn which paths exist from a distinguishable error.
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, {
        'content-type': CONTENT_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
        // The distribution is version-pinned by the installed package, so a
        // long-lived cache is safe and keeps editor startup off the wire.
        'cache-control': 'public, max-age=604800, immutable',
        'content-length': String(bytes.byteLength),
      })
      res.end(req.method === 'HEAD' ? undefined : bytes)
    },
  }), 'monaco-assets: distribution route')
}
