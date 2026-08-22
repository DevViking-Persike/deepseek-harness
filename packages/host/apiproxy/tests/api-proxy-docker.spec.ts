/**
 * docker domain of the host ApiProxy: the read-only rows project the seam's
 * values onto their wire rows, a composition with no Docker seam and a seam
 * with no usable provider answer the same `docker-unavailable` empty state,
 * the log cap keeps the newest text while reporting `truncated`, the compose
 * browser lists real host directories filtered to compose candidates, and the
 * lifecycle rows separate a rejected project from an engine that never
 * answered.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import DockerRuntime, { DockerError } from '@deepseek-ai/dsh-docker'
import type { DockerProvider } from '@deepseek-ai/dsh-docker'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy, isComposeFileName, type ApiProxyDefaults } from '../src/api-proxy.ts'

/** A scripted backend; every method defaults to a usable empty answer. */
function provider(overrides: Partial<DockerProvider> = {}): DockerProvider {
  return {
    id: 'stub',
    available: () => Promise.resolve(true),
    list: () => Promise.resolve([]),
    control: () => Promise.reject(new Error('control is not scripted in this test')),
    images: () => Promise.resolve([]),
    logs: request => Promise.resolve({ container: request.container, content: '', truncated: false }),
    composeUp: () => Promise.reject(new Error('unused')),
    composeDown: () => Promise.reject(new Error('unused')),
    ...overrides,
  }
}

/** Mount the host spine, optionally with a Docker seam carrying `providers`. */
async function harness(
  providers?: readonly DockerProvider[],
  defaults: Partial<ApiProxyDefaults> = {},
): Promise<{ ctx: Context; api: ApiProxy }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  if (providers !== undefined) {
    await ctx.plugin(DockerRuntime)
    for (const entry of providers) ctx.docker.registerProvider(entry)
  }
  return {
    ctx,
    api: createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
      cwd: '/tmp',
      ...defaults,
    }),
  }
}

const request = <P>(payload: P): { rpcId: ReturnType<typeof RpcId>; payload: P } =>
  ({ rpcId: RpcId('t-docker'), payload })

const signal = (): AbortSignal => new AbortController().signal

describe('docker domain over a mounted seam', () => {
  it('projects containers onto their wire rows, omitting absent compose labels', async () => {
    const { api } = await harness([provider({
      list: () => Promise.resolve([
        {
          id: 'c1', name: 'db', image: 'postgres:16', state: 'running', status: 'Up 3 hours',
          project: 'shop', service: 'db', ports: ['0.0.0.0:5432->5432/tcp'],
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'c2', name: 'loose', image: 'busybox', state: 'exited', status: 'Exited (0)',
          ports: [], createdAt: '2026-01-02T00:00:00Z',
        },
      ]),
    })])

    const response = await api.docker.listContainers(request({ all: true }), signal())

    expect(response.result).toEqual({
      ok: true,
      value: {
        containers: [
          {
            id: 'c1', name: 'db', image: 'postgres:16', state: 'running', status: 'Up 3 hours',
            project: 'shop', service: 'db', ports: ['0.0.0.0:5432->5432/tcp'],
            createdAt: '2026-01-01T00:00:00Z',
          },
          {
            id: 'c2', name: 'loose', image: 'busybox', state: 'exited', status: 'Exited (0)',
            ports: [], createdAt: '2026-01-02T00:00:00Z',
          },
        ],
      },
    })
    expect(response.result.ok && 'project' in (response.result.value.containers[1] ?? {})).toBe(false)
  })

  it('forwards the listing filters and the carrier signal to the seam', async () => {
    const seen: unknown[] = []
    const abort = new AbortController()
    const { api } = await harness([provider({
      list: (listRequest, forwarded) => {
        seen.push({ listRequest, aborted: forwarded === abort.signal })
        return Promise.resolve([])
      },
    })])

    await api.docker.listContainers(request({ project: 'shop' }), abort.signal)

    expect(seen).toEqual([{ listRequest: { project: 'shop' }, aborted: true }])
  })

  it('projects images onto their wire rows', async () => {
    const { api } = await harness([provider({
      images: () => Promise.resolve([
        { id: 'sha256:aa', tags: ['busybox:latest'], size: 4_200, createdAt: '2026-01-01T00:00:00Z' },
      ]),
    })])

    const response = await api.docker.listImages(request({}), signal())

    expect(response.result).toEqual({
      ok: true,
      value: {
        images: [{ id: 'sha256:aa', tags: ['busybox:latest'], size: 4_200, createdAt: '2026-01-01T00:00:00Z' }],
      },
    })
  })

  it('returns log text under the cap unchanged and forwards tail', async () => {
    const seen: unknown[] = []
    const { api } = await harness([provider({
      logs: (logsRequest) => {
        seen.push(logsRequest)
        return Promise.resolve({ container: logsRequest.container, content: 'boot\nready\n', truncated: false })
      },
    })])

    const response = await api.docker.logs(request({ container: 'db', tail: 20 }), signal())

    expect(seen).toEqual([{ container: 'db', tail: 20 }])
    expect(response.result).toEqual({
      ok: true,
      value: { container: 'db', content: 'boot\nready\n', truncated: false },
    })
  })

  it('keeps a provider-reported truncation even when the text fits the host cap', async () => {
    const { api } = await harness([provider({
      logs: () => Promise.resolve({ container: 'db', content: 'tail only', truncated: true }),
    })])

    const response = await api.docker.logs(request({ container: 'db' }), signal())

    expect(response.result).toEqual({
      ok: true,
      value: { container: 'db', content: 'tail only', truncated: true },
    })
  })
})

