# v1.0.4 patch audit — rolled Sleep outcomes

**Goal:** Allow individual and tier-specific saving throws, DCs, scaling and bonus rolls, making durable high-CON characters better able to resist poor rest and profit from comfort.

## Root issues

Previous releases only supported flat integer exhaustion and temporary HP per sleep tier. A high Constitution score did not influence sleep resistance or comfort rewards, and the Rules editor lacked D&D-style save/check and dice configuration.

## Corrections

- Separate tier mechanics in an independently validated world setting; leave the v1.0.x base-outcomes and plan schemas untouched.
- Default poor and miserable grades now use native CON saving throws (DC 12 and 15), with severity raising difficulty; a successful save fully negates sleep-added Exhaustion.
- Default comfortable and excellent grades use `1d4 + CON` and `1d6 + 2 × CON`; the previous 3/5 temporary-HP bases remain minimum values to preserve customized worlds. No temporary HP stacking.
- Provide editable DC scaling by score, level, existing Exhaustion, ability modifier and proficiency, and editable success outcomes (negate/half/reduce/unchanged).
- Provide bounded, injection-safe dice modes, six abilities, arbitrary integer multipliers (within safe bounds), flat bonuses, level scaling and min/max values.
- Correctly call documented dnd5e 5.x `Actor5e.rollSavingThrow(config, dialog, message)` with `dialog.configure=false` and `message.create=false`. The Actor's own dnd5e save applies proficiency and special effects. No second configuration prompt or duplicate chat card.
- Protect a queued plan against canceled or failed rolls, and prevent a pending plan from being overwritten if changed while rolling. A same-session failed persistence update retains the result for a GM retry; normal success consumes plan and ledger in one update.
- Scope UI to sleep terminology, retain the dashboard color/layout and existing permissions; expand only one tier by default and allow per-client Rules window geometry persistence.

## Validation

- Unit tests for DC boundaries and scaling, success reductions, dice formulas, invalid/injected input, proficiency and level bonuses, compatibility floors.
- Mock integration for successful/failed saves, native API argument structure, no dialog, post-rest consequence, strong-CON benefits, duplicate prevention, concurrent plan replacement, storage failure and same-session no-free-reroll.
- Rule-editor structural and settings-persistence tests, and full v1.0.3 regression suite.
- JavaScript syntax, EN/DE key parity, CSS parsing, Git integrity and ZIP integrity checked during release.

**Limitations:** No actual Foundry v13 browser/session was available for end-to-end visual or dnd5e 5.x/6.x regression testing. Simultaneous competing rests from different browser clients and changed module interaction versions remain unsupported live-test cases. No external modules are copied into the release.

Official API references:
- https://github.com/foundryvtt/dnd5e/wiki/Hooks
- https://raw.githubusercontent.com/foundryvtt/dnd5e/master/module/documents/actor/actor.mjs
- https://raw.githubusercontent.com/foundryvtt/dnd5e/master/module/dice/_types.mjs
- https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary
