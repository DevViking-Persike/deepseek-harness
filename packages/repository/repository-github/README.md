# @deepseek-ai/dsh-repository-github

English | [中文](README.zh.md)

Host subplugin registering GitHub code forge identity, capabilities, and offline status on `ctx.repositories`.

## Service contract

- Injects `repositories` (`ctx.repositories`).
- Registers a `ForgeProvider` with `id: 'github'` and capabilities (pull requests, issues, forks, branches, code search, webhooks).
- Reversibly unregisters on plugin disposal: `apply` returns the `registerForge` disposer, which the fiber runs on teardown.

## Model Experience

### GitHub Forge Context

#### What the model sees

`ctx.repositories` exposes the registered GitHub forge provider. Model-facing tools query forge capabilities and status to determine supported repository operations.

#### Token effect

Token usage depends on model query operations referencing forge capabilities.

#### KV Cache effect

Prompt prefix retention depends on caller prompt structure and stability of forge status.

## Known Limitations and Deferred Work

- Remote HTTP network interactions and REST/GraphQL API integration with GitHub are deferred to a subsequent provider package.
