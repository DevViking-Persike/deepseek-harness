# @deepseek-ai/dsh-client-ui-repository-local

English | [中文](README.zh.md)

Local repository section for the repositories conversation view: inspect Git repositories and summarize branch status across open workspaces over the host `git.*` RPC domain.

## What it registers

One `conversation.view.repositories.section` entry (`id: 'local'`, `order: 10`) — the Local Repositories section inside the Repositories conversation view.

## Model Experience

### Operator presentation

#### What the model sees

This browser-side package renders operator UI for `conversation.view.repositories.section` only and contributes no prompt sections, tools, or model-visible messages.

#### Token effect

This package contributes no text or tokens to the prompt or model conversation stream.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Read-only status inspection** — mutations such as stage, discard, and commit remain inside the Editor version control panel (`@deepseek-ai/dsh-client-ui-git`); this section focuses on workspace-wide multi-repository discovery and summary status inspection.
