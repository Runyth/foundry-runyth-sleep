# Runyth Sleep

**Version:** 1.1.0
**Platform:** Foundry VTT v13 · D&D 5e system 5.x–6.x (v13-dependent)  
**Languages:** English and German · English source/default  
**License:** GNU AGPL-3.0-or-later

Runyth Sleep adds grounded, GM-approved **sleeping conditions** to a character's **next completed long rest**. The system handles its ordinary long-rest recovery first; Runyth Sleep then awards or penalizes the quality of the sleep. All consequences are house rules, not official D&D rules.

## Install

1. Extract `runyth-sleep-v1.1.0-mod.zip` into `<Foundry User Data>/Data/modules/`. This must create the directory `modules/runyth-sleep/` containing `module.json`.
2. Restart Foundry if necessary. Enable **Runyth Sleep** under **Manage Modules** in a D&D 5e world.
3. Open **Configure Settings → Module Settings → Runyth Sleep → Open dashboard**. A dedicated entry is also available in the Settings and Actors sidebars and through the bed icon in the Token Controls toolbar.
4. Locate a character in the dashboard, e.g. **Mike Milligan**, then click **Set sleep**. You can search or filter by Actor folder and queued/unplanned status.
5. GM: choose the seven conditions, review the quality score, then click **Queue rest**. For a group, select rows and use **Plan for selected**.
6. Complete the normal D&D 5e **Long Rest** on the character sheet. The module applies consequences after the completed rest and stores the last result in the dashboard.
7. If there is **no queued sleep plan**, no **sleep-quality** penalties or bonuses are applied. **Armor rules are independent** and apply after a completed Long Rest when you enable an armor variant. The module displays a localized unplanned-sleep notice by default. In Module Settings, change **Unplanned long-rest behavior** to *Remind and open dashboard* (GM only), or *Do nothing*.

**Important:** A sleep plan is not a rest action. Plans do not trigger a rest, skip the D&D rest dialog, or override system rules for rest duration, interruptions or resource recovery. Unplanned rests are unchanged.

## Sleeping in armor (v1.0.7)

Open **Runyth Sleep dashboard → Rules → Edit rules → Sleeping in Armor** (bottom accordion). Choose one of the following presets:

| Preset | Meaning | Effect of equipped medium/heavy armor |
| --- | --- | --- |
| **2024 Core Rules** (**default**) | The official 2024 Long Rest and Equipment rules do **not** impose an armor-specific sleep penalty. | No armor-specific roll or recovery change. |
| **Xanathar optional** | The official older *Xanathar’s Guide to Everything* optional rule. The 2024 system's normal rest recovery completes first; this module adjusts recovery according to that older option. | Recover **one quarter of the Hit Dice spent before rest (minimum one)**; do **not** reduce Exhaustion during that Long Rest. No save. Light armor and shields do not count. |
| **Custom Constitution saves** (house rule) | Configurable armor-by-armor difficulty, outcomes, and recovered Hit Dice. | By default, Medium: **CON DC 12** or +1 Exhaustion; Heavy: **CON DC 15** or +1 Exhaustion. Pass: no extra penalty. Unarmored / light: no penalty. |

**Important rules distinction:** There is **no mandatory heavy-armor Constitution save** in the 2024 core rules or the Xanathar optional rule. That is the module's configurable house-rule preset. If you want the CON-focused survival mechanic, select **Custom Constitution saves** explicitly.

Each custom armor category (unarmored, light, medium, heavy) has independent enablement, saving throw ability, DC (0–40), normal/advantage/disadvantage, and separate **save success / failure** effects: additional Exhaustion (0–6), prevention of normal Exhaustion recovery, and percentage of spent Hit Dice recovered (0–100). Rules are GM-controlled but may be delegated to a permitted user, localized EN/DE, and available in the same visual Rules editor; Reset Defaults also restores the official 2024 preset.

Armor detection reads **equipped Armor Items** at the **start of Long Rest**; unequipped inventory, armor names, and shields are ignored. The most restrictive recognized equipped armor category takes precedence. Effects only apply to completed Long Rests, even without a queued bedding plan, and never apply to Short Rests. The module uses native D&D 5e saving throws for proficiency and modifiers, preserves an evaluated roll on failed writes, and records the last armored rest in `flags.runyth-sleep.lastArmorRest`. The GM can retry an errored armored-rest application in the **same connected session** through `game.modules.get("runyth-sleep").api.retryArmorRest(actor)`, strictly after the attempted completed rest.

