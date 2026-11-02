# Runyth Sleep v1.0.1 — performance and reliability audit

**Scope:** v1.0.0 source review, Foundry v13 public API compatibility, mocked UI lifecycle checks, domain and persistence regression tests. No running Foundry instance was available. Consequently this is **not** a claim that live-world rendering, network conditions, or other modules have been tested.

| Review area | v1.0.0 observation | v1.0.1 result |
| --- | --- | --- |
| Window geometry | Only planner remembered geometry; event listener saved repeatedly during movement | All three windows save on close, independently; coordinate clamps adapt to resized screens |
| Geometry write ordering | A delayed prior write could override a newer close | Same-window client settings writes serialized and latest geometry cached |
| Repeated window opening | Each click could open a duplicate and reconstruct UI | One dialog per type; existing dialog brought forward |
| Non-GM player interface | Raw JSON displayed; selecting another actor didn't refresh read-only conditions | Translated descriptive labels and reactive selected-actor display |
| UI update workload | Quality recomputation triggered by any form change | Quality computed only for relevant factor changes |
| Responsive controls | Small window width could compress button labels | Scoped wrapping/minimum clickable height and constrained scroll area |
| Group plan latency | A single sequential loop awaited every Actor update | Four bounded parallel writes, stable result order and isolated failures |
| Redundant documents writes | Clearing an empty plan still sent Actor.update | No-op clears perform zero writes |
| Rules save | All rules settings re-written even when unchanged | Skip unchanged values |
| Rest marker | Stale start could remain when a subsequent preLongRest had no plan | Explicitly clear marker before storing new valid start |
| Security | HTML display content must be escaped, GM-only mutators retained | Existing escaping and permissions remain; no new network calls |
| Dependencies | No third-party runtime JS or background network | Unchanged; zero added dependencies |

## Regression validation

Run `npm run check` from the checked-out source. Tests exercise pure calculations, permissions, persistence failure, idempotency, rest-start/completed wiring, localized assets, geometry layout bounds, close/reopen, and bounded concurrency. Tests have no real browser DOM or Foundry service and therefore do not measure in-world frame rates or module interaction timing.

## Manual verification requirements

1. Check all three dialogs in Foundry 13 at 1920×1080, 1280×720 and narrow/translated layouts; resize and move each, close, refresh browser and reopen.
2. Drag a window repeatedly with network throttling; verify no repeated Settings update traffic before close and exactly one successful persistence on close.
3. Open each window several times by hotkey/token toolbar and verify there is only one window of that type.
4. Select multiple PCs (10–50 if available); verify group plans take effect and no duplicates occur.
5. Verify one completed long rest initiated by a player and by a GM, and cancelled rest/short rest cases, against your exact dnd5e installation and rest modules.
6. Verify the parent planner retains unsaved form state while Help or Rules windows are independently opened and closed.
7. Simulate failing chat/Actor updates and verify exactly-once mechanical consequences and GM recovery.

**Relevant Foundry v13 APIs:**
- https://foundryvtt.com/api/v13/classes/foundry.applications.api.DialogV2.html
- https://foundryvtt.com/api/v13/interfaces/foundry.DialogV2WaitOptions.html
- https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html
- https://github.com/foundryvtt/dnd5e/wiki/Hooks
