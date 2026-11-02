# Validation and manual smoke tests — Runyth Sleep v1.0.7

## Automated checks

Prerequisite: Node.js 20+.

```text
npm run check
```

The repository contains unit tests for factor validation, all five grades, score boundary behavior, rules validation, non-stacking temporary HP, Exhaustion cap, schema rejection, and mocked rest-lifecycle tests for plan storage, double apply, short rest, canceled rest, changed plan, owner permissions, chat failure, storage failure and manual recovery.

`npm run check` includes Node syntax validation for all runtime JS and the Node built-in test runner. Additional v1.0.1 coverage includes: all three client window settings, geometry clamping for a changed screen, persistence deduplication and write ordering, reusing open windows and bringing them to the foreground, readable non-GM plan displays, bounded-concurrency group updates, stable ordering, and no-op clears.

The mock tests do not require Foundry to be installed and do not prove end-to-end compatibility by themselves.

## Mandatory in-world smoke tests before live campaigns

| Scenario | Expected behavior |
| --- | --- |
| Open planner with one character token selected | Actor targeted; editable by GM |
| Open planner with two characters selected | Both actors receive a distinct queued plan |
| Open planner with no token selected | Character dropdown available |
| Open planner as player | Read-only without permissions; with `editRules` but without `planOwn`, Rules editor available but cannot queue or change scene defaults |
| Default bedroll + quick shelter conditions | `Ordinary` score 0; no saving throw or penalty |
| Standard bed + solid indoor shelter | `Comfortable` score +3; roll temporary HP |
| Luxury bed indoors with guarded and quiet conditions | `Excellent` score; roll 1d6 + 2 × CON, minimum 5 |
| Queue plan, cancel D&D long rest | Plan remains; no applied effect |
| Queue plan, complete D&D short rest | Plan remains; no applied effect |
| Queue plan, complete D&D long rest | Exactly one effect application; queued plan cleared |
| Actor already has 10 temporary HP | Excellent sleep preserves 10 |
| Actor already at Exhaustion 5 | Cap 5 prevents increase |
| Change rules and reopen planner | New threshold/outcome persisted correctly |
| Set scene defaults, reopen planner | Scene choices reappear |
| Move/resize planner, reopen | Last size and position are restored |
| Move/resize Rules and Help independently | Each window restores only its own geometry |
| Move window, close, reopen rapidly | Final saved position is restored |
| Change from large monitor to a smaller monitor | All window controls remain onscreen |
| Click planner button repeatedly while open | Existing window rises to front; no duplicate |
| Player selects between two owned characters | Read-only plan, quality and last-result labels refresh correctly |
| Use narrow viewport with large labels and translated UI | Buttons wrap without clipping and contents scroll |
| Queue / clear plans for a large party | Result order is stable and writes are bounded; no freeze or duplicate |
| World chat visibility GM/off | Whisper or no message as configured |
| Disconnect chat permission / reject chat create | Mechanical change persists and is not retried |
| Reject Actor update | Plan is retained; GM can retry after resolving issue |
| Foundry reload | Queued plans and last result remain on actor |

Test at least one **player-initiated** long rest and one **GM-initiated** long rest on both dnd5e 5.x and 6.x versions available for Foundry v13. This is recommended because external system hook behavior can differ by version or with other rest-altering modules.

## Release verification

Run `python3 tools/release.py` in a **committed and tagged** clean checkout. The release script validates the package manifest, reruns tests, verifies the Git history, creates the three ZIP files, and verifies their contents. Archives include an embedded `SHA256SUMS.txt` in the documentation ZIP listing the module and source checksums.


## v1.0.4 specific verification

- The new dashboard unit tests exercise saved UI state sanitation, player-only Actor scope, planned/unplanned filtering, folder search, pagination, singleton behavior, and geometry persistence.
- The rest-engine tests exercise a completed long rest without a plan, a canceled rest, short rest, optional dashboard opening, and disabled notifications.
- Planner tests verify switching from one character to another when an actor-specific planner is already open.
- Manually verify Module Settings launcher, Settings/Actors sidebar cards, sheet integration, resizing, German text, and live system rest integration using `PATCH_AUDIT_1.0.2.md`. Browser/Foundry and cross-module integration performance cannot be certified by Node mocks.

