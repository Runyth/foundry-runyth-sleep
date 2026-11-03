# Changelog

## 1.1.1 — 2026-11-03

- AGENTS.md conformance release: the manifest author carries the standard organisational URL, and the shipped house-rule content states its CC BY-SA 4.0 content licence in the README. No runtime behaviour relationship or dependency change.

## 1.1.0 — 2026-10-25

- Delegated Rules editor permission (`editRules`) with role minimums and individual Allow/Deny/Inherit overrides; GM only by default.
- Dedicated, Foundry-owned rules JournalEntry with migration of existing custom world rule settings and document-level authorization.
- Four shelter grades with explicit 15-minute / 60-minute / at-least-24-hour construction guidance, illustrated in the Help dialog.
- Live quality-score explanation in Help: current thresholds, save-check conditions, and rolled temporary HP.
- Tests for permission delegation, revocation, migration, malformed settings and edit conflicts.

- Shelter modifiers: exposed −1, quickly improvised 0, carefully improvised +1, solid/indoors +2.
- Bedding modifiers: bedroll 0 and standard bed +1; remaining values unchanged.
- Renamed the optional planner label to **Sleep Note** (German: **Schlafnotiz**).
- Rule changes now persist as a single validated JournalEntry update. Scene defaults and permission administration remain GM-only.

- Existing queued plans, saved notes and prior rest results remain intact. Existing option IDs are preserved; their resulting quality may change under new scores.
- A GM must connect to provision the rule document after upgrading; old world settings remain as a compatibility fallback. The preparation times are campaign house rules, not official D&D 2024 rules.

- First publication as a Runyth module: `runyth-sleep` / **Runyth Sleep** with the publication standard in place — deterministic `-mod`, `-src`, and `-doc` archives with per-version checksums, byte-identical rebuild verification, standard quality and release pipelines, the full GNU AGPL-3.0-or-later licence with the standard source notice, the standard README licence chapter, and the manifest URL surfaces.

## 1.0.7 — 2026-10-23

- Armor-aware Long Rest processing, independent of queued sleeping-condition plans.
- Three GM-configurable rule presets: 2024 core RAW (default, no armor sleeping penalty), Xanathar's older official optional rule (no save, 25% spent Hit Dice recovery and no exhaustion reduction), and configurable armor-category house rules with native saving throws.
- Class-item Hit Dice recovery adjustments for medium/heavy armor when configured, snapshots at the start of rest, checked item state (never shield/item-name inference), native saves and configurable save-success/failure outcomes.
- Rules dashboard entry and collapsible, localized armor section with per-category save DCs, ability, advantage, Exhaustion, regeneration prevention and Hit Dice percentages.
- Rest-level replay protection and a GM-only same-session recovery method for partial document update failures; missing or invalid armor settings do not interrupt native rests.
- Mock regression and integration coverage for completed/short rests, armor equipping, native saves, optional recovery, retries, corrupted settings, and multiclass Hit Dice.

- No schema migration for queued plans, sleep thresholds or outcomes. Only the new `armorRules` world setting and `lastArmorRest` flag are added.
- The 2024 core default does not silently introduce house-rule Constitution saves. Xanathar's optional rule and custom effects must be explicitly enabled by a GM.
- Live Foundry v13 and dnd5e 5.x/6.x compatibility remain to be verified in a running world.

## 1.0.6 — 2026-10-22

- Replace oversized and sheet-dependent character-sheet Sleep button placement with a compact, accessible actor-header control, styled independently of dashboard launchers.
- Integrate at the same generic name/header accessory positions used by other well-behaved Foundry/Tidy actor-sheet controls, placing Sleep to the left when neighboring module indicators are present, without any module-specific dependency.
- Handle both Tidy name-anchor variants, multiple render hooks, and partial renders with idempotent placement and one deferred DOM normalization per sheet root.
- Keep Foundry native header controls in position and limit styles to actor sheets; avoid DOM observers, timers and new Actor updates.
- Extend regression coverage for Tidy integration, hook order, duplicate prevention, standard Foundry V2 headers, player permissions and absent neighboring controls; preserve existing rest rules and data.

## 1.0.5 — 2026-10-22

- Fix the Rules editor's unused vertical space when resized: remove independent viewport-based height caps on its inner grid, allowing content to occupy the full available DialogV2 area.
- Apply the same correction to the Planner and Help windows to prevent recurrence of double-scrollbars and clipped content.
- Establish one flex-based, minimum-height-safe scrolling container per dialog, with buttons fixed at the bottom; preserve independent window geometry, UI design, all control semantics, and compact/narrow responsiveness.
- Leave the dashboard's existing separate full-height/scrollable content layout unchanged.
- Add CSS layout-contract regressions, an optional Chromium-based dialog layout smoke harness, documentation, and a Foundry-specific manual resize checklist.
- No rule calculation, Actor flag, permission, rest-hook or world setting schema changes.

## 1.0.4 — 2026-10-22

