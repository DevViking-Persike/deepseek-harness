/**
 * The Git tool suite through the REAL tool registry and a real `ctx.git`.
 *
 * Registration is driven by enablement, not availability, and the mutating
 * group is off unless a deployment asks for it — both facts are only provable
 * against the registry that actually decides what the model sees.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import GitRuntime, { GitError } from '@deepseek-ai/dsh-git'
import type { GitProvider, GitStatus } from '@deepseek-ai/dsh-git'
import * as ToolGit from '@deepseek-ai/dsh-tool-git'
import { capDiff, formatStatus } from '@deepseek-ai/dsh-tool-git'

const testToolSignal = new AbortController().signal

/** A working tree with one staged rename and one unstaged edit. */
function status(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    root: '/repo',
    branch: 'main',
    head: 'abc123',
    upstream: 'origin/main',
    ahead: 2,
    behind: 1,
    changes: [
      {
        path: 'src/a.ts',
        absolutePath: '/repo/src/a.ts',
        index: 'unmodified',
        worktree: 'modified',
        binary: false,
        insertions: 3,
        deletions: 1,
      },
    ],
    truncated: false,
    ...overrides,
  }
}

/** A scripted backend so the tools run against a real seam without a repository. */
function provider(overrides: Partial<GitProvider> = {}): GitProvider {
  return {
    id: 'stub',
    available: () => Promise.resolve(true),
    discover: () => Promise.resolve({ repositories: [], truncated: false }),
    status: () => Promise.resolve(status()),
    worktrees: () => Promise.resolve([
      { path: '/repo', name: 'repo', branch: 'main', main: true, detached: false, bare: false },
    ]),
    compareBases: request => Promise.resolve(request.bases.map(base => ({ base, exists: true, ahead: 0, behind: 0, conflicts: false }))),
    graph: () => Promise.resolve({ commits: [], branches: [], truncated: false }),
    diff: request => Promise.resolve({
      path: request.path,
      oldText: 'before\n',
      newText: 'after\n',
      binary: false,
    }),
    log: () => Promise.resolve([{
      id: 'c0ffee1234',
      subject: 'first commit',
      authorName: 'Ada',
      authorEmail: 'ada@example.com',
      authoredAt: '2026-01-01T00:00:00Z',
      parents: [],
    }]),
    readBlob: () => Promise.resolve('recovered\n'),
    stage: () => Promise.resolve(),
    unstage: () => Promise.resolve(),
    discard: request => Promise.resolve({ path: request.path, recoveredOid: 'deadbeef' }),
    commit: () => Promise.resolve({
      id: 'c0ffee1234',
      subject: 'new commit',
      authorName: 'Ada',
      authorEmail: 'ada@example.com',
      authoredAt: '2026-01-01T00:00:00Z',
      parents: ['abc123'],
    }),
    ...overrides,
  }
}

/** Mount the real tool registry, git seam, and tool-git. */
async function mountTools(opts: { config?: ToolGit.Config; git?: GitProvider } = {}): Promise<{
  ctx: Context
  fiber: Awaited<ReturnType<Context['plugin']>>
  call: (name: string, args: unknown) => Promise<ToolExecutionResult>
}> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(GitRuntime, {})
  ctx.git.registerProvider(opts.git ?? provider())
  const fiber = await ctx.plugin(ToolGit, opts.config ?? { mutate: true })
  let counter = 0
  const call = (name: string, args: unknown) => ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`call-${++counter}`),
    name,
    arguments: args,
  })
  return { ctx, fiber, call }
}

/** The single text block a settled tool call rendered. */
function text(result: ToolExecutionResult): string {
  const block = result.content[0]
  return block !== undefined && block.type === 'text' ? block.text : ''
}

describe('registration follows enablement', () => {
  it('ships the read tools and withholds the mutating group by default', async () => {
    const { ctx } = await mountTools({ config: {} })

    // A deployment that says nothing gets reads only: git_discard destroys
    // uncommitted work and git_commit writes history.
    expect(ctx.tools.schemas().map(schema => schema.name).sort())
      .toEqual(['git_diff', 'git_log', 'git_status'])
  })

  it('registers the mutating group when a deployment opts in', async () => {
    const { ctx } = await mountTools({ config: { mutate: true } })

    expect(ctx.tools.schemas().map(schema => schema.name).sort()).toEqual([
      'git_commit', 'git_diff', 'git_discard', 'git_log', 'git_stage', 'git_status', 'git_unstage',
    ])
  })

  it('registers nothing when both groups are disabled', async () => {
    const { ctx } = await mountTools({ config: { inspect: false, mutate: false } })

    expect(ctx.tools.schemas()).toEqual([])
  })

  it('stays registered when no backend is usable', async () => {
    // Availability is a per-call fact; an unusable backend must not remove a
    // tool the model was already told about.
    const { ctx, call } = await mountTools({
      git: provider({ available: () => Promise.resolve(false) }),
    })

    expect(ctx.tools.schemas().map(schema => schema.name)).toContain('git_status')
    const result = await call('git_status', { repository: '/repo' })
    expect(result.isError).toBe(true)
  })

  it('removes every tool when the fiber is disposed', async () => {
    const { ctx, fiber } = await mountTools()

    await fiber.dispose()

    expect(ctx.tools.schemas()).toEqual([])
  })
})

