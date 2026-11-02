# GM Rules — Runyth Sleep v1.1.0

Runyth Sleep's consequences are optional **house rules**, not official D&D 5e rules. The dnd5e system finishes the long rest and its normal recovery first; this module evaluates the GM's one-night sleep plan **after** that. A canceled or short rest does not trigger a consequence. See [2024 Long Rest](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary#LongRest) and [temporary HP](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game#TemporaryHitPoints).

## Defaults

| Quality | Score | Base effect | Constitution resistance | Comfort roll |
| --- | --- | --- | --- | --- |
| Miserable | ≤ −5 | +2 Exhaustion on failure | CON saving throw, DC 15 + 1 per two points below −5 | None |
| Poor | −4…−2 | +1 Exhaustion on failure | CON saving throw, DC 12 + 1 per two points below −2 | None |
| Ordinary | −1…+1 | No consequence | None | None |
| Comfortable | +2…+4 | At least 3 temporary HP | None | `1d4 + CON modifier`, minimum 3 |
| Excellent | ≥ +5 | At least 5 temporary HP | None | `1d6 + 2 × CON modifier`, minimum 5 |

The default save negates all module-imposed Exhaustion on success. A stronger Constitution improves the native saving-throw result and the comfort bonus. A negative modifier cannot turn a benefit into negative temporary HP; the legacy minimum applies. If a character already has more temporary HP than the newly computed amount, existing temporary HP remains unchanged. These temporary HP follow the D&D system's ordinary end-of-long-rest expiration rules; this module does not create ongoing status effects.

The default exhaustion cap is 5, so the module does not independently cause Exhaustion level 6 (death). If a character already has level 5, a new penalty is suppressed; a successful long rest may first remove one level under 2024 rules. The GM can explicitly raise the cap in global Module Settings.

## How to edit

Open **Runyth Sleep dashboard → Rules → Edit rules**, or the Rest Planner's **Edit rules** link. Expand any of the five sleeping tiers. The editor includes three sections for that tier:

1. **Base consequences**: the Exhaustion added if the save fails or no save applies (0–6), and the non-stacking minimum temporary HP (0–100). The latter preserves existing v1.0.x customized values as safety floors.
2. **Resistance test**: enable/disable; native D&D 5e saving throw or ability check; any of the six attributes; base DC; severity, current Exhaustion, character level, selected ability modifier, proficiency bonus and fixed modifiers; min/max DC; normal/advantage/disadvantage; negate/halve/reduce/no change upon success; amount reduced on success.
3. **Comfort benefit**: no benefit / fixed / dice; 0–10 dice with d4/d6/d8/d10/d12/d20 (dice mode requires at least one); flat positive/negative modifier; choice of all six ability modifiers, multiplier, proficiency multiplier, character-level scaling; minimum/maximum resulting HP. GM-provided rules are validated as bounded integer values, never executed as text or arbitrary formula code.

**Restore default rules** requests confirmation and resets tier thresholds, base consequences and every advanced rule profile. Save validates the complete ruleset and performs a single dedicated rules-document update. A GM can delegate this editor with the `editRules` permission without granting global world-settings rights.

### Effective saving-throw DC

For a planned sleep tier, the module computes:

`DC = clamp(minDC, maxDC, baseDC + floor(max(0, tierAnchor − sleepScore) / qualityStep) × qualityGain + currentExhaustion × exhaustionGain + floor((actorLevel − 1) / levelStep) × levelGain + abilityModifier × abilityMultiplier + proficiencyBonus × proficiencyMultiplier + flatModifier)`

Terms with `qualityStep = 0` or `levelStep = 0` are disabled. `tierAnchor` is the configured poor/miserable cutoff for those tiers, or zero otherwise. Note that Constitution *already* improves the native saving throw, and should not be subtracted from the DC unless you deliberately wish to reward it a second time (`abilityMultiplier < 0`). DC min and max are editable from 0 to 40; base defaults are 12 and 15, bounded by 5–30. Difficulty 5/10/15/20/25/30 is a useful D&D-style reference rather than a hard rule; set boundaries explicitly for your campaign.

**Example:** Poor sleep score −4 gives a default DC 13 (base 12 plus one point for the two severity points below −2). Constitution +4 and saving throw proficiency +2 are then handled by the native dnd5e saving-throw implementation: roll d20 + modifiers against DC 13. A successful roll prevents module Exhaustion. No extra save roll is made when the base Exhaustion is 0.

### Bonus-HP formula

For dice mode, the roll formula is:

`N d sides + flat + abilityModifier × abilityMultiplier + proficiencyBonus × proficiencyMultiplier + floor((actorLevel − 1) / levelStep) × levelGain`

The final computed *offer* is clamped to the tier's min/max, preserving the legacy minimum as a floor, and compared against current temporary HP: the module keeps the larger value, **never stacks temporary HP**.

**Example:** A comfortable bed with CON +4 grants at least 3 temporary HP, rolling `1d4+4`: possible results 5–8. An excellent bed with CON −1 rolls `1d6−2` with a floor of 5. To make bonuses more pronounced for healthy characters, change the Constitution multiplier or die size in that tier.

## Native roll behavior and safety

On a completed long rest with a queued plan, the module calls dnd5e's native `actor.rollSavingThrow({ ability, target, advantage/disadvantage }, { configure: false }, { create: false })` (or its native ability-check counterpart) to retain proficiency, effects and character roll bonuses. That native roll isn't separately posted in chat; the module posts one localized result summary (subject to the configured public/GM/off chat visibility). The last result Actor flag retains the save total, computed DC, success, HP formula, rolled total and actual attribute delta. A canceled or nonnumeric native roll **fails closed**, leaves the plan queued and does not apply a guessed penalty. Missing Foundry dice support similarly preserves the plan.

One plan is consumed by one successful Actor update, which also writes the result ledger. During a transient update failure the already evaluated roll is held in client memory for a same-session retry, avoiding a free reroll; replacing the plan or changing rule configuration invalidates that cache. Restarting the client clears this ephemeral cache. Automatic retries are never scheduled. The GM recovery method is `game.modules.get('runyth-sleep').api.retryApply(actor)` after an actually completed long rest; do **not** use it before rest just because the API exists.

## Score factors

Seven factors determine the quality tier: bedding, shelter, temperature, moisture, noise, safety and interruptions. In v1.1.0, shelter becomes Exposed −1, Quickly Improvised 0, Carefully Improvised +1, and Solid/Indoors +2; Bedroll becomes 0 and Standard Bed becomes +1. Other scores stay unchanged. Existing choice IDs and plan schema 1 are preserved, but quality tiers for already queued plans are recalculated under the new values. The current effective rules are stored in a dedicated, permission-controlled JournalEntry, migrated from prior settings.

## v1.0.7: equipped armor and Long Rest

**Official 2024 rules:** In the published 2024 Long Rest and Armor rules, there is no rule requiring a Constitution save due solely to sleeping in heavy armor; do not confuse this with sleep-deprivation saves or other environmental hazards. The default **2024 Core Rules** preset therefore applies **no additional armor consequence**.

**Older official optional rule:** *Xanathar's Guide to Everything* treats light armor as harmless for sleeping and imposes two consequences for medium/heavy armor: you regain only 25% of the **spent Hit Dice** (at least one), and your Long Rest does not lower existing Exhaustion. It is an optional earlier-edition rule, **not an explicit 2024 core rule**. The 2024 system Long Rest first restores all spent Hit Dice; when this mode is enabled, Runyth Sleep adjusts **class items** to represent a quarter-recovery result. This is a DM-selected compatibility interpretation; verify with other rest-altering modules.

**Custom Constitution-saving-throw house rules** are provided because some campaigns want armor durability and character Constitution to matter. Out of the box, Heavy armor has DC 15 (CON), Medium DC 12 (CON), both with +1 Exhaustion on failure and no consequence on success; light/unarmored do not activate. GM can independently configure any category: disabled/enabled, ability, DC, advantage/disadvantage, additional Exhaustion, suppression of Long Rest Exhaustion reduction, and recovered Hit Dice percentage for either save result. These consequences supplement bedding/comfort quality and are never silently substituted for 2024 RAW.

**Sequence:** On `dnd5e.preLongRest`, capture equipped armor category and pre-rest exhaustion / spent class Hit Dice. After `dnd5e.restCompleted`, first apply any queued bedding plan, then process configured armor effects. Long Rest completion is required; short rests and canceled rests do nothing. In the Xanathar mode, if a character had 8 spent Hit Dice before the Long Rest, they recover 2 and finish with 6 still spent. If they had 1 spent, they recover 1. A Long Rest that reduced Exhaustion from 2 to 1 has that one point restored. Shields never count as armor. When using custom saves, the module invokes the native dnd5e save API to capture Constitution proficiency and modifiers.

**Recovery:** `game.modules.get('runyth-sleep').api.retryArmorRest(actor)` is a GM-only, same-session retry for an armor consequence that failed after a completed Long Rest. Failed storage writes preserve the resolved save to prevent free rerolls. Changes in embedded class items and Actor flags are checkpointed, avoiding double exhaustion on retries. Do not invoke the API to perform a new rest.

Reference: https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary#LongRest · https://www.dndbeyond.com/sources/dnd/br-2024/equipment#Armor · https://www.dndbeyond.com/sources/dnd/xgte/dungeon-masters-tools#SleepinginArmor

## v1.1.0 — Rules storage and delegated permissions

- `editRules` defaults to role minimum `5` (GM only). A GM grants trusted users `Allow` under Dashboard → Permissions or changes the minimum role. A `Deny` override always takes precedence for that user.
- On a GM's first login after upgrading, the module creates **Runyth Sleep — Rule Configuration**, migrates the old thresholds, outcomes, mechanics and armor settings into one validated flag, and stores its ID in a hidden world setting. No old Actor plans or results are rewritten.
- An authorized editor receives `OWNER` on this *single rules JournalEntry*, with read-only/OBSERVER as the document default. Authorization requires **both** the module's `editRules` setting and Foundry OWNER on this document. An unauthorized player cannot grant themselves either permission through the Runyth interface.
- A delegated user can edit saving-throw DCs, thresholds, temporary HP formulas, and armor behavior without Foundry's broader **Configure Settings** permission. They cannot change module permission grants or scene defaults. Rule updates are validated and written atomically as one document update, with a revision check against stale editors. The GM can revoke ownership by saving updated permissions.
- The rules JournalEntry appears in the ordinary Journal directory, so **do not delete it**. As with any owned JournalEntry, an authorized user may see its normal document controls; restrict delegation to trusted users. If deleted, a GM must reconnect and let the module reprovision it from the legacy settings (recent unsynchronized document-only edits may be lost).
- A non-GM can edit while the GM is offline once the rule document exists and the user has OWNER. Concurrent saves from multiple clients are protected by an optimistic revision check; a simultaneous network race cannot be prevented atomically by Foundry's document API.

### New scoring defaults and shelter construction guidance

| Shelter | Score | Example | Preparation |
| --- | ---: | --- | --- |
| No Shelter / Exposed to Elements | −1 | No wind or rain barrier | 0 |
| Quickly Improvised Shelter | 0 | Toss leaves, light branches or a loose tarp into position | 15 minutes |
| Carefully Improvised Shelter | +1 | Proper lean-to or tightly secured tarp with layered insulation | 60 minutes |
| Solid Shelter / Indoors | +2 | Existing inn room, sturdy hut, house, or durable long-term nomad tent | At least 24 hours to construct anew |

These building times are **Runyth Sleep house-rule benchmarks**, not official D&D 2024 core crafting rules. Shelter quality reflects realistic durability and actual protection; poor material, exposure, or weather may warrant additional temperature/moisture penalties. Bedding: **Bedroll +0, Standard Bed +1**; ground, straw, comfortable, and luxurious bedding retain their prior values. The Help dialog now includes each shelter's examples and a dynamic table of the current quality-score bands and configured save/HP modes.