describe('docker log cap', () => {
  it('keeps the newest characters and reports the truncation', async () => {
    const { api } = await harness(
      [provider({ logs: () => Promise.resolve({ container: 'db', content: 'OLDESTxxxxNEWEST', truncated: false }) })],
      { dockerLogMaxChars: 6 },
    )

    const response = await api.docker.logs(request({ container: 'db' }), signal())

    expect(response.result).toEqual({
      ok: true,
      value: { container: 'db', content: 'NEWEST', truncated: true },
    })
  })

  it('leaves text of exactly the cap length untruncated', async () => {
    const { api } = await harness(
      [provider({ logs: () => Promise.resolve({ container: 'db', content: 'NEWEST', truncated: false }) })],
      { dockerLogMaxChars: 6 },
    )

    const response = await api.docker.logs(request({ container: 'db' }), signal())

    expect(response.result).toEqual({
      ok: true,
      value: { container: 'db', content: 'NEWEST', truncated: false },
    })
  })
})

describe('docker domain without a reachable engine', () => {
  it('answers docker-unavailable on every row when the composition mounts no seam', async () => {
    const { api } = await harness(undefined)

    const responses = [
      await api.docker.listContainers(request({}), signal()),
      await api.docker.listImages(request({}), signal()),
      await api.docker.logs(request({ container: 'db' }), signal()),
    ]

    for (const response of responses) {
      expect(response.result.ok).toBe(false)
      if (response.result.ok) continue
      expect(response.result.error.code).toBe('docker-unavailable')
      expect(response.result.error.message).toContain('mounts no Docker seam')
    }
  })

  it('answers docker-unavailable when the seam has no usable provider', async () => {
    const { api } = await harness([provider({ available: () => Promise.resolve(false) })])

    const response = await api.docker.listContainers(request({}), signal())

    expect(response.result.ok).toBe(false)
    if (response.result.ok) return
    expect(response.result.error.code).toBe('docker-unavailable')
    expect(response.result.error.message).toContain('no usable docker provider')
  })

  it('answers docker-unavailable when several usable providers leave selection ambiguous', async () => {
    const { api } = await harness([provider({ id: 'a' }), provider({ id: 'b' })])

    const response = await api.docker.listImages(request({}), signal())

    expect(response.result.ok).toBe(false)
    if (response.result.ok) return
    expect(response.result.error.code).toBe('docker-unavailable')
  })
})

