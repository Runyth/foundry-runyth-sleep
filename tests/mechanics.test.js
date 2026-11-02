// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MECHANICS, calculateDC, descriptionFor, exhaustionAfterSave,
  hpFormula, hpFromRoll, sanitizeMechanics
} from "../scripts/mechanics.js";
import { DEFAULT_OUTCOMES, DEFAULT_THRESHOLDS } from "../scripts/domain.js";

function actor(con, exhaustion = 0, level = 3, proficiency = 2) {
  return { system: { abilities: { con: { mod: con }, wis: { mod: 2 } },
    details: { level }, attributes: { exhaustion, prof: proficiency } } };
}

test("defaults use Constitution saving throws for penalties and Constitution dice for comfortable sleep", () => {
  const config = sanitizeMechanics(DEFAULT_MECHANICS);
  assert.equal(config.miserable.save.enabled, true);
  assert.equal(config.poor.save.ability, "con");
  assert.equal(config.poor.save.dc, 12);
  assert.equal(config.miserable.save.dc, 15);
  assert.equal(config.comfortable.hp.mode, "dice");
  assert.equal(hpFormula(config.comfortable.hp, actor(4)), "1d4 + 4");
  assert.equal(hpFormula(config.excellent.hp, actor(4)), "1d6 + 8");
  assert.equal(hpFormula(config.excellent.hp, actor(-2)), "1d6 - 4");
  assert.equal(config.ordinary.save.enabled, false);
});

test("DC scales with severe conditions, exhaustion, level, save ability and proficiency", () => {
  const config = sanitizeMechanics(DEFAULT_MECHANICS);
  const rule = { ...config.poor.save, qualityStep: 2, qualityGain: 1,
    exhaustionGain: 2, levelStep: 4, levelGain: 3, abilityMultiplier: -1, proficiencyMultiplier: -1 };
  const context = actor(4, 2, 9, 3);
  // 12 + 2 severity (-6 instead of -2) + 4 exhaustion + 6 levels - 4 CON - 3 prof = 17
  assert.equal(calculateDC(rule, context, -6, "poor"), 17);
  assert.equal(calculateDC({ ...rule, minDC: 18 }, context, -6, "poor"), 18);
  assert.equal(calculateDC({ ...rule, maxDC: 10, minDC: 0 }, context, -6, "poor"), 10);
  assert.equal(calculateDC(config.miserable.save, actor(2), -7, "miserable"), 16);
});

test("success modes negate, reduce or halve exhaustion, without negative results", () => {
  const rule = DEFAULT_MECHANICS.miserable.save;
  assert.equal(exhaustionAfterSave(2, rule, true), 0);
  assert.equal(exhaustionAfterSave(2, rule, false), 2);
  assert.equal(exhaustionAfterSave(3, { ...rule, success: "half" }, true), 1);
  assert.equal(exhaustionAfterSave(2, { ...rule, success: "reduce", reduction: 1 }, true), 1);
  assert.equal(exhaustionAfterSave(2, { ...rule, success: "reduce", reduction: 6 }, true), 0);
  assert.equal(exhaustionAfterSave(2, { ...rule, success: "unchanged" }, true), 2);
});

test("HP profiles scale with proficiency and level; fixed and dice modes preserve old floor", () => {
  const rule = { ...DEFAULT_MECHANICS.comfortable.hp, flat: 1, proficiencyMultiplier: 2, levelStep: 3, levelGain: 2 };
  assert.equal(hpFormula(rule, actor(3, 0, 10, 3)), "1d4 + 16");
  assert.equal(hpFromRoll(rule, 3, 2), 3);
  assert.equal(hpFromRoll(rule, 3, 15), 15);
  assert.equal(hpFromRoll({ ...rule, maximum: 12 }, 3, 30), 12);
  assert.equal(hpFromRoll({ ...rule, minimum: 4 }, 0, 0), 4);
  assert.equal(hpFromRoll({ ...rule, mode: "none" }, 15, 22), 0);
});

test("invalid configs, cross-boundary DCs, formula injection, too many dice are rejected", () => {
  const base = structuredClone(DEFAULT_MECHANICS);
  assert.throws(() => sanitizeMechanics({ ...base, poor: { ...base.poor, save: { ...base.poor.save, ability: "script" } } }), RangeError);
  assert.throws(() => sanitizeMechanics({ ...base, poor: { ...base.poor, save: { ...base.poor.save, dc: "13 + 2d6" } } }), RangeError);
  assert.throws(() => sanitizeMechanics({ ...base, poor: { ...base.poor, save: { ...base.poor.save, minDC: 25, maxDC: 20 } } }), RangeError);
  assert.throws(() => sanitizeMechanics({ ...base, excellent: { ...base.excellent, hp: { ...base.excellent.hp, diceCount: 400 } } }), RangeError);
  assert.throws(() => sanitizeMechanics({ ...base, excellent: { ...base.excellent, hp: { ...base.excellent.hp, diceFaces: 17 } } }), RangeError);
  assert.throws(() => sanitizeMechanics({ ...base, excellent: { ...base.excellent, hp: { ...base.excellent.hp, maximum: 1, minimum: 2 } } }), RangeError);
  assert.throws(() => hpFromRoll(DEFAULT_MECHANICS.comfortable.hp, 3, NaN), TypeError);
});

test("preview states appropriate save DC and HP without rolling", () => {
  const profile = sanitizeMechanics(DEFAULT_MECHANICS);
  const poor = descriptionFor("poor", profile, DEFAULT_OUTCOMES, actor(4), -2, DEFAULT_THRESHOLDS);
  const comfortable = descriptionFor("comfortable", profile, DEFAULT_OUTCOMES, actor(4), 3, DEFAULT_THRESHOLDS);
  assert.match(poor, /CON save DC 12/);
  assert.match(comfortable, /1d4 \+ 4 temp HP/);
});
