# @deepseek-ai/dsh-client-ui-repositories

English | [中文](README.zh.md)

Repositories conversation view: browse, inspect, and manage workspace repositories and code hosting platform integrations.

## What it registers

One `conversation.view` entry (`id: 'repositories'`, `order: 40`) — a sibling tab beside Chat, Trajectory, Docker, and Editor.

The tab provides an internal navigation shell that declares the child slot list `conversation.view.repositories.section`. Living section plugins (such as Local, GitHub, and GitLab) register into this slot ring and are discovered dynamically through the slot registry. The shell renders tabs for all active sections, selects Local initially, and renders only the selected section.

## Model Experience

### Operator presentation

#### What the model sees

This browser-side package renders operator UI for the `conversation.view` tab only and contributes no prompt sections, tools, or model-visible messages.

#### Token effect

This package contributes no text or tokens to the prompt or model conversation stream.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Static initial tab selection** — the initial tab defaults to `'local'` and falls back to the first available section; persisting per-session tab selection across reloads is deferred to a future store integration.
