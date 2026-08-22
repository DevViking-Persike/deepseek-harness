/**
 * Vocabulary for the Docker capability seam (`ctx.docker`). Containers,
 * images, and Compose projects share one seam because they share one engine
 * connection, one selection decision, and one error taxonomy; their request
 * and result types stay separate.
 * @module @deepseek-ai/dsh-docker/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/**
 * Lifecycle state of one container, normalized across backends. `created` and
 * `restarting` are transient; `exited` and `dead` are terminal. A backend that
 * reports a state outside this set maps it to the closest member rather than
 * widening the union, so consumers switch exhaustively.
 */
export type DockerContainerState
  = | 'created'
    | 'running'
    | 'paused'
    | 'restarting'
    | 'exited'
    | 'dead'

/** One container as the seam describes it. */
export interface DockerContainer {
  /** Full engine-assigned container id. */
  readonly id: string
  /** Engine-assigned or user-supplied name, without the leading slash. */
  readonly name: string
  /** Image reference the container runs. */
  readonly image: string
  /** Normalized lifecycle state. */
  readonly state: DockerContainerState
  /** Backend's human-readable status line (`Up 2 hours`, `Exited (0) 3 minutes ago`). */
  readonly status: string
  /** Compose project this container belongs to, when it carries the label. */
  readonly project?: string
  /** Compose service name within {@link DockerContainer.project}, when labeled. */
  readonly service?: string
  /** Published port mappings, in the backend's display form (`0.0.0.0:5432->5432/tcp`). */
  readonly ports: readonly string[]
  /** Creation timestamp as an ISO-8601 string. */
  readonly createdAt: string
}

/** Which containers to list. */
export interface DockerListRequest {
  /** Include non-running containers. Omitted = running only. */
  readonly all?: boolean
  /** Restrict to one Compose project by label. */
  readonly project?: string
}

/** One locally available image. */
export interface DockerImage {
  /** Full image id, including the digest algorithm prefix. */
  readonly id: string
  /** `repository:tag` references pointing at this id. */
  readonly tags: readonly string[]
  /** On-disk size in bytes. */
  readonly size: number
  /** Creation timestamp as an ISO-8601 string. */
  readonly createdAt: string
}

/**
 * What one container-log read is asked for. The seam has no follow mode: a
 * streaming subscription is a different lifecycle with its own cancellation
 * and backpressure, and no current consumer needs it.
 */
export interface DockerLogsRequest {
  /** Container id or name. */
  readonly container: string
  /** Maximum number of trailing lines. Omitted = the provider's own default. */
  readonly tail?: number
  /** Restrict to entries at or after this ISO-8601 timestamp. */
  readonly since?: string
}

/** Collected log text of one container. */
export interface DockerLogsResult {
  /** Container id the entries came from. */
  readonly container: string
  /** Interleaved stdout and stderr text, oldest first. */
  readonly content: string
  /** True when the provider dropped older entries to honor a byte cap. */
  readonly truncated: boolean
}

/**
 * A Compose project the harness can act on. `file` is the compose file path;
 * the provider resolves it relative to its configured project root when it is
 * not absolute.
 */
export interface DockerComposeRequest {
  /** Path to the compose file. */
  readonly file: string
  /** Explicit project name. Omitted = the backend derives it from the file's directory. */
  readonly project?: string
  /** Restrict the operation to these service names. Omitted = every service. */
  readonly services?: readonly string[]
}

/**
 * One lifecycle action applied to a single container. `restart` is its own
 * action rather than a stop-then-start pair because the engine performs it
 * atomically, keeping the container's identity and its restart policy intact.
 */
export type DockerControlAction = 'start' | 'stop' | 'restart'

/** Request to apply one lifecycle action to one container. */
export interface DockerControlRequest {
  /** Container id or name the action addresses. */
  readonly container: string
  /** The action to apply. */
  readonly action: DockerControlAction
}

/** Outcome of one Compose lifecycle operation. */
export interface DockerComposeResult {
  /** Project name the backend acted on. */
  readonly project: string
  /** Combined backend output, already capped. */
  readonly output: string
  /** Containers the project owns after the operation settled. */
  readonly containers: readonly DockerContainer[]
}

/**
 * What a backend can do about an engine that is not answering. A machine may
 * carry the client CLI without a running daemon, or carry no container runtime
 * at all, and those two states call for different offers.
 */