## v1.0.4 regression coverage

- Role minimums, individual user overrides, GM rights, Foundry Actor ownership boundary, delegated own-character updates and denial of mixed unauthorized group updates.
- Dashboard visual component classes, correctly scoped stylesheet and absence of unrelated actions.
- Permission localization, Actor tab paging and current-window persistence.
- Manual side-by-side CSS/layout and live Foundry acceptance checklist: `docs/PATCH_AUDIT_1.0.3.md`.

## v1.0.4 additional acceptance tests (live Foundry)

1. Set Mike Milligan to a normal bedroll under improvised shelter. Open **Rules** and verify Poor = Constitution save, default DC 12, failure +1 Exhaustion and success 0.
2. With CON modifier +4 and CON save proficiency, complete long rest and verify a single native roll is evaluated without another dialog, the correct D&D 5e bonuses are included, and chat shows the total, DC, pass/fail and applied exhaustion.
3. Queue Miserable (score below −5). Verify DC rises per two negative points below −5. Check both pass/fail results; configure advantage and disadvantage separately and repeat.
4. Configure Comfortable 2d8 + CON × 2, maximum 20, minimum 3; verify actual die roll and applied results match, and are not added to existing larger temporary HP.
5. Configure a Wisdom check, DC scaling from level and current exhaustion, and half/reduce outcomes; verify native check bonuses, actor exhaustion and applied result.
6. Cancel a native roll (or force a roll error). The plan must remain and Actor attributes must not be changed by Runyth Sleep. The GM can retry after fixing the issue.
7. Simulate one failed Actor update after an evaluated roll. A same-client GM retry must reuse that exact result rather than silently rerolling.
8. Confirm unauthorized players cannot edit rules, scene defaults or another player's plan even when their character's rest is running.
9. Change EN/DE localization; verify all new rules labels and the current plan preview render legibly on a narrow screen, with scrollbars and persistent window geometry.
10. Upgrade a world with custom v1.0.3 `outcomes`. Verify old minimum temp-HP values and all previously queued plans remain intact.
11. In a private test world, repeat player-initiated vs GM-initiated long rests with other rest-altering modules active. Avoid simultaneous rest operations on the same Actor from multiple clients.

Live Foundry tests are not implied by passing Node mocks. The documented source API corresponds to the current dnd5e source; validate the installed dnd5e 5.x/6.x version separately before relying on the module in a campaign.


## v1.0.5: Layout regression and manual resize checks

Run `npm run check` for module logic, permissions, JS syntax and new CSS layout-contract tests. For an optional browser geometry smoke test, run `npm run test:layout` on a machine where local headless Chromium can successfully render pages. The utility opens the real generated Rules, Planner and Help markup in a structural mock of a Foundry v13 dialog at normal, enlarged and narrow sizes. It checks full-height content, single-scroll behavior, unobstructed footer controls, and horizontal overflow. It does **not** verify Foundry's own browser-rendered DOM and should not be counted as a live-world test.

**In a Foundry v13 test world, manually:**

1. Open the Rules editor, resize it taller, and confirm the visible Rules area grows continuously rather than stopping at a fixed height. Scroll to all five tiers and check the footer Save / Reset / Cancel buttons stay accessible.
2. Expand multiple tiers, shrink the editor, and verify only the main Rules content scrolls (no nested vertical scrollbar). Confirm lower controls are still reachable using mouse, touchpad, and keyboard.
3. Repeat resize and scroll tests with Planner (GM and player/read-only) and Help, using EN and DE localization, on desktop and narrow viewport.
4. Repeat after closing and reopening each window to verify independent stored size and position, and after switching to a smaller display to verify clamping.
5. Open the dashboard across Overview, Actors, Rules, Permissions, and Settings tabs. Verify its separate tabbed scroll container, actor cards and permissions remain unchanged.
6. Queue a plan, complete a Long Rest, and verify saving throws/temporary HP, Actor flags and permission behavior remain unchanged. No mechanics code or data schema was modified in this patch.

## v1.0.6 Actor-sheet compact-button checklist

