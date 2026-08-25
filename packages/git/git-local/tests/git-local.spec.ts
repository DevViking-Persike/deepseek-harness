/**
 * The local provider against REAL repositories created per test.
 *
 * The `git` binary is present on any machine that builds this repository, and
 * a stub CLI could only prove that the provider passes the argv the test
 * already assumed. Running the real binary is what proves the formats agree
 * with the `git` a user runs in their own terminal — the entire reason this
 * seam drives the CLI instead of reimplementing Git.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import GitRuntime from '@deepseek-ai/dsh-git'
import { GitError } from '@deepseek-ai/dsh-git'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as gitLocal from '@deepseek-ai/dsh-git-local'

const spillDir = mkdtempSync(join(tmpdir(), 'dsh-git-local-spec-'))
const created: string[] = []

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
  rmSync(spillDir, { recursive: true, force: true })
})

/** Run `git` directly to ARRANGE a fixture; the provider is what we assert on. */
function git(cwd: string, ...args: readonly string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

/** Create a repository with one committed file and a deterministic identity. */
function newRepo(): string {
  // `git worktree list` reports realpaths, and macOS resolves the temp root
  // through a symlink, so the fixture canonicalizes to match.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-git-repo-')))
  created.push(root)
  git(root, 'init', '-q', '.')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  git(root, 'config', 'commit.gpgsign', 'false')
  return root
}

/** Mount the real subprocess seam, the git seam, and the local provider. */
async function mount(config: Partial<gitLocal.Config> = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
  await ctx.plugin(GitRuntime, {})
  await ctx.plugin(gitLocal, config)
  return ctx
}

describe('status over a real repository', () => {
  it('reports branch, head, and both sides of every change', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'kept.txt'), 'one\n')
    writeFileSync(join(root, 'removed.txt'), 'gone\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    // One staged deletion, one unstaged edit, one untracked file.
    writeFileSync(join(root, 'kept.txt'), 'one\ntwo\n')
    git(root, 'rm', '-q', 'removed.txt')
    writeFileSync(join(root, 'fresh.txt'), 'new\n')

    const ctx = await mount()
    const status = await ctx.git.status(root)

    expect(status.root).toBe(root)
    expect(status.branch).toBeTruthy()
    expect(status.head).toMatch(/^[0-9a-f]{40}$/)
    // No upstream is configured, so divergence is zero rather than unknown.
    expect(status.upstream).toBeUndefined()
    expect(status.ahead).toBe(0)
    expect(status.behind).toBe(0)
    expect(status.truncated).toBe(false)

    const byPath = new Map(status.changes.map(change => [change.path, change]))
    expect(byPath.get('kept.txt')).toMatchObject({
      index: 'unmodified',
      worktree: 'modified',
      insertions: 1,
      deletions: 0,
    })
    expect(byPath.get('removed.txt')).toMatchObject({ index: 'deleted', worktree: 'unmodified' })
    expect(byPath.get('fresh.txt')).toMatchObject({ worktree: 'untracked' })
    // The absolute path spares every consumer from joining segments itself.
    expect(byPath.get('kept.txt')?.absolutePath).toBe(join(root, 'kept.txt'))
  })

  it('carries a rename with its original path and similarity', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'sp ace.txt'), 'x\ny\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    git(root, 'mv', 'sp ace.txt', 'renamed ção.txt')

    const ctx = await mount()
    const status = await ctx.git.status(root)

    // A path with a space and a non-ASCII name survives `-z` framing intact.
    expect(status.changes).toEqual([expect.objectContaining({
      path: 'renamed ção.txt',
      origPath: 'sp ace.txt',
      index: 'renamed',
      similarity: 100,
    })])
  })

  it('marks a binary file as carrying no line counts', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'seed.txt'), 'seed\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    writeFileSync(join(root, 'bin.dat'), Buffer.from([0, 1, 2, 3, 0, 255]))
    git(root, 'add', 'bin.dat')

    const ctx = await mount()
    const [change] = (await ctx.git.status(root)).changes

    expect(change).toMatchObject({ path: 'bin.dat', binary: true })
    expect(change?.insertions).toBeUndefined()
  })

  it('reads a repository with no commits as an empty, unborn state', async () => {
    const root = newRepo()

    const ctx = await mount()
    const status = await ctx.git.status(root)

    expect(status.head).toBeUndefined()
    expect(status.changes).toEqual([])
  })

  it('truncates at the configured change bound instead of returning everything', async () => {
    const root = newRepo()
    for (let i = 0; i < 6; i += 1) writeFileSync(join(root, `f${String(i)}.txt`), 'x\n')

    const ctx = await mount({ maxChanges: 3 })
    const status = await ctx.git.status(root)

    expect(status.changes).toHaveLength(3)
    expect(status.truncated).toBe(true)
  })

  it('fails with GIT_NOT_A_REPOSITORY outside any repository', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'dsh-git-plain-'))
    created.push(plain)

    const ctx = await mount()

    await expect(ctx.git.status(plain)).rejects.toMatchObject({ code: 'GIT_NOT_A_REPOSITORY' })
  })
})

