# @deepseek-ai/dsh-tool-docker

English | [中文](README.zh.md)

The model-facing Docker tool suite — `docker_ps`, `docker_images`, `docker_logs`, `docker_compose_up`, and `docker_compose_down` — over the [Docker capability seam](../docker/README.md) (`ctx.docker`). It owns model-facing concerns only: tool names, JSON schemas, argument validation, prompt sections, output character caps, result formatting, and the UI presentation projection — a `card: 'generic'` call view for the reads and a `card: 'terminal'` call and result view for the Compose lifecycle. All engine access goes through `ctx.docker`; this package never imports a concrete provider. No tool exposes a model-facing timeout: each tool's cooperative tool-call budget is declared here via config (`inspectTimeoutMs`/`composeTimeoutMs`, attached as `ToolDefinition.timeoutMs`) and enforced by [`@deepseek-ai/dsh-tool-call-timeout-policy`](../../guard/timeout-policy/README.md).

The two groups register independently. The read-only group is enabled by default; the Compose group is not, because starting and stopping containers changes machine state and a read-only Docker view is useful on its own. Each group contributes its own prompt section, so a composition that enables only reads never tells the model about lifecycle tools.

## Tools

| Tool | Args | Behavior |
|---|---|---|
| `docker_ps` | `all` (boolean), `project` (string) | Lists containers; running only unless `all` is true, optionally restricted to one Compose project. Absent arguments are omitted from the seam request rather than sent as explicit `undefined`. |
| `docker_images` | none | Lists locally available images. Repeated rows for one image id arrive collapsed into one entry carrying every tag. |
| `docker_logs` | `container` (required string), `tail` (number), `since` (string) | Reads one container's trailing log text. Output is capped at `maxLogChars`, keeping the newest characters. |
| `docker_compose_up` | `file` (required string), `project` (string), `services` (string[]) | Starts a Compose project and waits for its containers to become ready. Duplicate service names collapse to first-occurrence order. |
| `docker_compose_down` | `file` (required string), `project` (string) | Stops and removes a Compose project's containers. |

The three reads opt into concurrent scheduling because they do not mutate parent-agent state. Both Compose tools declare themselves concurrency-unsafe: Compose mutates machine state, and concurrent lifecycle calls on one project race inside the engine.

Each tool's JSON output value is the structured projection of the seam result — plain mutable JSON rows, with each absent optional container field omitted — and the text the model reads is rendered from that value, so UI presentation and future adapters never scrape rendered text.

## Config

| Key | Default | Meaning |
|---|---|---|
| `inspect` | `true` | Register `docker_ps`, `docker_images`, and `docker_logs`. |
| `compose` | `false` | Register `docker_compose_up` and `docker_compose_down`. Starting and stopping containers is a deployment decision, so opting in is explicit. |
| `inspectTimeoutMs` | `30000` | Cooperative tool-call timeout budget (ms) for one read. |
| `composeTimeoutMs` | `600000` | Cooperative tool-call timeout budget (ms) for one Compose lifecycle call. |
| `maxLogChars` | `40000` | Cap on characters one `docker_logs` call emits; the configured value appears verbatim in the tool description. |
| `maxComposeOutputChars` | `40000` | Cap on backend-output characters one Compose call emits. |

Every numeric field must be a positive integer; an invalid value throws at load rather than at the first call. Both caps keep the newest characters, because a log tail and a Compose progress tail are what explain a failure that just happened.

```yaml
- id: tool-docker
  name: '@deepseek-ai/dsh-tool-docker'
  config:
    inspect: true
    compose: false
```

## Stable registration

Tool registration follows product **enablement**, not backend availability. An enabled tool stays visible when no provider is registered, the configured provider is missing, several providers are usable, or the daemon is down; the seam resolves the provider at execution time and execution fails with a structured `DockerError` (`DOCKER_PROVIDER_UNAVAILABLE`, `DOCKER_PROVIDER_AMBIGUOUS`, and the rest of the taxonomy), which `ToolRuntime.execute()` turns into an error tool result the model can read and hooks/UI can route on. Registering the Docker seam and a backend therefore costs nothing on a machine without Docker. To remove a Docker tool entirely, disable its group here in config.

The tool never calls a provider's `available()` and never enumerates providers — its only execution path is `ctx.docker`, so provider selection stays entirely inside the seam.

## Model Experience

### System prompt

#### What the model sees

