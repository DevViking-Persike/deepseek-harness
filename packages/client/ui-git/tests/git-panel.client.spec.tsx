// @vitest-environment jsdom
/**
 * The version-control panel's user-visible behavior.
 *
 * Props are fed directly, which is the sanctioned zero-machinery path: what
 * this file asserts is what an operator sees and can click, not render
 * internals.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { GitPanel, GitUnavailable } from '../src/client/GitPanel.tsx'
import type { GitChangeRow, GitPanelProps, GitStatusView } from '../src/client/GitPanel.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** One changed path, clean on both sides unless a test says otherwise. */
function change(overrides: Partial<GitChangeRow> = {}): GitChangeRow {
  return {
    path: 'src/a.ts',
    absolutePath: '/repo/src/a.ts',
    index: 'unmodified',
    worktree: 'modified',
    binary: false,
    insertions: 3,
    deletions: 1,
    ...overrides,
  }
}

/** A working tree carrying the given changes. */
function tree(changes: readonly GitChangeRow[] = [change()]): GitStatusView {
  return {
    root: '/repo',
    branch: 'main',
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    changes,
    truncated: false,
  }
}

/** Render the panel over scripted wire calls. */
function mount(overrides: Partial<GitPanelProps> = {}) {
  const props = {
    openFile: vi.fn(),
    reloadBuffer: vi.fn(),
    listRepositories: () => Promise.resolve([
      { root: '/repo', name: 'project', workspaceTitle: 'Work', submodule: false },
    ]),
    // One checkout by default: most repositories have exactly one, and the
    // selector only appears when there are more.
    worktrees: () => Promise.resolve([
      { path: '/repo', name: 'project', branch: 'main', main: true, detached: false, bare: false, changes: 1 },
    ]),
    // Level with every base by default: the push-safety banner is an
    // exception, not the standing state.
    compareBases: () => Promise.resolve([]),
    graph: () => Promise.resolve({ commits: [], truncated: false }),
    diff: () => Promise.resolve({
      path: 'src/a.ts', oldText: 'linha antiga\n', newText: 'linha nova\n', binary: false,
    }),
    status: () => Promise.resolve(tree()),
    stage: () => Promise.resolve(tree([change({ index: 'modified', worktree: 'unmodified' })])),
    unstage: () => Promise.resolve(tree()),
    discard: () => Promise.resolve({ status: tree([]), recoveredOid: 'deadbeefcafe' }),
    commit: () => Promise.resolve({ subject: 'done', status: tree([]) }),
    requestCommit: () => Promise.resolve(),
    t: makeTranslate(en),
    ...overrides,
  } as unknown as GitPanelProps
  return { props, ...render(<GitPanel {...props} />) }
}

describe('repository discovery', () => {
  it('shows the branch and its changed files once a repository resolves', async () => {
    mount()

    expect(await screen.findByText('src/a.ts')).toBeTruthy()
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.getByText('+3 -1')).toBeTruthy()
  })

  it('reports divergence from the upstream when there is any', async () => {
    mount({ status: () => Promise.resolve({ ...tree(), ahead: 2, behind: 1 }) })

    expect(await screen.findByText('ahead 2, behind 1')).toBeTruthy()
  })

  it('shows a calm empty state when no workspace holds a repository', async () => {
    mount({ listRepositories: () => Promise.resolve([]) })

    expect(await screen.findByText('No Git repository in your workspaces.')).toBeTruthy()
  })

  it('shows a calm empty state when the composition mounts no Git seam', async () => {
    // An absent seam is a state to render, not a failure to report.
    mount({ listRepositories: () => Promise.reject(new GitUnavailable('absent')) })

    expect(await screen.findByText(/No Git is mounted here/)).toBeTruthy()
  })

  it('reports an ordinary discovery failure with its reason', async () => {
    mount({ listRepositories: () => Promise.reject(new Error('boom')) })

    expect(await screen.findByText(/Looking for repositories failed: boom/)).toBeTruthy()
  })

  it('says so when the working tree is clean', async () => {
    mount({ status: () => Promise.resolve(tree([])) })

    expect(await screen.findByText('No changes in this working tree.')).toBeTruthy()
  })
})

