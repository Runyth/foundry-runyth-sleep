# Architecture — Runyth Sleep v1.1.0

## Structure

- `scripts/domain.js`: deterministic, Foundry-independent scoring, validation, and proposed Actor data updates.
- `scripts/mechanics.js`: pure validation, tier profiles, DC calculation and bounded temporary-HP formulas.
- `scripts/engine.js`: server-document permission enforcement, pending-plan persistence, D&D rest lifecycle, post-rest application, chat announcements, and public integration points.
- `scripts/planner.js`: Foundry v13 DialogV2 UI, scene defaults, rules editor, and single-instance window lifecycle.
- `scripts/geometry.js`: validation/clamping of screen coordinates, per-client persistence on close, and serialized writes.
- `scripts/main.js`: module initialization, public API, world/client settings, and scene token-control tool.
- `styles/module.css`: responsive module-scoped controls.
- `languages/en.json` / `de.json`: native Foundry localization.
- `tests/`: Node built-in test runner; no dependencies or network needed.

## Actor flags

`flags.runyth-sleep.pendingPlan`: schema `1`, unique `id`, validated `choices`, GM note, epoch-millisecond `createdAt`, and `createdBy` user ID. Created/replaced by a GM or permitted Actor owner; deleted (represented by `null`) by a single successful post-rest actor update.

`flags.runyth-sleep.lastResult`: schema `1`, `planId`, score, tier, time, applying user, native save result (if applicable), comfort dice metadata and actual before/after change record. The last result identifies consumed plans and aids recovery and auditing.

`flags.runyth-sleep` is namespaced and never touches arbitrary foreign module data.

`flags.runyth-sleep.defaultChoices` on a **Scene**: validated factor selections used for subsequent planning in that scene.

## Lifecycle

1. GM stores a validated plan on the actor (a distinct ID for every actor).
2. `dnd5e.preLongRest` records the expected plan ID in ephemeral client memory; `dnd5e.preShortRest` cancels that marker.
3. D&D 5e performs its ordinary long rest. A canceled rest does not fire a completion that matches the ephemeral marker.
4. `dnd5e.restCompleted` checks the marker (within 20 real-world minutes), actor, plan ID and short-rest indicators.
5. The owner (or GM) calculates consequences from current actor attributes **after** core rest recovery, using the advanced validated mechanics profile. Any required saving throw uses the dnd5e system API with `dialog={configure:false}` and `message={create:false}`; comfort dice use Foundry `Roll` with integer-validated formulas.
6. A **single Actor.update** sets Exhaustion and/or temporary HP, clears the plan and writes the result ledger.
7. Chat announcement occurs **only after** update success; message failure never repeats the mechanical change.

The 20-minute marker bounds stale state from abandoned rest dialogues. Manual retry intentionally bypasses a start marker but requires GM privileges.

## Public API

After `ready` in a D&D 5e world:

```js
const api = game.modules.get("runyth-sleep").api;
await api.openPlanner();
await api.openHelp();
await api.openRules(); // GM-only
const plan = api.getPlan(actor);
const last = api.getLastResult(actor);
const preview = api.evaluate(choices); // optionally thresholds and outcomes
const results = await api.setPlans([actor], choices, "Optional GM note"); // GM by default; optional Actor-owner delegation
await api.clearPlans([actor]); // GM by default; optional Actor-owner delegation
await api.retryApply(actor); // GM-only; only after an already completed rest
```

`openPlanner({actors: [actorA, actorB]})` supports explicit Actor arguments. The API object is frozen; its methods perform their own permission checks.

## Compatibility boundaries

- Foundry v13 public `getSceneControlButtons` hook and `DialogV2` API.
- D&D 5e system hooks `preLongRest`, `preShortRest`, `restCompleted` as documented in its hook wiki.
- D&D 5e native `system.attributes.exhaustion` and `system.attributes.hp.temp` updates.
- No client-to-GM sockets: the authoritative Actor owner client already holds write permission on its actor.
- No external dependencies, service endpoints, third-party module requirements or macros automatically installed.

