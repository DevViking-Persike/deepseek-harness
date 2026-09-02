/** Package invariant companion for the browser-only Esteira view. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-esteira'
export const name = 'client-ui-esteira-invariant'
export const inject = ['invariants']
/** No runtime invariant: the plugin only projects Host and Session state through a disposable view registration. */
const install: InvariantInstaller = () => {}
/** Register the empty pure-consumer invariant. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
