// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { canAccess, canPlanActor, canSeeLastResult, canViewActor, DEFAULT_PERMISSIONS,
  PERMISSIONS, sanitizePermissions } from "../scripts/permissions.js";
import { DEFAULT_CHOICES, MODULE_ID } from "../scripts/domain.js";
import { clearPlans, getPlan, setPlans, resetRuntimeState } from "../scripts/engine.js";

let config;
let owner;
let nonOwner;
const user = { id: "player-one", isGM: false, role: 1 };

beforeEach(() => {
  resetRuntimeState();
  config = sanitizePermissions(DEFAULT_PERMISSIONS);
  owner = {
    uuid: "Actor.owner", name: "Dante", type: "character", visible: true, isOwner: true,
    flags: {}, testUserPermission: () => true,
    getFlag(namespace, key) { return this.flags[key] ?? null; },
    async update(change) {
      if (Object.hasOwn(change, `flags.${MODULE_ID}.pendingPlan`)) this.flags.pendingPlan = change[`flags.${MODULE_ID}.pendingPlan`];
    }
  };
  nonOwner = { ...owner, uuid: "Actor.other", name: "Mike", isOwner: false, testUserPermission: () => false };
  globalThis.game = {
    user: { ...user }, i18n: { localize: key => key },
    settings: { get: (namespace, key) => key === "permissions" ? config : undefined }
  };
  globalThis.foundry = { utils: { randomID: () => "abcdefghijklmnop" } };
});

test("permission defaults allow an owner to inspect but not create plans", async () => {
  assert.equal(canViewActor(owner), true);
  assert.equal(canSeeLastResult(owner), true);
  assert.equal(canPlanActor(owner), false);
  assert.equal(canViewActor(nonOwner), false);
  await assert.rejects(setPlans([owner], DEFAULT_CHOICES), /PermissionDenied/);
});

test("minimum Foundry roles and per-user allow/deny overrides follow the dashboard administration semantics", () => {
  config.roleMinimums.viewOwn = 2;
  assert.equal(canViewActor(owner), false);
  game.user.role = 2;
  assert.equal(canViewActor(owner), true);
  config.userOverrides[user.id] = { viewOwn: false, planOwn: true };
  assert.equal(canViewActor(owner), false);
  assert.equal(canPlanActor(owner), true);
  assert.equal(canPlanActor(nonOwner), false);
});

test("explicit allowance for party visibility never confers ownership", () => {
  config.userOverrides[user.id] = { viewParty: true, planOwn: true };
  assert.equal(canViewActor(nonOwner), true);
  assert.equal(canPlanActor(nonOwner), false);
  nonOwner.visible = false;
  assert.equal(canViewActor(nonOwner), false);
});

test("delegated owner may plan and clear only their own character", async () => {
  config.roleMinimums.planOwn = 1;
  const saved = await setPlans([owner], DEFAULT_CHOICES);
  assert.equal(saved[0].success, true);
  assert.ok(getPlan(owner));
  assert.equal((await clearPlans([owner]))[0].success, true);
  assert.equal(getPlan(owner), null);
  await assert.rejects(setPlans([owner, nonOwner], DEFAULT_CHOICES), /PermissionDenied/);
});

test("GM retains all rights even when override denies them", () => {
  config.userOverrides[user.id] = { viewOwn: false, planOwn: false };
  game.user.isGM = true;
  assert.equal(canViewActor(nonOwner), true);
  assert.equal(canPlanActor(nonOwner), true);
  assert.equal(canAccess(PERMISSIONS.VIEW_LAST, { actor: nonOwner }), true);
});

test("sanitizer rejects unsafe roles, unknown capabilities, invalid overrides and prototype-like IDs", () => {
  const bad = sanitizePermissions({
    roleMinimums: { viewOwn: -100, planOwn: "1", admin: 1 },
    userOverrides: { "__proto__": { planOwn: true }, "a.b": { planOwn: true },
      someone: { planOwn: "yes", viewLast: false, escalate: true } }
  });
  assert.equal(bad.roleMinimums.viewOwn, 1);
  assert.equal(bad.roleMinimums.planOwn, 1);
  assert.deepEqual(bad.userOverrides.someone, { viewLast: false });
  assert.equal(Object.hasOwn(bad.userOverrides, "a.b"), false);
});

test("prototype-like user IDs cannot poison the permissions object or grant rule editing", () => {
  const tainted = JSON.parse('{"userOverrides":{"__proto__":{"editRules":true},"constructor":{"editRules":true},"valid-user":{"editRules":true}}}');
  const result = sanitizePermissions(tainted);
  assert.equal(Object.hasOwn(result.userOverrides, "__proto__"), false);
  assert.equal(Object.hasOwn(result.userOverrides, "constructor"), false);
  assert.deepEqual(result.userOverrides["valid-user"], { editRules: true });
  assert.equal(Object.prototype.editRules, undefined);
  assert.equal(canAccess(PERMISSIONS.EDIT_RULES, { user }), false);
});
