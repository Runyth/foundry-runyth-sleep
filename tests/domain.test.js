// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateUpdates, DEFAULT_CHOICES, DEFAULT_OUTCOMES, DEFAULT_THRESHOLDS,
  evaluate, FACTORS, sanitizeChoices, sanitizeOutcomes, sanitizeThresholds, validatePlan
} from "../scripts/domain.js";

test("every factor accepts only defined choices", () => {
  assert.deepEqual(sanitizeChoices(DEFAULT_CHOICES), DEFAULT_CHOICES);
  for (const factor of Object.keys(FACTORS)) {
    assert.throws(() => sanitizeChoices({ ...DEFAULT_CHOICES, [factor]: "not-an-option" }), RangeError);
  }
  assert.throws(() => sanitizeChoices(null), TypeError);
});

test("default sleep scores map to all five grades", () => {
  const base = { ...DEFAULT_CHOICES };
  assert.equal(evaluate({ ...base, bedding: "ground", shelter: "exposed", temperature: "dangerous" }).tier, "miserable");
  assert.equal(evaluate(base).tier, "ordinary");
  assert.equal(evaluate({ ...base, bedding: "bed", shelter: "indoor", noise: "disruptive" }).tier, "ordinary");
  assert.equal(evaluate({ ...base, bedding: "comfortable", shelter: "indoor" }).tier, "comfortable");
  assert.equal(evaluate({ ...base, bedding: "luxurious", shelter: "indoor", noise: "quiet", safety: "guarded" }).tier, "excellent");
});

test("boundaries are inclusive and deterministic", () => {
  const score = evaluate({ ...DEFAULT_CHOICES, bedding: "ground", shelter: "indoor", moisture: "damp", temperature: "suitable" });
  assert.equal(score.score, -2);
  assert.equal(score.tier, "poor");
  assert.deepEqual(Object.keys(score.breakdown), Object.keys(FACTORS));
});

test("invalid rules, ordering, and injected values are rejected", () => {
  assert.deepEqual(sanitizeThresholds(DEFAULT_THRESHOLDS), DEFAULT_THRESHOLDS);
  assert.deepEqual(sanitizeOutcomes(DEFAULT_OUTCOMES), DEFAULT_OUTCOMES);
  assert.throws(() => sanitizeThresholds({ ...DEFAULT_THRESHOLDS, poor: -7 }), RangeError);
  assert.throws(() => sanitizeThresholds({ ...DEFAULT_THRESHOLDS, excellent: 4.5 }), RangeError);
  assert.throws(() => sanitizeOutcomes({ ...DEFAULT_OUTCOMES, poor: { exhaustion: -1, tempHp: 0 } }), RangeError);
  assert.throws(() => sanitizeOutcomes({ ...DEFAULT_OUTCOMES, excellent: { exhaustion: 0, tempHp: 9999 } }), RangeError);
});

test("temporary HP only improves existing HP and Exhaustion never decreases", () => {
  const excellent = evaluate({ ...DEFAULT_CHOICES, bedding: "luxurious", shelter: "indoor", noise: "quiet", safety: "guarded" });
  assert.deepEqual(calculateUpdates({ exhaustion: 0, tempHp: 9 }, excellent), {
    previous: { exhaustion: 0, tempHp: 9 },
    next: { exhaustion: 0, tempHp: 9 },
    actual: { exhaustion: 0, tempHp: 0 }
  });
  const poor = evaluate({ ...DEFAULT_CHOICES, moisture: "soaked" });
  assert.equal(calculateUpdates({ exhaustion: 4, tempHp: 0 }, poor).next.exhaustion, 5);
  assert.equal(calculateUpdates({ exhaustion: 5, tempHp: 0 }, poor).actual.exhaustion, 0);
  assert.equal(calculateUpdates({ exhaustion: 6, tempHp: 0 }, poor).next.exhaustion, 6);
  assert.throws(() => calculateUpdates({ exhaustion: 0, tempHp: 0 }, poor, 7), RangeError);
});

test("plan schema validation requires an ID, time and valid options", () => {
  const valid = { schema: 1, id: "abcdefghijklmnopqrstuvwxyz", createdAt: 1, choices: DEFAULT_CHOICES };
  assert.deepEqual(validatePlan(valid), DEFAULT_CHOICES);
  assert.throws(() => validatePlan({ ...valid, schema: 0 }), TypeError);
  assert.throws(() => validatePlan({ ...valid, id: "x" }), TypeError);
  assert.throws(() => validatePlan({ ...valid, createdAt: NaN }), TypeError);
});
