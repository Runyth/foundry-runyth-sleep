# User Guide — Runyth Sleep v1.1.0

## First-time setup — dashboard (v1.0.4)

1. Enable Runyth Sleep in a D&D 5e world (Foundry VTT v13).
2. Open **Configure Settings → Module Settings → Runyth Sleep → Open dashboard**. The same dashboard is available from the Settings sidebar, Actors sidebar, and bed icon under Token Controls.
3. Find **Mike Milligan** using the search field. The actor card shows queued condition rating, last completed sleep, and quick actions.
4. Click **Set sleep** on Mike's row. Choose bedding, shelter and the five other factors; review the live score; then click **Queue rest**.
5. Perform the ordinary **Long Rest** from Mike's D&D 5e character sheet. After it completes, Runyth Sleep automatically rolls any required native Constitution saving throw and/or comfort dice, then applies the result.
6. Return to the dashboard to see his updated last sleep result. The queued plan is consumed; it cannot apply twice.

**If no plan was queued:** The rest operates normally. By default Runyth Sleep now displays *Long rest finished without a queued ... plan: no extra effects were applied*. To also open the dashboard automatically in this situation, select **Unplanned long-rest behavior → Remind and open dashboard (GM only)** under Module Settings. Choosing *Do nothing* disables this notice. No option silently applies penalties to unplanned rests.

The GM can select multiple Actor rows, then use **Plan for selected** to apply the same sleeping conditions to that group. The dashboard searches Actor names/folders, filters queued and unplanned characters, filters Actor folders, and uses pagination (40 rows/page) for large worlds. Only GMs can edit by default; a GM may delegate **planOwn** in the Permissions tab to individual owners. Players otherwise see their own characters.

## The dashboard layout

- **Overview:** sleeping summaries, queued plan preview, current scene and quick actions.
- **Actors:** folder-grouped character cards, searches, folder and status filters, selectable cards, pagination and single/group sleep actions. Use the **Actors** tab when looking for Mike Milligan.
- **Rules:** open the GM/delegated rule editor. Expand any tier to edit saving throws, DC scaling, advantage/disadvantage, success reductions, comfort dice and modifiers.
- **Permissions (GM):** set role minimums (Player, Trusted, Assistant GM or GM only) and individual Allow/Deny/Inherit overrides. `viewOwn` and `viewLast` default to Player; `viewParty`, `planOwn`, and `editRules` default to GM only. Even with `planOwn`, users must already own the Actor in Foundry. No permission allows changing another user's plan on an unowned Actor.
- **Settings (GM):** open Foundry's Module Settings for automation, cap, result announcements and unplanned-rest handling.

The visual styles are native to this module and work independently: no other module is required as a dependency. Active tab, search, subfolder filter, status, page size and window geometry persist per client.

## A night's sleep

1. **GM:** Select the characters' map tokens. The planner will target all selected character actors once (duplicates are filtered).
2. **GM:** Choose bedding, shelter, temperature, moisture, noise, safety, and interruptions. The scoring preview updates with the quality, expected save DC and comfort dice formula; it does not roll prematurely.
3. **GM:** Optionally write a short note (up to 200 characters). It is not copied to the chat announcement.
4. **GM:** Click **Queue rest**. This stores one replaceable plan per character.
5. **Player/GM:** Perform the normal D&D 5e **long rest** for the character. Runyth Sleep waits for the system's completion hook, then applies any post-rest consequence.
6. One chat entry reports sleep quality, saving-throw total / DC / pass-or-fail, rolled bonus-HP formula and **actual** Exhaustion / temporary HP gains (unless disabled or set to GM whisper). The last result is also retained on the character.

**Multi-character selection** is useful for parties sharing a camp. When no tokens are selected, the planner presents a character dropdown. On a player client, the window is inspect-only.

## Window sizes and positions

The Dashboard, Planner, Rules Editor, and Help windows remember their **own** width, height, and location separately per client. Move or resize a window and close it normally; on the next opening it uses your last geometry. On a changed/smaller screen, the window is automatically brought back into the visible area. An already-open window is brought forward rather than duplicated.

Dashboard search/status/folder filters also survive reopening. Player users see localized, readable condition labels in the read-only window. Switching characters updates the displayed pending plan, sleep grade, and last result.

## Scene defaults

Click **Save scene defaults** in the GM planner to store the current selections on the active scene. A future planner opened on this scene uses those choices unless the chosen actor already has a pending plan. Scene defaults do **not** automatically apply to every rest: each actor's plan is still explicit.

## Worked examples

| Sleep | Bedding | Shelter | Other important factors | Typical rating |
| --- | --- | --- | --- | --- |
| Mud under open sky | Bare ground | Exposed | Dangerous temperature, soaked | Miserable |
| Roadside night | Bedroll | Quickly improvised shelter | All other conditions ordinary | Ordinary |
| Modest inn | Standard bed | Indoors | All other conditions ordinary | Comfortable |
| Quality lodging | Comfortable bed | Indoors | All other conditions ordinary | Comfortable |
| Protected luxury chamber | Luxurious bed | Indoors | Quiet, secure / guarded | Excellent |

## Change rules — Constitution and dice

Under **Dashboard → Rules → Edit rules**, the GM can expand each of the five sleep-quality tiers. There are three subsections: base Exhaustion and minimum HP; native saving throw/ability check configuration; and comfort bonus/rolled-HP configuration. The editor is scrollable and remembers its position/size. The default rules are:

| Tier | On completed Long Rest |
| --- | --- |
| Miserable | CON saving throw DC 15 (increases with harsher conditions); failure +2 Exhaustion, success 0 |
| Poor | CON saving throw DC 12 (increases with harsher conditions); failure +1 Exhaustion, success 0 |
| Ordinary | No extra consequence |
| Comfortable | `1d4 + CON modifier` temporary HP (minimum 3) |
| Excellent | `1d6 + 2 × CON modifier` temporary HP (minimum 5) |

