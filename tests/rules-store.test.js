import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHOICES, DEFAULT_OUTCOMES, DEFAULT_THRESHOLDS, FACTORS, evaluate, MODULE_ID } from "../scripts/domain.js";
import { DEFAULT_MECHANICS } from "../scripts/mechanics.js";
import { DEFAULT_ARMOR_RULES } from "../scripts/armor.js";
import { DEFAULT_PERMISSIONS, sanitizePermissions } from "../scripts/permissions.js";
import {
  canModifyRules, ensureRuleDocument, readRules, resetRuleConfiguration, resetRuleDocumentRuntimeState,
  ruleJournal, ruleRevision, saveRuleConfiguration, syncRuleDocumentAccess
} from "../scripts/rules-store.js";

let settings, docs, gm, player, other, created, writes, document;

beforeEach(() => {
  resetRuleDocumentRuntimeState();
  created = 0;
  writes = [];
  gm = { id: "gm", name: "Game Master", isGM: true, active: true, role: 4 };
  player = { id: "trusted-player", name: "Alice", isGM: false, active: true, role: 2 };
  other = { id: "other-player", name: "Bob", isGM: false, active: true, role: 1 };
  settings = new Map(Object.entries({
    rulesJournalId: "", permissions: sanitizePermissions(DEFAULT_PERMISSIONS),
    thresholds: DEFAULT_THRESHOLDS, outcomes: DEFAULT_OUTCOMES,
    mechanics: DEFAULT_MECHANICS, armorRules: DEFAULT_ARMOR_RULES
  }));
  docs = new Map();
  document = null;
  globalThis.game = {
    user: gm, users: { contents: [gm, player, other] },
    journal: { get: id => docs.get(id) ?? null, contents: [] },
    settings: {
      get: (namespace, key) => settings.get(key),
      set: async (namespace, key, value) => { writes.push(key); settings.set(key, value); }
    }
  };
  globalThis.JournalEntry = { create: async data => {
    created++;
    const flags = structuredClone(data.flags);
    document = {
      id: `journal-${created}`, name: data.name, ownership: data.ownership,
      getFlag: (ns, key) => flags[ns]?.[key],
      testUserPermission: (user, level) => user.isGM || (level === "OWNER" && document.ownership[user.id] === 3),
      update: async changes => {
        if (changes.ownership) document.ownership = changes.ownership;
        if (changes[`flags.${MODULE_ID}.ruleConfiguration`]) {
          flags[MODULE_ID].ruleConfiguration = changes[`flags.${MODULE_ID}.ruleConfiguration`];
        }
      }
    };
    docs.set(document.id, document);
    game.journal.contents.push(document);
    return document;
  } };
});

test("shelter and bedding defaults match four graded shelters and two changed beds", () => {
  assert.deepEqual(FACTORS.shelter, { exposed: -1, improvised: 0, careful: 1, indoor: 2 });
  assert.equal(FACTORS.bedding.bedroll, 0);
  assert.equal(FACTORS.bedding.bed, 1);
  assert.equal(FACTORS.bedding.ground, -3);
  assert.equal(FACTORS.bedding.straw, 0);
  assert.equal(evaluate({ ...DEFAULT_CHOICES, shelter: "careful" }).score, 1);
  assert.equal(evaluate({ ...DEFAULT_CHOICES, shelter: "indoor", bedding: "bed" }).score, 3);
});

test("first-run GM migration preserves custom world values and creates just one owned rule document", async () => {
  settings.set("thresholds", { miserable: -8, poor: -4, comfortable: 3, excellent: 7 });
  const first = await ensureRuleDocument();
  assert.equal(created, 1);
  assert.equal(first, ruleJournal());
  assert.deepEqual(readRules().thresholds, settings.get("thresholds"));
  assert.equal(first.ownership.default, 2);
  assert.equal(first.ownership[player.id], undefined);
  assert.equal(settings.get("rulesJournalId"), first.id);
  assert.equal((await ensureRuleDocument()).id, first.id);
  assert.equal(created, 1);
  assert.deepEqual(writes, ["rulesJournalId"]);
});

test("delegated rule edit requires BOTH module permission and document ownership; no global permission escalation", async () => {
  await ensureRuleDocument();
  game.user = player;
  assert.equal(canModifyRules(), false);
  await assert.rejects(saveRuleConfiguration(readRules()), /PermissionDenied/);
  game.user = gm;
  const permissions = sanitizePermissions({ ...DEFAULT_PERMISSIONS, userOverrides: { [player.id]: { editRules: true } } });
  settings.set("permissions", permissions);
  await syncRuleDocumentAccess();
  assert.equal(document.ownership[player.id], 3);
  assert.equal(document.ownership[other.id], undefined);
  game.user = player;
  assert.equal(canModifyRules(), true);
  const revised = readRules();
  revised.thresholds.comfortable = 3;
  assert.equal(await saveRuleConfiguration(revised, { expectedRevision: 1 }), true);
  assert.equal(ruleRevision(), 2);
  assert.equal(readRules().thresholds.comfortable, 3);
  assert.deepEqual(writes, ["rulesJournalId"]); // Delegates never write a world setting.
  game.user = other;
  assert.equal(canModifyRules(), false);
  await assert.rejects(saveRuleConfiguration(revised), /PermissionDenied/);
});

