/**
 * docker domain contract: read-only inspection over the host's `ctx.docker`
 * capability seam, plus a read-only browse that finds compose files by host
 * path. Every row here observes; none mutates. Lifecycle stays out of this
 * domain deliberately — starting and stopping containers runs through the
 * session agent's `docker_compose_up` / `docker_compose_down` tool calls,
 * where the session log records the mutation. An RPC button would change
 * machine state with no such record.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One container row of a listing. */
export interface DockerContainerEntry {
  /** Engine-assigned container id. */
  readonly id: string
  /** Container name as the engine reports it. */
  readonly name: string
  /** Image reference the container runs. */
  readonly image: string
  /** Lifecycle state word (`running`, `exited`, and the rest of the engine's set). */
  readonly state: string
  /** Human status line (`Up 3 hours`). */
  readonly status: string
  /** Compose project this container belongs to, when it carries the label. */
  readonly project?: string
  /** Compose service within the project, when it carries the label. */
  readonly service?: string
  /** Published port mappings. */
  readonly ports: readonly string[]
  /** Creation timestamp as the engine formats it. */
  readonly createdAt: string
}

/** One image row of a listing. */
export interface DockerImageEntry {
  /** Engine-assigned image id. */
  readonly id: string
  /** Every `repository:tag` pointing at this id; empty for an untagged image. */
  readonly tags: readonly string[]
  /** Size in bytes. */
  readonly size: number
  /** Creation timestamp as the engine formats it. */
  readonly createdAt: string
}

/** One row of a compose-file browse: a child directory or a compose YAML file. */
export interface DockerComposeBrowseEntry {
  /** Base name shown in a browser row (a root crumb carries its full path). */
  readonly name: string
  /** Absolute host path — the client never joins path segments itself. */
  readonly path: string
  /** True for a directory the browser can descend into, false for a compose file. */
  readonly directory: boolean
  /** Hidden by the host platform's convention (dot-prefixed on POSIX); the client owns whether to show it. */
  readonly hidden: boolean
}

/** docker.browseCompose response value: one directory level filtered to compose candidates. */
export interface DockerComposeBrowse {
  /** Absolute path of the listed directory. */
  readonly path: string
  /** The host account's home directory (breadcrumb rooting). */
  readonly home: string
  /** Ancestor chain from the filesystem root to the listed directory inclusive; every crumb is a jump target. */
  readonly crumbs: readonly DockerComposeBrowseEntry[]
  /** Child directories followed by compose YAML files, each group name-sorted. */
  readonly entries: readonly DockerComposeBrowseEntry[]
  /** True when the backend cut `entries` at its complete-result bound. */
  readonly truncated: boolean
}

/**
 * Whether a container engine answers, and what the host can do about it when
 * it does not. `startable` and `installable` combine the machine's state with
 * the deployment's permission, so a client renders only offers that would
 * actually run.
 */
export interface DockerEngineStatusView {
  /** Whether the engine answers right now. */
  readonly running: boolean
  /** Whether the host can start the engine on request. */
  readonly startable: boolean
  /** Whether the host can install a container runtime on request. */
  readonly installable: boolean
  /** The runtime the host would start or install (`colima`, `docker`). */
  readonly runtime?: string
  /** Why the engine is unreachable; absent while it runs. */
  readonly detail?: string
}

/** Docker-domain unary methods (the map keys docker.* of RpcMethodMap). */
export interface DockerApi {
  /**
   * Report engine reachability and the remedies available on this machine.
   * A stopped or absent engine is the answer, not a failure, so this method
   * succeeds in both cases.
   */
  engineStatus(
    request: RpcRequest<{}>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ status: DockerEngineStatusView }>>

  /**
   * Start the local container runtime, then report the settled status.
   * Fails with `docker-unmanageable` when no backend can start one or the
   * deployment withheld that permission.
   */
  startEngine(
    request: RpcRequest<{}>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ status: DockerEngineStatusView; output: string }>>

  /**
   * Install a container runtime, then report the settled status. A completed
   * installation does not imply a running engine. Same `docker-unmanageable`
   * stance as `startEngine`.
   */
  installEngine(
    request: RpcRequest<{}>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ status: DockerEngineStatusView; output: string }>>

  /**
   * List containers. An absent `all` lists running containers only. Fails
   * with `docker-unavailable` when the composition mounts no Docker seam or
   * no backend can reach an engine, which the client shows as an empty state
   * rather than an error.
   */
  listContainers(
    request: RpcRequest<{ all?: boolean; project?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ containers: readonly DockerContainerEntry[] }>>

  /**
   * Apply one lifecycle action to a single container. This is the operator's
   * own gesture on a container they can see, so it needs no session: a whole
   * project still goes through `composeUp` / `composeDown`. Fails with
   * `compose-failed` when a reachable engine refused the action.
   */
  control(
    request: RpcRequest<{ container: string; action: 'start' | 'stop' | 'restart' }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ container: DockerContainerEntry }>>

  /** List locally available images. Same `docker-unavailable` stance as `listContainers`. */
  listImages(
    request: RpcRequest<{}>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ images: readonly DockerImageEntry[] }>>

  /**
   * Read one container's recent log output. `tail` bounds the lines read;
   * the host caps the returned text and reports `truncated` when it dropped
   * older entries.
   */
  logs(
    request: RpcRequest<{ container: string; tail?: number }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ container: string; content: string; truncated: boolean }>>

  /**
   * List one directory level filtered to child directories and compose YAML
   * files, so the browser can pick a compose file by its host path. A browser
   * `<input type="file">` cannot supply a host path to the Docker CLI, so
   * selection has to happen host-side. An absent path lists the host account's
   * home directory; unreadable or missing targets fail with
   * `directory-unreadable`.
   */
  browseCompose(
    request: RpcRequest<{ path?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<DockerComposeBrowse>>

  /**
   * Start a Compose project detached and wait for its containers to become
   * ready. `file` is an absolute host path, normally one `browseCompose`
   * returned. Fails with `docker-unavailable` when no engine is reachable and
   * `compose-failed` when the engine rejected the project.
   */
  composeUp(
    request: RpcRequest<{ file: string; project?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<DockerComposeOutcome>>

  /** Stop and remove a Compose project's containers. Same failure stance as `composeUp`. */
  composeDown(
    request: RpcRequest<{ file: string; project?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<DockerComposeOutcome>>
}

/** docker.composeUp / docker.composeDown response value. */
export interface DockerComposeOutcome {
  /** Compose project the operation settled. */
  readonly project: string
  /** Backend output, capped by the host; the newest text survives. */
  readonly output: string
  /** Containers belonging to the project once the operation settled. */
  readonly containers: readonly DockerContainerEntry[]
}
