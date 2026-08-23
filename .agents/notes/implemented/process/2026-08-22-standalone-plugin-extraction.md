# Agent Note: Extracting standalone plugins from the monorepo

Status: implemented

English | [中文](2026-08-22-standalone-plugin-extraction.zh.md)

## Problem

Capability packages written inside the monorepo cannot be installed by anyone outside it: they import workspace dependencies (`workspace:^`) that resolve nowhere else, so a published copy would fail `pnpm install` on the first line. Four capabilities built here — Docker tools, the Monaco asset route, the CLIProxyAPI adapter, and the two subscription OAuth adapters — needed to reach external users.

## Decision

Extract each capability as a standalone CommonJS plugin: plain JavaScript, no build step, importing no `@deepseek-ai/dsh-*` package, reading every capability through `ctx` at run time. Three facts made this work, each established by experiment rather than assumption:

**The registry validates metadata, not class identity.** `ctx.llm.registerAdapter(providers, adapter)` never checks `instanceof LlmAdapter`. A plain object supplying `providerInfo` (whose `.id` must equal the requested provider and whose `.name` must be non-empty), `providerRetryPolicy`, `listModels`, `resolveModel`, and an async-generator `stream` registers and streams. This overturned an earlier conclusion that adapter packages could not be extracted; the belief had never been tested.

**Port against recorded behavior, not against memory.** For each translator and serializer, the in-repo implementation was executed over a fixture corpus and its output recorded as JSON. The port's tests compare against that recording, so a divergence on either side fails loudly. This caught nothing in the happy path — the point is that it would have caught everything it was designed to: `argumentsDelta` misnamed as `arguments` appends the string `"undefined"` to every tool call and raises nothing, and the two providers' opposite cache-accounting conventions (Anthropic reports input tokens already net of cache reads; OpenAI includes them) produce silently wrong cost figures in either direction.

**Verify the load-time vocabulary.** A standalone plugin rides runtime facts the repo makes no pre-release promise to keep. Each plugin re-checks its emitted chunk vocabulary against a fixed payload during `apply` and refuses to mount on drift, naming the changed field — a renamed field would otherwise corrupt output with nothing reported.

One deliberate deviation from the requested shape: both subscription adapters ship as **one** package rather than two. Their wire formats share nothing, but their credential machinery — the cross-process writer lock, the PKCE flow, the refresh cycle — is identical, and that is the code where a bug corrupts a real token. Duplicated across two repositories, a fix applied to one and missed in the other fails silently; one package gives the lock a single owner. A `routes` config enables either subscription alone.

The cross-process writer lock was ported verbatim from `packages/util/atomic-write`, including the parts that look incidental: exclusive-create is the only cross-process mutual exclusion, and pairing it with a rename-based commit is what keeps readers lock-free. Its test forks real processes and includes a negative control that disables the lock and asserts the corruption appears.

## Alternatives considered

- **Publish the workspace packages to npm** — only DeepSeek can publish under `@deepseek-ai`, and the pre-release versions on the registry (`0.0.1-rc.1`) do not satisfy the checkout's (`0.1.0-rc.8`), so an external plugin would pin a frozen, mismatched set.
- **Ship patches against built `lib/`**, as one community plugin does — any rebuild erases them.
- **Contribute upstream** — the right path for what must stay inside the harness (the editor tab, the movable sidebar), and the branch for it exists; extraction serves what is useful on its own.

## Consequences

- Four standalone plugins exist, each installed from GitHub and verified registering: `dsh-docker`, `dsh-monaco`, `dsh-cliproxy`, `dsh-subscriptions`.
- A profile can run a published plugin in place of the in-repo row by disabling one and enabling the other; both claim the same ids, so exactly one of each pair may be active or the second registration rejects with `DUPLICATE_ADAPTER`.
- The standalone plugins drift independently of this repo and must fail loudly at load when they can detect it; their READMEs state this and pin nothing they cannot verify.
- In-repo packages remain the reference implementations; their translators and serializers are the source the recorded fixtures come from, so a change here invalidates a fixture there and the port's suite says so.
