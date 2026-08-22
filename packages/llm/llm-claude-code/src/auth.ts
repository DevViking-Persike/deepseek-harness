/**
 * Claude Code subscription login for DeepSeek Harness: one Cordis service
 * that owns the OAuth credential lifecycle for the Anthropic
 * `/v1/messages` endpoint behind a Claude subscription.
 *
 * 1. Seed the credential by importing an existing CLIProxyAPI Claude auth
 *    file (one time), or complete the Anthropic OAuth PKCE flow in a browser
 *    via the local control endpoint.
 * 2. Persist and refresh `{ access, refresh, expires, email }` under
 *    `$DSH_HOME` with owner-only permissions.
 * 3. Serve a valid access token to this package's adapter.
 *
 * The OAuth flow is Anthropic's standard public protocol (the same client id
 * Claude Code itself registers); this is an independent implementation.
 *
 * @module dsh-llm-claude-code/auth
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** The persisted credential document shape (versioned). */
export interface StoredCredential {
  /** OAuth access token sent as the /v1/messages bearer. */
  access: string
  /** OAuth refresh token for silent renewal. */
  refresh: string
  /** Epoch millis when {@link StoredCredential.access} expires. */
  expires: number
  /** Subscription account label, when known. */
  email: string
}

/** One resolution's complete endpoints and paths. */
export interface AuthSpec {
  /** Path of this plugin's credential document. */
  filename: string
  /** Optional CLIProxyAPI Claude auth file to import from once. */
  importFrom: string | undefined
  /** Anthropic API base. */
  apiBase: string
  /** OAuth authorize endpoint. */
  authorizeUrl: string
  /** OAuth token endpoint (exchange and refresh). */
  tokenUrl: string
  /** Loopback port of the login control server. */
  controlPort: number
  /** Loopback port the OAuth redirect lands on (fixed by the public client). */
  redirectPort: number
}

/** Public protocol facts; every endpoint is config-overridable. */
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize'
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
const API_BASE = 'https://api.anthropic.com'
const SCOPE = 'user:profile user:inference user:sessions:claude_code'
const REDIRECT_URI = 'http://localhost:54545/callback'
const DEFAULT_CONTROL_PORT = 1458
const DEFAULT_FILENAME = 'claude-code-oauth.json'
const REFRESH_MARGIN_MS = 300_000
const REFRESH_INTERVAL_MS = 300_000
const REFRESH_TIMEOUT_MS = 30_000

/** Raw config the service constructor resolves through {@link resolveAuthSpec}. */
export interface AuthConfig {
  path?: string
  importFrom?: string
  dshHome?: string
  apiBase?: string
  authorizeUrl?: string
  tokenUrl?: string
  controlPort?: number
}

/** The `dsh-llm-claude-code` service on `ctx.claudeCodeAuth`. */
export class ClaudeCodeAuthService extends Service {
  static inject = ['llm']

  constructor(ctx: Context, config: AuthConfig) {
    super(ctx, 'claudeCodeAuth')
    this.spec = resolveAuthSpec(config)
    this.csrf = randomBytes(24).toString('base64url')
    this.loginFlow = undefined
    this.lastLoginError = undefined
  }

  private readonly spec: AuthSpec
  private readonly csrf: string
  private loginFlow: { abort: AbortController } | undefined
  private lastLoginError: string | undefined

  /** Service lifecycle: import seed, start the refresh loop and control server. */
  async * [Service.init](): AsyncGenerator<() => Promise<void> | void, void, void> {
    await this.seedFromImport()
    const token = await this.bearerToken().catch(() => undefined)
    if (token === undefined) {
      this.ctx.logger.info(
        `dsh-llm-claude-code: not logged in — open http://127.0.0.1:${this.spec.controlPort}/start to connect a Claude subscription`,
      )
    }
    const timer = setInterval(() => {
      void this.bearerToken().catch(() => {})
    }, REFRESH_INTERVAL_MS)
    const disposeControl = await this.startControlServer()
    yield () => {
      clearInterval(timer)
      this.loginFlow?.abort.abort()
      disposeControl()
    }
  }

  /** Import a CLIProxyAPI Claude auth file once, when no own store exists. */
  private async seedFromImport(): Promise<void> {
    const importFrom = this.spec.importFrom
    if (importFrom === undefined) return
    await withFileLock(this.spec.filename, async () => {
      const existing = await readCredential(this.spec.filename)
      if (existing !== undefined) return
      let source: {
        access_token?: unknown
        refresh_token?: unknown
        expired?: unknown
        email?: unknown
      }
      try {
        source = JSON.parse(await readFile(importFrom, 'utf8')) as typeof source
      } catch (error) {
        throw new Error(
          `dsh-llm-claude-code: cannot read importFrom file ${importFrom}: ${String(error)}`,
        )
      }
      if (typeof source.access_token !== 'string' || typeof source.refresh_token !== 'string') {
        throw new Error('dsh-llm-claude-code: importFrom file is not a CLIProxyAPI Claude auth document')
      }
      const expires = typeof source.expired === 'string'
        ? Date.parse(source.expired)
        : Number.NaN
      await writeCredential(this.spec.filename, {
        access: source.access_token,
        refresh: source.refresh_token,
        expires: Number.isFinite(expires) ? expires : 0,
        email: typeof source.email === 'string' ? source.email : '',
      })
      this.ctx.logger.info('dsh-llm-claude-code: imported CLIProxyAPI Claude credential (one time)')
    })
  }

