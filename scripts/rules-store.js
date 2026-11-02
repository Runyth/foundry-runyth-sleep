// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
/**
 * A dedicated owned JournalEntry is the authoritative rule store. Unlike a world
 * setting, its OWNER permission can be delegated without granting Configure Settings.
 * Existing world settings remain a read-only legacy fallback until a GM provisions it.
 */
import { MODULE_ID, DEFAULT_THRESHOLDS, DEFAULT_OUTCOMES, sanitizeThresholds, sanitizeOutcomes } from "./domain.js";
import { DEFAULT_MECHANICS, sanitizeMechanics } from "./mechanics.js";
import { DEFAULT_ARMOR_RULES, sanitizeArmorRules } from "./armor.js";
import { canAccess, PERMISSIONS } from "./permissions.js";

const locError = key => game.i18n?.localize?.(`RUNYTH_SLEEP.Errors.${key}`) ?? `RUNYTH_SLEEP.Errors.${key}`;

export const RULES_SCHEMA = 1;
export const RULES_JOURNAL_NAME = "Runyth Sleep — Rule Configuration";
const SETTING = "rulesJournalId";
const FLAG = "ruleConfiguration";
let provisioning = null;

function legacy() {
  return {
    thresholds: game.settings.get(MODULE_ID, "thresholds") ?? DEFAULT_THRESHOLDS,
    outcomes: game.settings.get(MODULE_ID, "outcomes") ?? DEFAULT_OUTCOMES,
    mechanics: game.settings.get(MODULE_ID, "mechanics") ?? DEFAULT_MECHANICS,
    armorRules: game.settings.get(MODULE_ID, "armorRules") ?? DEFAULT_ARMOR_RULES
  };
}

export function validateRuleConfiguration(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError("Invalid rules configuration.");
  }
  return {
    thresholds: sanitizeThresholds(candidate.thresholds),
    outcomes: sanitizeOutcomes(candidate.outcomes),
    mechanics: sanitizeMechanics(candidate.mechanics),
    armorRules: sanitizeArmorRules(candidate.armorRules)
  };
}

export function ruleJournal() {
  const id = game.settings.get(MODULE_ID, SETTING);
  return id && game.journal?.get?.(id) || null;
}

export function readRules() {
  const doc = ruleJournal();
  if (doc) {
    try {
      const snapshot = doc.getFlag(MODULE_ID, FLAG);
      if (snapshot?.schema === RULES_SCHEMA) return validateRuleConfiguration(snapshot.rules);
    } catch (error) {
      console.warn(`${MODULE_ID} | Invalid rules JournalEntry; using previous world rules`, error);
    }
  }
  // Fail safely per setting if an old world value was corrupted. Do not prevent
  // armor processing because an unrelated bedding setting is malformed.
  const old = legacy();
  const safe = (validate, value, fallback) => {
    try { return validate(value); } catch { return validate(fallback); }
  };
  return {
    thresholds: safe(sanitizeThresholds, old.thresholds, DEFAULT_THRESHOLDS),
    outcomes: safe(sanitizeOutcomes, old.outcomes, DEFAULT_OUTCOMES),
    mechanics: safe(sanitizeMechanics, old.mechanics, DEFAULT_MECHANICS),
    armorRules: safe(sanitizeArmorRules, old.armorRules, DEFAULT_ARMOR_RULES)
  };
}

export function canModifyRules(user = game.user) {
  if (!canAccess(PERMISSIONS.EDIT_RULES, { user })) return false;
  if (user?.isGM) return true;
  const doc = ruleJournal();
  // Never treat a module-level boolean as enough to modify a world document.
  return Boolean(doc?.testUserPermission?.(user, "OWNER"));
}

export function ruleRevision() {
  return ruleJournal()?.getFlag(MODULE_ID, FLAG)?.revision ?? 0;
}

function ownershipForUsers() {
  const ownership = { default: 2 }; // All players can read rule values; only permitted editors own it.
  for (const user of game.users?.contents ?? []) {
    if (user?.id && !user.isGM && canAccess(PERMISSIONS.EDIT_RULES, { user })) ownership[user.id] = 3;
  }
  return ownership;
}

export async function syncRuleDocumentAccess() {
  if (!game.user?.isGM) return false;
  const doc = ruleJournal();
  if (!doc) return false;
  const ownership = ownershipForUsers();
  if (JSON.stringify(doc.ownership ?? {}) !== JSON.stringify(ownership)) {
    await doc.update({ ownership });
  }
  return true;
}

export async function ensureRuleDocument() {
  if (!game.user?.isGM || !game.journal?.get || !globalThis.JournalEntry?.create) return null;
  if (provisioning) return provisioning;
  provisioning = (async () => {
    let doc = ruleJournal();
    if (!doc) {
      // Avoid two GM clients provisioning at once. A still-active GM with the
      // lexicographically earliest user ID performs automatic migration.
      const activeGms = (game.users?.contents ?? []).filter(u => u.isGM && u.active)
        .sort((a, b) => a.id.localeCompare(b.id));
      if (activeGms.length && activeGms[0].id !== game.user.id) return null;
      const existing = game.journal.contents?.find(entry => entry.getFlag?.(MODULE_ID, FLAG)?.schema === RULES_SCHEMA);
      if (existing) {
        doc = existing;
      } else {
        const rules = validateRuleConfiguration(legacy());
        doc = await JournalEntry.create({ name: RULES_JOURNAL_NAME, ownership: ownershipForUsers(),
          flags: { [MODULE_ID]: { [FLAG]: { schema: RULES_SCHEMA, revision: 1, rules } } } });
      }
      await game.settings.set(MODULE_ID, SETTING, doc.id);
    }
    await syncRuleDocumentAccess();
    return doc;
  })().finally(() => { provisioning = null; });
  return provisioning;
}

export async function saveRuleConfiguration(next, { expectedRevision = undefined } = {}) {
  if (!canModifyRules()) throw new Error(locError("PermissionDenied"));
  const validated = validateRuleConfiguration(next);
  let doc = ruleJournal();
  const newlyProvisioned = !doc && game.user.isGM;
  if (newlyProvisioned) doc = await ensureRuleDocument();
  if (!doc) throw new Error(locError("RulesUnavailable"));
  if (!game.user.isGM && !doc.testUserPermission?.(game.user, "OWNER")) {
    throw new Error(locError("PermissionDenied"));
  }
  const currentRevision = ruleRevision();
  if (expectedRevision !== undefined && expectedRevision !== currentRevision &&
    !(newlyProvisioned && expectedRevision === 0 && currentRevision === 1)) {
    throw new Error(locError("RulesChanged"));
  }
  const current = readRules();
  if (JSON.stringify(current) === JSON.stringify(validated)) return false;
  await doc.update({ [`flags.${MODULE_ID}.${FLAG}`]: {
    schema: RULES_SCHEMA, revision: currentRevision + 1, rules: validated
  } });
  return true;
}

export async function resetRuleConfiguration(options) {
  return saveRuleConfiguration({ thresholds: DEFAULT_THRESHOLDS, outcomes: DEFAULT_OUTCOMES,
    mechanics: DEFAULT_MECHANICS, armorRules: DEFAULT_ARMOR_RULES }, options);
}

export function resetRuleDocumentRuntimeState() {
  provisioning = null;
}
