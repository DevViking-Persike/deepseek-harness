# @deepseek-ai/dsh-llm-codex

[English](README.zh.md)

Codex subscription adapter for the DeepSeek Harness LLM seam: talks to the ChatGPT backend Codex Responses endpoint (`chatgpt.com/backend-api/codex/responses`, `openai-beta: responses=experimental`) with the Codex CLI client identity over the operator's own Codex subscription OAuth token — the same public OAuth protocol the Codex CLI registers, not the public platform API.

Registers the `codex-oauth` provider route (default catalog: `gpt-5.6-sol`, `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.5`, `gpt-5.3-codex-spark`). The harness model name is the wire model name; requests are not restricted to the catalog. Tiered models request their serving tier: `gpt-5.6-luna` sends `service_tier: "priority"` (Luna Fast).

## Connecting a subscription

Two paths, both ending in the same persisted credential (`$DSH_HOME/codex-oauth.json`, owner-only):

- **Import (one time)**: set `importFrom` to a CLIProxyAPI Codex auth file (e.g. `~/.cli-proxy-api/codex-*.json`); the service seeds its store at first boot and never reads the file again.
- **Browser login**: open `http://127.0.0.1:<controlPort>/start` (default port 1456) and complete the OpenAI OAuth PKCE flow; the local callback (port 1455, fixed by the public client) finishes the exchange. `/status` reports login state and cached subscription usage (`wham/usage`); CSRF-guarded `/logout` clears the credential.

Access tokens refresh silently near expiry (five-minute margin) against `auth.openai.com/oauth/token`.

## Configuration

Mounts as `llm-codex` in `dsh-base`. All fields are optional in `cordis.yml`:

| Field | Default | Meaning |
|---|---|---|
| `backendBase` | `https://chatgpt.com/backend-api` | Backend API base; `/codex/responses` is appended |
| `usageUrl` | `…/backend-api/wham/usage` | Subscription usage endpoint |
| `authorizeUrl` / `tokenUrl` | `auth.openai.com/oauth/…` | OAuth endpoint overrides |
| `controlPort` | `1456` | Loopback port of the login control server |
| `path` | `$DSH_HOME/codex-oauth.json` | Credential document path |
| `importFrom` | unset | CLIProxyAPI Codex auth file to import once |
| `models` | see above | Advisory model catalog; per-model `serviceTier` names the serving tier |
| `defaultContextWindow` | `400000` | Context capacity used when the selected model has no exact value |
| `streamIdleTimeoutMs` | `300000` | Maximum provider idle time while one stream read is outstanding |
| `retryPolicy` | normal mode, five retries | Provider-owned model-request retry policy |

The `llm-codex:` user-settings section (`$DSH_HOME/settings.yaml`) overrides this entry without a restart.

## Model Experience

### Codex request

#### What the model sees

The selected GPT model receives the harness system prompt (folded with any system-role history into the top-level `instructions` slot), message history, tool schemas, and call config without adapter-authored prompt prose. Harness reasoning blocks are not replayed: Codex multi-turn thinking continuity rides on the provider's `encrypted_content`, which the harness does not retain.

#### Token effect

OpenAI tokenization governs exact input. Dropped reasoning passback means later requests do not re-carry prior chain-of-thought tokens; cache-read usage is reported when the backend provides it.

#### KV Cache effect

An unchanged assembled prefix is eligible for backend prompt caching under the subscription; changing the model or any prompt, schema, or history content may prevent reuse from the first changed token.

### Codex response

#### What the model sees

Reasoning summaries, text, and raw-string tool arguments are translated into harness chunks for the loop to log and assemble.

#### Token effect

The backend enforces each model's own output cap; per-request `maxTokens` values do not cross the wire (the endpoint rejects `max_output_tokens`). Only loop-retained blocks affect later input.

#### KV Cache effect

Loop-retained response blocks append to the next request and preserve its earlier reusable prefix; dropped blocks have no later cache effect. Changing the model selects a different cache domain.

## Known Limitations and Deferred Work

- **The backend owns the output cap** — the endpoint rejects `max_output_tokens`, so per-request and configured output caps inform `resolveModel` capability views only; `maxTokens` config exists for that view and is not sent.
- **Reasoning is one-way** — reasoning-summary blocks stream to the harness but `encrypted_content` is not retained or replayed; lossless passback would need a `replayState` projection.
- **Image input is rejected (`UNSUPPORTED_CONTENT`)** — the adapter sends text and tool items only.
- **Stop sequences throw `UNSUPPORTED`** — the Responses endpoint has no stop-sequence parameter.
- **A settings model list replaces the composition list wholesale** — settings-layer merging is per-field, and arrays are one field.
- **Requests use raw `fetch`, not a shared HTTP service** — no shared proxy/interception configuration; adoption is deferred until a second adapter wants it.
- **The control server is plain HTTP on loopback** — the web settings card for login/rotation is deferred.
