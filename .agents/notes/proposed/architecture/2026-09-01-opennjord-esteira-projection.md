# OpenNjord Treadmill: harness-owned installation projected over full Harness sessions

## Status

Proposed.

## Context

The OpenNjord method (skills, rules, commands, agents, tools) used to be installed into every project under `.opennjord/`, with `.claude/` and `.codex/` symlink bridges. Projects keep the authoritative execution cursor in `.spec/esteira-state.yaml`. The `esteira-skills` repository defines the method in each `SKILL.md`; its `pipeline-contract.yaml` is a lint fixture for ordering, artifacts, verdicts, and human stops rather than a runtime state store.

The Harness already owns full-capability Sessions, per-step provider and model headers, provider-reported token usage, durable tool calls, continuation, cancellation, presets, and browser conversation views. A second agent runtime or a second writable pipeline state machine would diverge from those authorities and would reduce the tools available to an Esteira stage.

## Decision

The Esteira capability projects project files and ordinary Harness Sessions instead of replacing either one.

The harness owns the installation. `@deepseek-ai/dsh-treadmill` vendors the complete `.opennjord` tree, seeds an editable copy under `<dshHome>/treadmill`, registers its `skills` and `commands` directories as one global-layer filesystem Skill provider, contributes one per-agent prompt section with the rules index and tool paths, reads the stage table from `esteira/pipeline.yaml`, exposes the files through the `treadmill.*` RPC domain so the Knowledge section edits them in place, and honours the `treadmill.enabled` user setting, so every project sees `/discovery`, `/arquitetura`, `/desenvolvimento`, `/review-codigo-subagents`, `/qa`, `/qa-rpa`, `/seguranca`, `/redteam`, `/deploy`, and `/scaffold-spec` without a project copy. A project owns only `.spec/` (cursor, discovery, sprints, tasks, evidence) and `docs/adrs/`. Project `.dsh/skills` and `.agents/skills` still outrank the bundled copy, so a local override remains possible. OpenNjord Skills augment the selected Agent preset; they do not define a restricted preset.

`.spec/esteira-state.yaml` remains the only cursor that decides the next stage. The Host parses a bounded current-state view and observes canonical artifact homes. The UI never maintains a competing stage status or advances the cursor through an unlogged RPC mutation.

Starting, retrying, or approving work submits an explicit Skill prompt to a normal Session rooted at the project. The Session uses its selected Agent preset without tool filtering. The durable log records model-visible instructions, provider/model changes, output, tool calls, usage, cancellation, and human interaction.

The browser contributes one `conversation.view` entry ordered after Docker, laid out like the Njord orchestrator route: a numbered graph of the twelve canonical stages with status badges and a progress bar, a panel for the selected stage (Skill command, gate, attempt, verdict, output directories, run action), and bands for the sprint backlog, Session usage, and model activity. A project without a cursor gets one install action that submits `/scaffold-spec criar` constrained to `.spec/` and `docs/adrs/`. Views derive stage status from the cursor and the Session only.

Usage reports provider token fields exactly as recorded. Monetary cost requires a versioned price record for the exact provider and model. An absent price produces an unavailable cost, never an estimate presented as billing fact.

## Consequences

Editing the stage table changes every project's Treadmill at once without touching any project's cursor, because a cursor stores only the current stage id; a stage removed while current is reported, not lost. Disabling the Treadmill removes its skills and prompt section everywhere in one switch. Session replay explains what each model saw, produced, and invoked. Cursor recovery remains compatible with command-line and Njord execution because all clients read the same project file.

The first implementation needs a Host Service Definition and filesystem Provider, API consumer, Client plugin, REAL-composition test, and keyless UI snapshot. A later executor may automate cursor transitions only by applying the same validated file transaction and receipt rules used by the installed Esteira; it must not infer transitions from UI state.
