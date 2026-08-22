/**
 * Codex subscription login for DeepSeek Harness: one Cordis service that
 * owns the OAuth credential lifecycle for the ChatGPT backend Codex
 * Responses endpoint.
 *
 * 1. Seed the credential by importing an existing CLIProxyAPI Codex auth
 *    file (one time), or complete the OpenAI OAuth PKCE flow in a browser
 *    via the local control endpoint.
 * 2. Persist and refresh `{ access, refresh, expires, accountId, email }`
 *    under `$DSH_HOME` with owner-only permissions.
 * 3. Serve a valid access token plus the ChatGPT account id to this
 *    package's adapter, and the subscription usage report to status readers.
 *
 * The OAuth flow is OpenAI's standard public protocol (the same client id
 * the Codex CLI itself registers); this is an independent implementation.
 *
 * @module dsh-llm-codex/auth
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
  /** OAuth access token sent as the backend bearer. */
  access: string
  /** OAuth refresh token for silent renewal. */
  refresh: string
  /** Epoch millis when {@link StoredCredential.access} expires. */
  expires: number
  /** ChatGPT account id sent as the `chatgpt-account-id` header. */
  accountId: string
  /** Subscription account label, when known. */
  email: string
}

/** The normalized usage report from the subscription usage endpoint. */
export interface CodexUsage {
  /** Subscription plan label, when the endpoint reports one. */
  planType: string | undefined
  /** Primary rate-limit window, when reported. */
  primary: { usedPercent: number } | undefined
  /** Secondary rate-limit window, when reported. */
  secondary: { usedPercent: number } | undefined
  /** Fetched-at epoch millis. */
  fetchedAt: number
}

/** One resolution's complete endpoints and paths. */
export interface AuthSpec {
  /** Path of this plugin's credential document. */
  filename: string
  /** Optional CLIProxyAPI Codex auth file to import from once. */
  importFrom: string | undefined
  /** ChatGPT backend API base. */
  backendBase: string
  /** Subscription usage endpoint. */
  usageUrl: string
  /** OAuth authorize endpoint. */
  authorizeUrl: string
  /** OAuth token endpoint (exchange and refresh). */
  tokenUrl: string
  /** Loopback port of the login control server. */
  controlPort: number
  /** Loopback port the OAuth redirect lands on (fixed by the public client). */
  redirectPort: number
}

/** Raw config the service constructor resolves through {@link resolveAuthSpec}. */
export interface AuthConfig {
  path?: string
  importFrom?: string
  dshHome?: string
  backendBase?: string
  usageUrl?: string
  authorizeUrl?: string
  tokenUrl?: string
  controlPort?: number
}

/** Public protocol facts; every endpoint is config-overridable. */
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
const TOKEN_URL = 'https://auth.openai.com/oauth/token'
const BACKEND_BASE = 'https://chatgpt.com/backend-api'
const USAGE_URL = `${BACKEND_BASE}/wham/usage`
const REDIRECT_URI = 'http://localhost:1455/auth/callback'
const DEFAULT_CONTROL_PORT = 1456
const DEFAULT_FILENAME = 'codex-oauth.json'
const REFRESH_MARGIN_MS = 300_000
const REFRESH_INTERVAL_MS = 300_000
const REFRESH_TIMEOUT_MS = 30_000
const USAGE_TIMEOUT_MS = 8_000
const USAGE_CACHE_MS = 30_000

/** The `dsh-llm-codex` service on `ctx.codexAuth`. */
export class CodexAuthService extends Service {
  static inject = ['llm']

  constructor(ctx: Context, config: AuthConfig) {
    super(ctx, 'codexAuth')
    this.spec = resolveAuthSpec(config)
    this.csrf = randomBytes(24).toString('base64url')
    this.loginFlow = undefined
    this.lastLoginError = undefined
    this.usageCache = undefined
    this.usageError = undefined
  }

  private readonly spec: AuthSpec
  private readonly csrf: string
  private loginFlow: { abort: AbortController } | undefined
  private lastLoginError: string | undefined
  private usageCache: CodexUsage | undefined
  private usageError: string | undefined

