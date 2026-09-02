# `@deepseek-ai/dsh-client-ui-esteira`

This browser plugin adds an Esteira conversation view after Docker. It reads the project-owned `.spec/esteira-state.yaml`, projects the twelve canonical OpenNjord stages as a numbered graph with a progress bar and a per-stage panel, lists the sprint backlog, Session token usage, and per-step provider/model activity, and submits a stage as an explicit Skill prompt to the existing Session.

The view does not own cursor transitions. `.spec/esteira-state.yaml` remains authoritative, while the stage methods come from the OpenNjord skills that `@deepseek-ai/dsh-skill-opennjord` ships with the harness. A project without a cursor gets one **Install the Esteira in this project** action, which submits `/scaffold-spec criar` constrained to create only `.spec/` and `docs/adrs/`.

## Model Experience

The plugin adds no prompt section or tool schema. Clicking **Run current stage**, **Run this stage**, or **Install the Esteira in this project** appends one ordinary user prompt beginning with the selected `/skill`; the Session retains its complete Agent preset and the resulting request, tool calls, usage, and output remain durable in the Session log.

## Known Limitations and Deferred Work

The initial cursor reader supports the scalar and backlog fields used by the installed OpenNjord schema. Automated tick transactions, receipts, cross-Session run correlation, exact monetary pricing, and artifact diff inspection require Host-owned capabilities and are not inferred in the browser.
