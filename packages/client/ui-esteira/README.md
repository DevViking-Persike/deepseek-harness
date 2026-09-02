# `@deepseek-ai/dsh-client-ui-esteira`

This browser plugin adds an Esteira conversation view after Docker. It reads the project-owned `.spec/esteira-state.yaml`, presents stages, backlog artifact homes, Session token usage, and per-step provider/model activity, and submits the current stage as an explicit Skill prompt to the existing Session.

The view does not own cursor transitions. `.spec/esteira-state.yaml` remains authoritative, while `.opennjord/skills` supplies stage methods through the normal filesystem Skill provider.

## Model Experience

The plugin adds no prompt section or tool schema. Clicking **Run current stage** appends one ordinary user prompt beginning with the selected `/skill`; the Session retains its complete Agent preset and the resulting request, tool calls, usage, and output remain durable in the Session log.

## Known Limitations and Deferred Work

The initial cursor reader supports the scalar and backlog fields used by the installed OpenNjord schema. Automated tick transactions, receipts, cross-Session run correlation, exact monetary pricing, and artifact diff inspection require Host-owned capabilities and are not inferred in the browser.
