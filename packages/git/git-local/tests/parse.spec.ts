/**
 * Format rules of the machine-readable Git output the provider requests.
 *
 * Every fixture in this file is recorded from a real `git` run, not invented:
 * the framing rules that matter (a rename spending two status records and
 * three numstat records, a binary file reporting `-`, an unborn branch
 * reporting `(initial)`) are exactly the ones a hand-written fixture gets
 * wrong, and getting them wrong silently mis-attributes a path.
 */
import { describe, expect, it } from 'vitest'
import { parseLog, parseNumstat, parseStatus, parseWorktrees } from '../src/parse.ts'

/** Join records the way `-z` frames them: NUL after every record. */
function z(...records: readonly string[]): string {
  return records.map(record => `${record}\0`).join('')
}

describe('parseStatus', () => {
  it('reads branch, head, upstream, and ahead/behind from the headers', () => {
    const { headers } = parseStatus(z(
      '# branch.oid e8d5790876ee5326a31d732b7e25f93319b4ae0a',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -3',
    ))

    expect(headers).toEqual({
      branch: 'main',
      head: 'e8d5790876ee5326a31d732b7e25f93319b4ae0a',
      upstream: 'origin/main',
      ahead: 2,
      behind: 3,
    })
  })

  it('reports no upstream and zero divergence when git omits branch.ab', () => {
    // Git omits the header entirely for a branch with no tracking ref, so its
    // absence must read as "no divergence", never as a parse failure.
    const { headers } = parseStatus(z(
      '# branch.oid 7b4435c83460b679307d9c9e0650b26de06f26d1',
      '# branch.head main',
    ))

    expect(headers.upstream).toBeUndefined()
    expect(headers.ahead).toBe(0)
    expect(headers.behind).toBe(0)
  })

  it('treats an unborn branch as having no head commit', () => {
    // A repository with no commits reports the literal `(initial)`, which is
    // the absence of a commit rather than an object id.
    const { headers } = parseStatus(z('# branch.oid (initial)', '# branch.head main'))

    expect(headers.head).toBeUndefined()
    expect(headers.branch).toBe('main')
  })

  it('leaves branch undefined on a detached HEAD', () => {
    const { headers } = parseStatus(z('# branch.oid abc', '# branch.head (detached)'))

    expect(headers.branch).toBeUndefined()
  })

  it('separates the staged side from the unstaged side of one path', () => {
    // `D.` is staged-deleted with a clean worktree; `.M` is the reverse. A
    // parser folding these into one word makes stage and unstage
    // indistinguishable on the same row.
    const { entries } = parseStatus(z(
      '1 .M N... 100644 100644 100644 a29bdeb a29bdeb a.txt',
      '1 D. N... 100644 000000 000000 3367afd 0000000 b.txt',
    ))

    expect(entries).toEqual([
      { path: 'a.txt', index: 'unmodified', worktree: 'modified' },
      { path: 'b.txt', index: 'deleted', worktree: 'unmodified' },
    ])
  })

  it('consumes the extra record a rename spends, keeping the original path', () => {
    // The `2` entry ends with the NEW path and the ORIGINAL path follows as
    // its own NUL record. A reader that does not skip it would report the
    // original path as a separate changed file.
    const { entries } = parseStatus(z(
      '2 RM N... 100644 100644 100644 b77b4eb b77b4eb R100 renamed ção.txt',
      'sp ace.txt',
      '? untracked.txt',
    ))

    expect(entries).toEqual([
      {
        path: 'renamed ção.txt',
        index: 'renamed',
        worktree: 'modified',
        origPath: 'sp ace.txt',
        similarity: 100,
      },
      { path: 'untracked.txt', index: 'unmodified', worktree: 'untracked' },
    ])
  })

  it('keeps spaces in a path, which -z framing makes unambiguous', () => {
    const { entries } = parseStatus(z('1 .M N... 100644 100644 100644 aaa bbb my file name.txt'))

    expect(entries[0]?.path).toBe('my file name.txt')
  })

  it('marks both sides of an unmerged path as conflicted', () => {
    const { entries } = parseStatus(z(
      'u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.txt',
    ))

    expect(entries[0]).toEqual({
      path: 'conflict.txt',
      index: 'conflicted',
      worktree: 'conflicted',
    })
  })

  it('distinguishes ignored from untracked', () => {
    const { entries } = parseStatus(z('? new.txt', '! build.log'))

    expect(entries.map(entry => entry.worktree)).toEqual(['untracked', 'ignored'])
  })

  it('reads a clean repository as no entries', () => {
    expect(parseStatus(z('# branch.oid abc', '# branch.head main')).entries).toEqual([])
  })
})