- Give poor and miserable sleep native Constitution saves (default DC 12 / 15, with increasing DC under more severe conditions) to negate Exhaustion.
- Give comfortable and excellent sleep actual dice rolls (`1d4 + CON` / `1d6 + 2 × CON`), while retaining prior fixed temporary-HP values as non-stacking minimums.
- Add five independently editable advanced rule profiles, configurable save/check ability, DC scaling, proficiency, tier severity, level, Exhaustion, roll modes, success reductions, dice, ability and level multipliers, and min/max caps.
- Restore original defaults via confirmation; validate the entire rule profile before saving and avoid unchanged settings writes.
- Integrate native dnd5e 5.x saving-throw API using independent roll, dialog and message configuration objects to prevent unwanted dialogs and duplicate chat cards.
- Display save DC and formula previews before rest and post-rest save, bonus and delta results in a single localized chat summary, Actor ledger and planner summary.
- Preserve queued plans on invalid/canceled native rolls or dice failures; avoid rerolling after transient storage failures in the same client session.
- Add extensive pure-model, saving-throw/HP, plan-race, rules-editor and retry tests (68 passing), audit notes and usage documentation.

## 1.0.3 — 2026-10-22

- Rebuild the dashboard against the shared Runyth presentation language: dark gradient, gold-highlighted tabs, overview panels, folder-grouped character cards, context badges, selection toolbar and responsive button layouts.
- Replace the generic Actor table with grouped and paginated Actor cards; add Overview, Actors, Rules, Permissions and Settings tabs, retaining relevant Sleep actions only.
- Implement dashboard-style role minimums and per-user allow/deny/inherit overrides for viewing owned characters, viewing accessible party characters, viewing last results, and optionally planning owned characters.
- Enforce mutation authorization in Actor plan services; retain GM-only rule, scene-default and world-permission configuration.
- Preserve per-client tab/filter/subfolder/page-size state and independent window geometry; render only a bounded page of Actor cards.
- Avoid redundant Actor quality evaluation during filtering and update selection buttons without costly rerenders or Actor writes.
- Adopt the shared visual design with namespaced selectors so concurrent modules cannot interfere.
- Add targeted permission, security and visual-structure regression tests and documentation.

## 1.0.2 — 2026-10-22

- Add a discoverable **Open dashboard** button in the global module settings, matching the settings-level dashboard launcher pattern.
- Add visible Settings sidebar, Actors sidebar, Token Controls, and character sheet entry points.
- Introduce an all-character GM dashboard with search, Actor-folder and plan-status filters, pagination, quality/last-result summary and per-character quick actions.
- Add group planning from selected dashboard rows; preserve existing GM-only plan changes and character-owner read permissions.
- Explain unplanned Long Rests instead of remaining silent. Optional GM configuration can open the dashboard after unplanned rest; default is notification only. No unexpected penalties are added.
- Preserve dashboard geometry and filters per client, reuse the active dashboard, debounce searches/refreshes and handle 40 rows per page.
- Fix opening the planner for a different character while another actor’s planner is already open.
- Add regression tests for dashboard filtering, visibility, large lists, settings registration, session reuse, rest notifications, and planner actor switching.

## 1.0.1 — 2026-10-21

- Remember geometry separately for Planner, Rules, and Help per client; clamp stale or offscreen coordinates when the screen size changes.
- Persist geometry once per window close rather than repeatedly during dragging, with serialized setting writes to avoid reordering.
- Reuse an already-open window and bring it forward, preventing duplicate overlapping dialogs and resetting live input.
- Replace raw JSON in the player planner with translated, readable factor values; update the selected actor's player display when changing characters.
- Stop recalculating the quality preview for irrelevant form changes, and prevent repeated listener attachment on an unchanged dialog root.
- Harden the sleep lifecycle by clearing stale long-rest start markers on missing or replacement plans.

- Bound batch plan writes to four concurrent Actor updates and preserve the ordering of results.
- Avoid redundant Actor updates when clearing plans which are already empty and avoid unchanged rule setting writes.
- Improve responsive dialog controls: non-clipping button labels, scrollable content and narrower viewport styles.
- Add regression tests for geometry saving/clamping/write races, single-window lifecycle, player UI representation and group update bounds.
- Full source Git history retained; three ZIP release outputs verified.

## 1.0.0 — 2026-10-21

- Runyth Sleep v13 module for D&D 5e long rests.
- Seven assessable sleep-condition factors, deterministic five-tier rating and live scoring preview.
- GM-only per-character or selected-group plans, scene-wide reusable defaults, and GM-adjustable tier thresholds and consequences.
- Exhaustion penalties and temporary hit point bonuses applied after completed long rests without changing core recovery.
- Idempotent, one-use per-actor plans with replay ledger and GM retry API.
- Foundry v13 token-control launcher and DialogV2 user interface.
- English and German localization, configurable chat visibility, contextual help.
- Node-based unit and mocked integration tests; automated CI; three-ZIP release tooling.
