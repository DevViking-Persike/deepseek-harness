# Agent Note: Image attachment gated on the model's declared modalities

Status: implemented

English | [中文](2026-08-26-model-declared-image-capability.zh.md)

## Problem

The composer accepted an image for any model. A text-only model refused it at send, after the message was already durable, which leaves the session resending a request that cannot succeed — no model choice recovers it, because the image is in the log.

The capability to prevent this already existed and reached nowhere. Adapters declare `inputModalities`, `LlmRuntime.resolveModelInfo` returns it, and two host paths already gate on it. But `buildModelCatalog` projected model entries without the field, so `session.models` and `llm.models` answered `inputModalities: null` for every model and the browser had nothing to read.

## Decision

Carry `inputModalities` through `ModelCatalogModel` and its wire schema, and gate the attach path on it in the browser.

The field is typed as `string[]`, not a closed enum: `ModelModalityMap` is merge-extensible, so the wire carries whatever an adapter declared rather than a vocabulary this layer would have to keep in sync.

The gate is a new `imageSupport` registry on `ctx.conversation`, beside the existing `blocks`. It follows that registry exactly, because the constraint is the same one: the composer cannot import ui-model-selection — the dependency runs ui-model-selection → ui-conversation and never back — so the knower pushes and the attach path reads its own session's store.

**The value is tri-state, and that is the load-bearing part.** `true` accepts, `false` refuses, `undefined` cannot say. Only a catalog entry that *declares* modalities without `image` refuses; an entry that declares none, a model absent from the advisory groups, and a directory that has not loaded all mean "cannot say" and never gate. This mirrors `routable`, and for the same reason: gating on absence would let a slow or unreachable host lock an attach path that works.

The two wrong answers do not cost the same. Under-claiming refuses an image the operator can see and act on by switching models. Over-claiming admits one the endpoint rejects after the message is durable. So the fallback is conservative where it is cheap and permissive where it is not.

This is an affordance, not enforcement, exactly as `blocks` is: the host still refuses image content a model cannot take, regardless of what any client disables.

## Alternatives considered

- **Filter the model list to image-capable models while a draft holds an image** — hides the model the operator is trying to reach and answers a different question than "can this model see it".
- **Gate inside `ConversationController.createDraftImages`** — the draft layer knows nothing about model selection, and threading it there would invert the package dependency the block registry was built to avoid.
- **Derive capability from the provider route rather than per model** — the proxy's own registry disagrees within a route: `gpt-5.3-codex-spark` is text-only while its siblings take images, so a per-route answer would be wrong for one of them.

## Relation to the multimodal intake decision

The [durable-attachment note](../feature/2026-07-22-web-multimodal-image-input-and-durable-attachments.md) states that the browser "does not snapshot deployment limits or model capability", because a handshake snapshot cannot represent a session's target after `session.selectModel`.

That constraint holds and this change does not weaken it. What it rules out is a *stale* client copy; the gate here reads the live per-session model directory — the same state `session.selectModel` writes and both selection entries render — and republishes on every change, so it cannot describe a target the session has left. The host preflight remains the authoritative boundary and still rejects an image-bearing prompt a model cannot take; this only stops the composer from accepting content it can already tell will be refused.

## Consequences

- Catalog consumers may read `inputModalities`; absence still means unknown, so a consumer must keep its own fallback rather than treating absence as text-only.
- A new capability channel exists on `ctx.conversation`. A plugin that knows a session's model capability publishes through `imageSupport`; nothing else may write it, and the composer reads only its own session's store.
- Adapters that declare nothing keep today's behavior: the attach path stays open and the host remains the enforcement point.
- The GUI suite covers the registry's tri-state transitions and the derivation's six cases; a regression that silently drops the field again fails the derivation tests rather than reaching an operator.
