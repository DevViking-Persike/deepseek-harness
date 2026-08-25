# @deepseek-ai/dsh-client-ui-repository-github

English | [中文](README.zh.md)

GitHub repository integration section for the repositories conversation view: shows honest status for the unconfigured host provider and details planned remote integration features.

## What it registers

One `conversation.view.repositories.section` entry (`id: 'github'`, `order: 20`) — the GitHub section inside the Repositories conversation view.

## Model Experience

### Operator presentation

#### What the model sees

This browser-side package renders operator UI for `conversation.view.repositories.section` only and contributes no prompt sections, tools, or model-visible messages.

#### Token effect

This package contributes no text or tokens to the prompt or model conversation stream.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Host provider pending** — requires `@deepseek-ai/dsh-provider-github` (or equivalent host credentials and API bridge) before live repository browsing, pull requests, and clone actions become operational.