These are house rules, not official 2024 rules. D&D 5e already processes the normal long-rest Exhaustion reduction; the sleep save is performed afterwards against a separate potential sleep penalty. Saves use native 5e character proficiency, special effects and roll bonuses. Authorized rule editors may choose different abilities, DCs, severity scaling, character level/proficiency scaling, advantage/disadvantage, success reductions, die count/size, HP multipliers and limits. The **Restore default rules** action requires confirmation. Full ranges and formulas are in `docs/GM_RULES.md`.

Example for Mike: a roadside night typically scores `Poor`, giving a DC 12 CON save. If Mike has a +4 CON modifier (before proficiency), a d20 result of 9 gives at least 13 and avoids +1 Exhaustion. Another character with CON −1 must roll at least 13 on a d20 to avoid the same penalty (unless other save modifiers apply). A comfortable bed grants Mike `1d4+4` instead of a fixed 3 temporary HP.

## Plan changes

The GM can **Queue rest** again to replace an existing plan, or click **Clear plan** and confirm to cancel it. The last completed sleep outcome stays in the Actor's `flags.runyth-sleep.lastResult` for inspection.

## Failures and recovery

If a roll is canceled or an Actor update fails, the queued plan stays on the actor. A same-client retry after an Actor write failure reuses the previously evaluated roll, unless the plan or rules are changed. Review the console error and ensure the character has completed their long rest. The GM may run this in a Script Macro:

```js
// Retry a previously failed post-long-rest application for a controlled character.
const actor = canvas.tokens.controlled[0]?.actor;
if (!actor) throw new Error("Select a character token first.");
const result = await game.modules.get("runyth-sleep").api.retryApply(actor);
ui.notifications.info(`Sleep retry: ${result.status}`);
```

**Do not run this recovery action on a character who has not yet completed the rest.** The GM-only method deliberately permits recovery of an otherwise stranded plan.

## Notes

- Temporary hit points do not stack; the higher existing value is retained.
- An ordinary D&D 5e long rest may already reduce Exhaustion; this module adds its penalty **after** the system finishes that rest.
- D&D 5e system-level requirements and rest interruptions continue to apply normally.
- Sleep consequences apply to character actors, not NPCs.

## Character-sheet button (v1.0.6)

Find the small **Sleep** / **Schlaf** button with the bed symbol in the character sheet's top identity/header area. Click it to view or configure **that character's** next sleep plan. Only users with the corresponding character permissions see the button; plan editing remains restricted by the module's Permissions settings. A view-only player cannot use the sheet button to modify the plan.

- Tidy 5e: beside the character name, before other actor-name accessories (if present).
- Standard Foundry D&D 5e actor sheets: in the top window header, before custom indicators and native window actions.
- Other compatible sheets: use the available name/header insertion area; sheets that expose neither may omit the control. The dashboard remains accessible through Module Settings and the Actor Directory regardless.

Button positioning is based on generic sheet structures, not a hard dependency on any other module. If two modules provide indicators, they should appear as compact neighbors; if other indicators are absent, Sleep is shown by itself.

## v1.1.0 — Delegate the Rules editor

1. As GM, open **Runyth Sleep Dashboard → Permissions** and find **Edit sleeping rules**.
2. Leave the default **GM only** minimum and, under the trusted player's account, select **Allow**. Alternatively, set the role minimum to **Trusted Player** to authorize that entire role. Save permissions.
3. The player may open **Dashboard → Rules → Edit rules**. They can change thresholds, DCs, rolls, exhaustion, temporary HP and sleeping-in-armor rules. The settings do **not** grant them permission to edit another character or change global settings.
4. To revoke access, set **Deny** for that user (or remove the Allow override), and save. The module updates their ownership on its dedicated rules JournalEntry.

The GM must enter the world at least once after updating the module so it can create and migrate **Runyth Sleep — Rule Configuration**. A player may then edit the rules even without the GM being connected. If you cannot open Rules as a player, check both the saved permission and that the GM has initialized the journal. This journal document stores world rule configuration and should not be removed.

### Updated shelter grades

| Shelter type | Points | Minimum suggested preparation | Example |
| --- | ---: | --- | --- |
| No Shelter / Exposed to Elements | −1 | None | Sleeping under the open sky |
| Quickly Improvised Shelter | +0 | 15 min | Scattered leaves, quick branch screen, loose tarp |
| Carefully Improvised Shelter | +1 | 60 min | Well-secured lean-to, layered branch/tarp cover |
| Solid Shelter / Indoors | +2 | Already available, or ≥24 hours to construct | Room, building, enduring hut or durable nomad tent |

These times are the module's **campaign guidelines**, not a 2024 D&D core timing rule. Bedding is now Bedroll **0** and Standard Bed **+1**; the other bedding choices retain their scores. The note field is now **Sleep Note**.

### How to read the quality-score table

The Help window displays the current configured thresholds and consequences. Add all seven factor scores to obtain the **quality score**. By default ≤−5 is Miserable, −4…−2 Poor, −1…+1 Ordinary, +2…+4 Comfortable and ≥+5 Excellent. Miserable/Poor trigger a Constitution save *only if enabled and the tier would add Exhaustion*. The DC starts at 15 or 12, respectively, and may increase with severity or other configured factors. A successful default save negates exhaustion; a failed save adds the tier's configured amount. Comfortable/Excellent instead roll temporary HP (default 1d4 + CON / 1d6 + 2×CON). Configured armor-rest consequences are independent of bedding quality.
