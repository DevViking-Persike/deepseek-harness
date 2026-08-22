# @deepseek-ai/dsh-client-ui-docker

English | [中文](README.zh.md)

Web Docker inspection feature owner: contributes one `conversation.view` entry — the **Docker** tab beside Chat and Trajectory — over the host's read-only `docker.*` RPC domain. The package defines no service and declares no Context merge; it registers one view-ring entry at `order: 20` (Chat lower, Trajectory 10) whose label follows the active locale through the `docker` namespace.

The tab lists every container the engine knows, stopped ones included: a container that just exited is what an operator opens this tab to find, so a running-only listing would hide the failure being diagnosed. Each row carries the lifecycle state word, the name, the image reference, the compose project and service when the container carries those labels, its published ports, and the engine's own status line. Clicking a row expands the container's recent log output as the host capped it, and says so when the host or the engine dropped older entries. A second listing below shows the locally available images with their tags — untagged images read as `<untagged>` — and their sizes in the largest readable unit. One Refresh control reloads both listings and the expanded log panel together.

Lifecycle control is deliberately absent. Starting, stopping, and composing containers belongs to the agent's `dsh-tool-docker` calls, where the session log records them; an unlogged button would change machine state with no session record. The RPC domain this tab reads offers no such operation, so the exclusion is enforced where the decision was made rather than by omitting buttons here.

An unreachable engine is an ordinary state, not a failure: a machine with Docker stopped, or a composition that mounts no Docker seam at all, answers `docker-unavailable`, and the tab renders one calm line explaining that no engine is reachable — no alert role, no error styling, no listing sections. Any other refusal reports its code and message instead. Every read carries an `AbortSignal`: a refresh and an unmount abort the superseded requests on the wire rather than only discarding their results.

The wire calls live in this package's `apply` closure rather than in a [`dsh-client-runtime`](../runtime/README.md) object-layer service, because the domain is stateless and read by this plugin alone — nothing here is shared across entries, subscribed to, or cached between refreshes.

## Model Experience

None, as this package renders host-read engine state for a human and touches no prompt, message, schema, stream, or tool result. The model's own view of the same containers stays with [`dsh-tool-docker`](../../docker/tool-docker/README.md).

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Listings are read-only and pull-based** — there is no engine event stream behind this tab, so a container that starts or exits after a refresh stays invisible until the next one. Live updates would need a host-side watch the `docker` RPC domain does not offer.
- **The log panel shows one container at a time** — expanding a second row collapses the first, and the panel reads the host's default tail rather than offering a line count or a follow mode.
