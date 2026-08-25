/**
 * Repository discovery beneath a set of roots. A `.git` entry is the marker:
 * a directory for an ordinary repository, a file for a submodule or a linked
 * worktree, and both count. Reading the filesystem directly rather than
 * shelling out keeps one scan to one traversal instead of one `git` process
 * per candidate directory.
 * @module @deepseek-ai/dsh-git-local/discover
 */

import type { Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { GitDiscoverRequest, GitDiscoverResult, GitRepository } from '@deepseek-ai/dsh-git'

/**
 * Directory names never descended into. Each would cost an unbounded walk
 * while holding repositories a user did not author: dependency trees, build
 * output, and virtual environments. `.git` itself is skipped because a
 * repository's own internals contain no further working trees.
 */
const SKIP_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  'target',
  'vendor',
  '.next',
  '.cache',
  '.turbo',
])

/**
 * Whether a directory holds a repository working tree. A submodule and a
 * linked worktree carry `.git` as a FILE pointing at the real directory, so
 * testing for a directory alone would miss exactly the nested repositories
 * this scan exists to find.
 *
 * @param directory - absolute directory to test.
 * @returns true when a `.git` entry of either kind exists.
 */
async function isRepository(directory: string): Promise<boolean> {
  try {
    await stat(join(directory, '.git'))
    return true
  } catch {
    // No `.git` entry: an ordinary directory, which is the common case.
    return false
  }
}

/**
 * Find repositories beneath the requested roots, breadth-first so the
 * shallowest repositories are found before the limit is reached.
 *
 * Nesting is preserved rather than pruned: a monorepo containing submodules
 * reports the outer repository and each inner one, with `submodule` marking
 * those found beneath an already-discovered root. Stopping at the first `.git`
 * would hide precisely the inner repositories a user needs to review.
 *
 * @param request - roots, depth bound, and result bound.
 * @param signal - cancellation for the scan.
 * @returns the discovered repositories ordered by root path, and whether the
 * scan stopped at its limit.
 */
export async function discoverRepositories(
  request: GitDiscoverRequest,
  signal?: AbortSignal,
): Promise<GitDiscoverResult> {
  const { roots, maxDepth, limit } = request
  const found = new Map<string, GitRepository>()
  let truncated = false

  for (const root of roots) {
    if (found.size >= limit) {
      truncated = true
      break
    }
    // Breadth-first: one queue level per directory depth, so a shallow
    // repository is never lost to a deep sibling consuming the limit.
    let level: string[] = [root]
    for (let depth = 0; depth <= maxDepth && level.length > 0; depth += 1) {
      const next: string[] = []
      for (const directory of level) {
        signal?.throwIfAborted()
        if (found.size >= limit) {
          truncated = true
          break
        }
        if (await isRepository(directory)) {
          found.set(directory, {
            root: directory,
            name: basename(directory),
            workspacePath: root,
            // A repository beneath another discovered repository is nested:
            // a submodule, a linked worktree, or a vendored checkout.
            submodule: [...found.keys()].some(other => directory.startsWith(other + '/')),
          })
        }
        if (depth === maxDepth) continue
        let children: Dirent[]
        try {
          children = await readdir(directory, { withFileTypes: true })
        } catch {
          // Unreadable directory (permissions, a race with a delete): skipping
          // it is the honest answer, and failing the whole scan for one
          // directory would make discovery depend on unrelated files.
          continue
        }
        for (const child of children) {
          if (!child.isDirectory()) continue
          if (SKIP_DIRECTORIES.has(child.name)) continue
          next.push(join(directory, child.name))
        }
      }
      if (found.size >= limit) {
        truncated = true
        break
      }
      level = next
    }
  }

  return {
    repositories: [...found.values()].sort((a, b) => a.root.localeCompare(b.root)),
    truncated,
  }
}
