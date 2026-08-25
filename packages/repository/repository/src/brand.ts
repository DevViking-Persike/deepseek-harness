/**
 * Branded identifier types and factory functions for the repository capability seam.
 * @module @deepseek-ai/dsh-repository/brand
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque identifier for a managed repository. */
export type RepositoryId = Branded<'RepositoryId'>

/**
 * Brand a string as a {@link RepositoryId}.
 * @param id - raw repository identifier string.
 * @returns the branded repository identifier.
 */
export function RepositoryId(id: string): RepositoryId {
  return id as RepositoryId
}

/** Opaque identifier for a code forge provider (e.g. github, gitlab). */
export type ForgeId = Branded<'ForgeId'>

/**
 * Brand a string as a {@link ForgeId}.
 * @param id - raw forge identifier string.
 * @returns the branded forge identifier.
 */
export function ForgeId(id: string): ForgeId {
  return id as ForgeId
}

/** Opaque identifier for a repository catalog provider. */
export type CatalogProviderId = Branded<'CatalogProviderId'>

/**
 * Brand a string as a {@link CatalogProviderId}.
 * @param id - raw catalog provider identifier string.
 * @returns the branded catalog provider identifier.
 */
export function CatalogProviderId(id: string): CatalogProviderId {
  return id as CatalogProviderId
}
