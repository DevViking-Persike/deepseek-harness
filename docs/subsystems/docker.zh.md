# Docker 访问

[English](docker.md) | 中文

Docker 访问 seam——一个[能力 seam](../../.agents/notes/implemented/architecture/2026-08-21-docker-capability-seam.md)，在同一个 `ctx.docker` 服务上跨越容器查看、镜像列举、日志读取与 Compose 生命周期，并拆分到多个包：Service Definition（[dsh-docker](../../packages/docker/docker)，`ctx.docker` 与提供方注册表）、Service Provider（[dsh-docker-local](../../packages/docker/docker-local)，在 `ctx.subprocess` 之上驱动本地 `docker` CLI）与 Consumer（[dsh-tool-docker](../../packages/docker/tool-docker)，`docker_ps`／`docker_images`／`docker_logs`／`docker_compose_*` 工具 schema）。Docker 是**一项可选能力**，不属于 agent-loop（智能体循环）主干，因此其词汇归属此页而非 [core.md](core.md)。更换后端不会改变模型询问容器的方式。

来源：[`packages/docker/docker/src/types.ts`](../../packages/docker/docker/src/types.ts)

## 为什么四种操作属于一项能力

容器、镜像、日志与 Compose 项目通过同一条连接访问同一个引擎，并在引擎不可达时以完全相同的方式失败，因此它们共享一个提供方选择策略归属方、一套中止／错误词汇，以及一个面向产品的「该 harness 如何访问 Docker」配置接口。它们的请求与结果类型保持独立。提供方注册的是**后端**（`DockerProvider`）而非工具；面向模型的名称、schema、提示词指引与呈现全部归属唯一的消费方 `dsh-tool-docker`。

## 容器

`DockerContainerState` 是封闭联合：消费方对其进行穷尽 `switch`，后端报告集合之外的状态词时会映射到最接近的成员，而非扩展该联合，因此更新的引擎词汇不会以未知字符串的形式静默抵达消费方。

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

## 镜像

`size` 声明单位为字节，但引擎不公开机器可读尺寸的后端会由四舍五入后的展示字符串推导该值；请视其为近似值。

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

## 日志读取

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

## Compose 生命周期

`services` 选择 `composeUp` 启动哪些服务。拆除会整体删除项目的容器，因此 `composeDown` 忽略该字段。

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

## 提供方可用性

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

与 [web seam](web.md) 的 `available()` 属于本地凭据检查不同，这里的 `available()` 会询问引擎，因此在每次调用时重新探测：Docker 守护进程会在一次普通会话期间启动和停止，缓存结论会把操作路由到一个已经消失的后端。

选择绝不依赖注册、配置或 HMR（热模块替换）顺序：已配置的提供方 id（配置 `provider`，或由 `$DSH_DOCKER_PROVIDER` 提供相同字段）必须已注册且可用，否则恰好一个可用提供方自动选择；存在多个可用提供方而未配置 id 时为 `DOCKER_PROVIDER_AMBIGUOUS`，而非先到先得。

## 错误

`DockerError extends HarnessError`（[core.md](core.md) 错误分类体系）携带开放的 `code: string` 而非封闭联合：提供方可以在不修改 `dsh-docker` 的前提下抛出自有 code，消费方必须容忍未知 code。seam 抛出 `DOCKER_PROVIDER_UNAVAILABLE`、`DOCKER_PROVIDER_AMBIGUOUS`、`DOCKER_PROVIDER_CONFIGURED_MISSING`、`DOCKER_PROVIDER_CONFIGURED_UNAVAILABLE` 以及注册期的 `DOCKER_PROVIDER_DUPLICATE`。提供方另外补充引擎层 code：`dsh-docker-local` 在启动失败、调用超时或未分类的非零退出时抛出 `DOCKER_ENGINE_FAILED`，在 CLI 消息指明对象缺失时抛出 `DOCKER_NOT_FOUND`，在日志 tail 非正或 compose 文件路径为空时抛出 `DOCKER_INVALID_REQUEST`。工具执行会在结构化错误元数据中公开该 code。

## 该服务

`DockerRuntime` 注册后端，以 `DOCKER_PROVIDER_DUPLICATE` 拒绝重复 id，并在执行时解析提供方，失败时给出结构化选择错误。本地后端通过 `ctx.subprocess` 把每项操作执行为一次短暂且不经 shell 解释的 `docker` 调用，解析 `--format json` 输出并跳过 CLI 的纯文本警告行，同时限制收集输出；工具负责面向模型的呈现与自身的字符上限。浏览器 Docker RPC 域只读取容器、镜像与日志——生命周期留在已记录的工具调用中。

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