Sources: [2024 Long Rest](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary#LongRest), [2024 Armor](https://www.dndbeyond.com/sources/dnd/br-2024/equipment#Armor), [Xanathar's sleeping-in-armor rule](https://www.dndbeyond.com/sources/dnd/xgte/dungeon-masters-tools#SleepinginArmor), [dnd5e rest hooks](https://github.com/foundryvtt/dnd5e/wiki/Hooks).

## Default Constitution-based sleep consequences (v1.0.4)

| Quality | Default post-rest result |
| --- | --- |
| Miserable | Constitution save DC 15 (increasing with severity); fail: +2 Exhaustion, success: none |
| Poor | Constitution save DC 12 (increasing with severity); fail: +1 Exhaustion, success: none |
| Ordinary | No additional consequence |
| Comfortable | Roll `1d4 + CON modifier` temporary HP, at least 3 |
| Excellent | Roll `1d6 + 2 × CON modifier` temporary HP, at least 5 |

Saves use the D&D 5e system's native ability saving throw modifiers and apply only **after** a completed long rest. Temporary HP never stacks with an existing higher value. These are configurable house rules, not an official 2024 sleep rule.

Go to **Dashboard → Rules → Edit rules** to expand each grade and edit its base exhaustion, DC, save/check ability, roll advantage or disadvantage, tier severity scaling, current Exhaustion scaling, level/proficiency/ability scaling, success reduction, bonus-HP mode, die size/count, ability bonus, level scaling, and floors/caps. The Rules window retains its size and position. **Restore default rules** is confirmation-protected. See [`docs/GM_RULES.md`](docs/GM_RULES.md) for the exact formulas and in-world examples.

The defaults favour Constitution-focused characters: sturdy characters more often resist bad sleep and receive larger comfort bonuses. Prior v1.0.x temporary HP values remain as minimum values when dice are enabled. Legacy plans and last-result Actor flags are still supported.

## Dashboard and responsive windows (v1.0.3)

The redesigned dashboard follows the shared Runyth visual design: charcoal gradient, gold-accent tabs, overview cards, actor-folder groups, avatar rows, contextual tools, role-based permissions, and responsive controls. Tabs: **Overview · Actors · Rules · Permissions (GM) · Settings (GM)**. The Actors tab supports searching, optional subfolders, queued/unplanned filtering, bulk selection, and 20/40/80/120 cards per page. The dashboard stores active tab, filters and page size per client. It also remembers window geometry, as do the Rest Planner, Rules and Help dialogs; reopening reuses existing windows.

The player-facing planner uses translated condition labels instead of raw plan JSON, and switching between player characters refreshes the conditions shown. Group plan writes run at most four at a time, and unnecessary writes when clearing an already-empty plan are omitted. The quality preview only recalculates when relevant controls change, and now displays the configured save DC and comfort roll formula without rolling prematurely.

## Character-sheet Sleep control (v1.0.6)

The small **Sleep** button (bed icon) appears in the sheet's top identity/header area. It opens the selected character's own Sleep Planner, subject to the existing permission system. On Tidy 5e it uses the name-adjacent accessory position; on standard Foundry D&D actor sheets it occupies the header accessory position before native controls. It is intended to sit immediately **left of other module indicators** when they use the same standard region, and remains in place when other modules are not present.

The integration detects sheet structures instead of hard-coding any module name. The button is single-line, constrained and accessible (visible shortened label and tooltip). Its size is not derived from the large dashboard buttons; multiple render hooks and partial renders do not duplicate it. Other modules' controls are neither removed nor hidden.

## v1.1.0 — delegated rule editors and updated conditions

In **Dashboard → Permissions**, set **Edit sleeping rules** to a role minimum or assign a per-user **Allow** override to a trusted player. The default is **GM only**. Rules are stored in an ordinary, dedicated `Runyth Sleep — Rule Configuration` JournalEntry that the module creates when a GM enters the world. The delegated editor receives `OWNER` permission **on that document only**, not general Foundry world-settings access, permission administration, scene configuration, or ownership of other characters. GMs can revoke access at any time. The Rules tab and **Edit rules** button are available to the authorized player.

At first GM login after upgrading, existing customized thresholds, armor rules, DCs, and HP profiles are copied unchanged into the new document. Queued Actor plans and last-results are not migrated or modified; old settings remain as a read-only fallback. A player cannot delegate themselves before a GM provisions the document. The dedicated JournalEntry may appear in the Journal directory; it stores rule data and should not be deleted or repurposed. Players can still run their rests while the GM is offline once ownership is assigned.

**Shelter defaults** (the score is additive across seven factors):

| Shelter | Score | GM preparation guide |
| --- | ---: | --- |
| No shelter / Exposed to elements | −1 | Open to weather; no prepared protection |
| Quickly improvised shelter | 0 | 15 minutes to arrange leaves, twigs, or a loose tarp for one night |
| Carefully improvised shelter | +1 | 60 minutes for a carefully placed lean-to, weatherbreak, or prepared tarp |
| Solid shelter / Indoors | +2 | Existing room, building, durable hut, or long-term nomad tent; at least 24 hours to build from scratch |

**Bedding changes:** Bedroll = **0**, Standard Bed = **+1**. All other bedding scores are unchanged. The existing `exposed`, `improvised`, and `indoor` choice IDs remain supported; `careful` is new. Current queued plans automatically use the new scores, so their calculated quality may change. A bedroll in a quick shelter under otherwise neutral conditions scores **0 (Ordinary)**; a standard bed in solid shelter scores **+3 (Comfortable)**. The preparation times are module-defined campaign benchmarks, **not official 2024 D&D core construction times**.

The Rest Planner calls its free-text field **Sleep Note**. Open **Dashboard → Help** for all shelter examples and a live score table showing the configured thresholds, when a save/check is triggered, and when rolled temporary HP applies.

## Safety and behavior

- Only GMs can change Foundry world settings, scene defaults, and permission grants. The rule editor may be explicitly delegated to trusted players without global configuration rights. By default only GMs queue or clear plans; the Permissions tab can also delegate own-character plan management to players with Foundry OWNER permissions.
- The owning player can run a long rest for a planned character; updates occur on the client completing the rest.
- Each plan has a unique ID and is **consumed only once**; effects and the result ledger, including rolled outcome metadata, are stored in the same Actor document update.
- Existing higher temporary HP is **never overwritten**, Exhaustion is never lowered by this module, and the default cap avoids introducing Exhaustion 6 solely from a sleep penalty.
- If the Actor update fails, the queued plan remains for GM recovery. A failed chat announcement does not reapply consequences.
- `dnd5e.preLongRest` and `dnd5e.restCompleted` are used to avoid applying the outcome to short rests. Short rests are unaffected.
- Actor rest data and scene defaults remain in namespaced flags. Starting v1.1.0, world rule configuration is stored in a dedicated permission-controlled JournalEntry (migrated from existing hidden module world settings by a GM on first login); no sockets, external APIs, dependencies, monkey patches, or combat hooks.
- There is no passive, automatic detection of a bed's furniture token or scene geometry. The GM must decide conditions deliberately.

## Development

```text
npm run check
```

Node.js 20+ is required for tests. Tests use Foundry mocks and do not run a Foundry server. Before campaign deployment, perform the documented in-world smoke tests in `docs/TESTING.md`.

## Documentation

- `docs/USER_GUIDE.md`: dashboard onboarding, step-by-step usage and example scenarios.
- `docs/PATCH_AUDIT_1.0.4.md`: review of saving-throw integration, performance, validation and live acceptance tests.
- `docs/PATCH_AUDIT_1.0.5.md`: Rules / Planner / Help resizing and scroll-layout audit, including the live acceptance checklist.
- `docs/PATCH_AUDIT_1.0.7.md`: armor rules interpretation, presets, API integration and manual validation.
- `docs/PATCH_AUDIT_1.0.6.md`: actor-sheet integration, compact button styling, compatibility audit and in-world test matrix.
- `docs/PATCH_AUDIT_1.0.3.md`: dashboard design comparison and permission semantics.
- `docs/GM_RULES.md`: scores, defaults, balance and house rules.
- `docs/ARCHITECTURE.md`: Foundry integrations and data lifecycle.
- `docs/TESTING.md`: regression coverage and manual smoke tests.
- `CHANGELOG.md`: release history.

## Documentation references

- Foundry module structure: https://foundryvtt.com/article/module-development/
- Foundry v13 Scene Control hook: https://foundryvtt.com/api/v13/functions/hookEvents.getSceneControlButtons.html
- Foundry v13 DialogV2: https://foundryvtt.com/api/v13/classes/foundry.applications.api.DialogV2.html
- D&D 5e system rest hooks: https://github.com/foundryvtt/dnd5e/wiki/Hooks

**Resizable windows (v1.0.5):** The Rules editor, Sleep Planner, and Help dialog now expand their scrollable content to fit the current window height. Only the content area scrolls when necessary; the footer buttons stay available. Independent per-client window size/position settings continue to work. The all-character dashboard was not changed.

**Layout testing:** `npm run check` runs the automated module and CSS contract tests. Developers with a working local Chromium may additionally run `npm run test:layout` for browser layout smoke checks; those browser checks emulate the Foundry window structure and are not equivalent to a live Foundry session.

No hosted Git URL or update manifest is published in this initial release; install from the ZIP manually.


## Content licence

The sleeping-condition house rules this module adds (shelter grades, quality scoring thresholds, comfort results and the armor presets table) are homebrew gameplay content licensed **CC BY-SA 4.0**. The program source is **AGPL-3.0-or-later**; see the standard licence chapter below.

## Licence

Copyright © 2026  [Daniel Braniewski](https://brani.dev/)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
