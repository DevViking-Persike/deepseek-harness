# Agent Note: The agent-preset selector lives in the composer, exclusive with the header label

Status: implemented

English | [中文](2026-08-21-agent-preset-selector-in-the-composer.zh.md)

## Problem

A user who picked Creator mode on the new-session screen then read "Standard mode" in the chat header of the session they had just started, and had no way to tell which one was true.

Both surfaces were showing the same session at the same time. The chip occupied `conversation.hero.agentPreset` — a root-scoped hole in the hero row beside the workspace picker — and the header label occupied `conversation.session.header.actions`, gated only on the session summary carrying a preset at all. The hero row and the session header are both on screen while a session is blank, so the live selector and the static name coexisted, and they disagreed whenever the stage had not yet reached the session: the chip showed the staged pick, the label showed the composition the summary still recorded.

The placement made the disagreement likely rather than rare. The chip sat on chrome the user passes through on the way to typing, while the decision it carries stays open for the whole blank state — so the control the user wanted to re-read had scrolled out of attention exactly when the header started contradicting it.

## Decision

One session-bound surface at a time, both keyed on the same `blank` bit.

The selector is an entry in `conversation.input.left` — the composer card's own tool row, beside the access-mode and plan chrome — registered with `id: 'agent-preset'` and `order: -10` so it leads the row: the composition is what the rest of those controls operate inside. That slot's `InputZone` owner share already carries `session.blank`, the same bit the host derives and flips on the first accepted prompt, so no new owner prop, hook, or subscription was needed to place the choice where the user is when they make it.

`AgentPresetSeat` returns null once `blank` is false and skips its roster load in that state, so a started session pays nothing for a control it cannot use, and the chip is never a permanently disabled affordance. `AgentPresetLabel` reads `blank` from the same session summary it already read the preset from and withholds itself while the session is blank. The two are exclusive by construction on one fact from one source, so no session shows a live selector and a static name for the same composition.

`conversation.hero.agentPreset` is deleted — the slot key, its `HeroAgentPresetOwnerProps` owner share, the `conversation` entry's children row, and the `renderSlot` call in the hero workspace row. Keeping it as a no-session-only seat would have preserved the duplicate contract for a state the composer already covers: the hero renders with a blank session under it, and `conversation.input.left` renders in both the hero and docked composer variants.

Staging is unchanged. The chip still opens on the deployment default, still stages rather than applies, and `AgentPresetSeatController.apply()` still drops a stage aimed at a session that is no longer blank — the settings creator entry stages before any session exists, and a cold start has none, so the pick must still be able to precede its session.

## Alternatives considered

**Keep the hero chip and suppress the header label only.** This removes the visible contradiction with one edit, but leaves the choice on chrome the user leaves behind while the decision stays open, and keeps a root-scoped slot whose occupant needs session facts the slot cannot supply. The reported confusion was the symptom; the placement was the cause.

**Keep the hero chip for the no-session cold state and add the composer chip for blank sessions.** Two registrations of the same control, two locales seats, two disposal paths, and a contract that still declares a duplicate surface — for a state where the composer is already mounted and already renders `conversation.input.left`.

**Render the chip in the composer but disabled after the first turn, with the refusal as its tooltip.** Honest about the host's rule, but it spends the rest of every session as dead chrome in a row of live controls, and it says what the header label already says better.

**Give the header label an editable state while blank instead of moving the chip.** The session header is where a fixed fact is reported; making it conditionally interactive means one element with two meanings, and it is the wrong place to decide something before typing.

## Consequences

- The GUI contract lost a slot. `conversation.hero.agentPreset` is gone from `SlotMap`, from the `conversation` entry's children table, from `ConversationSlotProps`, and from the generated `slot-catalog.ts`; `conversation.input.left` now reports the agent-preset occupant and documents the `session.blank` pattern for any later entry whose choice closes when the conversation starts.
- The seat moved from root scope to session scope and from a `single` slot to a `list` slot, so its registration now requires an `id` and its component receives the session standard props. Its tests feed the `InputZone` owner share rather than an empty owner object.
- The header label now needs `blank` in the session summary, which `SessionSummary` already carries; a summary the sessions list has not caught up to still renders nothing, unchanged.
- A deployment composing no presets is unaffected: the roster is empty, and the row, chip, label, and section all render nothing.
- The cold state — no session at all, before a workspace is connected — no longer offers the chip. `conversation.input.left` is strictly session-scoped, so the skeleton renders it only once a session exists, while the removed hero seat was root-scoped and rendered without one. That composer is inert (the textarea is the workspace-picker trigger and no prompt can be sent), and connecting a workspace creates or reuses a blank session, which is where the chip appears with the deployment default still staged. The General-settings row remains the way to change the default without a session.
