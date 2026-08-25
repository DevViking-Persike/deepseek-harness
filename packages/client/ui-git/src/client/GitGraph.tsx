/**
 * The commit graph: lanes drawn as SVG strands beside the commit rows.
 *
 * SVG rather than CSS boxes because the interesting part is the EDGES — a
 * merge's strands curve from one column to another, and a border trick cannot
 * express that. Lane assignment itself is pure and lives in `lanes.ts`.
 */

import clsx from 'clsx'
import { assignLanes } from './lanes.ts'
import type { GraphCommitInput } from './lanes.ts'
import css from './GitGraph.module.css'

/** Horizontal distance between lanes, in pixels. */
const LANE_WIDTH = 12
/** Vertical distance between commit rows, in pixels. */
const ROW_HEIGHT = 22
/** Radius of a commit node. */
const NODE_RADIUS = 3.5

/** Props of the graph view. */
export interface GitGraphProps {
  /** Commits newest-first, each naming its parents. */
  commits: readonly GraphCommitInput[]
  /** True when the host cut the history short. */
  truncated: boolean
  /** Localized copy accessor. */
  t: (key: 'graph.truncated' | 'graph.empty', vars?: Record<string, string>) => string
}

/**
 * The x centre of one lane.
 * @param lane - zero-based column index.
 * @returns the pixel offset of that lane's centre.
 */
function laneX(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2
}

/**
 * The cubic path from a commit to a parent in another lane. The control points
 * sit at the row's midpoint, so the strand leaves and arrives vertically and
 * the crossing reads as one continuous branch rather than a diagonal.
 * @param from - lane the commit is drawn in.
 * @param to - lane the parent continues in.
 * @param y - vertical centre of the commit's row.
 * @returns the SVG path data.
 */
function curve(from: number, to: number, y: number): string {
  const mid = y + ROW_HEIGHT / 2
  const end = y + ROW_HEIGHT
  return `M ${String(laneX(from))} ${String(y)} C ${String(laneX(from))} ${String(mid)}, ${String(laneX(to))} ${String(mid)}, ${String(laneX(to))} ${String(end)}`
}

/**
 * Render the commit graph.
 * @param props - the commits, the truncation flag, and `t`.
 * @returns the lane drawing beside one row per commit.
 */
export function GitGraph({ commits, truncated, t }: GitGraphProps) {
  const { commits: placed, width } = assignLanes(commits)
  if (placed.length === 0) return <p className={css.placeholder}>{t('graph.empty')}</p>

  const graphWidth = Math.max(width, 1) * LANE_WIDTH
  const height = placed.length * ROW_HEIGHT

  return (
    <div className={css.root}>
      <div className={css.canvas} style={{ height: `${String(height)}px` }}>
        <svg
          className={css.lanes}
          width={graphWidth}
          height={height}
          viewBox={`0 0 ${String(graphWidth)} ${String(height)}`}
          aria-hidden="true"
        >
          {placed.map((commit, row) => {
            const y = row * ROW_HEIGHT + ROW_HEIGHT / 2
            return (
              <g key={commit.id}>
                {/* Strands passing this row: a parent waiting further down
                    keeps its column drawn through the gap. */}
                {commit.through.map(lane => (
                  <line
                    key={`through-${String(lane)}`}
                    className={css.strand}
                    x1={laneX(lane)}
                    y1={y}
                    x2={laneX(lane)}
                    y2={y + ROW_HEIGHT}
                  />
                ))}
                {/* Edges to this commit's parents. A parent in the same lane
                    is a straight strand; one in another lane curves across,
                    which is what makes a merge legible. */}
                {commit.edges.map(edge => (
                  edge.lane === commit.lane
                    ? (
                      <line
                        key={`edge-${edge.parent}`}
                        className={css.strand}
                        x1={laneX(commit.lane)}
                        y1={y}
                        x2={laneX(edge.lane)}
                        y2={y + ROW_HEIGHT}
                      />
                    )
                    : (
                      <path
                        key={`edge-${edge.parent}`}
                        className={css.strand}
                        d={curve(commit.lane, edge.lane, y)}
                        fill="none"
                      />
                    )
                ))}
                <circle
                  className={clsx(css.node, commit.merge && css.nodeMerge)}
                  cx={laneX(commit.lane)}
                  cy={y}
                  r={NODE_RADIUS}
                />
              </g>
            )
          })}
        </svg>
        <ol className={css.rows}>
          {placed.map(commit => (
            <li key={commit.id} className={css.row} title={commit.subject}>
              {commit.refs.length > 0 && (
                <span className={css.refs}>
                  {commit.refs.map(ref => (
                    <span key={ref} className={css.ref}>{ref}</span>
                  ))}
                </span>
              )}
              <span className={css.subject}>{commit.subject}</span>
              <span className={css.author}>{commit.authorName}</span>
            </li>
          ))}
        </ol>
      </div>
      {truncated && <p className={css.note}>{t('graph.truncated')}</p>}
    </div>
  )
}