describe('read tools', () => {
  it('renders both sides of the index and the tracking divergence', async () => {
    const { call } = await mountTools()

    const rendered = text(await call('git_status', { repository: '/repo' }))

    expect(rendered).toContain('On main vs origin/main (ahead 2, behind 1)')
    // Both sides are shown because they are independent facts the model needs
    // before it stages or commits.
    expect(rendered).toContain('src/a.ts staged=unmodified unstaged=modified +3 -1')
  })

  it('renders a clean tree as such rather than an empty list', async () => {
    const { call } = await mountTools({
      git: provider({ status: () => Promise.resolve(status({ changes: [] })) }),
    })

    expect(text(await call('git_status', { repository: '/repo' }))).toContain('Working tree clean.')
  })

  it('reads one file\'s before and after content', async () => {
    const { call } = await mountTools()

    const rendered = text(await call('git_diff', { repository: '/repo', path: 'src/a.ts' }))

    expect(rendered).toContain('before')
    expect(rendered).toContain('after')
  })

  it('reports a binary file instead of pretending it has text', async () => {
    const { call } = await mountTools({
      git: provider({
        diff: request => Promise.resolve({ path: request.path, oldText: null, newText: null, binary: true }),
      }),
    })

    expect(text(await call('git_diff', { repository: '/repo', path: 'logo.png' })))
      .toContain('is binary')
  })

  it('renders commits with their short id, subject, and author', async () => {
    const { call } = await mountTools()

    expect(text(await call('git_log', { repository: '/repo' })))
      .toContain('c0ffee12 first commit — Ada')
  })

  it('says so when a repository has no commits in range', async () => {
    const { call } = await mountTools({ git: provider({ log: () => Promise.resolve([]) }) })

    expect(text(await call('git_log', { repository: '/repo' }))).toContain('no commits')
  })

  it('rejects an empty repository and a non-positive limit', async () => {
    const { call } = await mountTools()

    expect((await call('git_status', { repository: '  ' })).isError).toBe(true)
    expect((await call('git_log', { repository: '/repo', limit: 0 })).isError).toBe(true)
  })
})

describe('mutating tools', () => {
  it('stages paths and reports the settled status', async () => {
    const { call } = await mountTools()

    const result = await call('git_stage', { repository: '/repo', paths: ['src/a.ts'] })

    expect(result.isError).toBeFalsy()
    expect(text(result)).toContain('On main')
  })

  it('reports the recovery id a discard produced', async () => {
    const { call } = await mountTools()

    const rendered = text(await call('git_discard', { repository: '/repo', path: 'src/a.ts' }))

    // The model must surface this: it is what lets a user undo a discard that
    // destroyed work they wanted.
    expect(rendered).toContain('recoverable as deadbeef')
  })

  it('reports a commit by its short id and subject', async () => {
    const { call } = await mountTools()

    expect(text(await call('git_commit', { repository: '/repo', message: 'new commit' })))
      .toContain('Committed c0ffee12 new commit')
  })

  it('surfaces a structured seam failure to the model', async () => {
    const { call } = await mountTools({
      git: provider({
        commit: () => Promise.reject(new GitError('nothing staged to commit', 'GIT_NOTHING_STAGED')),
      }),
    })

    const result = await call('git_commit', { repository: '/repo', message: 'x' })

    expect(result.isError).toBe(true)
    expect(text(result)).toContain('nothing staged')
  })

  it('rejects an empty path list and an empty message', async () => {
    const { call } = await mountTools()

    expect((await call('git_stage', { repository: '/repo', paths: [] })).isError).toBe(true)
    expect((await call('git_commit', { repository: '/repo', message: '  ' })).isError).toBe(true)
  })

  it('declines to run concurrently, because the index is shared state', async () => {
    const { ctx } = await mountTools()

    // Valid arguments: the registry validates before consulting the
    // predicate, so a malformed call would report false for its own reason.
    expect(ctx.tools.get('git_stage')?.isConcurrencySafe?.({ repository: '/repo', paths: ['a'] }))
      .toBe(false)
    // Reads carry no such constraint.
    expect(ctx.tools.get('git_status')?.isConcurrencySafe?.({ repository: '/repo' })).toBe(true)
  })
})

describe('load-time config validation', () => {
  it('rejects a non-positive budget', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(GitRuntime, {})

    await expect(ctx.plugin(ToolGit, { inspectTimeoutMs: 0 })).rejects.toThrow(/positive integer/)
  })
})

describe('pure helpers', () => {
  it('caps a diff from the HEAD, since a file\'s start is what matters', () => {
    expect(capDiff('abcdef', 3)).toEqual({ text: 'abc', dropped: true })
    expect(capDiff('ab', 8)).toEqual({ text: 'ab', dropped: false })
  })

  it('names a detached HEAD rather than printing nothing', () => {
    const { branch: _branch, upstream: _upstream, ...detachedStatus } = status({ changes: [] })
    const detached = formatStatus(detachedStatus)

    expect(detached).toContain('(detached HEAD)')
  })

  it('says when the change list was cut short', () => {
    expect(formatStatus(status({ truncated: true }))).toContain('were not listed')
  })
})
