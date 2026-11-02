// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID } from "./domain.js";

// Deliberately only expose permissions that can be enforced without an unsafe GM socket proxy.
export const PERMISSIONS = Object.freeze({
  VIEW_OWN: "viewOwn",
  VIEW_PARTY: "viewParty",
  VIEW_LAST: "viewLast",
  PLAN_OWN: "planOwn",
  EDIT_RULES: "editRules"
});
export const PERMISSION_IDS = Object.freeze(Object.values(PERMISSIONS));
export const DEFAULT_PERMISSIONS = Object.freeze({
  roleMinimums: Object.freeze({ viewOwn: 1, viewParty: 5, viewLast: 1, planOwn: 5, editRules: 5 }),
  userOverrides: Object.freeze({})
});

const MIN_ROLE = 1;
const MAX_ROLE = 5; // Five means GM only (Foundry roles top out at 4).

export function sanitizePermissions(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const roleMinimums = {};
  for (const id of PERMISSION_IDS) {
    const value = Number(source.roleMinimums?.[id]);
    roleMinimums[id] = Number.isInteger(value) && value >= MIN_ROLE && value <= MAX_ROLE
      ? value : DEFAULT_PERMISSIONS.roleMinimums[id];
  }
  const userOverrides = {};
  const entries = source.userOverrides && typeof source.userOverrides === "object" && !Array.isArray(source.userOverrides)
    ? Object.entries(source.userOverrides) : [];
  for (const [userId, overrides] of entries.slice(0, 500)) {
    if (!/^[\w-]{1,100}$/.test(userId) || ["__proto__", "prototype", "constructor"].includes(userId) || !overrides || typeof overrides !== "object" || Array.isArray(overrides)) continue;
    const checked = {};
    for (const id of PERMISSION_IDS) {
      if (Object.hasOwn(overrides, id) && typeof overrides[id] === "boolean") checked[id] = overrides[id];
    }
    if (Object.keys(checked).length) userOverrides[userId] = checked;
  }
  return { roleMinimums, userOverrides };
}

export function canAccess(permission, { user = game.user, actor = null, configuration = undefined } = {}) {
  if (!user || !PERMISSION_IDS.includes(permission)) return false;
  if (user.isGM) return true;
  const config = sanitizePermissions(configuration ?? game.settings.get(MODULE_ID, "permissions"));
  const override = config.userOverrides[user.id]?.[permission];
  const granted = typeof override === "boolean"
    ? override : Number(user.role ?? 0) >= config.roleMinimums[permission] && config.roleMinimums[permission] <= 4;
  if (!granted) return false;
  if (!actor) return true;
  // World-level permission is not a substitute for document ownership/visibility.
  if (permission === PERMISSIONS.VIEW_PARTY) return actor.visible !== false;
  return Boolean(actor.testUserPermission?.(user, "OWNER") ?? actor.isOwner);
}

export function canViewActor(actor, user = game.user) {
  if (!actor || actor.type !== "character") return false;
  return canAccess(PERMISSIONS.VIEW_OWN, { user, actor }) ||
    canAccess(PERMISSIONS.VIEW_PARTY, { user, actor });
}

export function canPlanActor(actor, user = game.user) {
  if (!actor || actor.type !== "character") return false;
  return Boolean(user?.isGM) || canAccess(PERMISSIONS.PLAN_OWN, { user, actor });
}

export function canSeeLastResult(actor, user = game.user) {
  return Boolean(user?.isGM) || (canViewActor(actor, user) &&
    canAccess(PERMISSIONS.VIEW_LAST, { user, actor }));
}