describe('docker engine failures', () => {
  it('maps a provider-raised engine failure onto internal with its message', async () => {
    const { api } = await harness([provider({
      logs: () => Promise.reject(new DockerError('no such container: db', 'DOCKER_NOT_FOUND')),
    })])

    const response = await api.docker.logs(request({ container: 'db' }), signal())

    expect(response.result.ok).toBe(false)
    if (response.result.ok) return
    expect(response.result.error.code).toBe('internal')
    expect(response.result.error.message).toBe('no such container: db')
  })

  it('maps an untyped provider throw onto internal', async () => {
    const { api } = await harness([provider({ images: () => Promise.reject(new Error('socket closed')) })])

    const response = await api.docker.listImages(request({}), signal())

    expect(response.result.ok).toBe(false)
    if (response.result.ok) return
    expect(response.result.error.code).toBe('internal')
    expect(response.result.error.message).toBe('socket closed')
  })
})

describe('docker compose browsing', () => {
  it('lists directories before compose files, each group name-sorted', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-compose-browse-'))
    mkdirSync(join(root, 'zeta'))
    mkdirSync(join(root, 'alpha'))
    writeFileSync(join(root, 'docker-compose.yml'), '')
    writeFileSync(join(root, 'compose.yaml'), '')
    writeFileSync(join(root, 'notes.txt'), '')
    const { api } = await harness([provider()])

    const response = await api.docker.browseCompose(request({ path: root }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.entries.map(e => e.name)).toEqual([
      'alpha', 'zeta', 'compose.yaml', 'docker-compose.yml',
    ])
  })

  it('answers absolute paths, because the client never joins segments itself', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-compose-browse-'))
    writeFileSync(join(root, 'docker-compose.yml'), '')
    const { api } = await harness([provider()])

    const response = await api.docker.browseCompose(request({ path: root }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.entries[0]?.path).toBe(join(root, 'docker-compose.yml'))
  })

  it('walks the breadcrumb chain from the filesystem root to the listed directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-compose-browse-'))
    const { api } = await harness([provider()])

    const response = await api.docker.browseCompose(request({ path: root }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    const crumbs = response.result.value.crumbs
    expect(crumbs.at(0)?.path).toBe(sep)
    expect(crumbs.at(-1)?.path).toBe(root)
    expect(crumbs.every(crumb => crumb.directory)).toBe(true)
  })

  it('flags a dot-prefixed entry as hidden and leaves showing it to the client', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-compose-browse-'))
    mkdirSync(join(root, '.hidden'))
    const { api } = await harness([provider()])

    const response = await api.docker.browseCompose(request({ path: root }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.entries).toEqual([
      { name: '.hidden', path: join(root, '.hidden'), directory: true, hidden: true },
    ])
  })

  it('caps the level and says so rather than returning an unbounded listing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-compose-browse-'))
    for (const name of ['a', 'b', 'c']) mkdirSync(join(root, name))
    const { api } = await harness([provider()], { dockerComposeBrowseMaxEntries: 2 })

    const response = await api.docker.browseCompose(request({ path: root }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.entries).toHaveLength(2)
    expect(response.result.value.truncated).toBe(true)
  })

  it('refuses a path that is not a directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-compose-browse-'))
    const file = join(root, 'docker-compose.yml')
    writeFileSync(file, '')
    const { api } = await harness([provider()])

    const response = await api.docker.browseCompose(request({ path: file }), signal())

    expect(response.result).toMatchObject({ ok: false, error: { code: 'directory-unreadable' } })
  })

  it('refuses a missing directory', async () => {
    const { api } = await harness([provider()])

    const response = await api.docker.browseCompose(request({ path: '/nope/definitely/absent' }), signal())

    expect(response.result).toMatchObject({ ok: false, error: { code: 'directory-unreadable' } })
  })

  it('browses with no Docker seam mounted, because picking a file needs no engine', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-compose-browse-'))
    const { api } = await harness()

    const response = await api.docker.browseCompose(request({ path: root }), signal())

    expect(response.result.ok).toBe(true)
  })
})