export interface DockerEngineStatus {
  /** Whether the engine answers right now. */
  readonly running: boolean
  /**
   * Whether the backend can start the engine itself. False when the engine
   * already runs, when no runtime is installed, or when the platform has no
   * start command this backend owns.
   */
  readonly startable: boolean
  /**
   * Whether the backend can install a container runtime here. False when one
   * is already installed or no supported installer exists on this platform.
   */
  readonly installable: boolean
  /** The runtime the backend would start or install (`colima`, `docker`). */
  readonly runtime?: string
  /** Why the engine is unreachable; absent while it runs. */
  readonly detail?: string
}

/** Outcome of an engine start or install attempt. */
export interface DockerEngineResult {
  /** The engine's status after the attempt settled. */
  readonly status: DockerEngineStatus
  /** Combined command output, already capped. */
  readonly output: string
}

/**
 * One container-lifecycle backend. `available()` reports whether the engine
 * can be reached right now; the seam calls it during selection, so a provider
 * whose daemon is down is skipped rather than chosen and failed.
 *
 * The three engine members are optional: a backend that cannot manage a local
 * runtime (a remote engine, a socket it did not create) simply omits them, and
 * the seam reports the capability as absent instead of guessing.
 */
export interface DockerProvider {
  /** Stable provider id, unique within the seam's registry. */
  readonly id: string
  /**
   * Whether this backend can serve requests right now.
   * @returns true when the engine answered.
   */
  available: () => Promise<boolean>
  /**
   * Report engine reachability and what this backend could do about it.
   * Selection never calls this: it answers precisely for a provider that
   * `available()` just rejected.
   * @param signal - cancellation for the underlying probe.
   * @returns the engine status.
   */
  engineStatus?: (signal?: AbortSignal) => Promise<DockerEngineStatus>
  /**
   * Start the local container runtime and wait for the engine to answer.
   * @param signal - cancellation for the underlying command.
   * @returns the settled status and the command output.
   */
  startEngine?: (signal?: AbortSignal) => Promise<DockerEngineResult>
  /**
   * Install a container runtime on this machine. A completed installation does
   * not imply a running engine; the returned status reports that separately.
   * @param signal - cancellation for the underlying command.
   * @returns the settled status and the command output.
   */
  installEngine?: (signal?: AbortSignal) => Promise<DockerEngineResult>
  /**
   * List containers.
   * @param request - listing filters.
   * @param signal - cancellation for the underlying engine call.
   * @returns the matching containers.
   */
  list: (request: DockerListRequest, signal?: AbortSignal) => Promise<readonly DockerContainer[]>
  /**
   * Apply one lifecycle action to a single existing container. Addressing one
   * container by id is distinct from Compose lifecycle, which acts on a whole
   * project declared by a file.
   * @param request - the container and the action to apply.
   * @param signal - cancellation for the underlying engine call.
   * @returns the container's state after the action settled.
   */
  control: (request: DockerControlRequest, signal?: AbortSignal) => Promise<DockerContainer>
  /**
   * List locally available images.
   * @param signal - cancellation for the underlying engine call.
   * @returns the local images.
   */
  images: (signal?: AbortSignal) => Promise<readonly DockerImage[]>
  /**
   * Read one container's logs.
   * @param request - container and range to read.
   * @param signal - cancellation for the underlying engine call.
   * @returns the collected log text.
   */
  logs: (request: DockerLogsRequest, signal?: AbortSignal) => Promise<DockerLogsResult>
  /**
   * Start a Compose project.
   * @param request - compose file, project, and service selection.
   * @param signal - cancellation for the underlying engine call.
   * @returns the settled project state.
   */
  composeUp: (request: DockerComposeRequest, signal?: AbortSignal) => Promise<DockerComposeResult>
  /**
   * Stop and remove a Compose project's containers.
   * @param request - compose file, project, and service selection.
   * @param signal - cancellation for the underlying engine call.
   * @returns the settled project state.
   */
  composeDown: (request: DockerComposeRequest, signal?: AbortSignal) => Promise<DockerComposeResult>
}

/**
 * Typed Docker error with a machine-routable, open-string `code` and chained
 * `cause`. Consumers must tolerate provider-specific codes. The seam itself
 * raises `DOCKER_PROVIDER_UNAVAILABLE`, `DOCKER_PROVIDER_AMBIGUOUS`,
 * `DOCKER_PROVIDER_CONFIGURED_MISSING`,
 * `DOCKER_PROVIDER_CONFIGURED_UNAVAILABLE`, and `DOCKER_PROVIDER_DUPLICATE`;
 * providers add engine-level codes such as `DOCKER_ENGINE_FAILED`,
 * `DOCKER_NOT_FOUND`, and `DOCKER_INVALID_REQUEST`. Tool execution exposes the
 * code in structured error metadata.
 */
export class DockerError extends HarnessError {}
