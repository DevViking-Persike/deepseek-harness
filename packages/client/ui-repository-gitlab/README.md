# @deepseek-ai/dsh-client-ui-repository-gitlab

English | [中文](README.zh.md)

GitLab repository integration section for the repositories conversation view: shows honest status for the unconfigured host provider and details planned remote integration features.

## What it registers

One `conversation.view.repositories.section` entry (`id: 'gitlab'`, `order: 30`) — the GitLab section inside the Repositories conversation view.

## Model Experience

### Operator presentation

#### What the model sees

This browser-side package renders operator UI for `conversation.view.repositories.section` only and contributes no prompt sections, tools, or model-visible messages.

#### Token effect

This package contributes no text or tokens to the prompt or model conversation stream.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Host provider pending** — requires `@deepseek-ai/dsh-provider-gitlab` (or equivalent host credentials and API bridge) before live repository browsing, merge requests, CI/CD pipeline status, and clone actions become operational.
