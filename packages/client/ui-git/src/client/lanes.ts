/**
 * Lane assignment for the commit graph: the pure step between "a list of
 * commits with parent ids" and "a drawing with columns and edges".
 *
 * Kept apart from the component so the topology rules are testable without
 * rendering, and so a different renderer could reuse them.
 * @module @deepseek-ai/dsh-client-ui-git/client/lanes
 */

/** One commit as the graph reader supplies it. */
export interface GraphCommitInput {
  id: string
  parents: readonly string[]
  refs: readonly string[]
  subject: string
  authorName: string
  authoredAt: string
}

/** One commit placed in a lane, with the edges leaving it. */
export interface PlacedCommit {
  id: string
  parents: readonly string[]
  refs: readonly string[]
  subject: string
  authorName: string
  authoredAt: string
  /** Zero-based column this commit is drawn in. */
  lane: number
  /** True when the commit has two or more parents. */
  merge: boolean
  /**
   * Lanes occupied immediately below this row, so a renderer can draw the
   * vertical strands passing it. Each entry is a lane index that is live
   * between this row and the next.
   */
  through: readonly number[]
  /** Lane each parent continues in, paired with the parent id. */
  edges: readonly { parent: string; lane: number }[]
}

/** The placed graph plus how wide it became. */
export interface LaneLayout {
  commits: readonly PlacedCommit[]
  /** Number of columns used; a linear history needs exactly one. */
  width: number
}

/**
 * Assign a lane to every commit, walking the list in the order given (newest
 * first, date-ordered).
 *
 * The rule is the one every graph renderer converges on: a lane is *reserved*
 * by a commit's children before the commit is reached. When a row is drawn,
 * its lane is whichever was reserved for it — or the first free column when
 * nothing reserved one, which is how an independent branch tip starts its own
 * column. Its first parent inherits the same lane, so a straight history stays
 * in one column; every additional parent of a merge takes its own lane, which
 * is what makes merges read as converging strands.
 *
 * A lane is released once no unvisited commit still reserves it, so columns
 * are reused rather than growing without bound down a long history.
 *
 * @param commits - commits newest-first, each naming its parents.
 * @returns every commit with its lane and outgoing edges, plus the width used.
 */
export function assignLanes(commits: readonly GraphCommitInput[]): LaneLayout {
  // lanes[i] is the commit id that column i is currently waiting to draw.
  const lanes: (string | undefined)[] = []
  const placed: PlacedCommit[] = []
  let width = 0

  /** First column reserved for `id`, or -1 when none is. */
  const reservedFor = (id: string): number => lanes.indexOf(id)

  /** Lowest free column, extending the array when every one is taken. */
  const firstFree = (): number => {
    const free = lanes.indexOf(undefined)
    if (free >= 0) return free
    lanes.push(undefined)
    return lanes.length - 1
  }

  for (const commit of commits) {
    let lane = reservedFor(commit.id)
    if (lane < 0) {
      // No child reserved a column: this is a branch tip, so it opens one.
      lane = firstFree()
    }
    // Every other column reserved for this same commit was a second child
    // pointing at it; those strands merge here and their columns free up.
    for (let i = 0; i < lanes.length; i += 1) {
      if (i !== lane && lanes[i] === commit.id) lanes[i] = undefined
    }

    const edges: { parent: string; lane: number }[] = []
    const [first, ...rest] = commit.parents
    if (first === undefined) {
      // A root commit continues nothing, so its column is released.
      lanes[lane] = undefined
    } else {
      // The first parent inherits this column, which keeps linear history
      // in a single straight strand.
      const existing = reservedFor(first)
      if (existing >= 0 && existing !== lane) {
        // Another strand already waits for this parent. The two converge, and
        // they converge on the LEFTMOST column so history collapses back
        // toward the trunk instead of drifting rightward down the page.
        const kept = Math.min(existing, lane)
        const released = Math.max(existing, lane)
        lanes[kept] = first
        lanes[released] = undefined
        edges.push({ parent: first, lane: kept })
      } else {
        lanes[lane] = first
        edges.push({ parent: first, lane })
      }
    }
    for (const parent of rest) {
      // Each further parent of a merge either joins a waiting column or opens
      // its own, which is what draws the diverging side of the merge.
      const existing = reservedFor(parent)
      const target = existing >= 0 ? existing : firstFree()
      lanes[target] = parent
      edges.push({ parent, lane: target })
    }

    // Columns still waiting for a commit are the strands passing this row.
    const through: number[] = []
    for (let i = 0; i < lanes.length; i += 1) {
      if (lanes[i] !== undefined) through.push(i)
    }
    width = Math.max(width, lanes.length)

    placed.push({
      id: commit.id,
      parents: commit.parents,
      refs: commit.refs,
      subject: commit.subject,
      authorName: commit.authorName,
      authoredAt: commit.authoredAt,
      lane,
      merge: commit.parents.length > 1,
      through,
      edges,
    })
  }

  return { commits: placed, width: Math.max(width, commits.length > 0 ? 1 : 0) }
}