**Limitations:** mocked tests validate logic and hooks; version-matrix testing in a running Foundry v13 installation remains necessary. A second simultaneous rest operation initiated from another client on the same Actor is not a supported coordination scenario. Only one queued plan exists per Actor.

## Window and performance policies (v1.0.1)

- Three independent client settings: `plannerPosition`, `rulesPosition`, `helpPosition`; geometry comprises numeric `left`, `top`, `width`, `height`.
- `DialogV2.wait` render/close callbacks are used, per Foundry v13's public API. Each dialog type has a single active instance; repeat openings bring the window to the foreground without resetting form selections.
- Client size is recalculated on opening, clamping stale coordinates to the active viewport. A synchronous cache supports immediate reopen while its asynchronous setting write is pending; serialized writes avoid older closes winning races.
- No position listeners or polling, no persistent animation loops, and no module-specific background timers.
- DOM events are attached only once per rendered content root; the preview recomputes only on factor changes. The actor selector refreshes the active actor's plan and last result on the player UI.
- GM batch plan writes use at most four concurrent Actor updates with stable result ordering. Already-empty queued plans do not trigger unnecessary Actor updates.

## Data retention & uninstall

This release stores two small Actor flags and an optional Scene defaults flag. Uninstalling the module leaves these passive flags in the world; this avoids destructive cleanup. There is no automatic migration or removal of other documents. The GM can clear pending plans from the UI before uninstall.

## Upstream reference documentation

- https://foundryvtt.com/article/module-development/
- https://foundryvtt.com/api/v13/functions/hookEvents.getSceneControlButtons.html
- https://foundryvtt.com/api/v13/classes/foundry.applications.api.DialogV2.html
- https://github.com/foundryvtt/dnd5e/wiki/Hooks


## v1.0.4 dashboard entry points

`getDashboardClass()` returns a singleton-compatible Foundry v13 `HandlebarsApplicationMixin(ApplicationV2)` class. Foundry's `game.settings.registerMenu` uses that class to open the all-character dashboard. The same dashboard instance is shared with Settings sidebar, Actor sidebar, and Token Controls launcher calls. Actor sheets provide an actor-specific planner launcher, never a generic window button on unrelated rest/roll dialogs.

The dashboard uses a native Handlebars UI with escaped Actor names/images, role/override-filtered actions, per-client tab/filters/geometry, configurable bounded pages (20/40/80/120 Actors) and debounced renders. `updateActor`, `createActor`, and `deleteActor` hooks refresh only the open dashboard. Existing plan flags and rest hooks are unchanged.

When a completed long rest has **no queued plan**, an optional post-completion reminder explains this and links the user to the dashboard through documented navigation. The setting can optionally bring the GM dashboard forward; absent plans never modify Actor mechanical state.

## v1.0.4 permission architecture and presentation design

- `scripts/permissions.js`: whitelisted world permission definitions, role minimums, optional user overrides, GM bypass and Actor ownership checks. `viewOwn`, `viewParty`, `viewLast`, `planOwn`, and (as of v1.1.0) `editRules` are the delegated rights. Scene defaults, global settings and permission administration remain GM-only.
- `templates/dashboard.hbs`: dashboard header/tabs, overview panels, paginated folder-grouped Actor cards, rules/permissions/settings panels.
- `styles/module.css`: module-scoped `rs-` class names with self-contained styling. Requires no additional module to be installed.
- Permitted Actor-owner changes are explicitly enforced inside `setPlans` and `clearPlans`, not merely hidden/shown in the UI.
- Existing `pendingPlan` and `lastResult` schemas, long-rest hooks, and calculation paths are unchanged.

## v1.0.4 mechanics

The world setting `mechanics` contains five independent `{save, hp}` profiles. It does not replace `thresholds` or `outcomes`; the latter still contain the exhaustion base and compatibility floor for temporary HP. `sanitizeMechanics` rejects invalid choices, unsafe numeric ranges, inconsistent bounds and unsupported die sizes. Profiles are evaluated *at rest completion*, not when the plan is created, and don't require re-queueing after a GM rules edit.

