/**
 * `@deepseek-ai/dsh-docker-local`: registers the local `docker` CLI backend
 * with `ctx.docker`. A function/namespace plugin (NOT a default-export
 * service): it registers INTO the seam's provider registry.
 * @module @deepseek-ai/dsh-docker-local
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-docker'
import type {} from '@deepseek-ai/dsh-subprocess'
import { LocalDockerProvider } from './provider.ts'
import type { LocalDockerLimits } from './provider.ts'

export { LOCAL_DOCKER_PROVIDER_ID, LocalDockerProvider } from './provider.ts'
export type { LocalDockerLimits } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'docker-local'

/** The Docker seam this provider registers into, plus the process seam it runs on. */
export const inject = ['docker', 'subprocess']

/** Plugin config: which CLI to run, where, and the limits each invocation carries. */
export interface Config {
  /** Executable name or absolute path of the Docker CLI. */
  cli?: string
  /** Working directory for invocations, and the root relative compose paths resolve against. Defaults to the harness process cwd. */
  projectRoot?: string
  /** Cooperative timeout for one inspection call. */
  inspectTimeoutMs?: number
  /** Cooperative timeout for one Compose lifecycle call. */
  composeTimeoutMs?: number
  /** Cap on collected output bytes of one invocation. */
  maxOutputBytes?: number
  /** Termination grace period handed to the subprocess seam. */
  graceMs?: number
  /** Trailing log lines used when a request states no `tail`. */
  defaultLogTail?: number
  /**
   * Whether an unreachable engine may be started from the UI. Starting a
   * daemon changes machine state outside the session, so a deployment that
   * does not want that turns it off here.
   */
  allowEngineStart?: boolean
  /**
   * Whether a missing container runtime may be installed from the UI.
   * Installation writes to the machine outside the workspace, so it is off by
   * default and a deployment opts in.
   */
  allowEngineInstall?: boolean
  /** VM manager that provides a Linux engine on macOS. */
  engineVmCli?: string
  /** Package manager used to install the runtime on macOS. */
  engineMacInstaller?: string
  /** Cooperative timeout for one engine start. */
  engineStartTimeoutMs?: number
  /** Cooperative timeout for one engine installation. */
  engineInstallTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  cli: z.string().default('docker'),
  projectRoot: z.string(),
  inspectTimeoutMs: z.number().default(30_000),
  // Pulling images and waiting for health checks routinely outlasts an
  // inspection call by an order of magnitude.
  composeTimeoutMs: z.number().default(600_000),
  maxOutputBytes: z.number().default(2_000_000),
  graceMs: z.number().default(5_000),
  defaultLogTail: z.number().default(200),
  allowEngineStart: z.boolean().default(true),
  allowEngineInstall: z.boolean().default(false),
  engineVmCli: z.string().default('colima'),
  engineMacInstaller: z.string().default('brew'),
  // A cold VM boot pulls and starts a Linux guest.
  engineStartTimeoutMs: z.number().default(300_000),
  // A package-manager install downloads the runtime and its dependencies.
  engineInstallTimeoutMs: z.number().default(1_800_000),
})

/** Complete config after schemastery applies every field default; `projectRoot` has none. */
type ResolvedConfig = Required<Omit<Config, 'projectRoot'>> & Pick<Config, 'projectRoot'>

/** Every positive-integer config field, validated together at load. */
const POSITIVE_FIELDS = [
  'inspectTimeoutMs',
  'composeTimeoutMs',
  'maxOutputBytes',
  'graceMs',
  'defaultLogTail',
  'engineStartTimeoutMs',
  'engineInstallTimeoutMs',
] as const satisfies readonly (keyof Config)[]

/**
 * Register the local Docker CLI provider. Misconfiguration fails at load; an
 * unreachable daemon does not, because availability is a per-call fact the
 * seam probes during selection.
 * @param ctx - Cordis context carrying the docker and subprocess seams.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: ResolvedConfig): void {
  for (const field of POSITIVE_FIELDS) {
    const value = config[field]
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`docker-local: ${field} must be a positive integer`)
    }
  }
  if (config.cli.length === 0) {
    throw new Error('docker-local: cli must not be empty')
  }
  if (config.engineVmCli.length === 0) {
    throw new Error('docker-local: engineVmCli must not be empty')
  }
  if (config.engineMacInstaller.length === 0) {
    throw new Error('docker-local: engineMacInstaller must not be empty')
  }
  const limits: LocalDockerLimits = {
    cli: config.cli,
    projectRoot: config.projectRoot ?? process.cwd(),
    inspectTimeoutMs: config.inspectTimeoutMs,
    composeTimeoutMs: config.composeTimeoutMs,
    maxOutputBytes: config.maxOutputBytes,
    graceMs: config.graceMs,
    defaultLogTail: config.defaultLogTail,
    platform: process.platform,
    engine: {
      allowStart: config.allowEngineStart,
      allowInstall: config.allowEngineInstall,
      vmCli: config.engineVmCli,
      macInstaller: config.engineMacInstaller,
      startTimeoutMs: config.engineStartTimeoutMs,
      installTimeoutMs: config.engineInstallTimeoutMs,
    },
  }
  ctx.effect(
    () => ctx.docker.registerProvider(new LocalDockerProvider(ctx, limits)),
    'docker-local: provider registration',
  )
}
