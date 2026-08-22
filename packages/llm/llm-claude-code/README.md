# @deepseek-ai/dsh-llm-claude-code

[中文](README.zh.md)

Claude subscription adapter for the DeepSeek Harness LLM seam: talks to Anthropic's `/v1/messages` endpoint with the Claude Code client identity over the operator's own Claude subscription OAuth token — the same public OAuth protocol the Claude Code CLI registers, not the public API-key API.

Registers the `claude-code-oauth` provider route (default catalog: `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`). The harness model name is the wire model name; requests are not restricted to the catalog.

### Catalog capacities

Each default value is what the endpoint serves this subscription, measured from the rejection that names the limit rather than copied from a vendor registry.

| Model | Context window | Output cap |
| --- | ---: | ---: |
| `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-opus-4-8` | 1,000,000 | 128,000 |
| `claude-sonnet-4-6` | 200,000 | 128,000 |
| `claude-haiku-4-5-20251001` | 200,000 | 64,000 |

Those four serve a 1M window natively: the request path returns `prompt is too long: N tokens > 1000000 maximum` with the `context-1m-2025-08-07` beta absent, and adding that beta changes nothing. The adapter therefore never sends it — a model without a native 1M window rejects the beta itself (`The long context beta is not yet available for this subscription`) even when the same request succeeds without it.

`claude-sonnet-4-6` is catalogued at 200,000 although it does serve larger inputs: past roughly 220,000 input tokens the endpoint answers `Usage credits are required for long context requests`, so its dependable subscription-only capacity is the 200,000 recorded here.

## Connecting a subscription

Two paths, both ending in the same persisted credential (`$DSH_HOME/claude-code-oauth.json`, owner-only):

- **Import (one time)**: set `importFrom` to a CLIProxyAPI Claude auth file (e.g. `~/.cli-proxy-api/claude-<email>.json`); the service seeds its store at first boot and never reads the file again.
- **Browser login**: open `http://127.0.0.1:<controlPort>/start` (default port 1458) and complete the Anthropic OAuth PKCE flow; the local callback finishes the exchange. `/status` and CSRF-guarded `/logout` round out the control endpoint.

Access tokens refresh silently near expiry (five-minute margin) against `platform.claude.com/v1/oauth/token`.

## Configuration

Mounts as `llm-claude-code` in `dsh-base`. All fields are optional in `cordis.yml`:

| Field | Default | Meaning |
|---|---|---|
| `apiBase` | `https://api.anthropic.com` | Anthropic API base; `/v1/messages` is appended |
| `authorizeUrl` / `tokenUrl` | `claude.ai/oauth/authorize` / `platform.claude.com/v1/oauth/token` | OAuth endpoint overrides |
| `controlPort` | `1458` | Loopback port of the login control server |
| `path` | `$DSH_HOME/claude-code-oauth.json` | Credential document path |
| `importFrom` | unset | CLIProxyAPI Claude auth file to import once |
| `models` | see above | Advisory model catalog |
| `maxTokens` | `32000` | Default per-request output cap; explicit request values and per-model `maxTokens` win |
| `defaultContextWindow` | `200000` | Context capacity used when the selected model has no exact value |
| `streamIdleTimeoutMs` | `300000` | Maximum provider idle time while one stream read is outstanding |
| `retryPolicy` | normal mode, five retries | Provider-owned model-request retry policy |

The `llm-claude-code:` user-settings section (`$DSH_HOME/settings.yaml`) overrides this entry without a restart.

## Model Experience

### Claude request

#### What the model sees

The selected Claude model receives the harness system prompt (folded with any system-role history into the top-level `system` slot), message history, tool schemas, stop sequences, and call config without adapter-authored prompt prose. Harness reasoning blocks are not replayed: Anthropic multi-turn thinking requires the provider's original signed thinking blocks, and an unsigned substitute is rejected upstream.

#### Token effect

Anthropic tokenization governs exact input. Dropped reasoning passback means later requests do not re-carry prior chain-of-thought tokens; cache-read usage is reported when the provider provides it.

#### KV Cache effect

An unchanged assembled prefix is eligible for Anthropic prompt caching under the subscription's OAuth cache scope (`prompt-caching-scope`); changing the model or any prompt, schema, or history content may prevent reuse from the first changed token.

### Claude response

#### What the model sees

Text, thinking, and raw-string tool arguments are translated into harness chunks for the loop to log and assemble.

#### Token effect

Generated tokens follow the request's `maxTokens` (default 32000); only loop-retained blocks affect later input.

#### KV Cache effect

Loop-retained response blocks append to the next request and preserve its earlier reusable prefix; dropped blocks have no later cache effect. Changing the model selects a different cache domain.

## Known Limitations and Deferred Work

- **Image input is rejected (`UNSUPPORTED_CONTENT`)** — the adapter sends text and tool blocks only; multimodal input follows the `llm-deepseek` data-URL pattern when needed.
- **Reasoning is one-way** — thinking blocks stream to the harness but are not replayed on later turns (unsigned thinking is rejected upstream); a `replayState` projection would be needed for lossless passback.
- **No reasoning-effort selector** — effort negotiation would map to the `effort` beta and a thinking budget; deferred until the harness surface needs it.
- **A settings model list replaces the composition list wholesale** — settings-layer merging is per-field, and arrays are one field.
- **Requests use raw `fetch`, not a shared HTTP service** — no shared proxy/interception configuration; adoption is deferred until a second adapter wants it.
- **The control server is plain HTTP on loopback** — the web settings card for login/rotation is deferred.