The native dnd5e `rollSavingThrow` / `rollAbilityCheck` method is invoked with three objects: process config (`ability`, `target`, optional advantage/disadvantage), `{configure:false}`, `{create:false}`. The module posts one own chat report and persists roll results in `lastResult`; roll failures abort rather than applying guessed consequences. The in-memory `resolvedRolls` cache prevents a same-session free reroll after a failed Actor write. Changing the plan invalidates cached rolls. Exact cross-client ordering and live Foundry compatibility still require testing.

References: https://github.com/foundryvtt/dnd5e/wiki/Hooks ; https://raw.githubusercontent.com/foundryvtt/dnd5e/master/module/documents/actor/actor.mjs ; https://raw.githubusercontent.com/foundryvtt/dnd5e/master/module/dice/_types.mjs


## v1.0.5 — Dialog layout ownership

- `runyth-sleep-window` belongs exclusively to the three `DialogV2.wait` auxiliary windows: Rules, Planner and Help. The dashboard is a distinct `ApplicationV2` and retains its original `rs-app-shell` / `rs-content` layout.
- DialogV2 `window-content` and `form.dialog-form` form a flex column with `min-height: 0`, so a saved size (or a user resize) supplies the available height. This also allows narrower displays to shrink the content without overflowing the window.
- Only `.dialog-content` is scrollable (`overflow-y: auto`). The inner `.runyth-sleep` and `.rs-sleep-advanced` have **no** viewport-percentage `max-height` or nested scrollbar; their content can use the whole available viewport. `.dialog-buttons` is non-shrinking.
- No resize observer or height polling: all calculations are handled by CSS layout. Window geometry persists only on close, as before.
- Automated tests in `tests/dialog-layout.test.js` guard the CSS height/scroll ownership. `tools/layout-smoke.mjs` optionally renders the actual dialogs' content in a structural Foundry shell using local Chromium, over three viewport/window sizes. A live Foundry check remains necessary.

## Actor-sheet header integration (v1.0.6)

`scripts/launchers.js` registers the standard `renderActorSheet`, `renderActorSheetV2` and Tidy actor-sheet render hooks; no global application hook or monkey-patch is used. It resolves actual character Actors and enforces `canViewActor`, then attaches one `runyth-sleep-sheet-control` per sheet root. Tidy renders use its documented actor-name/name-container anchors with a microtask coalesced by a WeakSet, so later synchronous third-party injections cannot push Sleep to the right. Foundry headers use generic extension-button detection and keep native menu/close actions at the right. Styles are isolated to the exact sheet indicator/header and never apply to the dashboard or other application headers. Button click delegates to `openPlanner({ actors: [actor] })` using existing permissions. No Actor write occurs on rendering.

## v1.1.0 — Rule document, authority and migration

- `scripts/rules-store.js` is the canonical rule reader/writer for all rest effects, armor rest behavior and previews. The GM-owned rule document is `JournalEntry` with ID persisted in `game.settings` (`rulesJournalId`), and namespaced flag `flags.runyth-sleep.ruleConfiguration`. That flag carries `schema=1`, `revision`, and fully validated `thresholds`, `outcomes`, `mechanics`, `armorRules`.
- A designated active GM creates it on `ready` and migrates four previously hidden world settings into the initial rule configuration. Thereafter the document is authoritative. The original settings remain registered as a compatibility and failure fallback, **not a second live state**; no client-to-GM socket or privileged setting write is needed.
- `permissions.editRules` uses role minimums and user overrides, default GM only. The GM synchronizes the ownership of this *specific* JournalEntry (`default: OBSERVER=2`, authorized user IDs: `OWNER=3`). Editors must satisfy module permission AND real Journal OWNER. Only GMs mutate the world `permissions` setting or scene defaults.
- All rule fields are validated as one transaction; a single `JournalEntry.update` updates the rules and increments an optimistic revision. Clients receive normal Foundry document synchronization. No polling, socket request proxy, per-Actor migrations or additional rest hooks are introduced.
- If the dedicated JournalEntry is missing/invalid, reading falls back to validated previous world settings; non-GM changes fail closed. The GM initializes/reconciles on login. Editing unrelated world settings is deliberately not delegated.

Reference: https://foundryvtt.com/article/settings/ — world settings are not granularly delegable; https://foundryvtt.com/article/users/ — document ownership permissions.