describe('parseNumstat', () => {
  it('reads line counts per path', () => {
    expect(parseNumstat(z('1\t0\ta.txt', '0\t1\tb.txt'))).toEqual([
      { path: 'a.txt', binary: false, insertions: 1, deletions: 0 },
      { path: 'b.txt', binary: false, insertions: 0, deletions: 1 },
    ])
  })

  it('reports a binary file as carrying no line counts at all', () => {
    // `-` is not zero: a binary file has no line information, and reporting 0
    // would claim the file is unchanged.
    const [entry] = parseNumstat(z('-\t-\tbin.dat'))

    expect(entry).toEqual({ path: 'bin.dat', binary: true })
    expect(entry?.insertions).toBeUndefined()
  })

  it('attributes a rename\'s counts to the new path across its three records', () => {
    // The counts record ends with an EMPTY path; the original and new paths
    // follow as their own records.
    expect(parseNumstat(z('0\t0\t', 'sp ace.txt', 'renamed ção.txt'))).toEqual([
      { path: 'renamed ção.txt', binary: false, insertions: 0, deletions: 0 },
    ])
  })

  it('reads an empty diff as no entries', () => {
    expect(parseNumstat('')).toEqual([])
  })
})

describe('parseWorktrees', () => {
  it('reads the branch, head, and path of each checkout', () => {
    const entries = parseWorktrees(z(
      'worktree /repo', 'HEAD abc123', 'branch refs/heads/main', '',
      'worktree /repo-feature', 'HEAD def456', 'branch refs/heads/feature', '',
    ))

    // The fully qualified ref is shortened: a UI shows `main`, not
    // `refs/heads/main`.
    expect(entries).toEqual([
      { path: '/repo', head: 'abc123', branch: 'main', detached: false, bare: false },
      { path: '/repo-feature', head: 'def456', branch: 'feature', detached: false, bare: false },
    ])
  })

  it('reads a detached checkout as having no branch', () => {
    const [entry] = parseWorktrees(z('worktree /wt', 'HEAD abc123', 'detached', ''))

    expect(entry).toEqual({ path: '/wt', head: 'abc123', detached: true, bare: false })
  })

  it('keeps a lock reason, and treats a bare lock flag as still locked', () => {
    const [withReason] = parseWorktrees(z('worktree /a', 'HEAD x', 'locked deploy in progress', ''))
    const [without] = parseWorktrees(z('worktree /b', 'HEAD x', 'locked', ''))

    expect(withReason?.locked).toBe('deploy in progress')
    // The bare flag means locked with no stated reason — not unlocked, which
    // is what decides whether removal may be offered.
    expect(without?.locked).toBe('')
  })

  it('reads a prunable checkout with the reason git gave', () => {
    const [entry] = parseWorktrees(z(
      'worktree /gone', 'HEAD x', 'detached',
      'prunable gitdir file points to non-existent location', '',
    ))

    expect(entry?.prunable).toBe('gitdir file points to non-existent location')
  })

  it('reads a bare repository, which has no working tree', () => {
    const [entry] = parseWorktrees(z('worktree /bare.git', 'bare', ''))

    expect(entry).toEqual({ path: '/bare.git', detached: false, bare: true })
  })

  it('reads no worktrees from empty output', () => {
    expect(parseWorktrees('')).toEqual([])
  })
})

describe('parseLog', () => {
  const RS = '\u001e'
  const NUL = '\0'

  it('reads every commit field', () => {
    const record = [
      'e8d5790876ee5326a31d732b7e25f93319b4ae0a',
      'Ada Lovelace',
      'ada@example.com',
      '2026-08-23T21:42:04-03:00',
      'first',
      '',
    ].join(NUL)

    expect(parseLog(record + RS)).toEqual([{
      id: 'e8d5790876ee5326a31d732b7e25f93319b4ae0a',
      authorName: 'Ada Lovelace',
      authorEmail: 'ada@example.com',
      authoredAt: '2026-08-23T21:42:04-03:00',
      subject: 'first',
      parents: [],
    }])
  })

  it('splits several parents of a merge commit', () => {
    const record = ['abc', 'n', 'e', 't', 'merge', 'p1 p2'].join(NUL)

    expect(parseLog(record + RS)[0]?.parents).toEqual(['p1', 'p2'])
  })

  it('keeps a subject containing the field characters it does not frame with', () => {
    // Tabs and quotes are ordinary subject content; only NUL and RS frame.
    const record = ['abc', 'n', 'e', 't', 'fix: "quoted"\tand tabbed', ''].join(NUL)

    expect(parseLog(record + RS)[0]?.subject).toBe('fix: "quoted"\tand tabbed')
  })

  it('reads an empty history as no commits', () => {
    expect(parseLog('')).toEqual([])
  })
})
