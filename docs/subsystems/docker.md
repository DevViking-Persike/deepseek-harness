# Docker Access

English | [中文](docker.zh.md)

The Docker access seam — a [capability seam](../../.agents/notes/implemented/architecture/2026-08-21-docker-capability-seam.md) that spans container inspection, image listing, log reads, and Compose lifecycle on one `ctx.docker` service, split across packages: Service Definition ([dsh-docker](../../packages/docker/docker), `ctx.docker` + the provider registry), Service Provider ([dsh-docker-local](../../packages/docker/docker-local), the local `docker` CLI over `ctx.subprocess`), and Consumer ([dsh-tool-docker](../../packages/docker/tool-docker), the `docker_ps` / `docker_images` / `docker_logs` / `docker_compose_*` tool schemas). Docker is **one optional capability**, not part of the agent-loop spine, so its vocabulary lives here rather than in [core.md](core.md). A backend swap does not change how the model asks about containers.

Source: [`packages/docker/docker/src/types.ts`](../../packages/docker/docker/src/types.ts)

## Why four operations are one capability

Containers, images, logs, and Compose projects reach one engine over one connection and fail identically when that engine is unreachable, so they share one provider-selection policy owner, one abort/error vocabulary, and one product-facing "how this harness reaches Docker" configuration API. Their request and result types stay separate. Providers register a **backend** (a `DockerProvider`), not tools; the model-facing names, schemas, prompt guidance, and presentation all live in the single `dsh-tool-docker` consumer.

## Containers

`DockerContainerState` is a CLOSED union: consumers `switch` on it to exhaustiveness, and a backend reporting a word outside the set maps it to the closest member rather than widening the union, so a newer engine vocabulary cannot silently reach a consumer as an unknown string.

```ts type-equiv
/**
 * Lifecycle state of one container, normalized across backends. `created` and
 * `restarting` are transient; `exited` and `dead` are terminal. A backend that
 * reports a state outside this set maps it to the closest member rather than
 * widening the union, so consumers switch exhaustively.
 */
type DockerContainerState
  = | 'created'
    | 'running'
    | 'paused'
    | 'restarting'
    | 'exited'
    | 'dead'
```

```ts type-equiv
/** One container as the seam describes it. */
interface DockerContainer {
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
```

```ts type-equiv
/** Which containers to list. */
interface DockerListRequest {
  /** Include non-running containers. Omitted = running only. */
  readonly all?: boolean
  /** Restrict to one Compose project by label. */
  readonly project?: string
}
```

## Images

`size` is declared in bytes, but a backend whose engine publishes no machine-readable size derives it from a rounded display string; treat it as approximate.

```ts type-equiv
/** One locally available image. */
interface DockerImage {
  /** Full image id, including the digest algorithm prefix. */
  readonly id: string
  /** `repository:tag` references pointing at this id. */
  readonly tags: readonly string[]
  /** On-disk size in bytes. */
  readonly size: number
  /** Creation timestamp as an ISO-8601 string. */
  readonly createdAt: string
}
```

## Log reads

```ts type-equiv
/**
 * What one container-log read is asked for. The seam has no follow mode: a
 * streaming subscription is a different lifecycle with its own cancellation
 * and backpressure, and no current consumer needs it.
 */
interface DockerLogsRequest {
  /** Container id or name. */
  readonly container: string
  /** Maximum number of trailing lines. Omitted = the provider's own default. */
  readonly tail?: number
  /** Restrict to entries at or after this ISO-8601 timestamp. */
  readonly since?: string
}
```

```ts type-equiv
/** Collected log text of one container. */
interface DockerLogsResult {
  /** Container id the entries came from. */
  readonly container: string
  /** Interleaved stdout and stderr text, oldest first. */
  readonly content: string
  /** True when the provider dropped older entries to honor a byte cap. */
  readonly truncated: boolean
}
```

## Compose lifecycle

`services` selects which services `composeUp` starts. A teardown removes a project's containers wholesale, so `composeDown` ignores the field.

```ts type-equiv
/**
 * A Compose project the harness can act on. `file` is the compose file path;
 * the provider resolves it relative to its configured project root when it is
 * not absolute.
 */
interface DockerComposeRequest {
  /** Path to the compose file. */
  readonly file: string
  /** Explicit project name. Omitted = the backend derives it from the file's directory. */
  readonly project?: string
  /** Restrict the operation to these service names. Omitted = every service. */
  readonly services?: readonly string[]
}
```

```ts type-equiv
/** Outcome of one Compose lifecycle operation. */
interface DockerComposeResult {
  /** Project name the backend acted on. */
  readonly project: string
  /** Combined backend output, already capped. */
  readonly output: string
  /** Containers the project owns after the operation settled. */
  readonly containers: readonly DockerContainer[]
}
```

## Provider availability

```ts type-equiv
/**
 * One container-lifecycle backend. `available()` reports whether the engine
 * can be reached right now; the seam calls it during selection, so a provider
 * whose daemon is down is skipped rather than chosen and failed.
 *
 * The three engine members are optional: a backend that cannot manage a local
 * runtime (a remote engine, a socket it did not create) simply omits them, and
 * the seam reports the capability as absent instead of guessing.
 */
interface DockerProvider {
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
```

Unlike the [web seam](web.md), whose `available()` is a local credential check, this one asks the engine and is therefore re-probed on every call: a Docker daemon starts and stops during an ordinary session, so a cached answer would route an operation to a backend that is already gone.