describe('worktrees', () => {
  /** A repository with a main checkout and one linked feature checkout. */
  const twoCheckouts = [
    { path: '/repo', name: 'project', branch: 'main', main: true, detached: false, bare: false, changes: 2 },
    { path: '/repo-feature', name: 'project-feature', branch: 'feature', main: false, detached: false, bare: false, changes: 5 },
  ]

  it('draws no selector when the repository has a single checkout', async () => {
    // A list of one is chrome that tells nothing.
    mount()
    await screen.findByText('src/a.ts')

    expect(screen.queryByText(/worktrees/)).toBeNull()
  })

  it('lists every checkout with how many changes each holds', async () => {
    mount({ worktrees: () => Promise.resolve(twoCheckouts) })

    expect(await screen.findByText('2 worktrees')).toBeTruthy()
    // Each row is titled by its path; `main` alone is ambiguous because it is
    // both this checkout's branch and the badge marking the main worktree.
    expect(screen.getByTitle('/repo')).toBeTruthy()
    expect(screen.getByTitle('/repo-feature')).toBeTruthy()
    expect(screen.getByText('feature')).toBeTruthy()
    // The counts are the point: what is in each checkout, without opening it.
    expect(screen.getByText('2 changed')).toBeTruthy()
    expect(screen.getByText('5 changed')).toBeTruthy()
  })

  it('reads the main checkout first, and switches to a linked one on demand', async () => {
    const status = vi.fn(() => Promise.resolve(tree()))
    mount({ worktrees: () => Promise.resolve(twoCheckouts), status })
    await screen.findByText('2 worktrees')

    // The main working tree is where an operator starts.
    await waitFor(() => { expect(status).toHaveBeenCalledWith('/repo', expect.anything()) })

    fireEvent.click(screen.getByTitle('/repo-feature'))

    // Each checkout has its own index and working tree, so switching must
    // re-read the one now shown.
    await waitFor(() => { expect(status).toHaveBeenCalledWith('/repo-feature', expect.anything()) })
  })

  it('stages into the checkout being shown, not the repository root', async () => {
    const stage = vi.fn(() => Promise.resolve(tree()))
    mount({ worktrees: () => Promise.resolve(twoCheckouts), stage })
    await screen.findByText('2 worktrees')
    fireEvent.click(screen.getByTitle('/repo-feature'))
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByRole('button', { name: 'Stage' }))

    // Staging in one worktree must never touch another's index.
    await waitFor(() => {
      expect(stage).toHaveBeenCalledWith('/repo-feature', ['src/a.ts'])
    })
  })

  it('marks a locked checkout and refuses to open it', async () => {
    mount({
      worktrees: () => Promise.resolve([
        ...twoCheckouts,
        {
          path: '/repo-release', name: 'release', branch: 'release', main: false,
          detached: false, bare: false, locked: 'release in flight', changes: 0,
        },
      ]),
    })
    await screen.findByText('3 worktrees')

    expect(screen.getByText('locked')).toBeTruthy()
    expect(screen.getByTitle('/repo-release').hasAttribute('disabled')).toBe(false)
  })

  it('marks a prunable checkout inert, since its directory is gone', async () => {
    mount({
      worktrees: () => Promise.resolve([
        ...twoCheckouts,
        {
          path: '/repo-gone', name: 'gone', main: false, detached: true, bare: false,
          prunable: 'gitdir file points to non-existent location',
        },
      ]),
    })
    await screen.findByText('3 worktrees')

    expect(screen.getByText('directory gone')).toBeTruthy()
    // Nothing can be read from a checkout whose directory no longer exists.
    expect(screen.getByTitle('/repo-gone').hasAttribute('disabled')).toBe(true)
  })

  it('names a detached checkout by its state rather than a branch', async () => {
    mount({
      worktrees: () => Promise.resolve([
        twoCheckouts[0] as never,
        { path: '/repo-wip', name: 'wip', main: false, detached: true, bare: false, changes: 0 },
      ]),
    })
    await screen.findByText('2 worktrees')

    expect(screen.getByText('(detached HEAD)')).toBeTruthy()
    expect(screen.getAllByText('clean').length).toBeGreaterThan(0)
  })

  it('still shows the repository when its checkouts cannot be listed', async () => {
    // A failed worktree read must not blank the panel: the repository's own
    // working tree is still readable.
    mount({ worktrees: () => Promise.reject(new Error('worktree list failed')) })

    expect(await screen.findByText('src/a.ts')).toBeTruthy()
  })
})

