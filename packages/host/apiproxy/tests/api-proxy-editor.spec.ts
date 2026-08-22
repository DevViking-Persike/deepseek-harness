/**
 * The editor domain over a real filesystem seam: paths are fenced to the
 * workspace root, reads report their freshness token, and a save that presents
 * a stale token is refused so a concurrent agent edit is never clobbered.
 */
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SessionStore from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '../src/api-proxy.ts'

/** An abort signal that never fires; these calls settle on their own. */
function signal(): AbortSignal {
  return new AbortController().signal
}

/** Wrap a payload as the request envelope every domain method takes. */
const request = <P>(payload: P): { rpcId: ReturnType<typeof RpcId>; payload: P } =>
  ({ rpcId: RpcId('t-editor'), payload })

/** A workspace with one text file and one nested directory. */
function workspace(): string {
  // The seam realpaths every target, and macOS resolves the temp root through
  // a symlink, so the expected root must be realpathed too.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-editor-spec-')))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'main.ts'), 'export const answer = 42\n')
  writeFileSync(join(root, 'README.md'), '# project\n')
  return root
}

/**
 * Mount a real local filesystem seam and the api proxy over it. No session is
 * addressed, so the domain falls back to the deployment workspace root, which
 * the sandbox-policy default pins to this temporary directory.
 */
async function harness(root: string | undefined) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  if (root !== undefined) {
    await ctx.plugin(LocalFileSystem)
    await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: root })
  }
  return {
    ctx,
    api: createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
      cwd: root ?? '/tmp',
    }),
  }
}

describe('editor.listDir', () => {
  it('lists the workspace root with directories before files', async () => {
    const root = workspace()
    const { api } = await harness(root)

    const response = await api.editor.listDir(request({}), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.entries.map(e => e.name)).toEqual(['src', 'README.md'])
    expect(response.result.value.entries[0]?.directory).toBe(true)
  })

  it('refuses a path that escapes the workspace root', async () => {
    const root = workspace()
    const { api } = await harness(root)

    const response = await api.editor.listDir(request({ path: '/etc' }), signal())

    expect(response.result).toMatchObject({ ok: false, error: { code: 'editor-denied' } })
  })
})

describe('editor.readFile', () => {
  it('returns the text and a freshness token', async () => {
    const root = workspace()
    const { api } = await harness(root)

    const response = await api.editor.readFile(request({ path: join(root, 'src/main.ts') }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.content).toBe('export const answer = 42\n')
    expect(response.result.value.version.length).toBeGreaterThan(0)
  })

  it('reports a missing file as not-found rather than an internal fault', async () => {
    const root = workspace()
    const { api } = await harness(root)

    const response = await api.editor.readFile(request({ path: join(root, 'absent.ts') }), signal())

    expect(response.result).toMatchObject({ ok: false, error: { code: 'editor-not-found' } })
  })

  it('refuses to read outside the workspace', async () => {
    const root = workspace()
    const { api } = await harness(root)

    const response = await api.editor.readFile(request({ path: '/etc/hosts' }), signal())

    expect(response.result).toMatchObject({ ok: false, error: { code: 'editor-denied' } })
  })
})

describe('editor.writeFile', () => {
  it('writes the file and returns the token for the next save', async () => {
    const root = workspace()
    const { api } = await harness(root)
    const path = join(root, 'src/main.ts')
    const read = await api.editor.readFile(request({ path }), signal())
    if (!read.result.ok) throw new Error('read failed')

    const response = await api.editor.writeFile(
      request({ path, content: 'export const answer = 43\n', version: read.result.value.version }),
      signal(),
    )

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.version).not.toBe(read.result.value.version)
    await expect(readFile(path, 'utf8')).resolves.toBe('export const answer = 43\n')
  })

  it('refuses a save whose token went stale, leaving the concurrent edit intact', async () => {
    const root = workspace()
    const { api } = await harness(root)
    const path = join(root, 'src/main.ts')
    const read = await api.editor.readFile(request({ path }), signal())
    if (!read.result.ok) throw new Error('read failed')
    // Someone else — in production the agent — writes the same file first.
    writeFileSync(path, 'export const answer = 99\n')

    const response = await api.editor.writeFile(
      request({ path, content: 'export const answer = 43\n', version: read.result.value.version }),
      signal(),
    )

    expect(response.result).toMatchObject({ ok: false, error: { code: 'editor-stale' } })
    await expect(readFile(path, 'utf8')).resolves.toBe('export const answer = 99\n')
  })

  it('refuses to write outside the workspace', async () => {
    const root = workspace()
    const { api } = await harness(root)

    const response = await api.editor.writeFile(
      request({ path: join(tmpdir(), 'escaped.txt'), content: 'x', version: 'v1' }),
      signal(),
    )

    expect(response.result).toMatchObject({ ok: false, error: { code: 'editor-denied' } })
  })
})

describe('the workspace root the editor is fenced by', () => {
  it('follows the addressed session\'s own project directory', async () => {
    // Two projects on disk; the session names the second one, so the tree must
    // show that project rather than the deployment's own root.
    const deployment = workspace()
    const project = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-editor-project-')))
    mkdirSync(join(project, 'manifests'))
    writeFileSync(join(project, 'kustomization.yaml'), 'resources: []\n')
    const { ctx, api } = await harness(deployment)
    ctx.sessions.create(SessionId('s-project'), { meta: { cwd: project } })

    const response = await api.editor.listDir(request({ sessionId: 's-project' }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.root).toBe(project)
    expect(response.result.value.entries.map(e => e.name)).toEqual(['manifests', 'kustomization.yaml'])
  })

  it('falls back to the deployment root when no session is addressed', async () => {
    const deployment = workspace()
    const { api } = await harness(deployment)

    const response = await api.editor.listDir(request({}), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.root).toBe(deployment)
  })
})

describe('editor without a filesystem seam', () => {
  it('answers editor-unavailable on every row', async () => {
    const { api } = await harness(undefined)

    for (const response of [
      await api.editor.listDir(request({}), signal()),
      await api.editor.readFile(request({ path: '/w/a.ts' }), signal()),
      await api.editor.writeFile(request({ path: '/w/a.ts', content: '', version: 'v1' }), signal()),
    ]) {
      expect(response.result).toMatchObject({ ok: false, error: { code: 'editor-unavailable' } })
    }
  })
})
