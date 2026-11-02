# Patch audit — Runyth Sleep v1.0.6

## Reported issue and root cause

The v1.0.5 character-sheet Sleep launcher appended a generic `.runyth-sleep-launcher` button directly inside Tidy's actor-name element or an arbitrary sheet-header container. Generic launcher CSS contained spacious button dimensions, and custom sheets could independently stretch or wrap the injected button. The module had no stable positioning contract relative to adjacent third-party sheet controls; both Tidy's partial renders and Foundry's multiple render hooks could influence ordering.

## Corrected behavior

1. Use the officially documented Tidy `data-tidy-sheet-part="actor-name"` and `name-container` anchors for identity-area accessories; never append inside the name input or other form control. When available, place the Sleep button directly **after** the actor-name anchor, before other name-adjacent control buttons.
2. Use a one-microtask-per-root `WeakSet` scheduler to normalize the order *after* synchronous render-hook callbacks have run. This handles different module registration orders and partial sheet renders without polling, observers, timers, or persistent DOM references. A second hook never duplicates a launcher.
3. For standard D&D 5e / compatible Foundry actor sheets, place the button in the window-header extension-control region, before any generic custom button and before Foundry's native close/ellipsis controls. Do not open dialogs or modify header controls on `renderApplicationV2` or unrelated application hooks.
4. Apply a dedicated `runyth-sleep-sheet-control` class with compact minimum dimensions, constrained width, no wrapping, icon and abbreviated label (localized `Sleep` / `Schlaf`), tooltip, keyboard focus ring, and a screen-reader label. CSS for titlebar action ordering is scoped to the exact actor-sheet header receiving the Sleep launcher. Other dialogs and dashboard buttons are unaffected.
5. Respect `canViewActor`/`canPlanActor` authorization exactly as before. Button activation still opens the existing actor-specific Sleep Planner; no changes to the rules engine, stored plans, rest hooks, or permissions.
6. **No foreign-module ID or CSS class is referenced.** The module collaborates through established Tidy/Foundry sheet structure. When a neighboring indicator exists, Sleep is positioned to its left; without one, Sleep retains the same compact header location.

## Performance and compatibility

- No new Foundry hooks; existing actor-sheet render hooks only.
- No MutationObserver, ResizeObserver, intervals, timers, or Actor writes added.
- DOM work occurs only during sheet renders and consists of a few bounded lookups and at most one microtask. Each root is independently deduplicated using a `WeakSet`, allowing garbage collection on window closure.
- Existing V1 and V2 D&D character sheets and Tidy render hooks are covered by mocked integration tests. The synthetic tests intentionally use generic neighbors rather than private module identifiers.
- No foreign stylesheet or script is bundled or imported.

## Automated checks

- JS syntax, CSS parsing, module metadata and locale parity.
- Tidy name-anchor placement, alternate name-container fallback, module-order independence, partial-render replacement, and idempotence under multiple hooks.
- Native Foundry window-control preservation, presence and absence of neighboring indicators, actor type filtering, player view-only permission, and non-Actor dialog isolation.
- Existing regression tests for sleep calculations, rules, dashboard, permissions, geometry and rest lifecycle.

## Live Foundry acceptance tests (not run in build environment)

1. Start Foundry v13 + dnd5e with Tidy 5e and another actor-sheet indicator module installed; open a character, verify **Sleep** appears immediately left of the other indicator, compact, in the top name/identity area. Click and confirm that exact Actor's plan opens.
2. Turn the other module off, refresh the character sheet; verify Sleep remains compact and functional in that same area. Swap module startup order and repeat.
3. Switch to the standard dnd5e sheet and reopen. Verify the Sleep control appears before custom accessories and the native close/menu controls; check other custom sheet implementations used in the world.
4. Narrow the sheet and browser viewport, change theme, zoom, and display scaling. Check no oversized button, wrong spacing, unexpected row, titlebar clipping, or overflow.
5. Render Tidy partial sheet sections, change name, switch tabs, and reopen the sheet. Verify precisely one Sleep button and no stale click callbacks.
6. Check GM, owning player with VIEW_OWN but without PLAN_OWN, and non-owner permissions. Check sheet closes, drag and keyboard navigation, and dashboard accessibility.
7. Open advancement/rest/roll dialogs; verify no Sleep control is injected into auxiliary windows.
8. Complete a long rest with a queued plan to ensure existing automation is unchanged.

## References

- Foundry v13 ActorSheetV2: https://foundryvtt.com/api/v13/classes/foundry.applications.sheets.ActorSheetV2.html
