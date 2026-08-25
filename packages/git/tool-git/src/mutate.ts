/**
 * The model-facing mutating Git tools: `git_stage`, `git_unstage`,
 * `git_discard`, and `git_commit`. These change a repository the deployment
 * owns, so the group is opt-in — the same stance the Docker Compose tools
 * take.
 *
 * `git_discard` is the one tool here that can destroy uncommitted work. The
 * seam preserves the replaced content before restoring and returns its object
 * id, which this tool reports to the model so the discard stays undoable.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { formatStatus, requireRepository } from './inspect.ts'

/** Model-facing `git_stage` and `git_unstage` arguments. */
interface GitStageArgs {
  repository: string
  paths: string[]
}

/** Model-facing `git_discard` arguments. */
interface GitDiscardArgs {
  repository: string
  path: string
  staged?: boolean
}

/** Model-facing `git_commit` arguments. */
interface GitCommitArgs {
  repository: string
  message: string
}

/** Pending-call presentation for a mutation. */
function presentMutation(title: string): GenericCallView {
  return { card: 'generic', title, kind: 'execute', rawInput: title }
}

/** Validate the path list both staging tools take. */
function requirePaths(paths: readonly string[]): string[] {
  if (paths.length === 0) throw new Error('paths must name at least one file')
  for (const path of paths) {
    if (path.trim().length === 0) throw new Error('every path must be a non-empty string')
  }
  return [...paths]
}

/**
 * Register the mutating Git tools and their prompt guidance.
 * @param ctx - context carrying the git, tools, and systemPrompt services.
 * @param timeoutMs - cooperative tool-call budget for each mutation.
 */
export function applyGitMutateTools(ctx: Context, timeoutMs: number): void {
  ctx.systemPrompt.section({
    name: 'tool:git_mutate',
    order: 114,
    text: 'Use git_stage and git_unstage to choose what a commit will contain, git_commit to record the staged changes, and git_discard to restore a file. git_discard destroys uncommitted work; it reports a recoveryId you can report back to the user so the change can be restored. Never commit without being asked to.',
  })

  ctx.tools.register(defineTool({
    name: 'git_stage',
    description: 'Add files to the Git index, so the next commit will contain them.',
    parameters: {
      repository: { type: 'string', required: true, description: 'Absolute path of the repository working-tree root.' },
      paths: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'Repository-relative paths to stage.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { staged: { type: 'number', required: true }, status: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.status }],
    },
    timeoutMs,
    // The index is shared repository state; two concurrent writes to it would
    // race, so these tools decline to run alongside anything else.
    isConcurrencySafe: () => false,
    async execute(args: GitStageArgs, exec) {
      const root = requireRepository(args.repository)
      const paths = requirePaths(args.paths)
      await ctx.git.stage({ root, paths }, exec.signal)
      return { staged: paths.length, status: formatStatus(await ctx.git.status(root, exec.signal)) }
    },
    presentCall: (args: GitStageArgs) => presentMutation(`git add ${args.paths.join(' ')}`),
  }))

  ctx.tools.register(defineTool({
    name: 'git_unstage',
    description: 'Remove files from the Git index without changing their content on disk.',
    parameters: {
      repository: { type: 'string', required: true, description: 'Absolute path of the repository working-tree root.' },
      paths: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'Repository-relative paths to unstage.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { unstaged: { type: 'number', required: true }, status: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.status }],
    },
    timeoutMs,
    isConcurrencySafe: () => false,
    async execute(args: GitStageArgs, exec) {
      const root = requireRepository(args.repository)
      const paths = requirePaths(args.paths)
      await ctx.git.unstage({ root, paths }, exec.signal)
      return { unstaged: paths.length, status: formatStatus(await ctx.git.status(root, exec.signal)) }
    },
    presentCall: (args: GitStageArgs) => presentMutation(`git restore --staged ${args.paths.join(' ')}`),
  }))

  ctx.tools.register(defineTool({
    name: 'git_discard',
    description: 'Restore a file, discarding its uncommitted change. Reports a recoveryId that can restore the discarded content.',
    parameters: {
      repository: { type: 'string', required: true, description: 'Absolute path of the repository working-tree root.' },
      path: { type: 'string', required: true, description: 'Repository-relative path to restore.' },
      staged: { type: 'boolean', description: 'Discard the staged change instead of the working-tree edit.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          recoveryId: { type: 'string' },
          status: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.recoveryId === undefined
          ? `Discarded ${value.path}.\n\n${value.status}`
          : `Discarded ${value.path}. Its previous content is recoverable as ${value.recoveryId}.\n\n${value.status}`,
      }],
    },
    timeoutMs,
    isConcurrencySafe: () => false,
    async execute(args: GitDiscardArgs, exec) {
      const root = requireRepository(args.repository)
      if (args.path.trim().length === 0) throw new Error('path must be a non-empty string')
      const outcome = await ctx.git.discard({
        root,
        path: args.path,
        side: args.staged === true ? 'index' : 'worktree',
      }, exec.signal)
      return {
        path: outcome.path,
        ...outcome.recoveredOid === undefined ? {} : { recoveryId: outcome.recoveredOid },
        status: formatStatus(await ctx.git.status(root, exec.signal)),
      }
    },
    presentCall: (args: GitDiscardArgs) => presentMutation(`git restore ${args.path}`),
  }))

  ctx.tools.register(defineTool({
    name: 'git_commit',
    description: 'Record the staged changes as a commit.',
    parameters: {
      repository: { type: 'string', required: true, description: 'Absolute path of the repository working-tree root.' },
      message: { type: 'string', required: true, description: 'Commit message; its first line is the subject.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          subject: { type: 'string', required: true },
          status: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Committed ${value.id.slice(0, 8)} ${value.subject}\n\n${value.status}`,
      }],
    },
    timeoutMs,
    isConcurrencySafe: () => false,
    async execute(args: GitCommitArgs, exec) {
      const root = requireRepository(args.repository)
      if (args.message.trim().length === 0) throw new Error('message must be a non-empty string')
      const commit = await ctx.git.commit({ root, message: args.message }, exec.signal)
      return {
        id: commit.id,
        subject: commit.subject,
        status: formatStatus(await ctx.git.status(root, exec.signal)),
      }
    },
    presentCall: () => presentMutation('git commit'),
  }))
}
