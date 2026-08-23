# Agent Note: The sidebar moves to either side of the frame

Status: implemented

English | [中文](2026-08-22-movable-sidebar-side.zh.md)

## Problem

`AppFrame` hardcoded the sidebar as the first grid track and the details panel as the third. Users who work with the browser on one half of the screen, or who simply prefer the navigation column near their dominant hand, had no way to move it; the only escape was collapsing the column to the 56px rail and losing the browser entirely.

Nothing about the three-column solver required that order. The concession chain, the width clamps, and the drag handles all operate on track widths, not on absolute screen positions.

## Decision

Placement becomes one more field of the transient layout store: `sidebarSide: 'left' | 'right'`, flipped by `toggleSidebarSide()` and exposed through `ctx.layout` for cross-plugin callers. `AppFrame` reads it and mirrors three things together — the grid template order, the `.sidebarCol` / `.detailsCol` grid columns and borders (through a `data-sidebar-side` attribute on the frame), and the sign of each drag delta so a handle still widens its own panel when dragged away from the viewport center. Widths, the concession chain, and collapse behavior are untouched: only the order of the two outer tracks changes.

The control that performs the flip lives in `ui-sidebar`, not `ui-layout`, registered into the `sidebar.footer.action` list slot that `ui-sidebar` itself declares. The dependency runs the right way: `ui-sidebar` already injects `ctx.layout`, whereas putting the button in `ui-layout` would require a `ui-layout → ui-sidebar` package reference against the existing `ui-sidebar → ui-layout` one, forming a project-reference cycle TypeScript rejects. The control ships with the column it moves; the state stays with the frame that owns geometry.

Placement is transient exactly like the widths — the store never touches `localStorage`, so a reload restores the left-side default.

## Alternatives considered

**A CSS-only mirror (`direction: rtl` or `order`).** Would flip the tracks without a store field, but the drag math reads client X against measured track widths; leaving those in visual order would invert every resize gesture, and the details concession chain would still squeeze the wrong panel.

**Own the button in `ui-layout` next to the state it mutates.** Blocked by the project-reference cycle described above, and it would put a sidebar-shaped control in the package that knows nothing about the sidebar's foot geometry (`wide`).

**Persist the choice.** Rejected for symmetry with the rest of the layout store, which is deliberately transient; persistence would need to arrive for widths, details, and placement together.

## Consequences

- `LayoutState` gained a field, so every snapshot assertion over the whole state object had to grow `sidebarSide`; `PanelActions` gained a method, so service doubles in tests must supply it.
- The three sidebar shell snapshots now include the footer button, in both dictionaries.
- CSS Modules do not cross package boundaries, so the button restates the foot's 28px/36px control geometry locally rather than importing `ui-sidebar`'s rail metrics.
