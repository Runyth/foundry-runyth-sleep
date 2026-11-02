# Runyth Sleep v1.0.2 — usage and UI discoverability patch

**Reference reviewed:** the shared Runyth dashboard presentation pattern (module, source and documentation surfaces).

## Root cause

Previous versions applied sleep effects **only** to a queued plan. The ability to queue plans was hidden in token controls; there was no obvious Settings menu entry or consolidated character dashboard. Thus a normal long rest with no plan deliberately had no effect, but gave no explanation. The D&D 5e system's rest hooks were already registered correctly.

## Presentation patterns adapted

| Presentation reference | Runyth Sleep implementation |
| --- | --- |
| Settings `registerMenu` for a manager class | `registerMenu` for `SleepDashboard` |
| Actors and Settings sidebar launcher cards | Scoped dashboard launcher cards |
| Actor sheet indicator | Character sheet sleep button |
| ApplicationV2/Handlebars manager | ApplicationV2/Handlebars dashboard |
| Actor search, folder filter, pagination, actor preview/actions | Sleep-plan search, folder/status filters, 40-row pages, sleep actions |
| Persistent window geometry | Per-client dashboard geometry and filters |
| Reuse manager instance, update only when necessary | Singleton dashboard, debounced refresh, no per-keypress Actor writes |

No unrelated business logic, contamination records, or assets are carried over. Runyth Sleep only handles sleeping and rest outcomes. The presentation reference is a workflow/UI pattern, not a runtime dependency.

## Safety and retention

- Existing `flags.runyth-sleep.pendingPlan` and `flags.runyth-sleep.lastResult` are backward compatible; no migration required.
- No new negative effects are ever applied when a rest has no queued plan.
- The unplanned-rest reminder fires **only after** `dnd5e.restCompleted`; canceled/short rests are not affected.
- Only a GM may queue, bulk edit, clear, save scene defaults or configure the rule table. Players see owned PCs only.
- Actor updates remain bounded to four at a time, and rerenders do not mutate Actor data.
- Search uses a 220 ms debounce; Actor-driven refreshes use 120 ms debounce; 40 rows/page cap.
- Dashboard geometry is clamped to available viewport on opening; client position/filter settings persist across sessions.
- Dashboard dialogs and actor-specific planners are reused or switched rather than stacked.

## Live acceptance checklist (required before production rollout)

1. Open **Module Settings → Runyth Sleep → Open dashboard**. Confirm the dashboard appears and reuses the same window when reopened.
2. Confirm Settings and Actors sidebar cards appear once, including after changing tabs.
3. Search for Mike Milligan. Open **Set sleep**, choose miserable conditions, save. Confirm dashboard shows a planned rest.
4. Execute Mike's Long Rest using the system sheet; verify after rest completion that Exhaustion increases according to rules and last result updates. Confirm pending plan disappears.
5. Long Rest **without** a plan: verify that no sleep consequence is applied and the correct explanatory notification appears. Confirm *dashboard* and *off* behavior under global settings.
6. Confirm the player view lists only owned PCs; attempts to edit/clear do not provide GM actions.
7. Check both system sheet and Tidy5e sheet integration, including partial renders and rest dialogs: sleep button must appear only on real character sheets, never a rest dialog.
8. Check German/English localized menu labels, narrow windows, 1280×720 displays, and panel geometry after reopening or changing resolution.
9. Filter by Actor folder, queued-only status, and clear selection; verify all navigation operates correctly with 100+ Actors.
10. Confirm short rests and canceled long rests do not produce outcomes or unplanned-rest notices.

**Tests:** `npm run check`. These are Node-based simulation/unit tests, not measured browser frame-time benchmarks or live Foundry VTT end-to-end tests.

Documentation references:
- https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html
- https://foundryvtt.com/api/v13/classes/foundry.applications.api.DialogV2.html
- https://github.com/foundryvtt/dnd5e/wiki/Hooks
