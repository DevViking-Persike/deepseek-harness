/**
 * Service Definition for the Docker capability seam (`ctx.docker`): a provider
 * registry and provider-selecting execution for container inspection, image
 * listing, log reads, and Compose lifecycle. Duplicate ids are rejected. At
 * execution time a configured provider must exist and be usable; without one,
 * exactly one usable provider is required, so selection never depends on
 * registration order. The local CLI implementation lives in
 * `@deepseek-ai/dsh-docker-local`.
 * @module @deepseek-ai/dsh-docker
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {
  DockerComposeRequest,
  DockerComposeResult,
  DockerContainer,
  DockerControlRequest,
  DockerEngineResult,
  DockerEngineStatus,
  DockerImage,
  DockerListRequest,
  DockerLogsRequest,
  DockerLogsResult,
  DockerProvider,
} from './types.ts'
import { DockerError } from './types.ts'

export { DockerError } from './types.ts'
export type {
  DockerComposeRequest,
  DockerComposeResult,
  DockerContainer,
  DockerContainerState,
  DockerControlAction,
  DockerControlRequest,
  DockerEngineResult,
  DockerEngineStatus,
  DockerImage,
  DockerListRequest,
  DockerLogsRequest,
  DockerLogsResult,
  DockerProvider,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    docker: DockerRuntime
  }
}

/**
 * Config for the Docker seam. `provider` pins which backend wins; it is
 * optional because a single registered usable provider auto-selects.
 * Operational overrides must feed this same field rather than introduce a
 * hidden priority chain.
 */
export interface DockerRuntimeConfig {
  /** Explicit provider id. Omitted = auto-select when exactly one is usable. */
  readonly provider?: string
}

/**
 * The Docker access service, registered as `ctx.docker` (one instance per
 * context).
 *
 * Selection semantics, resolved at execution time and never order-dependent:
 * - A configured id that is registered and `available()` → that provider.
 * - A configured id not registered → `DOCKER_PROVIDER_CONFIGURED_MISSING`.
 * - A configured id registered but unavailable → `DOCKER_PROVIDER_CONFIGURED_UNAVAILABLE`.
 * - No id configured, exactly one registered usable provider → that provider.
 * - No id configured, several usable providers → `DOCKER_PROVIDER_AMBIGUOUS`.
 * - No id configured, no usable provider → `DOCKER_PROVIDER_UNAVAILABLE`.
 */
export class DockerRuntime extends Service {
  /** Provider selection config; `$DSH_DOCKER_PROVIDER` feeds the same field. */
  static Config: z<DockerRuntimeConfig> = z.object({
    provider: z.string(),
  })

  /** Registered backends by id; registration order carries no meaning. */
  private readonly providers = new Map<string, DockerProvider>()

  /** Configured provider id, or the `$DSH_DOCKER_PROVIDER` operational override. */
  private readonly providerId: string | undefined

  constructor(ctx: Context, config: DockerRuntimeConfig = {}) {
    super(ctx, 'docker')
    this.providerId = config.provider ?? process.env.DSH_DOCKER_PROVIDER
  }

