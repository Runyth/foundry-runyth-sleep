# Patch audit — Runyth Sleep v1.0.5

## Reproduction and root cause

The v1.0.4 Edit Rules dialog saved its outer dimensions, but the inner `.runyth-sleep` grid was independently capped at `min(70vh, 100dvh - 11rem)`, with its own `overflow-y: auto`. Additionally `.rs-sleep-advanced` had a second max-height of `min(73dvh, 740px)` while `.window-content` and `.dialog-content` could also scroll. Consequently increasing the dialog height did not increase the available Rules editor space proportionally, leaving unused window area and introducing nested scrolling.

The shared `.runyth-sleep` rule also applied to the Planner and Help dialogs. The dashboard is a separate `ApplicationV2` and already has a dedicated full-height shell with one tab-content scroll region; it did not have this defect.

## Changes

1. Remove the viewport-based maximum heights and inner scrolling from the shared `.runyth-sleep` container and Rules-specific `.rs-sleep-advanced` container.
2. Explicitly let DialogV2 `.window-content` and `form.dialog-form` fill available vertical space using `display: flex`, `flex: 1 1 auto`, `flex-direction: column`, and `min-height: 0`.
3. Make `.dialog-content` the single scroll region. Keep the `.dialog-buttons` footer non-shrinking and visible.
4. Preserve existing responsive field grids, design, single-window lifecycle, and per-client window geometry; no JavaScript resize listeners or repeated measurement, no Actor writes, and no rule changes.

## Validation

- Automated CSS-contract tests protect against the original double-height-cap and nested-scroll pattern.
- Existing module tests cover independent window geometry, planner/rules/help behavior, dashboard visuals, permissions, saving-throw and rest-engine functionality.
- `tools/layout-smoke.mjs` is an optional native Chromium (no npm dependencies) smoke utility for actual generated dialogs against a structural Foundry shell at normal, enlarged and narrow viewports. It checks computed CSS and bounding boxes, but cannot replace a live Foundry render.
- A manual in-world checklist is appended to `docs/TESTING.md`. Run it in a v13 world, including localization and other installed modules.

**Environment limitation:** Headless Chromium launched but did not render a document in the release environment; browser smoke checks are therefore not claimed as passed. Automated Node-based tests and structural assertions were run. Real in-world Foundry rendering has not been performed.

Official Foundry v13 DialogV2 reference: https://foundryvtt.com/api/v13/classes/foundry.applications.api.DialogV2.html