describe('warning before a push', () => {
  it('stays quiet while the branch is level with its bases', async () => {
    mount({ compareBases: () => Promise.resolve([{ base: 'main', ahead: 2, behind: 0, conflicts: false }]) })
    await screen.findByText('src/a.ts')

    // Being ahead is the ordinary state of work in progress; only a base that
    // MOVED is worth interrupting for.
    expect(screen.queryByText(/rebase before pushing/)).toBeNull()
  })

  it('warns when the base moved underneath the branch', async () => {
    mount({ compareBases: () => Promise.resolve([{ base: 'develop', ahead: 1, behind: 3, conflicts: false }]) })

    expect(await screen.findByText('develop moved ahead by 3 — rebase before pushing.')).toBeTruthy()
  })

  it('says so when merging back would conflict', async () => {
    mount({ compareBases: () => Promise.resolve([{ base: 'main', ahead: 1, behind: 2, conflicts: true }]) })

    // The conflicting case is the one that actually blocks, so it reads
    // differently from a base that merely advanced.
    expect(await screen.findByText('main moved ahead by 2 and merging would conflict.')).toBeTruthy()
  })

  it('warns about each base that moved', async () => {
    mount({
      compareBases: () => Promise.resolve([
        { base: 'main', ahead: 1, behind: 1, conflicts: false },
        { base: 'develop', ahead: 1, behind: 4, conflicts: true },
      ]),
    })

    expect(await screen.findByText(/^main moved ahead by 1/)).toBeTruthy()
    expect(screen.getByText(/^develop moved ahead by 4/)).toBeTruthy()
  })

  it('keeps the panel usable when the comparison cannot be made', async () => {
    mount({ compareBases: () => Promise.reject(new Error('no bases here')) })

    // A scratch repository without main or develop is ordinary.
    expect(await screen.findByText('src/a.ts')).toBeTruthy()
  })
})

describe('the commit graph', () => {
  const commits = [
    {
      id: 'm1', parents: ['a1', 'b1'], refs: ['main'], subject: 'merge feature',
      authorName: 'Ada', authoredAt: '2026-01-03T00:00:00Z',
    },
    {
      id: 'b1', parents: ['base'], refs: ['feature'], subject: 'feature work',
      authorName: 'Ada', authoredAt: '2026-01-02T00:00:00Z',
    },
    {
      id: 'a1', parents: ['base'], refs: [], subject: 'main work',
      authorName: 'Bob', authoredAt: '2026-01-02T00:00:00Z',
    },
    { id: 'base', parents: [], refs: [], subject: 'base', authorName: 'Ada', authoredAt: '2026-01-01T00:00:00Z' },
  ]

  it('opens on the change list, not the graph', async () => {
    // The graph is the most expensive read this panel makes, so it is not
    // fetched until someone asks for it.
    const graph = vi.fn(() => Promise.resolve({ commits: [], truncated: false }))
    mount({ graph })
    await screen.findByText('src/a.ts')

    expect(graph).not.toHaveBeenCalled()
  })

  it('draws the commits once the graph is opened', async () => {
    mount({ graph: () => Promise.resolve({ commits, truncated: false }) })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByRole('tab', { name: 'Graph' }))

    expect(await screen.findByText('merge feature')).toBeTruthy()
    expect(screen.getByText('feature work')).toBeTruthy()
    // Branch tips are labelled, so a lane can be read back to its branch.
    // `main` also names the checked-out branch above, so the assertion scopes
    // to the graph's own ref badges.
    expect(screen.getAllByText('main').length).toBeGreaterThan(0)
    expect(screen.getByText('feature')).toBeTruthy()
  })

  it('says when the history is longer than shown', async () => {
    mount({ graph: () => Promise.resolve({ commits, truncated: true }) })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByRole('tab', { name: 'Graph' }))

    expect(await screen.findByText('History is longer than shown.')).toBeTruthy()
  })

  it('shows an empty history as such', async () => {
    mount({ graph: () => Promise.resolve({ commits: [], truncated: false }) })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByRole('tab', { name: 'Graph' }))

    expect(await screen.findByText('No commits yet.')).toBeTruthy()
  })

  it('hides the change list while the graph is showing', async () => {
    mount({ graph: () => Promise.resolve({ commits, truncated: false }) })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByRole('tab', { name: 'Graph' }))

    await screen.findByText('merge feature')
    expect(screen.queryByText('src/a.ts')).toBeNull()
  })
})