  /**
   * Register one container backend.
   * @param provider - the backend to add.
   * @returns a disposer that removes it; runs with the calling fiber.
   */
  registerProvider(provider: DockerProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new DockerError(
        `docker provider "${provider.id}" is already registered`,
        'DOCKER_PROVIDER_DUPLICATE',
      )
    }
    const providers = this.providers
    const dispose = this.ctx.effect(function* () {
      providers.set(provider.id, provider)
      yield () => providers.delete(provider.id)
    }, 'docker.registerProvider()')
    // ctx.effect's disposer returns Promise<void>; this disposer API is
    // synchronous fire-and-forget — discard the (always-resolved) promise.
    return () => void dispose()
  }

  /**
   * Ids of every registered backend, in registration order. Selection never
   * consults this order; it exists for diagnostics and for the UI's provider
   * display.
   * @returns the registered provider ids.
   */
  providerIds(): readonly string[] {
    return [...this.providers.keys()]
  }

  /**
   * Resolve the backend one operation must run on. Availability is probed
   * here, so a daemon that stopped between calls fails selection rather than
   * the operation.
   * @returns the selected backend.
   */
  private async select(): Promise<DockerProvider> {
    const configuredId = this.providerId
    if (configuredId !== undefined && configuredId.length > 0) {
      const configured = this.providers.get(configuredId)
      if (configured === undefined) {
        throw new DockerError(
          `configured docker provider "${configuredId}" is not registered`,
          'DOCKER_PROVIDER_CONFIGURED_MISSING',
        )
      }
      if (!await configured.available()) {
        throw new DockerError(
          `configured docker provider "${configuredId}" cannot reach its engine`,
          'DOCKER_PROVIDER_CONFIGURED_UNAVAILABLE',
        )
      }
      return configured
    }
    const usable: DockerProvider[] = []
    for (const provider of this.providers.values()) {
      if (await provider.available()) usable.push(provider)
    }
    const [only] = usable
    if (only === undefined) {
      throw new DockerError(
        'no usable docker provider is registered',
        'DOCKER_PROVIDER_UNAVAILABLE',
      )
    }
    if (usable.length > 1) {
      throw new DockerError(
        `several usable docker providers (${usable.map(p => p.id).join(', ')}); set the seam's provider`,
        'DOCKER_PROVIDER_AMBIGUOUS',
      )
    }
    return only
  }

  /**
   * The single backend that can manage a local engine, or undefined when none
   * offers that capability. Deliberately independent of `select()`: an engine
   * that is down makes every provider unusable, which is exactly when a caller
   * needs this answer. Several capable backends stay ambiguous, so nothing
   * starts a runtime the deployment did not name.
   * @returns the engine-managing backend, or undefined.
   */
  private engineProvider(): DockerProvider | undefined {
    const configuredId = this.providerId
    if (configuredId !== undefined && configuredId.length > 0) {
      const configured = this.providers.get(configuredId)
      return configured?.engineStatus === undefined ? undefined : configured
    }
    const capable = [...this.providers.values()].filter(p => p.engineStatus !== undefined)
    return capable.length === 1 ? capable[0] : undefined
  }

  /**
   * Report whether an engine is reachable and what can be done about it. A
   * composition whose backends cannot manage an engine answers a status with
   * every capability false, never an error: the absence of the capability is
   * itself the answer a UI renders.
   * @param signal - cancellation for the underlying probe.
   * @returns the engine status.
   */
  async engineStatus(signal?: AbortSignal): Promise<DockerEngineStatus> {
    const provider = this.engineProvider()
    if (provider?.engineStatus === undefined) {
      return {
        running: false,
        startable: false,
        installable: false,
        detail: 'no registered docker provider can manage a local engine',
      }
    }
    return provider.engineStatus(signal)
  }

  /**
   * Start the local container runtime.
   * @param signal - cancellation for the underlying command.
   * @returns the settled status and the command output.
   * @throws {DockerError} `DOCKER_ENGINE_UNMANAGEABLE` when no backend can start one.
   */
  async startEngine(signal?: AbortSignal): Promise<DockerEngineResult> {
    const provider = this.engineProvider()
    if (provider?.startEngine === undefined) {
      throw new DockerError(
        'no registered docker provider can start a local engine',
        'DOCKER_ENGINE_UNMANAGEABLE',
      )
    }
    return provider.startEngine(signal)
  }

  /**
   * Install a container runtime on this machine.
   * @param signal - cancellation for the underlying command.
   * @returns the settled status and the command output.
   * @throws {DockerError} `DOCKER_ENGINE_UNMANAGEABLE` when no backend can install one.
   */
  async installEngine(signal?: AbortSignal): Promise<DockerEngineResult> {
    const provider = this.engineProvider()
    if (provider?.installEngine === undefined) {
      throw new DockerError(
        'no registered docker provider can install a local engine',
        'DOCKER_ENGINE_UNMANAGEABLE',
      )
    }
    return provider.installEngine(signal)
  }

  /**
   * List containers on the selected backend.
   * @param request - listing filters.
   * @param signal - cancellation for the engine call.
   * @returns the matching containers.
   */
  async list(request: DockerListRequest = {}, signal?: AbortSignal): Promise<readonly DockerContainer[]> {
    const provider = await this.select()
    return provider.list(request, signal)
  }

  /**
   * Apply one lifecycle action to a single container on the selected backend.
   * @param request - the container and the action to apply.
   * @param signal - cancellation for the engine call.
   * @returns the container's state after the action settled.
   */
  async control(request: DockerControlRequest, signal?: AbortSignal): Promise<DockerContainer> {
    const provider = await this.select()
    return provider.control(request, signal)
  }

  /**
   * List locally available images on the selected backend.
   * @param signal - cancellation for the engine call.
   * @returns the local images.
   */
  async images(signal?: AbortSignal): Promise<readonly DockerImage[]> {
    const provider = await this.select()
    return provider.images(signal)
  }

  /**
   * Read one container's logs from the selected backend.
   * @param request - container and range to read.
   * @param signal - cancellation for the engine call.
   * @returns the collected log text.
   */
  async logs(request: DockerLogsRequest, signal?: AbortSignal): Promise<DockerLogsResult> {
    const provider = await this.select()
    return provider.logs(request, signal)
  }

  /**
   * Start a Compose project on the selected backend.
   * @param request - compose file, project, and service selection.
   * @param signal - cancellation for the engine call.
   * @returns the settled project state.
   */
  async composeUp(request: DockerComposeRequest, signal?: AbortSignal): Promise<DockerComposeResult> {
    const provider = await this.select()
    return provider.composeUp(request, signal)
  }

  /**
   * Stop and remove a Compose project's containers on the selected backend.
   * @param request - compose file, project, and service selection.
   * @param signal - cancellation for the engine call.
   * @returns the settled project state.
   */
  async composeDown(request: DockerComposeRequest, signal?: AbortSignal): Promise<DockerComposeResult> {
    const provider = await this.select()
    return provider.composeDown(request, signal)
  }
}

export default DockerRuntime
