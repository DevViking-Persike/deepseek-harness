# `@deepseek-ai/dsh-skill-opennjord`

This host plugin vendors the complete OpenNjord Esteira installation under `assets/opennjord` (`skills`, `rules`, `commands`, `agents`, `integrations`, `tools`) and serves the `skills` directory to every project through one `FileSystemSkillProvider` named `opennjord`. The method lives in the harness: a project keeps no `.opennjord`, `.claude`, or `.codex` copy and no symlink bridge.

What a project owns is only its execution state and its decisions: `.spec/` (cursor `esteira-state.yaml`, discovery, sprints, tasks, QA and security evidence) and `docs/adrs/`. `/scaffold-spec` creates that pair; the harness supplies `/discovery`, `/arquitetura`, `/desenvolvimento`, `/review-codigo-subagents`, `/qa`, `/qa-rpa`, `/seguranca`, `/redteam`, and `/deploy`.

## Model Experience

The provider registers into the global layer of the skill registry, so every Agent preset sees the OpenNjord skills in its catalog next to project, user, and bundled skills. Project roots (`.dsh/skills`, `.agents/skills`) outrank this provider, so a project may still override one skill locally.

## Known Limitations and Deferred Work

Only `skills` is consumed today. `rules`, `commands`, `agents`, `integrations`, and `tools` are vendored for the same reason but have no harness consumer yet: rules need a system-prompt projection, commands are covered by skills, agents need a mapping onto Agent presets, and tools are shell scripts the skills invoke by relative path. Updating the vendored copy is a manual copy from the canonical `esteira-skills` checkout.