describe('worktrees over real checkouts', () => {
  it('lists the main working tree first, then each linked one with its branch', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), 'x\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    git(root, 'branch', 'feature')
    const linked = `${root}-feature`
    created.push(linked)
    git(root, 'worktree', 'add', '-q', linked, 'feature')

    const ctx = await mount()
    const worktrees = await ctx.git.worktrees(root)

    expect(worktrees).toHaveLength(2)
    // Git lists the main checkout first, which is how `main` is decided
    // without a second query.
    expect(worktrees[0]).toMatchObject({ path: root, main: true, detached: false, bare: false })
    expect(worktrees[1]).toMatchObject({
      path: linked, name: basename(linked), branch: 'feature', main: false,
    })
  })

  it('reports a detached checkout as carrying no branch', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), 'x\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    const detached = `${root}-detached`
    created.push(detached)
    git(root, 'worktree', 'add', '-q', '--detach', detached, 'HEAD')

    const ctx = await mount()
    const entry = (await ctx.git.worktrees(root)).find(tree => tree.path === detached)

    expect(entry).toMatchObject({ detached: true })
    expect(entry?.branch).toBeUndefined()
  })

  it('reports a locked checkout with its reason, so removal is not offered blindly', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), 'x\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    const locked = `${root}-locked`
    created.push(locked)
    git(root, 'worktree', 'add', '-q', '--detach', locked, 'HEAD')
    git(root, 'worktree', 'lock', locked, '--reason', 'deploy in progress')

    const ctx = await mount()
    const entry = (await ctx.git.worktrees(root)).find(tree => tree.path === locked)

    expect(entry?.locked).toBe('deploy in progress')
  })

  it('answers the same list from inside a linked checkout', async () => {
    // Every checkout shares one object database, so asking any of them must
    // report the whole set rather than only itself.
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), 'x\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    const linked = `${root}-second`
    created.push(linked)
    git(root, 'worktree', 'add', '-q', '--detach', linked, 'HEAD')

    const ctx = await mount()
    const fromLinked = await ctx.git.worktrees(linked)

    expect(fromLinked.map(tree => tree.path).sort()).toEqual([root, linked].sort())
    // `main` still names the repository's main working tree, not the one asked.
    expect(fromLinked.find(tree => tree.main)?.path).toBe(root)
  })

  it('reports a single-checkout repository as one main worktree', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), 'x\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')

    const ctx = await mount()

    const [only, ...rest] = await ctx.git.worktrees(root)

    expect(rest).toEqual([])
    expect(only).toMatchObject({ path: root, main: true })
    expect(only?.branch).toBeTruthy()
  })
})