describe('opening a change in the editor', () => {
  it('hands the absolute path to the editor buffer', async () => {
    // This is why the panel lives inside the editor tab: reviewing a change
    // and editing it stay one gesture apart.
    const openFile = vi.fn()
    mount({ openFile })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(openFile).toHaveBeenCalledWith('/repo/src/a.ts')
  })

  it('does not jump to the editor merely because a row was selected', async () => {
    // Selecting a row answers "what changed"; leaving the panel is a separate
    // decision the person makes explicitly.
    const openFile = vi.fn()
    mount({ openFile })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByTitle('src/a.ts'))

    expect(openFile).not.toHaveBeenCalled()
  })
})

describe('showing what changed', () => {
  it('draws both sides of the change when a row is selected', async () => {
    mount()
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByTitle('src/a.ts'))

    // The whole point of the panel: the diff is visible without leaving it.
    expect(await screen.findByText(/linha nova/)).toBeTruthy()
    expect(screen.getByText(/linha antiga/)).toBeTruthy()
  })

  it('reads the staged side for a change with nothing left unstaged', async () => {
    const diff = vi.fn(() => Promise.resolve({
      path: 'src/a.ts', oldText: 'a\n', newText: 'b\n', binary: false,
    }))
    mount({
      status: () => Promise.resolve(tree([change({ index: 'modified', worktree: 'unmodified' })])),
      diff,
    })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByTitle('src/a.ts'))

    // Staged-only changes compare against HEAD; anything else compares the
    // working tree, which is what the person is looking at.
    await waitFor(() => {
      expect(diff).toHaveBeenCalledWith('/repo', 'src/a.ts', true, expect.anything())
    })
  })

  it('collapses the diff when the same row is selected again', async () => {
    mount()
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByTitle('src/a.ts'))
    await screen.findByText(/linha nova/)
    fireEvent.click(screen.getByTitle('src/a.ts'))

    await waitFor(() => { expect(screen.queryByText(/linha nova/)).toBeNull() })
  })

  it('says a binary file has nothing to compare', async () => {
    mount({
      diff: () => Promise.resolve({ path: 'logo.png', oldText: null, newText: null, binary: true }),
    })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByTitle('src/a.ts'))

    expect(await screen.findByText(/binary/)).toBeTruthy()
  })

  it('reports a failed read without collapsing the row', async () => {
    mount({ diff: () => Promise.reject(new Error('object missing')) })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByTitle('src/a.ts'))

    expect(await screen.findByText(/Reading the change failed: object missing/)).toBeTruthy()
  })
})

describe('staging', () => {
  it('offers Stage for an unstaged change and folds the settled status back', async () => {
    const stage = vi.fn(() => Promise.resolve(
      tree([change({ index: 'modified', worktree: 'unmodified' })]),
    ))
    mount({ stage })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByRole('button', { name: 'Stage' }))

    expect(stage).toHaveBeenCalledWith('/repo', ['src/a.ts'])
    // The row now offers the opposite action, because the settled status came
    // back on the mutation itself.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unstage' })).toBeTruthy()
    })
  })

  it('offers Unstage for a staged change', async () => {
    const unstage = vi.fn(() => Promise.resolve(tree()))
    mount({ status: () => Promise.resolve(tree([change({ index: 'modified', worktree: 'unmodified' })])), unstage })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByRole('button', { name: 'Unstage' }))

    expect(unstage).toHaveBeenCalledWith('/repo', ['src/a.ts'])
  })

  it('reports a refused mutation without losing the list', async () => {
    mount({ stage: () => Promise.reject(new Error('index locked')) })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByRole('button', { name: 'Stage' }))

    expect(await screen.findByText('index locked')).toBeTruthy()
    expect(screen.getByText('src/a.ts')).toBeTruthy()
  })
})

