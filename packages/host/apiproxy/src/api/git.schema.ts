/**
 * git domain zod schemas (names derived from map keys:
 * gitStatusRequestSchema / gitStatusValueSchema, and so on).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import type {
  GitChangeKindView, GitCommitView, GitDiffSideView, GitFileChangeView, GitRepositoryEntry,
  GitWorktreeView,
} from './git.ts'

/** Which side of the index an operation addresses. */
export const gitDiffSideSchema = z.enum(['worktree', 'index']) satisfies z.ZodType<Wire<GitDiffSideView>>

/** How one path changed on one side of the index. */
export const gitChangeKindSchema = z.enum([
  'unmodified', 'added', 'modified', 'deleted', 'renamed',
  'copied', 'typechange', 'untracked', 'ignored', 'conflicted',
]) satisfies z.ZodType<Wire<GitChangeKindView>>

/** One repository row of a discovery listing. */
export const gitRepositoryEntrySchema = z.object({
  root: z.string(),
  name: z.string(),
  workspacePath: z.string(),
  workspaceTitle: z.string(),
  submodule: z.boolean(),
}) satisfies z.ZodType<Wire<GitRepositoryEntry>>

/** One changed path of a status. */
export const gitFileChangeSchema = z.object({
  path: z.string(),
  absolutePath: z.string(),
  index: gitChangeKindSchema,
  worktree: gitChangeKindSchema,
  origPath: z.string().optional(),
  similarity: z.number().optional(),
  binary: z.boolean(),
  insertions: z.number().optional(),
  deletions: z.number().optional(),
}) satisfies z.ZodType<Wire<GitFileChangeView>>

/** One repository's working-tree state; the value of several git.* rows. */
export const gitStatusValueSchema = z.object({
  root: z.string(),
  branch: z.string().optional(),
  head: z.string().optional(),
  upstream: z.string().optional(),
  ahead: z.number(),
  behind: z.number(),
  changes: z.array(gitFileChangeSchema),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'git.status'>>>

/** One commit row of a history read. */
export const gitCommitSchema = z.object({
  id: z.string(),
  subject: z.string(),
  authorName: z.string(),
  authorEmail: z.string(),
  authoredAt: z.string(),
  parents: z.array(z.string()),
}) satisfies z.ZodType<Wire<GitCommitView>>

/** git.listRepositories request payload (empty; extend in place). */
export const gitListRepositoriesRequestSchema = z.object({
}) satisfies z.ZodType<Wire<RequestPayload<'git.listRepositories'>>>

/** git.listRepositories response value. */
export const gitListRepositoriesValueSchema = z.object({
  repositories: z.array(gitRepositoryEntrySchema),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'git.listRepositories'>>>

/** git.status request payload. */
export const gitStatusRequestSchema = z.object({
  root: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'git.status'>>>

/** git.compareBases request payload; an absent list uses the host's defaults. */
export const gitCompareBasesRequestSchema = z.object({
  root: z.string().min(1),
  bases: z.array(z.string().min(1)).optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'git.compareBases'>>>

/** git.compareBases response value. */
export const gitCompareBasesValueSchema = z.object({
  comparisons: z.array(z.object({
    base: z.string(),
    exists: z.boolean(),
    ahead: z.number(),
    behind: z.number(),
    conflicts: z.boolean().optional(),
  })),
}) satisfies z.ZodType<Wire<ResponseValue<'git.compareBases'>>>

/** git.graph request payload. */
export const gitGraphRequestSchema = z.object({
  root: z.string().min(1),
  limit: z.number().int().positive().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'git.graph'>>>

/** git.graph response value. */
export const gitGraphValueSchema = z.object({
  commits: z.array(z.object({
    id: z.string(),
    parents: z.array(z.string()),
    refs: z.array(z.string()),
    subject: z.string(),
    authorName: z.string(),
    authoredAt: z.string(),
  })),
  branches: z.array(z.object({
    name: z.string(),
    head: z.string(),
    upstream: z.string().optional(),
    current: z.boolean(),
  })),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'git.graph'>>>

/** git.worktrees request payload. */
export const gitWorktreesRequestSchema = z.object({
  root: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'git.worktrees'>>>

/** One checkout row of a worktree listing. */
export const gitWorktreeSchema = z.object({
  path: z.string(),
  name: z.string(),
  branch: z.string().optional(),
  head: z.string().optional(),
  main: z.boolean(),
  detached: z.boolean(),
  bare: z.boolean(),
  locked: z.string().optional(),
  prunable: z.string().optional(),
  changes: z.number().optional(),
}) satisfies z.ZodType<Wire<GitWorktreeView>>

/** git.worktrees response value. */
export const gitWorktreesValueSchema = z.object({
  worktrees: z.array(gitWorktreeSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'git.worktrees'>>>

/** git.diff request payload. */
export const gitDiffRequestSchema = z.object({
  root: z.string().min(1),
  path: z.string().min(1),
  side: gitDiffSideSchema,
}) satisfies z.ZodType<Wire<RequestPayload<'git.diff'>>>

/** git.diff response value. */
export const gitDiffValueSchema = z.object({
  path: z.string(),
  oldText: z.string().nullable(),
  newText: z.string().nullable(),
  binary: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'git.diff'>>>

/** git.log request payload. */
export const gitLogRequestSchema = z.object({
  root: z.string().min(1),
  limit: z.number().int().positive().optional(),
  path: z.string().min(1).optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'git.log'>>>

/** git.log response value. */
export const gitLogValueSchema = z.object({
  commits: z.array(gitCommitSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'git.log'>>>

/** git.stage request payload; a non-empty path list is required. */
export const gitStageRequestSchema = z.object({
  root: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'git.stage'>>>

/** git.unstage request payload. */
export const gitUnstageRequestSchema = z.object({
  root: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'git.unstage'>>>

/** git.discard request payload. */
export const gitDiscardRequestSchema = z.object({
  root: z.string().min(1),
  path: z.string().min(1),
  side: gitDiffSideSchema,
}) satisfies z.ZodType<Wire<RequestPayload<'git.discard'>>>

/** git.discard response value; `recoveredOid` is what makes the discard undoable. */
export const gitDiscardValueSchema = z.object({
  status: gitStatusValueSchema,
  recoveredOid: z.string().optional(),
}) satisfies z.ZodType<Wire<ResponseValue<'git.discard'>>>

/** git.recover request payload. */
export const gitRecoverRequestSchema = z.object({
  root: z.string().min(1),
  oid: z.string().min(4),
}) satisfies z.ZodType<Wire<RequestPayload<'git.recover'>>>

/** git.recover response value. */
export const gitRecoverValueSchema = z.object({
  content: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'git.recover'>>>

/** git.commit request payload. */
export const gitCommitRequestSchema = z.object({
  root: z.string().min(1),
  message: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'git.commit'>>>

/** git.commit response value. */
export const gitCommitValueSchema = z.object({
  commit: gitCommitSchema,
  status: gitStatusValueSchema,
}) satisfies z.ZodType<Wire<ResponseValue<'git.commit'>>>
