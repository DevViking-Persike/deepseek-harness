# @deepseek-ai/dsh-docker

English | [中文](README.zh.md)

The **`DockerRuntime`** (`ctx.docker`) defines WHAT container access the harness has — inspect containers and images, read one container's logs, run a Compose project's lifecycle — over multiple backends, without binding the model contract to one engine's API.

This package owns the Service Definition role of the Docker capability seam:

| Package | Role |
|---|---|
| `@deepseek-ai/dsh-docker` (this) | Service Definition: the service, the provider registry, selection policy, the request/result vocabulary, the `DockerError` taxonomy |
| `@deepseek-ai/dsh-docker-local` | Provider: the local `docker` CLI driven through `ctx.subprocess` |
| `@deepseek-ai/dsh-tool-docker` | Consumer: the model-facing `docker_ps` / `docker_images` / `docker_logs` / `docker_compose_*` tool schemas over `ctx.docker` |

Inspection, image listing, log reads, and Compose lifecycle share one seam because they share one engine connection, one selection decision, and one error taxonomy; their request and result types stay separate.

## Service API (`ctx.docker`)

| Member | Semantics |
|---|---|
| `registerProvider(provider)` | Register a backend. Throws `DockerError` `DOCKER_PROVIDER_DUPLICATE` on a duplicate id. Returns a disposer; the registration is torn down with the calling fiber. |
| `providerIds()` | The registered ids in registration order, for diagnostics and provider display. Selection never consults this order. |
| `list(request?, signal?)` | List containers on the selected backend; `all` includes non-running containers and `project` restricts to one Compose project label. |
| `images(signal?)` | List locally available images on the selected backend. |
| `logs(request, signal?)` | Read one container's trailing log text. There is no follow mode: a streaming subscription is a different lifecycle with its own cancellation and backpressure. |
| `composeUp(request, signal?)` | Start a Compose project and return its settled containers. |
| `composeDown(request, signal?)` | Stop and remove a Compose project's containers. |

Providers register a **backend**, not tools. `dsh-tool-docker` is the only owner of model-facing names, descriptions, prompt guidance, JSON schemas, and presentation.

## Selection

Selection never depends on registration, config, or HMR order. A deployment either pins a provider id (config `provider`, or the `$DSH_DOCKER_PROVIDER` operational override feeding the same field) or lets a single usable provider auto-select. Every call resolves the provider first, and availability is re-probed on each one, so a daemon that stopped between calls fails selection rather than the operation:

| Situation | Execution |
|---|---|
| configured id registered and `available()` | runs that provider |
| configured id not registered | `DOCKER_PROVIDER_CONFIGURED_MISSING` |
| configured id registered but unavailable | `DOCKER_PROVIDER_CONFIGURED_UNAVAILABLE` |
| no id, exactly one registered usable provider | runs it |
| no id, no usable provider | `DOCKER_PROVIDER_UNAVAILABLE` |
| no id, several usable providers | `DOCKER_PROVIDER_AMBIGUOUS` |

Each failure branch throws `DockerError`, whose structured code (plus message detail — the missing id, the ambiguous candidate set) is what direct callers route on. A provider's `available()` answers whether its engine can be reached right now; a provider whose daemon is down is skipped during selection rather than chosen and failed. `dsh-tool-docker` never calls it — the tool executes through `ctx.docker` and routes on the thrown codes, so provider selection has one owner.

## Vocabulary

`DockerListRequest` (`all?`, `project?`) → `DockerContainer[]` (`id`, `name`, `image`, `state`, `status`, optional `project`/`service`, `ports[]`, `createdAt`). `DockerContainerState` is a CLOSED union (`created` | `running` | `paused` | `restarting` | `exited` | `dead`) that consumers switch over exhaustively; a backend reporting a state outside the set maps it to the closest member rather than widening the union. `DockerLogsRequest` (`container`, `tail?`, `since?`) → `DockerLogsResult` (`container`, `content`, `truncated`), where `content` interleaves the container's stdout and stderr oldest first. `DockerComposeRequest` (`file`, `project?`, `services?`) → `DockerComposeResult` (`project`, capped `output`, settled `containers[]`); a relative `file` resolves against the provider's configured project root. Cancellation is a direct optional `AbortSignal` argument on every operation. See `src/types.ts` for the full contracts and the `DockerError` code taxonomy.

`DockerError` carries an open-string `code`, so consumers tolerate provider-specific values: the seam raises the five selection and registration codes above, and providers add engine-level codes such as `DOCKER_ENGINE_FAILED`, `DOCKER_NOT_FOUND`, and `DOCKER_INVALID_REQUEST`.

## Model Experience

Indirectly, through `dsh-tool-docker`, which renders bounded container, image, log, and Compose data or retains the structured `DockerError` code as a tool error while this registry contributes no prompt or schema itself.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **No follow mode and no observation surface** — `logs()` returns one bounded batch, and there is no provider-change event or capability-status query; availability is observed only by executing an operation and routing the thrown `DockerError` codes.
- **`composeDown` ignores `services`** — `DockerComposeRequest` carries the field for `composeUp`, but a teardown removes a project's containers wholesale, so a backend never filters a `down` by service ([seam Agent Note](../../../.agents/notes/implemented/architecture/2026-08-21-docker-capability-seam.md)).
- **The seam has no single-container lifecycle** — there is no start, stop, restart, exec, pull, or prune; container lifecycle stays deferred behind the Compose-project operations that the model already reasons about.
- **`DockerImage.size` is only as precise as the backend reports** — the seam declares bytes, and a backend that publishes no machine-readable size reports a value derived from its own display string.
