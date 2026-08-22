# @deepseek-ai/dsh-docker-local

English | [中文](README.zh.md)

The local `docker` CLI `DockerProvider` for the harness [Docker capability seam](../docker/README.md) (`ctx.docker`). It lists containers and images, reads container logs, and runs Compose project lifecycle by executing the CLI through `ctx.subprocess`.

This is an **implementation** package: it registers a provider into `ctx.docker`, it does not own the key and it does not register a model-facing tool. It is a function/namespace plugin (`inject: ['docker', 'subprocess']`).

The CLI is the backend rather than the Engine API socket because Compose is a CLI-only capability: reimplementing project orchestration over raw HTTP would duplicate the one component that already owns dependency order, network creation, and teardown.

## Responsibility split

The provider owns **engine access**: CLI invocation, argument construction, output parsing, per-invocation timeouts, byte caps, and `DockerError` classification. `@deepseek-ai/dsh-tool-docker` owns **presentation** — model-facing schemas, argument validation, output character caps, and rendering. Provider selection stays in the seam.

Every operation is one short-lived, non-shell-interpreted `docker` invocation: arguments reach the executable as a fixed argv, so a container name or compose path can never be interpreted as a flag or a shell fragment. A log read passes the container after a `--` terminator, so a name that begins with a dash reaches the CLI as an operand.

`available()` runs `docker info` — the cheapest call that fails when the daemon is down, since the client-only `version` succeeds without a reachable engine — and reports false rather than throwing, so an unreachable daemon is a selection fact the seam turns into its own error. The provider works without any Docker desktop application running; a reachable daemon is the only requirement.

## Failure classification

The CLI exits non-zero for every failure, so the provider reads its message: text naming a missing object (`No such`, `not found`, `no configuration file`) becomes `DOCKER_NOT_FOUND`, and every other non-zero exit becomes `DOCKER_ENGINE_FAILED`. A failure to launch the executable and an elapsed invocation timeout are also `DOCKER_ENGINE_FAILED`. A non-positive log `tail` and an empty compose file path are rejected before any process starts, as `DOCKER_INVALID_REQUEST`.

## Parsing

Listings run `--format json`, and a stdout line that is not a JSON object is skipped: `docker` interleaves plain-text warnings such as context deprecation and credential-helper notices with its rows, and a warning must not void an otherwise valid listing. Compose project and service names are read from the `com.docker.compose.project` and `com.docker.compose.service` labels of the `Labels` column. An engine state word outside `DockerContainerState` reads as `dead` rather than widening the seam's closed union. Image rows repeat one id per `repository:tag`, so the provider collapses them into one image carrying every tag; `<none>` repository and tag values produce an untagged image.

`composeUp` runs `up --detach --wait`, so the call settles on running or healthy containers rather than the CLI's detach acknowledgement, and the returned containers are the real settled state. `composeDown` runs `down` with no service filter.

## Config

| Key | Default | Meaning |
|---|---|---|
| `cli` | `docker` | Executable name or absolute path of the Docker CLI. |
| `projectRoot` | the harness process cwd | Working directory for invocations, and the root a relative compose path resolves against. |
| `inspectTimeoutMs` | `30_000` | Cooperative timeout for one inspection call (`available`, `list`, `images`, `logs`). |
| `composeTimeoutMs` | `600_000` | Cooperative timeout for one Compose lifecycle call; pulling images and waiting for health checks routinely outlasts an inspection call by an order of magnitude. |
| `maxOutputBytes` | `2_000_000` | Cap on collected output bytes of one invocation; a log read that hits it reports `truncated`. |
| `graceMs` | `5_000` | Termination grace period handed to the subprocess seam. |
| `defaultLogTail` | `200` | Trailing log lines used when a request states no `tail`. |

Every numeric field must be a positive integer and `cli` must be non-empty; an invalid value throws at load rather than silently constructing a provider with nonsensical limits. An unreachable daemon does not fail load, because availability is a per-call fact the seam probes during selection.

```yaml
- id: docker-local
  name: '@deepseek-ai/dsh-docker-local'
```

## Model Experience

Indirectly, through [`dsh-tool-docker`](../tool-docker/README.md), which renders this provider's parsed container, image, log, and Compose output under its own character caps and retains provider failures while CLI arguments, warning lines, and process mechanics remain hidden.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Image sizes come from the CLI's display string** — `docker images --format json` exposes no machine-readable size, so `1.09GB`-style text is parsed into bytes with decimal (not binary) units and an unparseable value reads as `0` rather than failing the listing.
- **The provider drives only the local CLI** — there is no remote engine host, TLS connection, or `DOCKER_HOST` context selection of its own; the CLI's own environment decides which engine it reaches.
- **`composeDown` never filters by service** — the CLI's `down` removes a project's containers wholesale and rejects a service filter, so the seam's `services` selection cannot reach it.
- **Log reads are batch-only** — `--follow` is never passed, so a caller gets one bounded tail per call, and `maxOutputBytes` drops the oldest bytes when the window overflows.
