/**
 * Lane assignment topology.
 *
 * The fixtures here are the shapes a real history produces — linear, a branch
 * tip, a merge, an octopus, a root — because lane assignment is exactly where
 * a graph renderer goes subtly wrong: a strand drawn in the wrong column
 * misattributes which branch a commit belongs to.
 */
import { describe, expect, it } from 'vitest'
import { assignLanes } from '../src/client/lanes.ts'
import type { GraphCommitInput } from '../src/client/lanes.ts'

/** One commit, newest-first order supplied by the caller. */
function commit(id: string, parents: readonly string[] = [], refs: readonly string[] = []): GraphCommitInput {
  return { id, parents, refs, subject: id, authorName: 'T', authoredAt: '2026-01-01T00:00:00Z' }
}

describe('assignLanes', () => {
  it('keeps a linear history in one column', () => {
    const { commits, width } = assignLanes([
      commit('c', ['b']),
      commit('b', ['a']),
      commit('a'),
    ])

    expect(commits.map(entry => entry.lane)).toEqual([0, 0, 0])
    expect(width).toBe(1)
  })

  it('gives an independent branch tip its own column', () => {
    // Two tips over one base: the second tip reserves nothing, so it opens a
    // lane of its own rather than stealing the first one.
    const { commits, width } = assignLanes([
      commit('tip1', ['base']),
      commit('tip2', ['base']),
      commit('base'),
    ])

    expect(commits[0]?.lane).toBe(0)
    expect(commits[1]?.lane).toBe(1)
    expect(width).toBe(2)
  })

  it('draws a merge as two strands converging on its parents', () => {
    const { commits } = assignLanes([
      commit('m', ['main1', 'side1']),
      commit('side1', ['base']),
      commit('main1', ['base']),
      commit('base'),
    ])

    const merge = commits[0]
    expect(merge?.merge).toBe(true)
    // The first parent inherits the merge's own lane; the second opens another.
    expect(merge?.edges).toEqual([
      { parent: 'main1', lane: 0 },
      { parent: 'side1', lane: 1 },
    ])
    // Both parents are then drawn in the lanes reserved for them.
    expect(commits.find(entry => entry.id === 'main1')?.lane).toBe(0)
    expect(commits.find(entry => entry.id === 'side1')?.lane).toBe(1)
  })

  it('collapses back to one column once a shared parent is reached', () => {
    const { commits } = assignLanes([
      commit('m', ['main1', 'side1']),
      commit('side1', ['base']),
      commit('main1', ['base']),
      commit('base'),
    ])

    // `base` is reached by both strands, so it draws once and the extra
    // column is released rather than left dangling.
    const base = commits.find(entry => entry.id === 'base')
    expect(base?.lane).toBe(0)
    expect(base?.through).toEqual([])
  })

  it('marks a non-merge commit as such', () => {
    const { commits } = assignLanes([commit('b', ['a']), commit('a')])

    expect(commits.every(entry => !entry.merge)).toBe(true)
  })

  it('handles an octopus merge with more than two parents', () => {
    const { commits } = assignLanes([
      commit('o', ['p1', 'p2', 'p3']),
      commit('p1'),
      commit('p2'),
      commit('p3'),
    ])

    expect(commits[0]?.merge).toBe(true)
    expect(commits[0]?.edges.map(edge => edge.lane)).toEqual([0, 1, 2])
  })

  it('releases the column of a root commit', () => {
    const { commits } = assignLanes([commit('only')])

    // A root continues nothing, so no strand passes below it.
    expect(commits[0]?.through).toEqual([])
  })

  it('reports the strands passing each row', () => {
    const { commits } = assignLanes([
      commit('tip1', ['base']),
      commit('tip2', ['base']),
      commit('base'),
    ])

    // Below the first tip, one strand is live: the column waiting for `base`.
    expect(commits[0]?.through).toEqual([0])
    // The second tip shares that same parent, so its strand converges onto
    // the leftmost column rather than keeping a second one alive.
    expect(commits[1]?.through).toEqual([0])
    expect(commits[1]?.edges).toEqual([{ parent: 'base', lane: 0 }])
  })

  it('carries the refs through to the placed commit', () => {
    const { commits } = assignLanes([commit('a', [], ['main', 'v1.0'])])

    expect(commits[0]?.refs).toEqual(['main', 'v1.0'])
  })

  it('lays out an empty history as nothing', () => {
    expect(assignLanes([])).toEqual({ commits: [], width: 0 })
  })
})
