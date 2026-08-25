/**
 * The git domain over a real Git seam and real repositories.
 *
 * The fences are what this file exists to prove, and it proves them by
 * REJECTION through the domain method itself, not by inspecting a schema: a
 * repository outside every registered workspace and a path outside its
 * repository must both be refused before the seam is reached, because both
 * values arrive over the wire in production.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import GitRuntime from '@deepseek-ai/dsh-git'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as gitLocal from '@deepseek-ai/dsh-git-local'
import SessionStore from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '../src/api-proxy.ts'

const spillDir = mkdtempSync(join(tmpdir(), 'dsh-git-domain-spill-'))
const created: string[] = [spillDir]

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
})

/** An abort signal that never fires; these calls settle on their own. */
function signal(): AbortSignal {
  return new AbortController().signal
}

/** Wrap a payload as the request envelope every domain method takes. */
const request = <P>(payload: P): { rpcId: ReturnType<typeof RpcId>; payload: P } =>
  ({ rpcId: RpcId('t-git'), payload })

/** Run `git` directly to ARRANGE a fixture; the domain is what we assert on. */
function git(cwd: string, ...args: readonly string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

/**
 * A workspace directory holding one repository with a committed file and one
 * uncommitted edit. macOS resolves the temp root through a symlink and the
 * fence compares realpaths, so the fixture realpaths too.
 */
function workspaceWithRepo(): { workspace: string; repo: string } {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-git-ws-')))
  created.push(workspace)
  const repo = join(workspace, 'project')
  git(workspace, 'init', '-q', repo)
  git(repo, 'config', 'user.email', 'test@example.com')
  git(repo, 'config', 'user.name', 'Test')
  git(repo, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(repo, 'a.txt'), 'committed\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'first')
  writeFileSync(join(repo, 'a.txt'), 'edited\n')
  return { workspace, repo }
}

/** Mount the Git seam, its local provider, and the api proxy over a workspace set. */
async function harness(workspaces: readonly string[], options: { seam?: boolean } = {}) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  ctx.provide('workspaceRegistry', {
    list: () => workspaces.map((path, index) => ({
      id: `w${String(index)}`,
      path,
      title: `workspace ${String(index)}`,
    })),
  } as never)
  if (options.seam !== false) {
    await ctx.plugin(LocalSubprocessRuntime)
    ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
    await ctx.plugin(GitRuntime, {})
    await ctx.plugin(gitLocal, {})
  }
  return {
    ctx,
    api: createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
      cwd: workspaces[0] ?? '/tmp',
    }),
  }
}

describe('git.listRepositories', () => {
  it('finds the repositories inside the registered workspaces', async () => {
    const { workspace, repo } = workspaceWithRepo()
    const { api } = await harness([workspace])

    const response = await api.git.listRepositories(request({}), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.repositories).toEqual([expect.objectContaining({
      root: repo,
      name: 'project',
      workspacePath: workspace,
      // The workspace title rides along so a picker groups without a second
      // lookup the client would otherwise have to make.
      workspaceTitle: 'workspace 0',
      submodule: false,
    })])
  })

  it('answers an empty list rather than failing when no workspace holds a repository', async () => {
    const empty = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-git-empty-')))
    created.push(empty)
    const { api } = await harness([empty])

    const response = await api.git.listRepositories(request({}), signal())

    expect(response.result).toMatchObject({ ok: true, value: { repositories: [], truncated: false } })
  })
})

