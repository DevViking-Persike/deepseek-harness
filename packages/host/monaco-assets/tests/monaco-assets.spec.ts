/**
 * The Monaco asset route over a real web server: the distribution's own files
 * are served with their content types, a traversal attempt is refused, and an
 * absent path is indistinguishable from a refused one.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as monacoAssets from '@deepseek-ai/dsh-host-monaco-assets'
import { monacoRoot, resolveAsset } from '../src/index.ts'

/** Boot a real server on an OS-assigned port with the route mounted. */
async function serve(config: monacoAssets.Config = {}) {
  const ctx = new Context()
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(monacoAssets, config)
  return { ctx, base: `http://127.0.0.1:${String(ctx.webServer.port)}` }
}

describe('asset path containment', () => {
  it('resolves a plain file inside the distribution', () => {
    const root = monacoRoot()

    expect(resolveAsset(root, '/loader.js')).toBe(`${root}/loader.js`)
  })

  it('refuses a path that climbs out of the distribution', () => {
    const root = monacoRoot()

    // Both the encoded and plain forms must be rejected: `normalize` collapses
    // the traversal before containment is decided.
    expect(resolveAsset(root, '/../../../etc/passwd')).toBeUndefined()
    expect(resolveAsset(root, '/editor/../../../../etc/passwd')).toBeUndefined()
  })
})

describe('the mounted route', () => {
  it('serves the loader as javascript', async () => {
    const { base } = await serve()

    const response = await fetch(`${base}/monaco/loader.js`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect((await response.text()).length).toBeGreaterThan(1000)
  })

  it('serves the editor stylesheet as css', async () => {
    const { base } = await serve()

    const response = await fetch(`${base}/monaco/editor/editor.main.css`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8')
  })

  it('answers 404 for a path that does not exist in the distribution', async () => {
    const { base } = await serve()

    const response = await fetch(`${base}/monaco/absent-file.js`)

    expect(response.status).toBe(404)
  })

  it('refuses a traversal attempt without revealing whether the target exists', async () => {
    const { base } = await serve()

    const response = await fetch(`${base}/monaco/%2e%2e/%2e%2e/package.json`)

    expect([403, 404]).toContain(response.status)
  })

  it('rejects a method that is not a read', async () => {
    const { base } = await serve()

    const response = await fetch(`${base}/monaco/loader.js`, { method: 'POST' })

    expect(response.status).toBe(405)
  })

  it('honors a configured route prefix', async () => {
    const { base } = await serve({ route: '/vendor/monaco' })

    await expect(fetch(`${base}/vendor/monaco/loader.js`).then(r => r.status)).resolves.toBe(200)
  })

  it('rejects a route that is not an absolute prefix', async () => {
    const ctx = new Context()
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })

    await expect(ctx.plugin(monacoAssets, { route: 'monaco/' }))
      .rejects.toThrow(/absolute path without a trailing slash/)
  })

  it('stops serving once its fiber disposes', async () => {
    const ctx = new Context()
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    const fiber = await ctx.plugin(monacoAssets, {})
    const base = `http://127.0.0.1:${String(ctx.webServer.port)}`
    await expect(fetch(`${base}/monaco/loader.js`).then(r => r.status)).resolves.toBe(200)

    await fiber.dispose()

    await expect(fetch(`${base}/monaco/loader.js`).then(r => r.status)).resolves.toBe(404)
  })
})
