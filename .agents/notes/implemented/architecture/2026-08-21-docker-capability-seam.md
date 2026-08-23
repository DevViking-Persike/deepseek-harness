# Agent Note: Docker capability seam over the local CLI

Status: implemented

English | [中文](2026-08-21-docker-capability-seam.zh.md)

## Problem

Agent work on a developer machine constantly involves containers: a service the task depends on is down, a Compose project needs to come up before an integration test, a failure is only explicable from one container's log tail. Without a container capability the model reaches those facts through `bash`, where every invocation is an unstructured command whose output the model must parse, whose arguments the harness cannot bound, and whose result no UI can render as anything but terminal text.

Containers, images, logs, and Compose projects reach one engine over one connection, and every one of them fails the same way when that engine is unreachable. Putting them behind separate services would duplicate one selection decision and one error taxonomy; putting them directly in a tool package would make the model-facing schemas own engine access, argument mapping, output parsing, and provider selection at once.

The browser client also wants to show what is running. That surface is a read, but a Docker domain that exposed lifecycle would let a button change machine state with no session record of who changed it or why.

## Decision

Container access is a capability seam following [the capability-seam Agent Note](2026-06-13-capability-seams.md):

1. `@deepseek-ai/dsh-docker` (`packages/docker/docker`) owns `ctx.docker`, the provider registry, provider selection, the shared request/result vocabulary, and `DockerError`.
2. `@deepseek-ai/dsh-docker-local` (`packages/docker/docker-local`) implements the backend by driving the local `docker` CLI through `ctx.subprocess`, and registers it with `ctx.docker`.
3. `@deepseek-ai/dsh-tool-docker` (`packages/docker/tool-docker`) owns the model-facing `docker_ps`, `docker_images`, `docker_logs`, `docker_compose_up`, and `docker_compose_down` schemas, argument validation, prompt sections, output caps, result formatting, and presentation over `ctx.docker`.

Selection matches the [web seam](2026-06-24-web-capability-seam.md) rule and never depends on registration order: a configured provider id must be registered and available, otherwise exactly one usable provider auto-selects; zero usable providers is `DOCKER_PROVIDER_UNAVAILABLE` and several is `DOCKER_PROVIDER_AMBIGUOUS`. Availability is re-probed on every call rather than cached, because a Docker daemon starts and stops during an ordinary session and a cached "usable" answer would send the operation to a backend that is already gone. The probe is one `docker info` call, so its cost is the same order as the operation it precedes.

Inspection, image listing, log reads, and Compose lifecycle are one seam because they share the engine connection, the selection decision, and the error taxonomy; their request and result types stay separate, and `DockerContainerState` is a closed union that consumers switch over exhaustively.

### The local CLI is the backend

`docker-local` executes `docker` as a fixed argv through `ctx.subprocess`, never a shell string, and parses `--format json` output. Two facts pick the CLI over the Engine API socket.

Compose is a CLI-only capability. Reimplementing project orchestration over the raw HTTP API means reimplementing dependency order, network and volume creation, health-check waiting, and teardown — duplicating the one component that already owns them, and diverging from it on every Compose release.

The CLI needs no desktop application. It talks to whatever engine its own environment points at, so a machine running Docker Engine, Colima, OrbStack, or Rancher Desktop is served by the same provider without the harness modelling any of them. `available()` runs `docker info` rather than `docker version`, because the client-only `version` succeeds while the daemon is down.

The parser tolerates what the CLI actually emits: a stdout line that is not a JSON object is a plain-text warning (context deprecation, credential-helper notices) and is skipped rather than voiding the listing, and an engine state word outside the closed union reads as `dead` rather than widening it. `docker images --format json` publishes no machine-readable size, so the provider parses the display string (`1.09GB`) into decimal bytes and reports `0` when it cannot; a display-only field must not fail a listing.

### The browser Docker domain is read-only

`packages/host/apiproxy/src/api/docker.ts` declares `listContainers`, `listImages`, and `logs`, and nothing else. Lifecycle stays out by design: **model-visible ⟺ logged**, and starting or stopping containers from a UI button would change machine state with no session event recording it. Routing lifecycle through the agent's tools keeps every such change reconstructable from the session log as a `tool/call` with its arguments and result. When no Docker seam is mounted or no backend reaches an engine, the domain answers `docker-unavailable`, which the client shows as an empty state rather than an error.