describe('docker compose lifecycle', () => {
  const settled = {
    project: 'shop',
    output: 'Container shop-db Started',
    containers: [{
      id: 'c1', name: 'shop-db', image: 'postgres:17', state: 'running' as const, status: 'Up 1 second',
      ports: [], createdAt: '2026-01-01T00:00:00Z',
    }],
  }

  it('forwards the chosen host path and projects the settled project', async () => {
    let seen: unknown
    const { api } = await harness([provider({
      composeUp: (composeRequest) => {
        seen = composeRequest
        return Promise.resolve(settled)
      },
    })])

    const response = await api.docker.composeUp(request({ file: '/srv/shop/docker-compose.yml' }), signal())

    expect(seen).toEqual({ file: '/srv/shop/docker-compose.yml' })
    expect(response.result).toMatchObject({ ok: true, value: { project: 'shop' } })
  })

  it('forwards an explicit project name when the caller pinned one', async () => {
    let seen: unknown
    const { api } = await harness([provider({
      composeUp: (composeRequest) => {
        seen = composeRequest
        return Promise.resolve(settled)
      },
    })])

    await api.docker.composeUp(request({ file: '/srv/c.yml', project: 'pinned' }), signal())

    expect(seen).toEqual({ file: '/srv/c.yml', project: 'pinned' })
  })

  it('tears a project down through the seam', async () => {
    const { api } = await harness([provider({
      composeDown: () => Promise.resolve({ project: 'shop', output: 'Removed', containers: [] }),
    })])

    const response = await api.docker.composeDown(request({ file: '/srv/c.yml' }), signal())

    expect(response.result).toMatchObject({ ok: true, value: { project: 'shop', containers: [] } })
  })

  it('separates an engine that rejected the project from an engine that never answered', async () => {
    const rejected = await harness([provider({
      composeUp: () => Promise.reject(new DockerError('port 5432 already allocated', 'DOCKER_ENGINE_FAILED')),
    })])
    const rejectedResponse = await rejected.api.docker.composeUp(request({ file: '/srv/c.yml' }), signal())
    expect(rejectedResponse.result).toMatchObject({
      ok: false,
      error: { code: 'compose-failed', message: 'port 5432 already allocated' },
    })

    const stopped = await harness([provider({ available: () => Promise.resolve(false) })])
    const stoppedResponse = await stopped.api.docker.composeUp(request({ file: '/srv/c.yml' }), signal())
    expect(stoppedResponse.result).toMatchObject({ ok: false, error: { code: 'docker-unavailable' } })
  })

  it('refuses every lifecycle call when no composition mounts the seam', async () => {
    const { api } = await harness()

    const up = await api.docker.composeUp(request({ file: '/srv/c.yml' }), signal())
    const down = await api.docker.composeDown(request({ file: '/srv/c.yml' }), signal())

    expect(up.result).toMatchObject({ ok: false, error: { code: 'docker-unavailable' } })
    expect(down.result).toMatchObject({ ok: false, error: { code: 'docker-unavailable' } })
  })
})

describe('compose file recognition', () => {
  it('accepts the names Compose itself defaults to, plus the .compose.yml convention', () => {
    for (const name of [
      'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml',
      'compose.override.yml', 'docker-compose.prod.yaml', 'shop.compose.yml', 'DOCKER-COMPOSE.YML',
    ]) {
      expect(isComposeFileName(name), name).toBe(true)
    }
  })

  it('rejects a file that merely mentions compose', () => {
    for (const name of ['notes.txt', 'compose.json', 'composer.yml', 'readme.yaml', 'compose.yml.bak']) {
      expect(isComposeFileName(name), name).toBe(false)
    }
  })
})
