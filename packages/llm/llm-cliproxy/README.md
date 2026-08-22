# @deepseek-ai/dsh-llm-cliproxy

[中文](README.zh.md)

[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) adapter for the DeepSeek Harness LLM seam: one local proxy instance exposes the operator's own CLI subscriptions (Claude OAuth, Codex/OpenAI OAuth, …) through an OpenAI-compatible `/v1/chat/completions` endpoint, and this plugin registers two provider routes over it:

- `cliproxy-claude` — Claude models (default catalog: `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`)
- `cliproxy-openai` — GPT/Codex models (default catalog: `gpt-5.6-sol`, `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.5`, `gpt-5.3-codex-spark`)

Each default catalog entry carries its own capacities: the Claude Fable 5, Opus 5, Sonnet 5, and Opus 4.8 routes serve a 1,000,000-token context, Sonnet 4.6 and Haiku 4.5 serve 200,000, and every GPT/Codex route serves 400,000. A model outside the catalogs falls back to `defaultContextWindow`.

The harness model name is the proxy's wire model name; requests are not restricted to the advisory catalogs, so any model the proxy serves (use its `GET /v1/models`) can be selected by id.

## Configuration

Mounts as `llm-cliproxy` in `dsh-base`. All fields are optional in `cordis.yml`:

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `http://127.0.0.1:8317/v1` | Proxy endpoint base including the `/v1` prefix |
| `apiKeyEnv` | `CLIPROXY_API_KEY` | Credential reference resolved per request through the credentials service, or the launching environment when that service is absent |
| `claudeModels` / `openaiModels` | see above | Advisory per-route model catalogs |
| `maxTokens` | `32000` | Default per-request output cap; explicit request values and per-model `maxTokens` win |
| `defaultContextWindow` | `200000` | Context capacity used when the selected model has no exact value |
| `streamIdleTimeoutMs` | `300000` | Maximum proxy idle time while one stream read is outstanding |
| `retryPolicy` | normal mode, five retries | Provider-owned model-request retry policy |

The `llm-cliproxy:` user-settings section (`$DSH_HOME/settings.yaml`, written by the web Models page) overrides this entry without a restart.

The proxy API key is the value the CLIProxyAPI operator set under `api-keys` in its own `config.yaml` — it authenticates to the local proxy, not to the upstream subscriptions.

## Model Experience

### CLIProxyAPI request

#### What the model sees

The selected upstream model receives the harness system prompt, message history, tool schemas, stop sequences, and call config without adapter-authored prompt prose. Reasoning content from a prior assistant turn is passed back verbatim, whether or not that turn called a tool.

#### Token effect

Upstream tokenization governs exact input. Reasoning passback carries every reasoned turn's chain of thought into later requests; the proxy reports usage with cache-read tokens separated when its upstream provides them.

#### KV Cache effect

An unchanged assembled prefix is eligible for the upstream provider's cache reuse through the proxy's session-affinity routing; changing the provider route, model, or any prompt, schema, or history content may prevent reuse from the first changed token. Reasoning passback appends on every reasoned turn.

### CLIProxyAPI response

#### What the model sees

Reasoning, text, and raw-string tool arguments are translated into harness chunks for the loop to log and assemble.

#### Token effect

Generated tokens follow the request's `maxTokens` (default 32000); only loop-retained blocks affect later input.

#### KV Cache effect

Loop-retained response blocks append to the next request and preserve its earlier reusable prefix; dropped blocks have no later cache effect. Changing the provider route or model selects a different cache domain.

## Known Limitations and Deferred Work

- **Image input is rejected (`UNSUPPORTED_CONTENT`)** — the adapter sends string-content messages only; extending it follows the `llm-deepseek` data-URL pattern when a multimodal route is needed.
- **No `replayState`** — the proxy does not expose per-conversation native metadata, so cross-provider history restore relies on plain messages.
- **No reasoning-effort selector** — effort negotiation belongs to the proxy's upstream routing, not this adapter.
- **A settings model list replaces the composition list wholesale** — settings-layer merging is per-field, and arrays are one field.
- **Requests use raw `fetch`, not a shared HTTP service** — no shared proxy/interception configuration; adoption is deferred until a second adapter wants it.
