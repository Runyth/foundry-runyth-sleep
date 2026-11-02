// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
// Pure sleep-scoring and consequence functions; no Foundry globals.
export const MODULE_ID = "runyth-sleep";
export const PLAN_VERSION = 1;

export const FACTORS = Object.freeze({
  bedding: Object.freeze({ ground: -3, bedroll: 0, straw: 0, bed: 1, comfortable: 2, luxurious: 3 }),
  shelter: Object.freeze({ exposed: -1, improvised: 0, careful: 1, indoor: 2 }),
  temperature: Object.freeze({ dangerous: -3, cold: -1, suitable: 0 }),
  moisture: Object.freeze({ soaked: -2, damp: -1, dry: 0 }),
  noise: Object.freeze({ disruptive: -2, ordinary: 0, quiet: 1 }),
  safety: Object.freeze({ threatened: -2, uncertain: 0, guarded: 1 }),
  interruptions: Object.freeze({ frequent: -2, occasional: -1, none: 0 })
});

export const DEFAULT_CHOICES = Object.freeze({
  bedding: "bedroll",
  shelter: "improvised",
  temperature: "suitable",
  moisture: "dry",
  noise: "ordinary",
  safety: "uncertain",
  interruptions: "none"
});

export const DEFAULT_THRESHOLDS = Object.freeze({
  miserable: -5,
  poor: -2,
  comfortable: 2,
  excellent: 5
});

export const DEFAULT_OUTCOMES = Object.freeze({
  miserable: Object.freeze({ exhaustion: 2, tempHp: 0 }),
  poor: Object.freeze({ exhaustion: 1, tempHp: 0 }),
  ordinary: Object.freeze({ exhaustion: 0, tempHp: 0 }),
  comfortable: Object.freeze({ exhaustion: 0, tempHp: 3 }),
  excellent: Object.freeze({ exhaustion: 0, tempHp: 5 })
});

export const TIERS = Object.freeze(["miserable", "poor", "ordinary", "comfortable", "excellent"]);

export function sanitizeChoices(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Sleep choices must be an object.");
  }
  const result = {};
  for (const [factor, options] of Object.entries(FACTORS)) {
    const choice = value[factor] ?? DEFAULT_CHOICES[factor];
    if (!Object.hasOwn(options, choice)) {
      throw new RangeError(`Invalid choice for ${factor}.`);
    }
    result[factor] = choice;
  }
  return result;
}

export function sanitizeThresholds(input = DEFAULT_THRESHOLDS) {
  if (!input || typeof input !== "object") throw new TypeError("Invalid threshold configuration.");
  const values = Object.keys(DEFAULT_THRESHOLDS).map(key => Number(input[key]));
  if (values.some(value => !Number.isInteger(value) || value < -30 || value > 30)) {
    throw new RangeError("Thresholds must be integers from -30 through 30.");
  }
  if (values.some((value, index) => index > 0 && value <= values[index - 1])) {
    throw new RangeError("Sleep thresholds must be strictly increasing.");
  }
  return Object.fromEntries(Object.keys(DEFAULT_THRESHOLDS).map((key, index) => [key, values[index]]));
}

export function sanitizeOutcomes(input = DEFAULT_OUTCOMES) {
  if (!input || typeof input !== "object") throw new TypeError("Invalid outcome configuration.");
  const result = {};
  for (const tier of TIERS) {
    const entry = input[tier];
    if (!entry || typeof entry !== "object") throw new TypeError(`Missing ${tier} outcome.`);
    const exhaustion = Number(entry.exhaustion);
    const tempHp = Number(entry.tempHp);
    if (!Number.isInteger(exhaustion) || exhaustion < 0 || exhaustion > 6) {
      throw new RangeError(`Invalid exhaustion for ${tier}.`);
    }
    if (!Number.isInteger(tempHp) || tempHp < 0 || tempHp > 100) {
      throw new RangeError(`Invalid temporary hit points for ${tier}.`);
    }
    result[tier] = { exhaustion, tempHp };
  }
  return result;
}

export function evaluate(choices, thresholds = DEFAULT_THRESHOLDS, outcomes = DEFAULT_OUTCOMES) {
  const selected = sanitizeChoices(choices);
  const cutoffs = sanitizeThresholds(thresholds);
  const rules = sanitizeOutcomes(outcomes);
  const breakdown = Object.fromEntries(Object.entries(selected).map(([factor, choice]) => [factor, FACTORS[factor][choice]]));
  const score = Object.values(breakdown).reduce((sum, number) => sum + number, 0);
  const tier = score <= cutoffs.miserable ? "miserable"
    : score <= cutoffs.poor ? "poor"
      : score >= cutoffs.excellent ? "excellent"
        : score >= cutoffs.comfortable ? "comfortable"
          : "ordinary";
  return { score, breakdown, tier, effects: { ...rules[tier] } };
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

export function calculateUpdates(actorData, evaluation, exhaustionCap = 5) {
  if (!evaluation || !evaluation.effects) throw new TypeError("Missing evaluation.");
  const cap = Number(exhaustionCap);
  if (!Number.isInteger(cap) || cap < 0 || cap > 6) throw new RangeError("Invalid exhaustion cap.");
  const currentExhaustion = integer(actorData.exhaustion);
  const currentTempHp = integer(actorData.tempHp);
  const newExhaustion = Math.max(currentExhaustion, Math.min(cap, currentExhaustion + evaluation.effects.exhaustion));
  const newTempHp = Math.max(currentTempHp, integer(evaluation.effects.tempHp));
  return {
    previous: { exhaustion: currentExhaustion, tempHp: currentTempHp },
    next: { exhaustion: newExhaustion, tempHp: newTempHp },
    actual: { exhaustion: newExhaustion - currentExhaustion, tempHp: newTempHp - currentTempHp }
  };
}

export function validatePlan(plan) {
  if (!plan || plan.schema !== PLAN_VERSION || typeof plan.id !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(plan.id)) {
    throw new TypeError("Invalid sleep plan or unsupported schema.");
  }
  if (!Number.isFinite(plan.createdAt) || plan.createdAt <= 0) throw new TypeError("Invalid plan time.");
  return sanitizeChoices(plan.choices);
}
