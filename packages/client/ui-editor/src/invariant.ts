/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-editor`.
 * @module @deepseek-ai/dsh-client-ui-editor/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-editor'

/** Cordis companion plugin name. */
export const name = 'client-ui-editor-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a pure-consumer plugin — it emits no cordis events and
 * owns no mutable cross-plugin state. Every container, image, and log line it
 * shows is re-read from the host per refresh rather than held here, and its
 * view-slot registration is a plain effect whose disposal this package's
 * behavior specs observe directly.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