Each enabled group contributes one section: the read-only group at order 112 and the Compose group at order 113. A scoped tool restriction does not remove these independently registered sections.

##### Read-only Docker guidance

```markdown
Use docker_ps to see which containers exist and whether they are running, docker_images to see locally available images, and docker_logs to read a container's recent output when diagnosing a failure. These tools only observe; they never start or stop anything.
```

##### Compose lifecycle guidance

```markdown
Use docker_compose_up to start a Compose project and docker_compose_down to stop and remove its containers. These tools change machine state: name the compose file the user asked about, and confirm with docker_ps rather than assuming the result.
```

#### Token effect

Fixed guidance cost per request for each config-enabled group, even when a restriction hides its schemas. Enabling Compose adds its section; disabling reads removes theirs.

#### KV Cache effect

Prefix-stable while enabled groups, scope, and guidance text are unchanged. Config enablement or plugin lifecycle may invalidate reuse from the first changed prompt section; scoped schema restrictions do not remove it.

### Tool schemas

#### What the model sees

The model sees the generated [`docker_ps`, `docker_images`, `docker_logs`, `docker_compose_up`, and `docker_compose_down` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-docker). The `docker_logs` description states the configured `maxLogChars`. Timeout budgets and output caps are otherwise deployment settings, not model arguments.

#### Token effect

Fixed schema cost per request for the enabled groups at a resolved `maxLogChars`; config disablement removes both schemas and guidance, while a scoped restriction removes only the schemas.

#### KV Cache effect

Prefix-stable while definitions, resolved log cap, and visibility are unchanged. Config enablement, changing `maxLogChars`, plugin lifecycle, or scoped restrictions may invalidate reuse from the first changed schema token.

### Container and image listings

#### What the model sees

`docker_ps` renders one line per container shaped `<name>[ [<project>/<service>]] <state> (<status>) image=<image>[ ports=<mapping> …]`, with the Compose scope and port suffix omitted when unlabeled or unpublished, and `No containers matched.` for an empty listing. `docker_images` renders one line per image shaped `<tag> … <size> id=<id>`, where an image with no tag reads `<untagged>` and the size is rendered in the units `docker images` uses, and `No images found.` for an empty listing.

#### Token effect

Data-dependent and proportional to the number of containers or images on the host; neither listing is capped, and both results are resent until compaction.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Log reads

#### What the model sees

A log read returns the container's interleaved stdout and stderr, oldest first, bounded to the newest `maxLogChars` characters. An empty range reads exactly `The container produced no log output in this range.` A result the provider or the cap truncated is prefixed with `(older entries dropped)` on its own line.

#### Token effect

Bounded by `maxLogChars` per call and resent until compaction; `tail` and `since` narrow the range the model pays for.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Compose results

#### What the model sees

A settled Compose call leads with `Project <name> settled.` — `Project settled.` when the backend reported no project name — then one line per remaining container shaped `- <name> <state>[ (<ports>)]`, or `No containers remain.` after a teardown. Non-empty backend output follows after a blank line, bounded to its newest `maxComposeOutputChars` characters.

#### Token effect

Data-dependent project state plus backend output capped at `maxComposeOutputChars`, resent until compaction; zero when the Compose group is disabled.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Argument and engine errors

#### What the model sees

Value errors become exactly `Error: container must be a non-empty string`, `Error: tail must be a positive integer`, `Error: file must be a non-empty compose file path`, `Error: services must contain at least one service when provided`, or `Error: each service must be a non-empty string`. An unreachable, missing, or ambiguous backend, and an engine failure, reach the model as the seam's or provider's `DockerError` message with its structured code in error metadata.

#### Token effect

Only the failing call adds these retained tokens.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **`docker_compose_down` takes no `services`** — a teardown removes a project's containers wholesale, so the schema omits the field and any value the model supplies never reaches the seam.
- **Listings are uncapped** — `maxLogChars` and `maxComposeOutputChars` bound log and Compose output, but a host with hundreds of containers or images renders every row, so a deployment that needs a bound restricts by `project` or disables the read group.
- **No Docker-specific permission policy** — every tool, including the state-changing Compose pair, executes without requesting `ctx.approval`; a deployment that needs confirmation adds a `tools/pre-execute` policy.
- **No single-container lifecycle tools** — the model can start and stop a Compose project but cannot start, stop, restart, or exec into one container, because [the seam](../docker/README.md) exposes no such operation.
