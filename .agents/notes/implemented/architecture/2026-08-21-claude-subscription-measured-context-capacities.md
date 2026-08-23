# Agent Note: Catalog the Claude context capacity the endpoint serves, not the registry's

Status: implemented

English | [中文](2026-08-21-claude-subscription-measured-context-capacities.zh.md)

## Problem

`llm-claude-code` catalogued an explicit 1M window for `claude-fable-5` alone; `claude-opus-5`, `claude-sonnet-5`, and `claude-opus-4-8` carried no exact value and fell back to `defaultContextWindow` (200,000). Compaction reads that number, so those three models were compacted at a fifth of the capacity the endpoint grants, wasting most of the context the subscription pays for.

The obvious repair — copying `context_length` from the CLIProxyAPI model registry — is not evidence. A registry states what a model can do somewhere, while the catalog governs what this credential may send to this endpoint, and the two diverge per subscription. An earlier attempt in the opposite direction had already failed: a raw request carrying `context-1m-2025-08-07` was rejected with "The long context beta is not yet available for this subscription", which reads as proof that the subscription has no 1M entitlement at all.

## Decision

Catalog values are measured against `api.anthropic.com` over the OAuth path, one probe per model, and Anthropic states each limit in its own rejection: `prompt is too long: N tokens > LIMIT maximum` names the window, and `max_tokens: N > CAP` names the output cap. Both are validation failures, so an intentionally oversize probe reads the true limit without generating tokens.

| Model | Context window | Output cap |
| --- | ---: | ---: |
| `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-opus-4-8` | 1,000,000 | 128,000 |
| `claude-sonnet-4-6` | 200,000 | 128,000 |
| `claude-haiku-4-5-20251001` | 200,000 | 64,000 |

The 1M window is native to those four models, not an opt-in: each returns `> 1000000 maximum` with `context-1m-2025-08-07` absent, and adding the beta changes no outcome. The adapter therefore keeps omitting it. The beta is not merely useless but harmful elsewhere — `claude-haiku-4-5-20251001` answers a plain 200k request yet rejects the same request when the beta rides along, which is exactly the earlier failure: it measured the beta's availability, not the models' capacity.

`claude-sonnet-4-6` is catalogued at the 200,000 fallback even though it demonstrably serves more. It answered at 208k and 220k input, then returned `Usage credits are required for long context requests` at 240k and above. That ceiling depends on pay-as-you-go credit rather than the subscription, so the catalog records the capacity every request can rely on. Its output cap is still corrected to the measured 128,000, against the registry's 64,000.

## Alternatives considered

**Adopt the CLIProxyAPI registry values wholesale.** It agrees on the four 1M windows, but it is aspiration rather than entitlement: it also declares `claude-sonnet-4-6` at 200,000/64,000, where the endpoint serves a 128,000 output cap and a credit-gated window above 200,000. Its own source confirms it never asserts the 1M window on the wire — `claudeCodeCLIBetas` forwards `context-1m-2025-08-07` only when a caller requests it.

**Send `context-1m-2025-08-07` to unlock the window.** It unlocks nothing, because the window is already native, and it converts working requests into failures on every model without one.

**Catalog `claude-sonnet-4-6` at its observed ceiling.** Compaction would then size prompts against capacity that disappears with the credit balance, turning a planning number into an intermittent request failure.

## Consequences

Compaction sizes `claude-opus-5`, `claude-sonnet-5`, and `claude-opus-4-8` against the 1M window the endpoint actually serves instead of a 200,000 fallback.

The real-composition test resolves all six models through `ctx.llm.resolveModelInfo` and pins each window, so restoring a registry-copied value fails the suite; it also asserts that no request carries `context-1m`. Because these numbers are entitlements rather than constants, a subscription change can legitimately move them, and the measurement procedure in this note — not the registry — is what re-derives them.
