/**
 * Package-owned invariant companion for the Monaco asset route.
 * @module @deepseek-ai/dsh-host-monaco-assets/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-monaco-assets'

/** Cordis companion plugin name. */
export const name = 'host-monaco-assets-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every request is one stateless read of a
 * version-pinned distribution, so this package owns no mutable state to relate.
 */
const install: InvariantInstaller = () => {}

/**
 * Register the Monaco asset-route invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