describe('git.status', () => {
  it('reports both sides of every change with absolute paths', async () => {
    const { workspace, repo } = workspaceWithRepo()
    const { api } = await harness([workspace])

    const response = await api.git.status(request({ root: repo }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.changes).toEqual([expect.objectContaining({
      path: 'a.txt',
      absolutePath: join(repo, 'a.txt'),
      index: 'unmodified',
      worktree: 'modified',
    })])
  })
})

describe('git.worktrees', () => {
  it('lists every checkout with the changes each one holds', async () => {
    const { workspace, repo } = workspaceWithRepo()
    git(repo, 'branch', 'feature')
    const linked = join(workspace, 'project-feature')
    git(repo, 'worktree', 'add', '-q', linked, 'feature')
    // One uncommitted edit in the linked checkout, independent of the main one.
    writeFileSync(join(linked, 'a.txt'), 'edited in the other worktree\n')
    const { api } = await harness([workspace])

    const response = await api.git.worktrees(request({ root: repo }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    const { worktrees } = response.result.value
    expect(worktrees).toHaveLength(2)
    // The counts are what let one call answer what is in each checkout.
    expect(worktrees.find(tree => tree.path === repo)).toMatchObject({ main: true, changes: 1 })
    expect(worktrees.find(tree => tree.path === linked)).toMatchObject({
      main: false, branch: 'feature', changes: 1,
    })
  })

  it('reports a locked checkout with its reason', async () => {
    const { workspace, repo } = workspaceWithRepo()
    const locked = join(workspace, 'project-locked')
    git(repo, 'worktree', 'add', '-q', '--detach', locked, 'HEAD')
    git(repo, 'worktree', 'lock', locked, '--reason', 'release in flight')
    const { api } = await harness([workspace])

    const response = await api.git.worktrees(request({ root: repo }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.worktrees.find(tree => tree.path === locked))
      .toMatchObject({ locked: 'release in flight', detached: true })
  })

  it('keeps a prunable checkout in the list, without claiming a count', async () => {
    const { workspace, repo } = workspaceWithRepo()
    const gone = join(workspace, 'project-gone')
    git(repo, 'worktree', 'add', '-q', '--detach', gone, 'HEAD')
    // The directory disappears; git still knows the checkout exists.
    rmSync(gone, { recursive: true, force: true })
    const { api } = await harness([workspace])

    const response = await api.git.worktrees(request({ root: repo }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    const entry = response.result.value.worktrees.find(tree => tree.path === gone)
    // A vanished directory is a state to render, not a failed listing.
    expect(entry?.prunable).toBeTruthy()
    expect(entry?.changes).toBeUndefined()
  })

  it('refuses a repository outside every registered workspace', async () => {
    const outside = workspaceWithRepo()
    const registered = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-git-wt-fence-')))
    created.push(registered)
    const { api } = await harness([registered])

    const response = await api.git.worktrees(request({ root: outside.repo }), signal())

    expect(response.result).toMatchObject({ ok: false, error: { code: 'git-denied' } })
  })
})

describe('git.compareBases', () => {
  /** A repository whose `develop` moved after `feature` branched off it. */
  function diverged(): { workspace: string; repo: string } {
    const { workspace, repo } = workspaceWithRepo()
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'second')
    git(repo, 'branch', 'develop')
    git(repo, 'checkout', '-q', '-b', 'feature')
    writeFileSync(join(repo, 'feature.txt'), 'work\n')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'feature work')
    git(repo, 'checkout', '-q', 'develop')
    writeFileSync(join(repo, 'moved.txt'), 'moved\n')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'develop moved')
    git(repo, 'checkout', '-q', 'feature')
    return { workspace, repo }
  }

  it('reports how far the base moved underneath the branch', async () => {
    const { workspace, repo } = diverged()
    const { api } = await harness([workspace])

    const response = await api.git.compareBases(
      request({ root: repo, bases: ['develop'] }),
      signal(),
    )

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    // `behind: 1` is the fact that makes a push unsafe.
    expect(response.result.value.comparisons).toEqual([
      { base: 'develop', exists: true, ahead: 1, behind: 1, conflicts: false },
    ])
  })

  it('warns that merging back would conflict', async () => {
    const { workspace, repo } = workspaceWithRepo()
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'second')
    git(repo, 'branch', 'develop')
    git(repo, 'checkout', '-q', '-b', 'feature')
    writeFileSync(join(repo, 'a.txt'), 'ours\n')
    git(repo, 'commit', '-q', '-am', 'ours')
    git(repo, 'checkout', '-q', 'develop')
    writeFileSync(join(repo, 'a.txt'), 'theirs\n')
    git(repo, 'commit', '-q', '-am', 'theirs')
    git(repo, 'checkout', '-q', 'feature')
    const { api } = await harness([workspace])

    const response = await api.git.compareBases(
      request({ root: repo, bases: ['develop'] }),
      signal(),
    )

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.comparisons[0]).toMatchObject({ behind: 1, conflicts: true })
    // The check computed the merge without touching the working tree.
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('ours\n')
  })

  it('omits a base this repository does not have', async () => {
    const { workspace, repo } = diverged()
    const { api } = await harness([workspace])

    const response = await api.git.compareBases(
      request({ root: repo, bases: ['develop', 'nonexistent'] }),
      signal(),
    )

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    // A repository with `develop` should not be told about a base it never had.
    expect(response.result.value.comparisons.map(entry => entry.base)).toEqual(['develop'])
  })

  it('refuses a repository outside every registered workspace', async () => {
    const outside = workspaceWithRepo()
    const registered = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-git-base-fence-')))
    created.push(registered)
    const { api } = await harness([registered])

    const response = await api.git.compareBases(request({ root: outside.repo }), signal())

    expect(response.result).toMatchObject({ ok: false, error: { code: 'git-denied' } })
  })
})

describe('git.graph', () => {
  it('carries parents and refs, so lanes can be laid out', async () => {
    const { workspace, repo } = workspaceWithRepo()
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'second')
    const { api } = await harness([workspace])

    const response = await api.git.graph(request({ root: repo }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    const { commits, branches } = response.result.value
    expect(commits.length).toBeGreaterThan(1)
    expect(commits[0]?.parents).toEqual([commits[1]?.id])
    // The current branch anchors a lane, and `HEAD ->` was stripped from it.
    expect(commits[0]?.refs.some(ref => ref.includes('HEAD'))).toBe(false)
    expect(branches.filter(branch => branch.current)).toHaveLength(1)
  })

  it('refuses a repository outside every registered workspace', async () => {
    const outside = workspaceWithRepo()
    const registered = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-git-graph-fence-')))
    created.push(registered)
    const { api } = await harness([registered])

    const response = await api.git.graph(request({ root: outside.repo }), signal())

    expect(response.result).toMatchObject({ ok: false, error: { code: 'git-denied' } })
  })
})

describe('the workspace fence', () => {
  it('refuses a repository outside every registered workspace', async () => {
    // The repository is real and readable; what makes it inadmissible is that
    // no registered workspace contains it. A wire value must never reach an
    // arbitrary repository on the machine.
    const outside = workspaceWithRepo()
    const registered = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-git-other-')))
    created.push(registered)
    const { api } = await harness([registered])

    const response = await api.git.status(request({ root: outside.repo }), signal())

    expect(response.result).toMatchObject({ ok: false, error: { code: 'git-denied' } })
  })

  it('refuses every mutating row for an out-of-workspace repository', async () => {
    const outside = workspaceWithRepo()
    const registered = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-git-other-mut-')))
    created.push(registered)
    const { api } = await harness([registered])
    const root = outside.repo

    // Enforcement lives in the operation, not the schema: each mutating row
    // must refuse on its own, because each is separately reachable.
    for (const response of [
      await api.git.stage(request({ root, paths: ['a.txt'] }), signal()),
      await api.git.unstage(request({ root, paths: ['a.txt'] }), signal()),
      await api.git.discard(request({ root, path: 'a.txt', side: 'worktree' }), signal()),
      await api.git.commit(request({ root, message: 'nope' }), signal()),
      await api.git.recover(request({ root, oid: 'abcdef' }), signal()),
      await api.git.diff(request({ root, path: 'a.txt', side: 'worktree' }), signal()),
      await api.git.log(request({ root }), signal()),
    ]) {
      expect(response.result).toMatchObject({ ok: false, error: { code: 'git-denied' } })
    }
  })

  it('refuses a path escaping its repository', async () => {
    const { workspace, repo } = workspaceWithRepo()
    const { api } = await harness([workspace])

    const response = await api.git.diff(
      request({ root: repo, path: '../outside.txt', side: 'worktree' }),
      signal(),
    )

    expect(response.result).toMatchObject({ ok: false, error: { code: 'git-denied' } })
  })

  it('refuses a repository that does not exist', async () => {
    const { workspace } = workspaceWithRepo()
    const { api } = await harness([workspace])

    const response = await api.git.status(
      request({ root: join(workspace, 'absent') }),
      signal(),
    )

    expect(response.result).toMatchObject({ ok: false, error: { code: 'git-denied' } })
  })
})

describe('operator mutations', () => {
  it('stages and answers the settled status in one round trip', async () => {
    const { workspace, repo } = workspaceWithRepo()
    const { api } = await harness([workspace])

    const response = await api.git.stage(request({ root: repo, paths: ['a.txt'] }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    // The status rides back on the mutation so the panel never renders a
    // state the repository has already left.
    expect(response.result.value.changes[0]).toMatchObject({
      index: 'modified',
      worktree: 'unmodified',
    })
  })

  it('discards a change and leaves it recoverable through the returned id', async () => {
    const { workspace, repo } = workspaceWithRepo()
    const { api } = await harness([workspace])

    const discarded = await api.git.discard(
      request({ root: repo, path: 'a.txt', side: 'worktree' }),
      signal(),
    )

    expect(discarded.result.ok).toBe(true)
    if (!discarded.result.ok) return
    expect(discarded.result.value.status.changes).toEqual([])

    // The discard destroyed uncommitted work, and the returned id is what
    // makes that work reachable again — the reason this destructive gesture
    // is allowed on this domain at all.
    const oid = discarded.result.value.recoveredOid
    expect(oid).toMatch(/^[0-9a-f]{40}$/)
    const recovered = await api.git.recover(request({ root: repo, oid: oid as string }), signal())

    expect(recovered.result).toMatchObject({ ok: true, value: { content: 'edited\n' } })
  })

  it('commits staged work and answers the new commit with a clean status', async () => {
    const { workspace, repo } = workspaceWithRepo()
    const { api } = await harness([workspace])
    await api.git.stage(request({ root: repo, paths: ['a.txt'] }), signal())

    const response = await api.git.commit(request({ root: repo, message: 'edit a.txt' }), signal())

    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.commit).toMatchObject({ subject: 'edit a.txt', authorName: 'Test' })
    expect(response.result.value.status.changes).toEqual([])
  })

  it('reports an empty index as git-nothing-staged, not a failure', async () => {
    const { workspace, repo } = workspaceWithRepo()
    const { api } = await harness([workspace])
    // Discard the only change so the index is genuinely empty.
    await api.git.discard(request({ root: repo, path: 'a.txt', side: 'worktree' }), signal())

    const response = await api.git.commit(request({ root: repo, message: 'nothing' }), signal())

    // The client renders a disabled action from this code rather than an error.
    expect(response.result).toMatchObject({ ok: false, error: { code: 'git-nothing-staged' } })
  })
})

describe('git without a seam', () => {
  it('answers git-unavailable on every row', async () => {
    const { workspace, repo } = workspaceWithRepo()
    const { api } = await harness([workspace], { seam: false })

    for (const response of [
      await api.git.listRepositories(request({}), signal()),
      await api.git.status(request({ root: repo }), signal()),
      await api.git.diff(request({ root: repo, path: 'a.txt', side: 'worktree' }), signal()),
      await api.git.log(request({ root: repo }), signal()),
      await api.git.stage(request({ root: repo, paths: ['a.txt'] }), signal()),
      await api.git.unstage(request({ root: repo, paths: ['a.txt'] }), signal()),
      await api.git.discard(request({ root: repo, path: 'a.txt', side: 'worktree' }), signal()),
      await api.git.recover(request({ root: repo, oid: 'abcdef' }), signal()),
      await api.git.commit(request({ root: repo, message: 'x' }), signal()),
    ]) {
      expect(response.result).toMatchObject({ ok: false, error: { code: 'git-unavailable' } })
    }
  })
})