### Read-only tools ship on, Compose tools are opt-in

`tool-docker` registers its two groups independently: `inspect` defaults to true and `compose` defaults to false, and the shipped `packages/bundle/base/cordis.patch.yml` states both explicitly. Reads observe; they cannot damage a machine, and their value does not depend on a deployment's opinion. The Compose pair changes machine state on a host the deployment owns, so enabling it is a deployment decision rather than a default. Each group contributes its own prompt section, so a read-only composition never tells the model about tools it does not have.

Registration follows enablement, not availability. An enabled tool stays visible when no backend is registered or the daemon is down, and execution fails with the structured `DockerError`, so plugin load order, engine state, and HMR timing never enter the model-facing schema. Registering the seam and the local provider therefore costs nothing on a machine without Docker.

## Alternatives considered

**Let the model use `bash` for Docker.** Rejected. The model would parse unbounded CLI text, the harness could not cap log or Compose output, arguments would be shell-interpreted, and no UI could render the result as anything but a terminal card. The tools also let a deployment ship reads without shipping lifecycle, which a shell tool cannot express.

**Drive the Engine API socket instead of the CLI.** Tempting because it gives structured JSON with real byte sizes and needs no `docker` binary on PATH. Rejected because Compose is not in that API: the project lifecycle the model most needs would have to be reimplemented against `docker compose`'s own semantics. The cost is paying for CLI text parsing and losing exact image sizes.

**Separate `ctx.containers` and `ctx.compose` seams.** Rejected for the reason the web seam kept search and fetch together: the provider registry, order-independent selection, abort propagation, and the error taxonomy are shared machinery that would be duplicated across two near-identical seams, and a deployment would have two things to configure for one engine.

**Cache provider availability.** Rejected. A Docker daemon stops and starts during a session, so a cached answer routes an operation to a backend that is already unreachable, turning a clean selection error into an engine failure mid-operation.

**Expose container lifecycle on the seam (start, stop, restart, exec, pull).** Deferred rather than rejected. The Compose-project operations cover the cases the model reasons about today; single-container verbs are a larger model-facing contract with their own permission questions, and adding them later is additive.

**Expose lifecycle in the browser RPC domain.** Rejected. An unlogged button changing machine state breaks the reconstructability the session log guarantees, and the same operation already exists as a logged tool call.

**Ship the Compose tools enabled by default.** Rejected. `docker compose down` removes a project's containers on the user's machine; a default that can do that without the deployment saying so is the wrong side of the safe-default line.

## Testing

Each layer is pinned at its own boundary. `dsh-docker` covers registration, disposal with the registering fiber, every selection branch including per-call re-probing, and forwarding with the cancellation signal. `docker-local` covers CLI argument construction (the `--` log terminator, project filters, the configured project root), JSON-lines parsing with interleaved warnings, unknown state words, image-id collapsing, availability from `docker info`, not-found versus engine-failure classification, and the absent `down` service filter, all over a scripted `ctx.subprocess`. `tool-docker` covers group-driven registration, load-time config validation, disposal, concurrency-safety declarations, formatting, output caps, argument validation, and a structured engine error reaching the model while the tool stays registered — through the real tool registry and a real `ctx.docker`.

## Consequences

**Image sizes are approximate.** They come from the CLI's rounded display string in decimal units; a caller that needs exact bytes cannot get them from this backend.

**`composeDown` ignores `services`.** `DockerComposeRequest` carries the field for `composeUp`, but the CLI's `down` removes a project wholesale, so both the provider and the `docker_compose_down` schema drop it.

**Listings are unbounded.** Log and Compose output are capped, but a host with hundreds of containers or images renders every row into model context; a deployment that needs a bound restricts by project or disables the read group.

**No Docker-specific permission policy.** Every tool, including the state-changing pair, executes without `ctx.approval`; a deployment that wants confirmation adds a `tools/pre-execute` policy.

**Remote engines are the CLI's business.** The provider models no host, TLS material, or context selection of its own, so reaching a remote engine means configuring the CLI's environment rather than the plugin.
