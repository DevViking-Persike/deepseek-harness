/**
 * The model-facing read-only Git tools: `git_status`, `git_diff`, and
 * `git_log`. Execution goes through `ctx.git` — this module owns only the
 * model-facing schemas, argument validation, output caps, and formatting,
 * never provider selection or process execution.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import type { GitFileChange, GitStatus } from '@deepseek-ai/dsh-git'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Model-facing `git_status` arguments. */
interface GitStatusArgs {
  repository: string
}

/** Model-facing `git_diff` arguments. */
interface GitDiffArgs {
  repository: string
  path: string
  staged?: boolean
}

/** Model-facing `git_log` arguments. */
interface GitLogArgs {
  repository: string
  limit?: number
  path?: string
}

/** One changed path as the tool's JSON output carries it. */
export interface ChangeRow {
  path: string
  index: string
  worktree: string
  origPath?: string
  binary: boolean
  insertions?: number
  deletions?: number
}

/**
 * Project one seam change onto its model-facing JSON row, omitting each absent
 * optional field.
 * @param change - one changed path from `ctx.git`.
 * @returns the plain JSON row the output schema declares.
 */
export function changeRow(change: GitFileChange): ChangeRow {
  return {
    path: change.path,
    index: change.index,
    worktree: change.worktree,
    ...change.origPath === undefined ? {} : { origPath: change.origPath },
    binary: change.binary,
    ...change.insertions === undefined ? {} : { insertions: change.insertions },
    ...change.deletions === undefined ? {} : { deletions: change.deletions },
  }
}

/**
 * Render one changed path as a single model-facing line. Both sides of the
 * index are shown because they are independent facts: a path can be staged as
 * one kind and edited again as another, and the model needs to know which
 * before it stages or commits.
 */
function changeLine(change: ChangeRow): string {
  const counts = change.binary
    ? ' binary'
    : change.insertions === undefined ? '' : ` +${String(change.insertions)} -${String(change.deletions ?? 0)}`
  const renamed = change.origPath === undefined ? '' : ` (from ${change.origPath})`
  return `${change.path}${renamed} staged=${change.index} unstaged=${change.worktree}${counts}`
}

/**
 * Format a status as model-facing text.
 * @param status - the repository state from `ctx.git`.
 * @returns the branch line followed by one line per changed path.
 */
export function formatStatus(status: GitStatus): string {
  const branch = status.branch ?? '(detached HEAD)'
  const tracking = status.upstream === undefined
    ? ''
    : ` vs ${status.upstream} (ahead ${String(status.ahead)}, behind ${String(status.behind)})`
  const head = `On ${branch}${tracking}`
  if (status.changes.length === 0) return `${head}\nWorking tree clean.`
  const lines = status.changes.map(change => changeLine(changeRow(change)))
  const note = status.truncated ? '\n(more changed paths were not listed)' : ''
  return `${head}\n${lines.join('\n')}${note}`
}

/**
 * Cap diff text, keeping the HEAD of the content: unlike a log tail, the
 * interesting part of a file is its beginning, and a diff the model cannot see
 * the start of is not usable.
 * @param text - the side's full content.
 * @param maxChars - largest number of characters to keep.
 * @returns the kept text and whether anything was dropped.
 */
export function capDiff(text: string, maxChars: number): { text: string; dropped: boolean } {
  if (text.length <= maxChars) return { text, dropped: false }
  return { text: text.slice(0, maxChars), dropped: true }
}

/** Pending-call presentation for a read. */
function presentRead(title: string): GenericCallView {
  return { card: 'generic', title, kind: 'search', rawInput: title }
}

/**
 * Register the read-only Git tools and their prompt guidance.
 * @param ctx - context carrying the git, tools, and systemPrompt services.
 * @param timeoutMs - cooperative tool-call budget for each read.
 * @param maxDiffChars - cap on characters one `git_diff` call emits.
 */
