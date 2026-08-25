/**
 * Domain specification and zod schemas for persistent local repository catalog storage.
 * @module @deepseek-ai/dsh-repository-local/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { ForgeId, RepositoryId } from '@deepseek-ai/dsh-repository'

/** Schema for a configured git remote. */
export const repositoryRemoteRecord = z.object({
  name: z.string(),
  url: z.string(),
  fetchUrl: z.string().optional(),
  pushUrl: z.string().optional(),
})

/** Schema for forge metadata reference. */
export const repositoryForgeRefRecord = z.object({
  forgeId: z.string().transform(ForgeId),
  owner: z.string(),
  name: z.string(),
})

/** Schema for durable stored repository record. */
export const repositoryRecord = z.object({
  id: z.string().transform(RepositoryId),
  name: z.string(),
  path: z.string(),
  remotes: z.array(repositoryRemoteRecord).optional(),
  defaultBranch: z.string().optional(),
  currentBranch: z.string().optional(),
  isClean: z.boolean().optional(),
  forge: repositoryForgeRefRecord.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/** Type of durable stored repository record. */
export type RepositoryRecord = z.infer<typeof repositoryRecord>

/** Schema for durable global state of repository catalog domain. */
export const repositoryDomainState = z.object({
  initialized: z.boolean(),
  repositoryIds: z.array(z.string().transform(RepositoryId)),
})

/** Type of durable global state of repository catalog domain. */
export type RepositoryDomainState = z.infer<typeof repositoryDomainState>

/** Domain specification for persistent repository catalog. */
export const repositoryDomainSpec = defineDomain({
  name: 'repository_catalog',
  version: 1,
  global: {
    schema: repositoryDomainState,
    initial: { initialized: false, repositoryIds: [] },
  },
  tables: {
    repositories: domainTable<RepositoryId, RepositoryRecord>(repositoryRecord),
  },
})