  /**
   * Return a valid access token, refreshing and persisting when near expiry.
   * @param signal - optional caller cancellation for the refresh request.
   * @returns the access token, or `undefined` when not logged in.
   */
  async bearerToken(signal?: AbortSignal): Promise<string | undefined> {
    return withFileLock(this.spec.filename, async () => {
      const current = await readCredential(this.spec.filename)
      if (current === undefined) return undefined
      if (current.expires > Date.now() + REFRESH_MARGIN_MS) return current.access
      const next = await this.tokenRequest(new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: current.refresh,
        client_id: CLIENT_ID,
      }), signal)
      const stored: StoredCredential = {
        access: next.access,
        refresh: next.refresh || current.refresh,
        expires: next.expires,
        email: current.email,
      }
      await writeCredential(this.spec.filename, stored)
      return stored.access
    })
  }

  /**
   * Begin a browser login: PKCE against the public Claude Code client.
   * @returns `{ url, completion }` — the authorize URL to open and a promise
   *   that resolves after the callback completes the exchange.
   */
  beginBrowserLogin(): { url: string; completion: Promise<void>; abort: AbortController } {
    if (this.loginFlow !== undefined) throw new Error('a Claude login is already in progress')
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const state = randomBytes(16).toString('hex')
    const url = new URL(this.spec.authorizeUrl)
    for (const [key, value] of Object.entries({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    })) {
      url.searchParams.set(key, value)
    }
    const abort = new AbortController()
    this.loginFlow = { abort }
    const completion = (async () => {
      try {
        const code = await waitForBrowserCallback(state, this.spec.redirectPort, abort.signal)
        await this.finishLogin(code, verifier, abort.signal)
      } catch (error) {
        this.lastLoginError = error instanceof Error ? error.message : String(error)
      } finally {
        this.loginFlow = undefined
      }
    })()
    return { url: url.toString(), completion, abort }
  }

  /**
   * Exchange an authorization code for tokens and persist.
   * @param authorizationCode - the OAuth authorization code.
   * @param verifier - the PKCE verifier used to request the code.
   * @param signal - optional caller cancellation.
   */
  async finishLogin(authorizationCode: string, verifier: string, signal?: AbortSignal): Promise<void> {
    const credential = await this.tokenRequest(new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code: authorizationCode,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }), signal)
    if (credential.refresh.length === 0) {
      throw new Error('Anthropic token response is missing refresh_token')
    }
    await withFileLock(this.spec.filename, () => writeCredential(this.spec.filename, credential))
    this.lastLoginError = undefined
  }

  /** Delete the credential document. */
  async logout(): Promise<void> {
    await withFileLock(this.spec.filename, async () => {
      try {
        await unlink(this.spec.filename)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    })
  }

  /**
   * Read login status for the control endpoint.
   * @returns the status document.
   */
  async status(): Promise<Record<string, unknown>> {
    const credential = await readCredential(this.spec.filename)
    return {
      loggedIn: credential !== undefined,
      loginPending: this.loginFlow !== undefined,
      ...credential !== undefined ? { email: credential.email, expiresAt: credential.expires } : {},
      ...this.lastLoginError !== undefined ? { loginError: this.lastLoginError } : {},
      csrf: this.csrf,
    }
  }

  /**
   * POST the OAuth token endpoint and normalize the response.
   * @param body - URLSearchParams request body.
   * @param signal - optional caller cancellation.
   * @returns the normalized credential.
   */
  private async tokenRequest(body: URLSearchParams, signal?: AbortSignal): Promise<StoredCredential> {
    const timeout = AbortSignal.timeout(REFRESH_TIMEOUT_MS)
    const response = await fetch(this.spec.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
    })
    if (!response.ok) {
      throw new Error(`Anthropic token request failed (HTTP ${response.status}): ${await response.text()}`)
    }
    const value = await response.json() as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown }
    if (typeof value.access_token !== 'string' || value.access_token.length === 0) {
      throw new Error('Anthropic token response is missing access_token')
    }
    return {
      access: value.access_token,
      refresh: typeof value.refresh_token === 'string' ? value.refresh_token : '',
      expires: Date.now() + (typeof value.expires_in === 'number' ? value.expires_in : 3600) * 1000,
      email: '',
    }
  }

  /** Start the 127.0.0.1 control server; resolves to its disposer. */
  private async startControlServer(): Promise<() => void> {
    return new Promise((resolveStart, rejectStart) => {
      const server = createServer((request, response) => {
        void this.controlRequest(request, response)
      })
      server.once('error', rejectStart)
      server.listen(this.spec.controlPort, '127.0.0.1', () => {
        server.removeListener('error', rejectStart)
        resolveStart(() => {
          this.loginFlow?.abort.abort()
          server.close()
        })
      })
    })
  }

  private async controlRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const headers = {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    }
    const send = (status: number, value: unknown): void => {
      response.writeHead(status, headers).end(JSON.stringify(value))
    }
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${this.spec.controlPort}`)
      if (url.pathname === '/start' && request.method === 'GET') {
        const flow = this.beginBrowserLogin()
        void flow.completion
        response.writeHead(302, { location: flow.url, 'cache-control': 'no-store' }).end()
        return
      }
      if (url.pathname === '/status' && request.method === 'GET') {
        send(200, await this.status())
        return
      }
      if (url.pathname === '/logout' && request.method === 'POST') {
        if (request.headers['x-dsh-csrf'] !== this.csrf) {
          send(403, { error: 'Invalid CSRF token.' })
          return
        }
        await this.logout()
        send(200, { ok: true })
        return
      }
      send(404, { error: 'Not found' })
    } catch (error) {
      send(500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/** Read and validate the credential document; ENOENT maps to `undefined`. */
async function readCredential(filename: string): Promise<StoredCredential | undefined> {
  let text: string
  try {
    text = await readFile(filename, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  // A file is a parser boundary: the cast describes what a valid document
  // holds, not what this one does, so every field is checked before use.
  const doc = JSON.parse(text) as { version?: unknown; credential?: Partial<StoredCredential> } | null
  const credential = doc === null ? undefined : doc.credential
  if (
    doc === null
    || doc.version !== 1
    || typeof credential?.access !== 'string'
    || typeof credential.refresh !== 'string'
    || typeof credential.expires !== 'number'
  ) {
    throw new Error('dsh-llm-claude-code: invalid credential document')
  }
  return { ...credential, email: typeof credential.email === 'string' ? credential.email : '' } as StoredCredential
}

/** Persist the credential atomically with owner-only permissions. */
async function writeCredential(filename: string, credential: StoredCredential): Promise<void> {
  await writeFileAtomic(
    filename,
    `${JSON.stringify({ version: 1, credential }, null, 2)}\n`,
    { mode: 0o600, dirMode: 0o700 },
  )
}

/**
 * One-shot local OAuth callback listener, guarded by `state`.
 * @param state - the expected OAuth state value.
 * @param port - the loopback port to listen on.
 * @param signal - optional cancellation.
 * @returns the authorization code once the callback arrives.
 */
function waitForBrowserCallback(state: string, port: number, signal: AbortSignal): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', `http://localhost:${port}`)
      if (url.pathname !== '/callback' || url.searchParams.get('state') !== state) {
        response.writeHead(400).end('Invalid Anthropic OAuth callback.')
        return
      }
      const code = url.searchParams.get('code')
      if (code === null) {
        response.writeHead(400).end('Missing authorization code.')
        return
      }
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        .end('Claude login complete. You may close this window.')
      settled = true
      signal.removeEventListener('abort', abort)
      server.close()
      resolvePromise(code)
    })
    const abort = (): void => {
      if (settled) return
      settled = true
      server.close()
      rejectPromise(new Error('Anthropic login cancelled'))
    }
    signal.addEventListener('abort', abort, { once: true })
    server.listen(port, '127.0.0.1').once('error', (error) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      rejectPromise(error)
    })
  })
}

/**
 * Resolve the runtime spec from plugin config in one explicit step.
 * @param config - raw plugin config.
 * @returns validated endpoints, ports, and the credential file path.
 */
export function resolveAuthSpec(config: {
  path?: string
  importFrom?: string
  dshHome?: string
  apiBase?: string
  authorizeUrl?: string
  tokenUrl?: string
  controlPort?: number
}): AuthSpec {
  const dshHome = resolveDshHome(config.dshHome)
  return {
    filename: resolve(config.path ?? join(dshHome, DEFAULT_FILENAME)),
    importFrom: config.importFrom,
    apiBase: config.apiBase ?? API_BASE,
    authorizeUrl: config.authorizeUrl ?? AUTHORIZE_URL,
    tokenUrl: config.tokenUrl ?? TOKEN_URL,
    controlPort: config.controlPort ?? DEFAULT_CONTROL_PORT,
    redirectPort: Number(new URL(REDIRECT_URI).port),
  }
}
