// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
// Optional armor-at-rest integration. The 2024 core rules do not penalize armored sleep.
// Xanathar's medium/heavy-armor rule is an older official optional rule, not 2024 RAW.
export const ARMOR_CATEGORIES = Object.freeze(["none", "light", "medium", "heavy"]);
export const ARMOR_MODES = Object.freeze(["core2024", "xanathar", "custom"]);
const ABILITIES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const OUTCOME = Object.freeze({ exhaustion: 0, preventRecovery: false, hitDicePercent: 100 });

const customProfile = (enabled, dc) => ({
  enabled,
  save: { enabled, ability: "con", dc, rollMode: "normal" },
  failure: { exhaustion: enabled ? 1 : 0, preventRecovery: false, hitDicePercent: 100 },
  success: { ...OUTCOME }
});

export const DEFAULT_ARMOR_RULES = Object.freeze({
  mode: "core2024",
  custom: {
    none: customProfile(false, 10),
    light: customProfile(false, 10),
    medium: customProfile(true, 12),
    heavy: customProfile(true, 15)
  }
});

function whole(value, min, max, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new RangeError(`Invalid ${field}.`);
  return parsed;
}

function parseOutcome(input, field) {
  if (!input || typeof input !== "object") throw new TypeError(`Missing ${field}.`);
  if (typeof input.preventRecovery !== "boolean") throw new TypeError(`Invalid ${field}.preventRecovery.`);
  return {
    exhaustion: whole(input.exhaustion, 0, 6, `${field}.exhaustion`),
    preventRecovery: input.preventRecovery,
    hitDicePercent: whole(input.hitDicePercent, 0, 100, `${field}.hitDicePercent`)
  };
}

export function sanitizeArmorRules(value = DEFAULT_ARMOR_RULES) {
  if (!value || typeof value !== "object" || !ARMOR_MODES.includes(value.mode)) throw new TypeError("Invalid armor rules preset.");
  const custom = {};
  for (const category of ARMOR_CATEGORIES) {
    const input = value.custom?.[category];
    if (!input || typeof input !== "object" || typeof input.enabled !== "boolean" ||
      typeof input.save?.enabled !== "boolean" || !ABILITIES.includes(input.save?.ability) ||
      !["normal", "advantage", "disadvantage"].includes(input.save?.rollMode)) {
      throw new TypeError(`Invalid armor rules for ${category}.`);
    }
    custom[category] = {
      enabled: input.enabled,
      save: {
        enabled: input.save.enabled, ability: input.save.ability,
        dc: whole(input.save.dc, 0, 40, `${category}.save.dc`),
        rollMode: input.save.rollMode
      },
      failure: parseOutcome(input.failure, `${category}.failure`),
      success: parseOutcome(input.success, `${category}.success`)
    };
  }
  return { mode: value.mode, custom };
}

function equipped(system) {
  if (typeof system?.equipped === "boolean") return system.equipped;
  return system?.equipped?.value === true;
}

// Armor must be equipped, never inferred from item names, shield AC, or an inventory entry.
export function armorCategory(actor) {
  const categories = new Set();
  for (const item of actor?.items ?? []) {
    if (!["equipment", "armor"].includes(item.type) || !equipped(item.system)) continue;
    const category = item.system?.type?.value ?? item.system?.armor?.type;
    if (["light", "medium", "heavy"].includes(category)) categories.add(category);
  }
  return categories.has("heavy") ? "heavy" : categories.has("medium") ? "medium"
    : categories.has("light") ? "light" : "none";
}

export function armorProfile(rules, category) {
  const checked = sanitizeArmorRules(rules);
  if (!ARMOR_CATEGORIES.includes(category)) throw new RangeError("Invalid armor category.");
  if (checked.mode === "core2024") return null;
  if (checked.mode === "xanathar") {
    if (!["medium", "heavy"].includes(category)) return null;
    return {
      enabled: true,
      save: { enabled: false, ability: "con", dc: 0, rollMode: "normal" },
      failure: { exhaustion: 0, preventRecovery: true, hitDicePercent: 25 },
      success: { exhaustion: 0, preventRecovery: true, hitDicePercent: 25 }
    };
  }
  return checked.custom[category].enabled ? checked.custom[category] : null;
}

export function armorOutcome(profile, passed) {
  return profile[passed ? "success" : "failure"];
}

// Distribute recovered Hit Dice over class items deterministically. Always recover at
// least one of the spent dice when percent is nonzero, as Xanathar specifies.
export function hitDiceTarget(snapshot, percent) {
  if (percent === 100) return [];
  const spent = snapshot.reduce((sum, item) => sum + item.spent, 0);
  if (!spent) return [];
  const restore = spent === 0 || percent === 0 ? 0 : Math.max(1, Math.floor(spent * percent / 100));
  let remaining = restore;
  return snapshot.map(item => {
    const recovered = Math.min(item.spent, remaining);
    remaining -= recovered;
    return { id: item.id, spent: item.spent - recovered };
  });
}

export function takeRestSnapshot(actor) {
  return {
    category: armorCategory(actor),
    exhaustion: Math.max(0, Number(actor?.system?.attributes?.exhaustion) || 0),
    hitDice: [...(actor?.items ?? [])].filter(item => item.type === "class" && item.id)
      .map(item => ({ id: item.id, spent: Math.max(0, Math.floor(Number(item.system?.hd?.spent) || 0)) }))
  };
}

export function armorExhaustion(current, beforeRest, restExhaustion, outcome, cap = 5) {
  // Restore only the point the system removed, not exhaustion gained from other sleep effects.
  const recovered = Math.max(0, beforeRest - restExhaustion);
  return Math.min(cap, Math.max(0, current + (outcome.preventRecovery ? recovered : 0) + outcome.exhaustion));
}