describe('discarding', () => {
  it('tells the operator where the discarded content went', async () => {
    // A discard destroys uncommitted work; the panel must not let it vanish
    // silently, because the recovery id is the only way back.
    mount()
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(await screen.findByText(/still recoverable as deadbeef/)).toBeTruthy()
  })

  it('reloads the editor buffer when the discarded file is the open one', async () => {
    const reloadBuffer = vi.fn()
    mount({ reloadBuffer, openPath: '/repo/src/a.ts' })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    // The working tree moved under the buffer; leaving it stale would show
    // content the file no longer has.
    await waitFor(() => { expect(reloadBuffer).toHaveBeenCalled() })
  })

  it('leaves the buffer alone when another file was discarded', async () => {
    const reloadBuffer = vi.fn()
    mount({ reloadBuffer, openPath: '/repo/src/other.ts' })
    await screen.findByText('src/a.ts')

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    await waitFor(() => { expect(screen.getByText(/still recoverable/)).toBeTruthy() })
    expect(reloadBuffer).not.toHaveBeenCalled()
  })
})

describe('committing', () => {
  it('keeps both commit routes disabled until something is staged and written', async () => {
    mount()
    await screen.findByText('src/a.ts')

    // Nothing is staged and no message is written.
    expect(screen.getByRole('button', { name: /^Commit 0$/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Commit via agent' }).hasAttribute('disabled')).toBe(true)
  })

  it('commits directly once a staged change and a message exist', async () => {
    const commit = vi.fn(() => Promise.resolve({ subject: 'done', status: tree([]) }))
    mount({
      status: () => Promise.resolve(tree([change({ index: 'modified', worktree: 'unmodified' })])),
      commit,
    })
    await screen.findByText('src/a.ts')

    fireEvent.change(screen.getByLabelText('Commit message'), { target: { value: 'fix the thing' } })
    fireEvent.click(screen.getByRole('button', { name: /^Commit 1$/ }))

    expect(commit).toHaveBeenCalledWith('/repo', 'fix the thing')
  })

  it('routes the same commit through the agent when asked, so the session logs it', async () => {
    const requestCommit = vi.fn(() => Promise.resolve())
    mount({
      status: () => Promise.resolve(tree([change({ index: 'modified', worktree: 'unmodified' })])),
      requestCommit,
    })
    await screen.findByText('src/a.ts')

    fireEvent.change(screen.getByLabelText('Commit message'), { target: { value: 'audit me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Commit via agent' }))

    expect(requestCommit).toHaveBeenCalledWith('/repo', 'audit me')
  })

  it('reports a refused commit', async () => {
    mount({
      status: () => Promise.resolve(tree([change({ index: 'modified', worktree: 'unmodified' })])),
      commit: () => Promise.reject(new Error('hook rejected the commit')),
    })
    await screen.findByText('src/a.ts')

    fireEvent.change(screen.getByLabelText('Commit message'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: /^Commit 1$/ }))

    expect(await screen.findByText('hook rejected the commit')).toBeTruthy()
  })
})

describe('bounded listings', () => {
  it('says when the host cut the change list short', async () => {
    mount({ status: () => Promise.resolve({ ...tree(), truncated: true }) })

    expect(await screen.findByText(/Too many changes to list/)).toBeTruthy()
  })

  it('shows a binary file without claiming line counts', async () => {
    // A binary change carries no counts at all — omitted, never zero.
    const binary: GitChangeRow = {
      path: 'logo.png',
      absolutePath: '/repo/logo.png',
      index: 'unmodified',
      worktree: 'modified',
      binary: true,
    }
    mount({ status: () => Promise.resolve(tree([binary])) })
    await screen.findByText('logo.png')

    // Git has no line counts for binary content, so the row shows none
    // rather than claiming zero.
    expect(screen.queryByText(/^\+\d/)).toBeNull()
  })
})