See [`PATCH_AUDIT_1.0.6.md`](PATCH_AUDIT_1.0.6.md) for the live test matrix. Run the automated `tests/sheet-controls.test.js` fixture with `npm run check`; it validates Tidy name and fallback positions, hook load orders, partial renders, generic neighboring controls, standard header and close-menu placement, permissions, and idempotence. In Foundry v13, verify the icon and label are compact on standard dnd5e, Tidy 5e and any installed custom sheets, with and without other status modules; validate responsive sizing, accessibility and actor-specific planner activation.

## v1.0.7 armor-specific live acceptance checklist

1. Open **Rules → Edit rules → Sleeping in Armor**. Verify the default says 2024 Core Rules; run a Long Rest in Plate armor and confirm no armor-related save, penalty, or Actor write.
2. Select **Custom Constitution saves**, save, and equip Mike Milligan with Plate. Perform Long Rest without a queued sleeping plan: verify one CON save at DC 15 and Exhaustion +1 on failure, 0 on success. Native saving-throw proficiency and modifiers must be honored.
3. Equip a shield only or carry Plate armor **unequipped**; repeat and confirm no armor effect. Check Light armor, Medium DC 12, and custom ability / advantage selections.
4. Select **Xanathar optional**. With Heavy armor and eight spent class Hit Dice and Exhaustion 2, complete Long Rest: expect 6 Hit Dice still spent and Exhaustion 2, with no armor save. Test Medium armor identically and Light armor without penalties.
5. Test multiclass characters with two different class Hit Dice items. Verify total regained equals one-quarter of spent dice (minimum one) without overwriting unrelated Item data.
6. Repeat with both a queued comfort plan and a failed poor-sleep save: armor consequences remain independent and are not double-counted. Verify public, GM-only, and disabled chat modes.
7. Cancel Long Rest, use Short Rest, change armor after Long Rest begins, or dismiss a native saving throw: ensure no unintended changes; failed saves can be recovered without free rerolls.
8. Simulate a failed embedded class-item update and use the GM-only recovery method in the same browser session; verify Exhaustion is not applied again and exactly the intended class Hit Dice remain spent.
9. Test with any installed rest-changing modules. Validate per-client ownership, rules permissions and smooth dashboard resize in English and German.
10. Repeat on the exact Foundry v13/dnd5e version used in the campaign. Passing mocked tests does **not** prove live compatibility.

## v1.1.0 feature acceptance (live Foundry)

1. Upgrade from v1.0.7 with customized tier thresholds, HP/save profiles and armor mode; join as GM and verify the new `Runyth Sleep — Rule Configuration` JournalEntry was provisioned and all values survived unchanged. Restart and verify it is not duplicated.
2. Grant `editRules` to one Trusted Player via **Permissions → per-user Allow**. The player opens the dashboard Rules tab, changes a DC, saves, and the GM sees the same changed value; the player must not gain Foundry's global Configure Settings rights.
3. Revoke the grant, save permissions and verify the player can no longer open or save Rules. Confirm that an untrusted second player cannot edit rules or any other player's Actor regardless of rule-journal visibility.
4. With role minimum Trusted Player, verify one denied trusted user is blocked while another trusted user can edit. Reset permissions and confirm the default GM-only authority is restored.
5. With the GM disconnected, confirm an already authorized user can edit the rules while other connected players receive the new values via normal document updates. Conflict from an out-of-date editor must show an error and not overwrite newer rules.
6. Inspect the shelter selector: exposed −1, quickly improvised 0, carefully improvised +1, solid +2. Verify Bedroll 0, Standard Bed +1 and every other bedding entry unchanged.
7. Open Help in English and German; inspect all four shelter examples, preparation times 15 min/60 min/≥24h, the note distinguishing those from official 2024 rules, and live quality bands with save/HP triggers.
8. Verify Planner label **Sleep Note / Schlafnotiz** and that existing plan note content remains unchanged. Preview a previously queued plan after the upgrade: the quality must be recomputed with new weights without rewriting Actor flags.
9. Perform a poor, comfortable and armor-modified long rest under both GM and player control. Confirm no duplicate effects, no additional events, and normal D&D rest recovery.

Node mocks verify logic and persistence contracts; complete visual and end-to-end behavior must be checked in a real v13 world before deployment.
