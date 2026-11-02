# Runyth Sleep v1.0.7 — Armor rules audit

## Source-of-truth and terminology

- 2024 Core Rules: no sleeping-in-armor saving throw or penalty in the published Long Rest and Equipment chapters. The default preset intentionally does not invent one.
- Xanathar's Guide to Everything: older **official optional** rule for sleeping in medium or heavy armor. Restricts recovered spent Hit Dice to one-quarter (minimum one); existing Exhaustion does not improve after the Long Rest. No constitution saving throw.
- Custom (house rule): GM-configurable Constitution DCs and all six saving-throw abilities, normal/advantage/disadvantage, category rules, pass/fail Exhaustion and spent Hit Dice recovery. This is **not** official 2024 RAW.

## Engineering

- Armor is detected using item type/category plus equipped status; never inferred from text names or AC. Shield-only and unequipped items are ignored.
- Capture armor category, exhaustion and spent class Hit Dice on `dnd5e.preLongRest`. Use the captured snapshot on a **successful completed long rest**, even if equipment is later changed.
- Restrict subsequent adjustments to configured armor categories; preserve the standard system rest otherwise. Run house-rule bedding effects independently.
- For Xanathar, reconcile the native system's class-item Hit Dice recovery with configured percentages, distributing recovered dice deterministically across classes. Class-item updates do not replace the Actor's other data.
- Persist armor outcomes in namespaced Actor flags. A phase ledger separates Actor Exhaustion changes from embedded class-item adjustments so same-session retries do not reapply Exhaustion. Canceled/invalid rolls fail closed.
- All rules are validated as bounded values; only GM can change world settings or invoke administrative retry.
- No additional observers, timers, DOM polling, per-frame work or background updates. Armor work occurs only at rest boundaries.

## Automated tests

Run `npm run check`; this includes syntax, prior regression suites, and new armor pure-logic and rest lifecycle suites. Local Node mocks do not substitute for visual or Foundry-in-world testing.

## Live acceptance

See `docs/TESTING.md` for the full in-world checklist, including player-initiated rests, Tidy 5e, multiclass Hit Dice, partial updates and module interaction.

## Sources

- https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary#LongRest
- https://www.dndbeyond.com/sources/dnd/br-2024/equipment#Armor
- https://www.dndbeyond.com/sources/dnd/xgte/dungeon-masters-tools#SleepinginArmor
- https://github.com/foundryvtt/dnd5e/wiki/Hooks
