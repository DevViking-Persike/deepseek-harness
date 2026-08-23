# Agent Note: A started session switches agent presets in place

Status: implemented

English | [中文](2026-08-21-in-place-preset-switch-for-started-sessions.zh.md)

## Problem

A session's agent preset was fixed once a turn ran. The host answered `agent-preset-locked` for any `agentPreset.select` on a started conversation, on the theory that swapping the composition would "strand logged tool calls" — history produced under the old preset's tools replayed against an agent that can no longer make those calls.

That theory conflated two different wire facts. A provider request serializes COMPLETED tool call/result pairs as history (`tool_use`/`tool_result` for Anthropic, `function_call`/`function_call_output` for OpenAI Responses) independent of the request's current `tools` catalog; neither native adapter validates historical tool names against the current schemas. The old calls are durable evidence, not an active tool contract. What a swap actually changes is what the NEXT request assembles — the new composition's system prompt and tool schemas. The lock therefore prevented something the wire formats accept, and users had to fork a continuation (a new session, a new screen) just to change the mode their conversation ran under.

## Decision

`agentPreset.select` recomposes a started, settled conversation in place. The session, its history, its workspace attachment, and its id stay put; `presets.recompose` swaps the composition subtree (unmount-then-mount, previous composition restored on failure), and the committed swap appends `agent-preset/selected` exactly as a blank-session switch does — `resolveSessionPreset` is last-event-wins, so resume rebuilds the new composition. The header selector in the Web client calls this directly and folds the confirmed preset into the shared session summary (`noteAgentPreset`; the upsert keeps `blank` monotone and treats `agentPreset` as newest-wins).

The one remaining refusal is a turn in flight: `agent-preset-locked` while `agent.status === 'running'`. Swapping the toolset between a step's request and its tool executions would strand work that is still being produced under the old schemas; a settled conversation has no such in-flight window. Per-session switches stay serialized through the existing `presetSwitches` queue, re-reading the status inside the queue.

`session.fork`'s optional `agentPreset` (the derived-continuation path) remains for callers that want a branch: a child seeded with the source's completed transcript under a different composition, the source untouched. In-place switch and fork are now two honest options over one recompose seam rather than one real capability and one refusal.

## Alternatives considered

**Keep the blank-only lock and offer only the fork continuation.** Safe, but it changes screens and session identity for what the user experiences as "change the mode of THIS chat", and the wire-format analysis shows the stranding rationale does not hold for completed history.

**Transform the transcript on switch (strip tool calls, rebuild synthetic turns).** Would guarantee the new model never sees calls it cannot repeat, but it destroys durable evidence, breaks replay determinism, and costs a rewrite of shared surface machinery for a benefit the providers do not require.

**Block the switch on any preset whose toolset is a subset/superset of the current one.** Unenforceable in general (presets name plugins, not tool lists) and unnecessary: mixed-history-with-new-catalog is valid provider input.

## Consequences

- A failed swap still restores the previous composition; the logged `agent-preset/selected` lands only after the swap commits, so the log never claims a composition the agent does not run.
- The slash-command and skill catalogs invalidate on the forwarded `agent-preset/selected` event as before; a started-session switch now triggers the same invalidation, so `/`-menus follow the new composition.
- Historical tool calls in the visible transcript may name tools the new composition does not offer. The model can read their results but cannot repeat those calls; new requests carry only the new schemas. This is the documented trade of switching mid-conversation.
- The blank-session composer chip and the started-session header selector remain exclusive on the same `blank` bit; the header now offers the switch exactly where the old label only reported it.
- Verification: `api-proxy-agent-preset.spec.ts` pins the settled-turn switch (log resolves the new preset) and the running-turn refusal; the header-selector component and apply specs pin the in-place call, the current-preset no-op, and the summary fold; `api-proxy-fork.spec.ts` still pins the fork path beside it.