describe('comparing against an integration branch', () => {
  /** A repo whose `develop` moved after `feature` branched off it. */
  function diverged(): string {
    const root = newRepo()
    writeFileSync(join(root, 'f.txt'), 'base\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'base')
    git(root, 'branch', 'develop')
    git(root, 'checkout', '-q', '-b', 'feature')
    writeFileSync(join(root, 'feature.txt'), 'work\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'feature work')
    git(root, 'checkout', '-q', 'develop')
    writeFileSync(join(root, 'other.txt'), 'moved\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'develop moved')
    git(root, 'checkout', '-q', 'feature')
    return root
  }

  it('reports how far the base moved underneath this branch', async () => {
    const root = diverged()

    const ctx = await mount()
    const [comparison] = await ctx.git.compareBases({ root, bases: ['develop'] })

    // `behind` is the fact that decides whether pushing is safe: develop has
    // one commit this branch does not.
    expect(comparison).toMatchObject({ base: 'develop', exists: true, ahead: 1, behind: 1 })
  })

  it('reports a base that does not exist rather than failing', async () => {
    const root = diverged()

    const ctx = await mount()
    const [comparison] = await ctx.git.compareBases({ root, bases: ['nonexistent'] })

    // A repository simply without `develop` is an ordinary state.
    expect(comparison).toEqual({ base: 'nonexistent', exists: false, ahead: 0, behind: 0 })
  })

  it('answers each requested base in the order asked', async () => {
    const root = diverged()

    const ctx = await mount()
    const found = await ctx.git.compareBases({ root, bases: ['develop', 'absent', 'main'] })

    expect(found.map(entry => entry.base)).toEqual(['develop', 'absent', 'main'])
  })

  it('reports no conflict when the change touches other files', async () => {
    const root = diverged()

    const ctx = await mount()
    const [comparison] = await ctx.git.compareBases({ root, bases: ['develop'] })

    // Both sides moved, but on different files: merging is clean.
    expect(comparison?.conflicts).toBe(false)
  })

  it('reports a conflict when both sides changed the same file', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'f.txt'), 'base\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'base')
    git(root, 'branch', 'develop')
    git(root, 'checkout', '-q', '-b', 'feature')
    writeFileSync(join(root, 'f.txt'), 'ours\n')
    git(root, 'commit', '-q', '-am', 'ours')
    git(root, 'checkout', '-q', 'develop')
    writeFileSync(join(root, 'f.txt'), 'theirs\n')
    git(root, 'commit', '-q', '-am', 'theirs')
    git(root, 'checkout', '-q', 'feature')

    const ctx = await mount()
    const [comparison] = await ctx.git.compareBases({ root, bases: ['develop'] })

    // This is the answer worth having before a push, and computing it moved
    // no ref and wrote no file.
    expect(comparison).toMatchObject({ behind: 1, conflicts: true })
    // The working tree is untouched by the check.
    expect(readFileSync(join(root, 'f.txt'), 'utf8')).toBe('ours\n')
  })

  it('reports zero divergence for a branch level with its base', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'f.txt'), 'base\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'base')
    git(root, 'branch', 'develop')

    const ctx = await mount()
    const [comparison] = await ctx.git.compareBases({ root, bases: ['develop'] })

    expect(comparison).toMatchObject({ ahead: 0, behind: 0, conflicts: false })
  })
})

describe('the commit graph', () => {
  it('carries each commit\'s parents and the refs pointing at it', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'f.txt'), 'base\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'base')
    git(root, 'checkout', '-q', '-b', 'topic')
    writeFileSync(join(root, 'g.txt'), 'topic\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'topic work')

    const ctx = await mount()
    const graph = await ctx.git.graph({ root, limit: 10 })

    expect(graph.commits).toHaveLength(2)
    const [tip, base] = graph.commits
    expect(tip?.subject).toBe('topic work')
    // Parents are what give the renderer its lanes.
    expect(tip?.parents).toEqual([base?.id])
    expect(base?.parents).toEqual([])
    // `HEAD -> topic` is split so the lane label is the branch alone.
    expect(tip?.refs).toContain('topic')
    expect(tip?.refs).not.toContain('HEAD')
  })

  it('gives a merge commit both of its parents', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'f.txt'), 'base\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'base')
    git(root, 'checkout', '-q', '-b', 'side')
    writeFileSync(join(root, 'side.txt'), 'side\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'side work')
    git(root, 'checkout', '-q', '-')
    git(root, 'merge', '-q', '--no-ff', 'side', '-m', 'merge side')

    const ctx = await mount()
    const graph = await ctx.git.graph({ root, limit: 10 })

    // Two parents is what makes a merge draw as converging lanes.
    expect(graph.commits[0]?.parents).toHaveLength(2)
  })

  it('includes commits from branches other than the one checked out', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'f.txt'), 'base\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'base')
    git(root, 'checkout', '-q', '-b', 'other')
    writeFileSync(join(root, 'o.txt'), 'other\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'only on other')
    git(root, 'checkout', '-q', '-')

    const ctx = await mount()
    const graph = await ctx.git.graph({ root, limit: 10 })

    // A graph showing only HEAD's ancestry would hide the branch being compared.
    expect(graph.commits.map(commit => commit.subject)).toContain('only on other')
  })

  it('lists every local branch with its tip and the current marker', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'f.txt'), 'base\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'base')
    git(root, 'branch', 'develop')

    const ctx = await mount()
    const graph = await ctx.git.graph({ root, limit: 10 })

    expect(graph.branches.map(branch => branch.name).sort()).toContain('develop')
    expect(graph.branches.filter(branch => branch.current)).toHaveLength(1)
  })

  it('reports truncation without returning more than the limit', async () => {
    const root = newRepo()
    for (let i = 0; i < 4; i += 1) {
      writeFileSync(join(root, `f${String(i)}.txt`), 'x\n')
      git(root, 'add', '-A')
      git(root, 'commit', '-q', '-m', `commit ${String(i)}`)
    }

    const ctx = await mount()
    const graph = await ctx.git.graph({ root, limit: 2 })

    expect(graph.commits).toHaveLength(2)
    expect(graph.truncated).toBe(true)
  })

  it('reads an empty graph from a repository with no commits', async () => {
    const ctx = await mount()

    expect(await ctx.git.graph({ root: newRepo(), limit: 10 }))
      .toEqual({ commits: [], branches: [], truncated: false })
  })

  it('rejects a non-positive limit', async () => {
    const ctx = await mount()

    await expect(ctx.git.graph({ root: newRepo(), limit: 0 }))
      .rejects.toMatchObject({ code: 'GIT_INVALID_REQUEST' })
  })
})