  /** Service lifecycle: import seed, start the refresh loop and control server. */
  async * [Service.init](): AsyncGenerator<() => Promise<void> | void, void, void> {
    await this.seedFromImport()
    const token = await this.bearerToken().catch(() => undefined)
    if (token === undefined) {
      this.ctx.logger.info(
        `dsh-llm-codex: not logged in — open http://127.0.0.1:${this.spec.controlPort}/start to connect a Codex subscription`,
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

  /** Import a CLIProxyAPI Codex auth file once, when no own store exists. */
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
        account_id?: unknown
        email?: unknown
      }
      try {
        source = JSON.parse(await readFile(importFrom, 'utf8')) as typeof source
      } catch (error) {
        throw new Error(
          `dsh-llm-codex: cannot read importFrom file ${this.spec.importFrom}: ${String(error)}`,
        )
      }
      if (typeof source.access_token !== 'string' || typeof source.refresh_token !== 'string') {
        throw new Error('dsh-llm-codex: importFrom file is not a CLIProxyAPI Codex auth document')
      }
      const expires = typeof source.expired === 'string'
        ? Date.parse(source.expired)
        : Number.NaN
      await writeCredential(this.spec.filename, {
        access: source.access_token,
        refresh: source.refresh_token,
        expires: Number.isFinite(expires) ? expires : 0,
        accountId: typeof source.account_id === 'string' ? source.account_id : '',
        email: typeof source.email === 'string' ? source.email : '',
      })
      this.ctx.logger.info('dsh-llm-codex: imported CLIProxyAPI Codex credential (one time)')
    })
  }

  /**
   * Resolve the request credential: a valid access token plus the ChatGPT
   * account id the backend header needs.
   * @param signal - optional caller cancellation for the refresh request.
   * @returns the credential pair, or `undefined` when not logged in.
   */
  async access(signal?: AbortSignal): Promise<{ accessToken: string; accountId: string } | undefined> {
    const accessToken = await this.bearerToken(signal)
    if (accessToken === undefined) return undefined
    const credential = await readCredential(this.spec.filename)
    if (credential === undefined) return undefined
    return { accessToken: credential.access, accountId: credential.accountId }
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
        accountId: current.accountId,
        email: current.email,
      }
      await writeCredential(this.spec.filename, stored)
      return stored.access
    })
  }

  /**
   * Begin a browser login: PKCE against the public Codex client.
   * @returns `{ url, completion, abort }` — the authorize URL to open, a
   *   promise that resolves after the callback completes the exchange, and
   *   the flow's cancellation controller.
   */
  beginBrowserLogin(): { url: string; completion: Promise<void>; abort: AbortController } {
    if (this.loginFlow !== undefined) throw new Error('a Codex login is already in progress')
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const state = randomBytes(16).toString('hex')
    const url = new URL(this.spec.authorizeUrl)
    for (const [key, value] of Object.entries({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile email offline_access',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      originator: 'deepseek-harness',
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
      throw new Error('OpenAI token response is missing refresh_token')
    }
    await withFileLock(this.spec.filename, () => writeCredential(this.spec.filename, credential))
    this.usageCache = undefined
    this.usageError = undefined
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
    this.usageCache = undefined
    this.usageError = undefined
  }

  /**
   * Read login status and cached subscription usage for the control endpoint.
   * @param refresh - force a usage refresh.
   * @returns the status document.
   */
  async status(refresh: boolean): Promise<Record<string, unknown>> {
    const credential = await readCredential(this.spec.filename)
    if (credential === undefined) {
      return {
        loggedIn: false,
        loginPending: this.loginFlow !== undefined,
        ...this.lastLoginError !== undefined ? { loginError: this.lastLoginError } : {},
        csrf: this.csrf,
      }
    }
    if (refresh
      || this.usageCache === undefined
      || Date.now() - this.usageCache.fetchedAt > USAGE_CACHE_MS) {
      try {
        this.usageCache = await this.fetchUsage()
        this.usageError = undefined
      } catch (error) {
        this.usageError = error instanceof Error ? error.message : String(error)
      }
    }
    return {
      loggedIn: true,
      loginPending: this.loginFlow !== undefined,
      accountId: credential.accountId,
      email: credential.email,
      expiresAt: credential.expires,
      usage: this.usageCache,
      ...this.usageError !== undefined ? { usageError: this.usageError } : {},
      csrf: this.csrf,
    }
  }

  /**
   * Query the subscription usage endpoint.
   * @returns the normalized usage report.
   */
  async fetchUsage(): Promise<CodexUsage> {
    const access = await this.bearerToken()
    if (access === undefined) throw new Error('Codex login is missing')
    const credential = await readCredential(this.spec.filename)
    const response = await fetch(this.spec.usageUrl, {
      signal: AbortSignal.timeout(USAGE_TIMEOUT_MS),
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${access}`,
        ...credential?.accountId !== undefined && credential.accountId.length > 0
          ? { 'chatgpt-account-id': credential.accountId }
          : {},
      },
    })
    if (!response.ok) {
      throw new Error(`Codex usage request failed (HTTP ${response.status})`)
    }
    return normalizeUsage(await response.json() as Record<string, unknown>)
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
      throw new Error(`OpenAI token request failed (HTTP ${response.status}): ${await response.text()}`)
    }
    const value = await response.json() as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; id_token?: unknown }
    if (typeof value.access_token !== 'string' || value.access_token.length === 0) {
      throw new Error('OpenAI token response is missing access_token')
    }
    return {
      access: value.access_token,
      refresh: typeof value.refresh_token === 'string' ? value.refresh_token : '',
      expires: Date.now() + (typeof value.expires_in === 'number' ? value.expires_in : 3600) * 1000,
      accountId: extractAccountId(value.access_token, typeof value.id_token === 'string' ? value.id_token : undefined),
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
        send(200, await this.status(url.searchParams.get('refresh') === '1'))
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

/** Decode a JWT payload without verification (claims extraction only). */
function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const [, payload] = token.split('.')
  if (payload === undefined || token.split('.').length !== 3) return undefined
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * Extract the ChatGPT account id from a token's claims.
 * @param token - the access token.
 * @param idToken - optional id token used as a fallback claim source.
 * @returns the account id, or the empty string.
 */
export function extractAccountId(token: string, idToken?: string): string {
  const auth = (claims: Record<string, unknown> | undefined): string => {
    const nested = claims?.['https://api.openai.com/auth']
    if (nested !== null && typeof nested === 'object') {
      const id = (nested as Record<string, unknown>).chatgpt_account_id
      if (typeof id === 'string' && id.length > 0) return id
    }
    const flat = claims?.chatgpt_account_id
    return typeof flat === 'string' ? flat : ''
  }
  const direct = auth(decodeJwtPayload(token))
  if (direct.length > 0) return direct
  const fallback = idToken === undefined ? '' : auth(decodeJwtPayload(idToken))
  return fallback
}

/**
 * Reduce the usage endpoint reply to the stable display fields.
 * @param value - the parsed usage response.
 * @returns normalized plan and rate-limit windows.
 */
export function normalizeUsage(value: Record<string, unknown>): CodexUsage {
  const limits = value.rate_limit !== null && typeof value.rate_limit === 'object'
    ? value.rate_limit as Record<string, unknown>
    : {}
  const windowOf = (w: unknown): { usedPercent: number } | undefined => {
    if (w === null || typeof w !== 'object') return undefined
    const used = (w as Record<string, unknown>).used_percent
    if (typeof used !== 'number' || !Number.isFinite(used)) return undefined
    return { usedPercent: Math.max(0, Math.min(100, used)) }
  }
  return {
    ...typeof value.plan_type === 'string' ? { planType: value.plan_type } : { planType: undefined },
    ...windowOf(limits.primary_window ?? limits.primary) !== undefined
      ? { primary: windowOf(limits.primary_window ?? limits.primary) }
      : { primary: undefined },
    ...windowOf(limits.secondary_window ?? limits.secondary) !== undefined
      ? { secondary: windowOf(limits.secondary_window ?? limits.secondary) }
      : { secondary: undefined },
    fetchedAt: Date.now(),
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
    throw new Error('dsh-llm-codex: invalid credential document')
  }
  return {
    ...credential,
    accountId: typeof credential.accountId === 'string' ? credential.accountId : '',
    email: typeof credential.email === 'string' ? credential.email : '',
  } as StoredCredential
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
      if (url.pathname !== '/auth/callback' || url.searchParams.get('state') !== state) {
        response.writeHead(400).end('Invalid OpenAI OAuth callback.')
        return
      }
      const code = url.searchParams.get('code')
      if (code === null) {
        response.writeHead(400).end('Missing authorization code.')
        return
      }
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        .end('Codex login complete. You may close this window.')
      settled = true
      signal.removeEventListener('abort', abort)
      server.close()
      resolvePromise(code)
    })
    const abort = (): void => {
      if (settled) return
      settled = true
      server.close()
      rejectPromise(new Error('OpenAI login cancelled'))
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
export function resolveAuthSpec(config: AuthConfig): AuthSpec {
  const dshHome = resolveDshHome(config.dshHome)
  return {
    filename: resolve(config.path ?? join(dshHome, DEFAULT_FILENAME)),
    importFrom: config.importFrom,
    backendBase: (config.backendBase ?? BACKEND_BASE).replace(/\/+$/, ''),
    usageUrl: config.usageUrl ?? USAGE_URL,
    authorizeUrl: config.authorizeUrl ?? AUTHORIZE_URL,
    tokenUrl: config.tokenUrl ?? TOKEN_URL,
    controlPort: config.controlPort ?? DEFAULT_CONTROL_PORT,
    redirectPort: Number(new URL(REDIRECT_URI).port),
  }
}