Selection never depends on registration, config, or HMR order: a configured provider id (config `provider`, or `$DSH_DOCKER_PROVIDER` feeding the same field) must be registered and available, or exactly one usable provider auto-selects; several usable providers with no configured id is `DOCKER_PROVIDER_AMBIGUOUS`, not first-wins.

## Errors

`DockerError extends HarnessError` ([core.md](core.md) error taxonomy) with an open `code: string`, not a closed union: a provider may raise its own codes without editing `dsh-docker`, and consumers must tolerate an unknown code. The seam raises `DOCKER_PROVIDER_UNAVAILABLE`, `DOCKER_PROVIDER_AMBIGUOUS`, `DOCKER_PROVIDER_CONFIGURED_MISSING`, `DOCKER_PROVIDER_CONFIGURED_UNAVAILABLE`, and the registration-time `DOCKER_PROVIDER_DUPLICATE`. Providers add engine-level codes: `dsh-docker-local` raises `DOCKER_ENGINE_FAILED` for a launch failure, an elapsed invocation timeout, or an unclassified non-zero exit, `DOCKER_NOT_FOUND` when the CLI's message names a missing object, and `DOCKER_INVALID_REQUEST` for a non-positive log tail or an empty compose file path. Tool execution exposes the code in structured error metadata.

## The service

`DockerRuntime` registers backends, rejects duplicate ids with `DOCKER_PROVIDER_DUPLICATE`, and resolves a provider at execution time with structured selection errors. The local backend runs each operation as one short-lived, non-shell-interpreted `docker` invocation through `ctx.subprocess`, parses `--format json` output while skipping the CLI's plain-text warning lines, and caps collected output; the tool owns model-facing presentation and its own character caps. The browser Docker RPC domain reads containers, images, and logs only — lifecycle stays in logged tool calls.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdocker--dockerruntime"></a>

### `ctx.docker` — `DockerRuntime`

The Docker access service, registered as `ctx.docker` (one instance per context).

Selection semantics, resolved at execution time and never order-dependent:

- A configured id that is registered and `available()` → that provider.
- A configured id not registered → `DOCKER_PROVIDER_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `DOCKER_PROVIDER_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable provider → that provider.
- No id configured, several usable providers → `DOCKER_PROVIDER_AMBIGUOUS`.
- No id configured, no usable provider → `DOCKER_PROVIDER_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register one container backend.
 * @param provider - the backend to add.
 * @returns a disposer that removes it; runs with the calling fiber.
 */
registerProvider(provider: DockerProvider): () => void

/**
 * Ids of every registered backend, in registration order. Selection never
 * consults this order; it exists for diagnostics and for the UI's provider
 * display.
 * @returns the registered provider ids.
 */
providerIds(): readonly string[]

/**
 * Report whether an engine is reachable and what can be done about it. A
 * composition whose backends cannot manage an engine answers a status with
 * every capability false, never an error: the absence of the capability is
 * itself the answer a UI renders.
 * @param signal - cancellation for the underlying probe.
 * @returns the engine status.
 */
async engineStatus(signal?: AbortSignal): Promise<DockerEngineStatus>

/**
 * Start the local container runtime.
 * @param signal - cancellation for the underlying command.
 * @returns the settled status and the command output.
 * @throws {DockerError} `DOCKER_ENGINE_UNMANAGEABLE` when no backend can start one.
 */
async startEngine(signal?: AbortSignal): Promise<DockerEngineResult>

/**
 * Install a container runtime on this machine.
 * @param signal - cancellation for the underlying command.
 * @returns the settled status and the command output.
 * @throws {DockerError} `DOCKER_ENGINE_UNMANAGEABLE` when no backend can install one.
 */
async installEngine(signal?: AbortSignal): Promise<DockerEngineResult>

/**
 * List containers on the selected backend.
 * @param request - listing filters.
 * @param signal - cancellation for the engine call.
 * @returns the matching containers.
 */
async list(request: DockerListRequest = {}, signal?: AbortSignal): Promise<readonly DockerContainer[]>

/**
 * Apply one lifecycle action to a single container on the selected backend.
 * @param request - the container and the action to apply.
 * @param signal - cancellation for the engine call.
 * @returns the container's state after the action settled.
 */
async control(request: DockerControlRequest, signal?: AbortSignal): Promise<DockerContainer>

/**
 * List locally available images on the selected backend.
 * @param signal - cancellation for the engine call.
 * @returns the local images.
 */
async images(signal?: AbortSignal): Promise<readonly DockerImage[]>

/**
 * Read one container's logs from the selected backend.
 * @param request - container and range to read.
 * @param signal - cancellation for the engine call.
 * @returns the collected log text.
 */
async logs(request: DockerLogsRequest, signal?: AbortSignal): Promise<DockerLogsResult>

/**
 * Start a Compose project on the selected backend.
 * @param request - compose file, project, and service selection.
 * @param signal - cancellation for the engine call.
 * @returns the settled project state.
 */
async composeUp(request: DockerComposeRequest, signal?: AbortSignal): Promise<DockerComposeResult>

/**
 * Stop and remove a Compose project's containers on the selected backend.
 * @param request - compose file, project, and service selection.
 * @param signal - cancellation for the engine call.
 * @returns the settled project state.
 */
async composeDown(request: DockerComposeRequest, signal?: AbortSignal): Promise<DockerComposeResult>
```

Source: [`packages/docker/docker/src/index.ts:75`](../../packages/docker/docker/src/index.ts)
<!-- END GENERATED cordis-surface -->