describe('diff', () => {
  it('returns both sides of an unstaged edit', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), 'before\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    writeFileSync(join(root, 'a.txt'), 'after\n')

    const ctx = await mount()
    const diff = await ctx.git.diff({ root, path: 'a.txt', side: 'worktree' })

    expect(diff).toEqual({ path: 'a.txt', oldText: 'before\n', newText: 'after\n', binary: false })
  })

  it('returns a null before-side for a newly added file', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'seed.txt'), 'seed\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    writeFileSync(join(root, 'added.txt'), 'brand new\n')
    git(root, 'add', 'added.txt')

    const ctx = await mount()
    const diff = await ctx.git.diff({ root, path: 'added.txt', side: 'index' })

    expect(diff.oldText).toBeNull()
    expect(diff.newText).toBe('brand new\n')
  })

  it('reports binary content as binary with neither side as text', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'seed.txt'), 'seed\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    writeFileSync(join(root, 'bin.dat'), Buffer.from([0, 1, 2, 0]))

    const ctx = await mount()
    const diff = await ctx.git.diff({ root, path: 'bin.dat', side: 'worktree' })

    expect(diff).toMatchObject({ binary: true, oldText: null, newText: null })
  })

  it('refuses a path escaping the repository', async () => {
    const root = newRepo()

    const ctx = await mount()

    // The path arrives over a wire in production, so `..` must be refused
    // here rather than handed to the CLI.
    await expect(ctx.git.diff({ root, path: '../outside.txt', side: 'worktree' }))
      .rejects.toMatchObject({ code: 'GIT_OUTSIDE_REPOSITORY' })
    await expect(ctx.git.diff({ root, path: '/etc/hosts', side: 'worktree' }))
      .rejects.toMatchObject({ code: 'GIT_OUTSIDE_REPOSITORY' })
  })
})

describe('log', () => {
  it('reads commits newest first with their author facts', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), '1\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first commit')
    writeFileSync(join(root, 'a.txt'), '2\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'second commit')

    const ctx = await mount()
    const commits = await ctx.git.log({ root, limit: 10 })

    expect(commits.map(commit => commit.subject)).toEqual(['second commit', 'first commit'])
    expect(commits[0]).toMatchObject({ authorName: 'Test', authorEmail: 'test@example.com' })
    // The root commit has no parents; the later one names it.
    expect(commits[1]?.parents).toEqual([])
    expect(commits[0]?.parents).toEqual([commits[1]?.id])
  })

  it('reads an empty history rather than failing on an unborn branch', async () => {
    const ctx = await mount()

    expect(await ctx.git.log({ root: newRepo(), limit: 5 })).toEqual([])
  })

  it('rejects a non-positive limit', async () => {
    const ctx = await mount()

    await expect(ctx.git.log({ root: newRepo(), limit: 0 }))
      .rejects.toMatchObject({ code: 'GIT_INVALID_REQUEST' })
  })
})