test("a stale owner is refused when their module permission was revoked", async () => {
  await ensureRuleDocument();
  settings.set("permissions", sanitizePermissions({ ...DEFAULT_PERMISSIONS,
    userOverrides: { [player.id]: { editRules: true } } }));
  await syncRuleDocumentAccess();
  game.user = player;
  assert.equal(canModifyRules(), true);
  settings.set("permissions", sanitizePermissions(DEFAULT_PERMISSIONS));
  assert.equal(canModifyRules(), false);
  await assert.rejects(saveRuleConfiguration(readRules()), /PermissionDenied/);
  game.user = gm;
  await syncRuleDocumentAccess();
  assert.equal(document.ownership[player.id], undefined);
});

test("minimum role can grant rule editing to trusted players while preserving other user's denial", async () => {
  await ensureRuleDocument();
  const permissions = sanitizePermissions({ roleMinimums: { ...DEFAULT_PERMISSIONS.roleMinimums, editRules: 2 },
    userOverrides: { [player.id]: { editRules: false } } });
  settings.set("permissions", permissions);
  await syncRuleDocumentAccess();
  assert.equal(document.ownership[player.id], undefined);
  settings.set("permissions", { ...permissions, userOverrides: {} });
  await syncRuleDocumentAccess();
  assert.equal(document.ownership[player.id], 3);
  assert.equal(document.ownership[other.id], undefined);
});

test("invalid rules, stale revision and missing ownership reject edits without modifying data", async () => {
  await ensureRuleDocument();
  const rules = readRules();
  await assert.rejects(saveRuleConfiguration({ ...rules, thresholds: { ...rules.thresholds, poor: 99 } }), RangeError);
  assert.equal(ruleRevision(), 1);
  const edit = readRules();
  edit.thresholds.comfortable = 3;
  await assert.rejects(saveRuleConfiguration(edit, { expectedRevision: 0 }), /RulesChanged/);
  assert.equal(ruleRevision(), 1);
  settings.set("permissions", sanitizePermissions({ ...DEFAULT_PERMISSIONS,
    userOverrides: { [player.id]: { editRules: true } } }));
  game.user = player; // Permission alone cannot bypass the OWNER ACL.
  assert.equal(canModifyRules(), false);
});

test("reset restores every original rules profile; no-op saves avoid document writes", async () => {
  await ensureRuleDocument();
  assert.equal(await saveRuleConfiguration(readRules()), false);
  assert.equal(ruleRevision(), 1);
  const changed = readRules();
  changed.thresholds.comfortable = 3;
  assert.equal(await saveRuleConfiguration(changed), true);
  assert.equal(await resetRuleConfiguration({ expectedRevision: 2 }), true);
  assert.deepEqual(readRules().thresholds, DEFAULT_THRESHOLDS);
  assert.deepEqual(readRules().mechanics, DEFAULT_MECHANICS);
  assert.deepEqual(readRules().armorRules, DEFAULT_ARMOR_RULES);
  assert.equal(ruleRevision(), 3);
});

test("non-GM without a provisioned document cannot change world settings", async () => {
  game.user = player;
  assert.equal(await ensureRuleDocument(), null);
  assert.equal(ruleJournal(), null);
  assert.equal(canModifyRules(), false);
  await assert.rejects(saveRuleConfiguration(readRules()), /PermissionDenied/);
  assert.deepEqual(writes, []);
});

test("rules document updates are visible to all users with observer access", async () => {
  await ensureRuleDocument();
  const rule = readRules();
  rule.thresholds.poor = -3;
  await saveRuleConfiguration(rule);
  game.user = other;
  assert.deepEqual(readRules().thresholds.poor, -3);
  assert.equal(document.ownership.default, 2);
  assert.equal(canModifyRules(), false);
});

test("legacy malformed armor config cannot prevent valid bedding rules", () => {
  settings.set("armorRules", { mode: "invalid" });
  assert.deepEqual(readRules().thresholds, DEFAULT_THRESHOLDS);
  assert.deepEqual(readRules().armorRules, DEFAULT_ARMOR_RULES);
});

test("authorization respects permission override and actual document ACL on every save", async () => {
  await ensureRuleDocument();
  settings.set("permissions", sanitizePermissions({ ...DEFAULT_PERMISSIONS,
    userOverrides: { [player.id]: { editRules: true } } }));
  await syncRuleDocumentAccess();
  game.user = player;
  document.ownership = { default: 2 }; // Simulate server-side ownership removal.
  assert.equal(canModifyRules(), false);
  await assert.rejects(saveRuleConfiguration(readRules()), /PermissionDenied/);
});
