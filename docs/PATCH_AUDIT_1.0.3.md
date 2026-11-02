# v1.0.3 Dashboard design and permissions patch audit

## Reference and scope

Source of the reference design: the shared Runyth dashboard presentation foundation. The redesign is built directly on the shared style foundation and dashboard hierarchy, rather than attempting to imitate it with a table.

## Visual/UI changes

- Matching dark background gradient, panels (`#23262c`), warm gold accent (`#f0ca82`), rounded borders, button gradients, spacing, typography and focus outline.
- Matching header/status badges, scrollable tabs, scrolling dashboard body, overview panel grid, folder-grouped Actor cards, actor art, search/filter toolbar, selection toolbar and pagination.
- Sleep-specific badge colors distinguish poor/comfortable/etc. without unrelated dirt/body/clothing controls.
- Accessible button sizes, wraps, translated labels, scroll containment, and container-query narrow-window layouts (in addition to viewport rules).
- Overlays never intentionally duplicate; window geometry and active tabs/search/folders/status/page size remain per-client.
- Overview shows totals, current scene, quick actions and a compact list of queued sleeps. Actors tab is paged 20/40/80/120 and grouped by folder.
- Empty spaces and nonsensical unrelated actions were not carried over (soap, cleaning, contamination, maintenance, transaction ledger).

## Permission model

Permission role minimums and per-user allow/deny/inherit overrides intentionally follow a standard dashboard administration model. The new `Permissions` tab is GM-only. Actors and actions are filtered by permission at both render and service-call level:

| ID | Default role | Actor boundary | Notes |
| --- | --- | --- | --- |
| `viewOwn` | Player (1) | Foundry OWNER | Enables own-character dashboard and sheet launcher |
| `viewParty` | GM only (5) | Actor must be visible to client | Never grants Foundry Actor access |
| `viewLast` | Player (1) | Foundry OWNER | Shows last completed sleep on owned characters only |
| `planOwn` | GM only (5) | Foundry OWNER | Optional delegated planning and clearing, never others' Actors |

Foundry role 5 means GM-only, not an actual built-in role. The GM always has authority, even when a user override says deny. Only the GM may change permissions, world rules, scene defaults, and global configuration. No socket-based GM escalation or unauthorized Actor updates were added. World-level settings are not an alternative to Foundry's document authorization. The permission setting is a single namespaced, whitelisted object with stable defaults; the format is new and does not migrate old plans.

## Performance and persistence

- Actor flags and score evaluation are read only while overview or Actor browser is displayed, not when viewing Rules/Permissions/Settings.
- Filtered Actor rows reuse a single hydrated in-memory index per render; no duplicate evaluation pass for the Actor list.
- Browser renders only the selected page and lazily loads the images; folders are grouped after pagination.
- Live checkbox selection updates count, row highlighting and bulk-button availability without rerendering or writing Actor documents.
- Text search is debounced, Actor document refreshes are debounced, and rendering does not repeat event listeners on an unchanged root.
- Per-client filter state, active tab and window geometry persist; the existing positional storage retains serialized writes.
- Plan application remains a single Actor write after a D&D 5e long rest, with prior idempotency safeguards and bounded group operations.

## Validation

`npm run check` runs JavaScript syntax checks and simulated unit/integration tests. Tests include role minimums, overrides, ownership, delegated own-character changes, privacy, template structure, localization consistency, rest mechanics and window persistence. PostCSS was used to parse the adapted stylesheet successfully.

**Unverified in a live world:** exact rendering in Foundry v13 and Tidy5e, drag/resize interactions, the specific Foundry v13 ApplicationV2 action bindings, third-party interactions, role changes across connected clients, and actual Long Rest processing with the installed D&D 5e system. A standalone Chromium preview did not complete in the build environment; therefore no browser screenshot verification is claimed.

## Live acceptance checklist

1. Open Runyth Sleep side by side with a comparable presentation-focused module: confirm identical design palette/header/tab/panel/card spacing and no CSS bleed.
2. Open Runyth Sleep from Configure Settings, token controls and Actors sidebar; confirm singleton behavior and remembered window geometry.
3. Check Overview / Actors / Rules / Permissions / Settings tabs at narrow and wide sizes. Check sticky parts, scrolling, button wrapping and dark theme.
4. Check folder-filter recursion, text search, page-size changes, card grouping and bulk selecting/clearing across pages.
5. Set one player's `planOwn` to Allow; confirm they can set/clear *only* an owned Actor's plan. Deny `viewOwn` and confirm it disappears. Verify GM-only screens are absent.
6. For the same character, queue a miserable rest, complete Long Rest, verify Exhaustion and queued plan removal. Test excellent rest and preserved higher temporary HP.
7. Test player view of last result, viewParty permission, no Actor ownership bypass, German localization, permissions reload after new login.
8. Test together with a presentation-focused module: no conflicting styles, scripts, menus, settings or Actor flags.
