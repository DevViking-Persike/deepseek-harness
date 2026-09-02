# OpenNjord Esteira projection over full Harness sessions

## Status

Proposed.

## Context

Projects may install development disciplines under `.opennjord/skills` and keep the authoritative execution cursor in `.spec/esteira-state.yaml`. The `esteira-skills` repository defines the method in each `SKILL.md`; its `pipeline-contract.yaml` is a lint fixture for ordering, artifacts, verdicts, and human stops rather than a runtime state store.

The Harness already owns full-capability Sessions, per-step provider and model headers, provider-reported token usage, durable tool calls, continuation, cancellation, presets, and browser conversation views. A second agent runtime or a second writable pipeline state machine would diverge from those authorities and would reduce the tools available to an Esteira stage.

## Decision

The Esteira capability projects project files and ordinary Harness Sessions instead of replacing either one.

The filesystem Skill provider discovers `<project>/.opennjord/skills` after the higher-priority project `.dsh/skills` and `.agents/skills` roots and before user roots. OpenNjord Skills therefore augment the selected Agent preset; they do not define a restricted preset.

`.spec/esteira-state.yaml` remains the only cursor that decides the next stage. The Host parses a bounded current-state view and observes canonical artifact homes. The UI never maintains a competing stage status or advances the cursor through an unlogged RPC mutation.

Starting, retrying, or approving work submits an explicit Skill prompt to a normal Session rooted at the project. The Session uses its selected Agent preset without tool filtering. The durable log records model-visible instructions, provider/model changes, output, tool calls, usage, cancellation, and human interaction.

The browser contributes one `conversation.view` entry ordered after Docker. Its internal routes are Overview, Stages, Runs, Usage, Models, Artifacts, and Configuration. Views derive stage execution from the cursor, project artifacts, and linked Sessions.

Usage reports provider token fields exactly as recorded. Monetary cost requires a versioned price record for the exact provider and model. An absent price produces an unavailable cost, never an estimate presented as billing fact.

## Consequences

A project can install or update OpenNjord Skills independently while the Harness retains its normal Skills and tools. Session replay explains what each model saw, produced, and invoked. Cursor recovery remains compatible with command-line and Njord execution because all clients read the same project file.

The first implementation needs a Host Service Definition and filesystem Provider, API consumer, Client plugin, REAL-composition test, and keyless UI snapshot. A later executor may automate cursor transitions only by applying the same validated file transaction and receipt rules used by the installed Esteira; it must not infer transitions from UI state.
