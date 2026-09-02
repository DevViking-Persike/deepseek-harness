# `@deepseek-ai/dsh-treadmill`

This host plugin owns the OpenNjord Treadmill installation. It vendors the complete `.opennjord` tree under `assets/opennjord` (`skills`, `rules`, `commands`, `agents`, `integrations`, `tools`, and the stage table `esteira/pipeline.yaml`), seeds an editable copy into `<dshHome>/treadmill` on first use (adding new top-level entries on later boots, never overwriting an edit), and serves that copy: `skills` and `commands` become one filesystem Skill provider named `treadmill` for every project, the rules index and tool paths become one system-prompt section per agent, and the `ctx.treadmill` service reads and writes the files so the Knowledge section can edit them in place.

A project keeps no `.opennjord`, `.claude`, or `.codex` copy and no symlink bridge. It owns only its execution state and decisions: `.spec/` (cursor `esteira-state.yaml`, discovery, sprints, tasks, QA and security evidence) and `docs/adrs/`. `/scaffold-spec` creates that pair; the harness supplies `/discovery`, `/arquitetura`, `/desenvolvimento`, `/review-codigo-subagents`, `/qa`, `/qa-rpa`, `/seguranca`, `/redteam`, `/deploy`, and the `commands` entries such as `/check-rules` and `/refactor`.

## Model Experience

The provider registers into the global layer of the skill registry, so every Agent preset sees the Treadmill skills and commands next to project, user, and bundled skills; project `.dsh/skills` and `.agents/skills` still outrank it. Each agent's system prompt gains one `treadmill:rules` section naming the installation root, listing every rule file with its heading, and pointing at `tools/spec-check.sh` and `tools/esteira-check.sh`; the model reads the rules it needs with its ordinary file tools.

## Stage table

`esteira/pipeline.yaml` lists the stages in execution order with `id`, `label`, `section`, `skill`, optional `args` (`sprint` receives the active sprint), `gate` (`manual` waits for the run action, `auto` follows through from the previous stage), `verdict`, `produces`, and `enabled`. Editing it adds, removes, reorders, or relabels stages for every project at once. A disabled stage stays listed and is skipped: the Treadmill view shows it as skipped, runs the next enabled stage when the cursor sits on it, and every stage prompt names the disabled stages so the Skill advances the cursor past them. The default table ships `deploy` enabled and `commit-push` (close the round with commits and a push instead of a deploy) disabled; switch the two to deliver by repository.

A project's cursor stores only the current stage id, so progress is unaffected by any table change: a cursor at a stage the table no longer lists is reported as such by the Treadmill view until the stage returns or the cursor advances. An invalid table is reported through `describe()` with `stages` empty and the files untouched.

## Per-project tables and skills

A project can own its Treadmill without a full installation. Switching a stage from the project's Treadmill view (`treadmill.updateStage` with a `sessionId`, for `enabled` or `gate`) copies the effective table into `.spec/treadmill.yaml` and flips the stage there; from then on that file is the project's table and `describe` reports `tableSource: 'project'`. Saving a skill or command from the Skills-treadmill editor with **Save to project** writes it to the project's `.dsh/skills`, where the ordinary filesystem provider outranks the harness copy for that project alone. A project without either file keeps using the harness default.

## Settings

The `treadmill` user-settings section carries `enabled` (default from the plugin's `enabled` config, itself `true`). Off, the provider serves no skill, the prompt section is empty, and `describe()` reports the state so the Treadmill view and the Knowledge pane show it.

## Known Limitations and Deferred Work

`agents` and `integrations` are vendored and editable but have no harness consumer: agents need a mapping onto Agent presets, and the OpenViking kit is documentation. Updating the vendored copy is a manual copy from the canonical `esteira-skills` checkout.