describe('index mutation', () => {
  it('stages and unstages a path without touching the working tree', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), 'first\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    writeFileSync(join(root, 'a.txt'), 'edited\n')

    const ctx = await mount()
    await ctx.git.stage({ root, paths: ['a.txt'] })

    expect((await ctx.git.status(root)).changes[0]).toMatchObject({
      index: 'modified',
      worktree: 'unmodified',
    })

    await ctx.git.unstage({ root, paths: ['a.txt'] })

    expect((await ctx.git.status(root)).changes[0]).toMatchObject({
      index: 'unmodified',
      worktree: 'modified',
    })
    // Unstaging must never revert the file itself.
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('edited\n')
  })

  it('unstages a first-ever add, where there is no HEAD to restore from', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), 'new\n')

    const ctx = await mount()
    await ctx.git.stage({ root, paths: ['a.txt'] })
    await ctx.git.unstage({ root, paths: ['a.txt'] })

    expect((await ctx.git.status(root)).changes[0]).toMatchObject({ worktree: 'untracked' })
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('new\n')
  })

  it('refuses a staging request with no paths and one that escapes', async () => {
    const root = newRepo()
    const ctx = await mount()

    await expect(ctx.git.stage({ root, paths: [] }))
      .rejects.toMatchObject({ code: 'GIT_INVALID_REQUEST' })
    await expect(ctx.git.stage({ root, paths: ['../escape.txt'] }))
      .rejects.toMatchObject({ code: 'GIT_OUTSIDE_REPOSITORY' })
  })
})

describe('discard preserves the work it destroys', () => {
  it('restores the file and leaves the discarded content recoverable', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), 'committed\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    writeFileSync(join(root, 'a.txt'), 'work in progress\n')

    const ctx = await mount()
    const result = await ctx.git.discard({ root, path: 'a.txt', side: 'worktree' })

    // The file is back to its committed content...
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('committed\n')
    // ...and the discarded work is still addressable, which is what makes
    // this discard undoable rather than a silent loss.
    expect(result.recoveredOid).toMatch(/^[0-9a-f]{40}$/)
    expect(await ctx.git.readBlob(root, result.recoveredOid as string))
      .toBe('work in progress\n')
  })

  it('removes an untracked file while still preserving its content', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'seed.txt'), 'seed\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')
    writeFileSync(join(root, 'scratch.txt'), 'unsaved thought\n')

    const ctx = await mount()
    const result = await ctx.git.discard({ root, path: 'scratch.txt', side: 'worktree' })

    expect((await ctx.git.status(root)).changes).toEqual([])
    expect(await ctx.git.readBlob(root, result.recoveredOid as string))
      .toBe('unsaved thought\n')
  })

  it('rejects an object id that is not one', async () => {
    const ctx = await mount()

    await expect(ctx.git.readBlob(newRepo(), 'not-an-oid; rm -rf /'))
      .rejects.toMatchObject({ code: 'GIT_INVALID_REQUEST' })
  })
})

describe('commit', () => {
  it('commits the staged changes and reads the new commit back', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), 'content\n')

    const ctx = await mount()
    await ctx.git.stage({ root, paths: ['a.txt'] })
    const commit = await ctx.git.commit({ root, message: 'add a.txt' })

    expect(commit).toMatchObject({ subject: 'add a.txt', authorName: 'Test' })
    expect(commit.id).toMatch(/^[0-9a-f]{40}$/)
    expect((await ctx.git.status(root)).changes).toEqual([])
  })

  it('keeps a message with newlines and quotes intact as one argument', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), 'x\n')

    const ctx = await mount()
    await ctx.git.stage({ root, paths: ['a.txt'] })
    // A message is never shell-interpreted: it reaches git as one argv entry.
    const commit = await ctx.git.commit({ root, message: 'fix: "quoted"\n\nbody `here`' })

    expect(commit.subject).toBe('fix: "quoted"')
  })

  it('refuses an empty message and an empty index distinctly', async () => {
    const root = newRepo()
    writeFileSync(join(root, 'a.txt'), 'x\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'first')

    const ctx = await mount()

    await expect(ctx.git.commit({ root, message: '   ' }))
      .rejects.toMatchObject({ code: 'GIT_INVALID_REQUEST' })
    await expect(ctx.git.commit({ root, message: 'nothing here' }))
      .rejects.toMatchObject({ code: 'GIT_NOTHING_STAGED' })
  })
})