export function applyGitInspectTools(ctx: Context, timeoutMs: number, maxDiffChars: number): void {
  ctx.systemPrompt.section({
    name: 'tool:git_inspect',
    order: 113,
    text: 'Use git_status to see which files changed in a repository and whether each change is staged, git_diff to read one file\'s before and after content, and git_log to read recent commits. Every repository path must be absolute. These tools only observe; they never stage, discard, or commit anything.',
  })

  ctx.tools.register(defineTool({
    name: 'git_status',
    description: 'Show which files changed in a Git repository, with each change\'s staged and unstaged state.',
    parameters: {
      repository: { type: 'string', required: true, description: 'Absolute path of the repository working-tree root.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          branch: { type: 'string' },
          upstream: { type: 'string' },
          ahead: { type: 'number', required: true },
          behind: { type: 'number', required: true },
          changes: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                index: { type: 'string', required: true },
                worktree: { type: 'string', required: true },
                origPath: { type: 'string' },
                binary: { type: 'boolean', required: true },
                insertions: { type: 'number' },
                deletions: { type: 'number' },
              },
            },
          },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatStatus({
          root: '',
          ...value.branch === undefined ? {} : { branch: value.branch },
          ...value.upstream === undefined ? {} : { upstream: value.upstream },
          ahead: value.ahead,
          behind: value.behind,
          changes: value.changes as unknown as GitFileChange[],
          truncated: value.truncated,
        }),
      }],
    },
    timeoutMs,
    // Reads do not mutate parent-agent state.
    isConcurrencySafe: () => true,
    async execute(args: GitStatusArgs, exec) {
      const status = await ctx.git.status(requireRepository(args.repository), exec.signal)
      return {
        ...status.branch === undefined ? {} : { branch: status.branch },
        ...status.upstream === undefined ? {} : { upstream: status.upstream },
        ahead: status.ahead,
        behind: status.behind,
        changes: status.changes.map(changeRow),
        truncated: status.truncated,
      }
    },
    presentCall: (args: GitStatusArgs) => presentRead(`git status — ${args.repository}`),
  }))

  ctx.tools.register(defineTool({
    name: 'git_diff',
    description: `Read one file's content before and after its change. Returns at most ${String(maxDiffChars)} characters per side.`,
    parameters: {
      repository: { type: 'string', required: true, description: 'Absolute path of the repository working-tree root.' },
      path: { type: 'string', required: true, description: 'Repository-relative path of the file to compare.' },
      staged: { type: 'boolean', description: 'Compare the staged change against the last commit instead of the working tree against the index.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          oldText: { type: 'string' },
          newText: { type: 'string' },
          binary: { type: 'boolean', required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.binary
          ? `${value.path} is binary, so it has no text to compare.`
          : `--- ${value.path} (before)\n${value.oldText ?? '(absent)'}\n+++ ${value.path} (after)\n${value.newText ?? '(absent)'}${value.truncated ? '\n(content truncated)' : ''}`,
      }],
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args: GitDiffArgs, exec) {
      if (args.path.trim().length === 0) throw new Error('path must be a non-empty string')
      const diff = await ctx.git.diff({
        root: requireRepository(args.repository),
        path: args.path,
        side: args.staged === true ? 'index' : 'worktree',
      }, exec.signal)
      const before = diff.oldText === null ? null : capDiff(diff.oldText, maxDiffChars)
      const after = diff.newText === null ? null : capDiff(diff.newText, maxDiffChars)
      return {
        path: diff.path,
        ...before === null ? {} : { oldText: before.text },
        ...after === null ? {} : { newText: after.text },
        binary: diff.binary,
        truncated: (before?.dropped ?? false) || (after?.dropped ?? false),
      }
    },
    presentCall: (args: GitDiffArgs) => presentRead(`git diff — ${args.path}`),
  }))

  ctx.tools.register(defineTool({
    name: 'git_log',
    description: 'Read a Git repository\'s recent commits, newest first.',
    parameters: {
      repository: { type: 'string', required: true, description: 'Absolute path of the repository working-tree root.' },
      limit: { type: 'number', description: 'Number of commits to read.' },
      path: { type: 'string', description: 'Only commits touching this repository-relative path.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          commits: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                subject: { type: 'string', required: true },
                authorName: { type: 'string', required: true },
                authoredAt: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.commits.length === 0
          ? 'This repository has no commits in that range.'
          : value.commits
            .map(commit => `${commit.id.slice(0, 8)} ${commit.subject} — ${commit.authorName}, ${commit.authoredAt}`)
            .join('\n'),
      }],
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args: GitLogArgs, exec) {
      if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1)) {
        throw new Error('limit must be a positive integer')
      }
      const commits = await ctx.git.log({
        root: requireRepository(args.repository),
        limit: args.limit ?? DEFAULT_LOG_LIMIT,
        ...args.path === undefined ? {} : { path: args.path },
      }, exec.signal)
      return {
        commits: commits.map(commit => ({
          id: commit.id,
          subject: commit.subject,
          authorName: commit.authorName,
          authoredAt: commit.authoredAt,
        })),
      }
    },
    presentCall: (args: GitLogArgs) => presentRead(`git log — ${args.repository}`),
  }))
}

/** Commits `git_log` reads when the model names no limit. */
const DEFAULT_LOG_LIMIT = 20

/**
 * Validate the repository argument every Git tool takes.
 * @param repository - the model-supplied repository root.
 * @returns the same value once it is usable.
 */
export function requireRepository(repository: string): string {
  if (repository.trim().length === 0) throw new Error('repository must be a non-empty absolute path')
  return repository
}
