# Feature audit — Runyth Sleep v1.1.0

## Requested changes

| Requirement | Implementation |
| --- | --- |
| Delegate rules to a trusted player | `editRules` permission (default GM-only) with role minimum and per-user Allow/Deny/Inherit |
| Avoid broader Foundry admin rights | JournalEntry ownership only on one module-specific rules document, not the Configure Settings privilege |
| Restrict scene defaults/permissions | Both remain GM-only, even for delegated rule editors |
| Preserve existing rules | First GM session migrates thresholds, outcomes, mechanics and armor configuration to one document; old settings retained as fallback |
| Shelter grades | Exposed −1 / Quick 0 / Careful +1 / Solid +2 |
| Bedding scores | Bedroll 0 / Standard Bed +1 / other values unchanged |
| Rename planner note | Sleep Note / Schlafnotiz; plan data key `note` unchanged |
| Expanded Help | Four shelter examples, 15/60/1440-minute preparation benchmarks, score threshold table and roll explanation |
| No unnecessary polling or actor work | One rules document update per changed ruleset; no timers, extra rest hooks, or Actor migrations |

## Security model

Foundry world settings do not provide fine-grained custom rule-editing authorization. Granting a player Foundry's Configure Settings permission would be much broader than this request. This release instead creates an ordinary **JournalEntry** specifically for rules. Non-GM saves require BOTH the module `editRules` permission and genuine Foundry `OWNER` authorization on that JournalEntry. GMs manage membership via the Permissions tab. Read access is `OBSERVER`, not `OWNER`, for other players. The four legacy world settings are read-only compatibility inputs after migration.

**Important limitations:** A delegated owner may have ordinary JournalEntry controls for this dedicated rule document; delegate only to trusted players. If a non-GM manually corrupts the raw JSON flags outside the module's validated editor, the engine fails back to legacy settings rather than executing untrusted values. Revision checking detects already-applied edits but cannot supply server-side compare-and-swap for truly simultaneous updates. Live Foundry v13 integration testing is still required.

## Migration and safety

- Preserve namespaced existing Actor flags; `PLAN_VERSION` stays 1.
- Preserve `exposed`, `improvised`, `indoor`, `bedroll`, `bed` IDs; add `careful`.
- Initialize once from existing rule settings; guard multiple GM startup provision attempts.
- One journal flag update replaces four individual world setting writes, avoiding partially persisted rulesets.
- Validate numeric ranges, save/DC profiles, tier ordering, armor rules before writing; revisions guard stale dialogs.
- No socketlib dependency, GM socket proxy, elevated role permission, document monkey-patching, or render loops.

## Test coverage

`npm run check` includes all previous rest, dashboard, armor and sheet integration tests plus the v1.1.0 rule-store and UI help regression tests. The release script verifies manifest versions, Git integrity and all ZIP files. Live Foundry tests are separately documented in `docs/TESTING.md`.

## Official-vs-homebrew timing note

The shelter assembly durations are user-specified campaign benchmarks inspired by D&D-style exploration, **not** construction durations mandated by the 2024 D&D core rules.

References: https://foundryvtt.com/article/settings/ · https://foundryvtt.com/article/users/ · https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary#LongRest