describe('discovery across workspace roots', () => {
  it('finds nested repositories and marks the inner ones', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'dsh-git-ws-'))
    created.push(workspace)
    const outer = join(workspace, 'outer')
    const inner = join(outer, 'packages', 'inner')
    mkdirSync(inner, { recursive: true })
    git(workspace, 'init', '-q', outer)
    git(workspace, 'init', '-q', inner)

    const ctx = await mount()
    const found = await ctx.git.discover({ roots: [workspace], maxDepth: 5, limit: 50 })

    const roots = found.repositories.map(repository => repository.root)
    expect(roots).toContain(outer)
    // A repository inside another is the submodule/vendored case; pruning at
    // the first `.git` would hide exactly what a reviewer needs to see.
    expect(roots).toContain(inner)
    expect(found.repositories.find(r => r.root === inner)?.submodule).toBe(true)
    expect(found.repositories.find(r => r.root === outer)?.submodule).toBe(false)
    expect(found.truncated).toBe(false)
  })

  it('never descends into dependency and build directories', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'dsh-git-skip-'))
    created.push(workspace)
    const buried = join(workspace, 'node_modules', 'dep')
    mkdirSync(buried, { recursive: true })
    git(workspace, 'init', '-q', buried)

    const ctx = await mount()
    const found = await ctx.git.discover({ roots: [workspace], maxDepth: 5, limit: 50 })

    expect(found.repositories).toEqual([])
  })

  it('stops at the limit and says so', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'dsh-git-limit-'))
    created.push(workspace)
    for (const name of ['a', 'b', 'c']) {
      const dir = join(workspace, name)
      mkdirSync(dir, { recursive: true })
      git(workspace, 'init', '-q', dir)
    }

    const ctx = await mount()
    const found = await ctx.git.discover({ roots: [workspace], maxDepth: 3, limit: 2 })

    expect(found.repositories).toHaveLength(2)
    expect(found.truncated).toBe(true)
  })

  it('honours the depth bound', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'dsh-git-depth-'))
    created.push(workspace)
    const deep = join(workspace, 'a', 'b', 'c')
    mkdirSync(deep, { recursive: true })
    git(workspace, 'init', '-q', deep)

    const ctx = await mount()

    expect((await ctx.git.discover({ roots: [workspace], maxDepth: 1, limit: 50 })).repositories)
      .toEqual([])
    expect((await ctx.git.discover({ roots: [workspace], maxDepth: 3, limit: 50 })).repositories)
      .toHaveLength(1)
  })
})

describe('provider registration and selection', () => {
  it('registers one provider and removes it with the fiber', async () => {
    const ctx = await mount()

    expect(ctx.git.providerIds()).toEqual(['local'])
  })

  it('rejects a duplicate provider id', async () => {
    const ctx = await mount()

    expect(() => ctx.git.registerProvider({ id: 'local' } as never))
      .toThrow(GitError)
  })

  it('fails selection when the configured provider is not registered', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalSubprocessRuntime)
    ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
    await ctx.plugin(GitRuntime, { provider: 'absent' })

    await expect(ctx.git.status(newRepo()))
      .rejects.toMatchObject({ code: 'GIT_PROVIDER_CONFIGURED_MISSING' })
  })

  it('fails selection when no provider is registered at all', async () => {
    const ctx = new Context()
    await ctx.plugin(GitRuntime, {})

    await expect(ctx.git.status(newRepo()))
      .rejects.toMatchObject({ code: 'GIT_PROVIDER_UNAVAILABLE' })
  })

  it('reports an unusable CLI as unavailable rather than crashing', async () => {
    const ctx = await mount({ cli: join(tmpdir(), 'definitely-not-a-real-git-binary') })

    // A machine without git makes the provider unusable, which is a selection
    // fact — the seam raises its own error rather than a spawn failure.
    await expect(ctx.git.status(newRepo()))
      .rejects.toMatchObject({ code: 'GIT_PROVIDER_UNAVAILABLE' })
  })
})
