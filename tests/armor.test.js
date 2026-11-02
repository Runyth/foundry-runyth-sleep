// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ARMOR_RULES, armorCategory, armorProfile, armorExhaustion,
  hitDiceTarget, sanitizeArmorRules, takeRestSnapshot
} from "../scripts/armor.js";
import { rememberArmorRest, applyArmorRest, discardArmorRest, resetArmorRuntimeState } from "../scripts/armor-engine.js";
import { MODULE_ID } from "../scripts/domain.js";

const item = (id, category, equipped = true) => ({
  id, type: "equipment", system: { equipped, type: { value: category } }
});
const clazz = (id, spent) => ({ id, type: "class", system: { hd: { spent } } });
let settings, messages, notifications, saves, failAttributes, failClasses;

function actor(items = [item("armor", "heavy"), clazz("fighter", 8)]) {
  const flags = {};
  return {
    uuid: "Actor.Armored", type: "character", name: "Armored Fighter", isOwner: true,
    items,
    system: { attributes: { exhaustion: 2 } },
    getFlag: (id, key) => flags[id]?.[key],
    async update(data) {
      if (failAttributes) throw new Error("attribute write failure");
      const key = `flags.${MODULE_ID}.lastArmorRest`;
      if (data[key]) {
        flags[MODULE_ID] ??= {};
        flags[MODULE_ID].lastArmorRest = data[key];
      }
      if (data["system.attributes.exhaustion"] !== undefined) {
        this.system.attributes.exhaustion = data["system.attributes.exhaustion"];
      }
    },
    async updateEmbeddedDocuments(type, changes) {
      if (failClasses) throw new Error("class item write failure");
      for (const change of changes) {
        const doc = this.items.find(doc => doc.id === change._id);
        doc.system.hd.spent = change["system.hd.spent"];
      }
    },
    async rollSavingThrow(options) { saves.push(options); return { total: settings.rollTotal }; }
  };
}

beforeEach(() => {
  resetArmorRuntimeState();
  settings = { armorRules: DEFAULT_ARMOR_RULES, exhaustionCap: 5, chatVisibility: "public", rollTotal: 9 };
  failAttributes = false; failClasses = false;
  messages = []; notifications = []; saves = [];
  globalThis.game = {
    system: { id: "dnd5e" }, user: { isGM: true, id: "gm" },
    i18n: { localize: key => key }, settings: { get: (id, key) => settings[key] }
  };
  globalThis.foundry = { utils: { randomID: () => "armorRest12345678" } };
  globalThis.ChatMessage = {
    getSpeaker: () => ({}), getWhisperRecipients: () => [],
    create: async value => { messages.push(value); }
  };
  globalThis.ui = { notifications: { error: value => notifications.push(value) } };
});

test("2024 core rules do not invent an armor penalty or saving throw", async () => {
  const character = actor();
  rememberArmorRest(character);
  character.system.attributes.exhaustion = 1;
  character.items[1].system.hd.spent = 0;
  const result = await applyArmorRest(character, 1);
  assert.equal(result.status, "no-effect");
  assert.equal(character.system.attributes.exhaustion, 1);
  assert.equal(character.items[1].system.hd.spent, 0);
  assert.equal(saves.length, 0);
  assert.equal(messages.length, 0);
});

test("only equipped armor items count; shields and ordinary inventory do not", () => {
  assert.equal(armorCategory({ items: [item("shield", "shield"), item("heavy", "heavy", false)] }), "none");
  assert.equal(armorCategory({ items: [item("light", "light")] }), "light");
  assert.equal(armorCategory({ items: [item("med", "medium"), item("heavy", "heavy")] }), "heavy");
  assert.equal(armorCategory({ items: [{ type: "equipment", system: { equipped: { value: true }, armor: { type: "medium" } } }] }), "medium");
  assert.equal(armorCategory({ items: [{ type: "weapon", system: { equipped: true, type: { value: "heavy" } } }] }), "none");
});

test("Xanathar optional rule applies to medium and heavy, without a Constitution save", () => {
  const rules = { ...DEFAULT_ARMOR_RULES, mode: "xanathar" };
  for (const kind of ["medium", "heavy"]) {
    const profile = armorProfile(rules, kind);
    assert.equal(profile.save.enabled, false);
    assert.equal(profile.failure.hitDicePercent, 25);
    assert.equal(profile.failure.preventRecovery, true);
  }
  assert.equal(armorProfile(rules, "light"), null);
});

test("Xanathar optional rule restores previous exhaustion and only a quarter of spent Hit Dice", async () => {
  settings.armorRules = { ...DEFAULT_ARMOR_RULES, mode: "xanathar" };
  const character = actor();
  rememberArmorRest(character);
  character.system.attributes.exhaustion = 1;
  character.items[1].system.hd.spent = 0; // Native 2024 rest recovered all eight.
  assert.equal((await applyArmorRest(character, 1)).status, "applied");
  assert.equal(character.system.attributes.exhaustion, 2);
  assert.equal(character.items[1].system.hd.spent, 6); // Recover only 2 of 8 spent.
  assert.equal(character.getFlag(MODULE_ID, "lastArmorRest").phase, "complete");
  assert.equal(saves.length, 0);
  assert.equal(messages.length, 1);
  assert.equal((await applyArmorRest(character, 1)).status, "no-effect");
});

test("Xanathar spent Hit Dice recovery uses one minimum and multiclass distribution", () => {
  assert.deepEqual(hitDiceTarget([{ id: "a", spent: 1 }], 25), [{ id: "a", spent: 0 }]);
  assert.deepEqual(hitDiceTarget([{ id: "a", spent: 3 }, { id: "b", spent: 4 }], 25), [
    { id: "a", spent: 2 }, { id: "b", spent: 4 }
  ]);
  assert.deepEqual(hitDiceTarget([{ id: "a", spent: 3 }], 0), [{ id: "a", spent: 3 }]);
  assert.deepEqual(hitDiceTarget([{ id: "a", spent: 3 }], 100), []);
});

test("custom heavy armor rolls a native CON save, failure adds Exhaustion", async () => {
  settings.armorRules = { ...DEFAULT_ARMOR_RULES, mode: "custom" };
  const character = actor();
  rememberArmorRest(character);
  character.system.attributes.exhaustion = 1;
  assert.equal((await applyArmorRest(character, 1)).status, "applied");
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0], { ability: "con", target: 15 });
  assert.equal(character.system.attributes.exhaustion, 2);
});

test("successful armor save avoids penalties, and category can be changed independently", async () => {
  settings.armorRules = { ...DEFAULT_ARMOR_RULES, mode: "custom" };
  settings.rollTotal = 19;
  const character = actor();
  rememberArmorRest(character);
  character.system.attributes.exhaustion = 1;
  assert.equal((await applyArmorRest(character, 1)).status, "applied");
  assert.equal(character.system.attributes.exhaustion, 1);
});

test("armor choice is snapshotted at the start of rest, not inferred afterwards", () => {
  const character = actor();
  const previous = takeRestSnapshot(character);
  character.items[0].system.equipped = false;
  assert.equal(previous.category, "heavy");
  assert.equal(armorCategory(character), "none");
});

test("invalid or malicious custom settings fail validation", () => {
  assert.throws(() => sanitizeArmorRules({ mode: "unknown" }));
  const bad = structuredClone(DEFAULT_ARMOR_RULES);
  bad.custom.heavy.save.dc = "20; eval(...)";
  assert.throws(() => sanitizeArmorRules(bad));
  bad.custom.heavy.save.dc = 20;
  bad.custom.heavy.failure.hitDicePercent = 101;
  assert.throws(() => sanitizeArmorRules(bad));
});

test("canceled native save leaves armor consequence unapplied for retry", async () => {
  settings.armorRules = { ...DEFAULT_ARMOR_RULES, mode: "custom" };
  settings.rollTotal = undefined;
  const character = actor();
  rememberArmorRest(character);
  character.system.attributes.exhaustion = 1;
  assert.equal((await applyArmorRest(character, 1)).status, "failed");
  assert.equal(character.getFlag(MODULE_ID, "lastArmorRest"), undefined);
  assert.equal(character.system.attributes.exhaustion, 1);
  settings.rollTotal = 18;
  assert.equal((await applyArmorRest(character, 1)).status, "applied");
});

test("failed Actor write reuses the same armor save rather than rolling again", async () => {
  settings.armorRules = { ...DEFAULT_ARMOR_RULES, mode: "custom" };
  const character = actor();
  rememberArmorRest(character);
  character.system.attributes.exhaustion = 1;
  failAttributes = true;
  assert.equal((await applyArmorRest(character, 1)).status, "failed");
  assert.equal(saves.length, 1);
  failAttributes = false;
  settings.rollTotal = 20;
  assert.equal((await applyArmorRest(character, 1)).status, "applied");
  assert.equal(saves.length, 1);
  assert.equal(character.system.attributes.exhaustion, 2);
});

test("partial class update failure only resumes class recovery and does not duplicate exhaustion", async () => {
  settings.armorRules = { ...DEFAULT_ARMOR_RULES, mode: "xanathar" };
  const character = actor();
  rememberArmorRest(character);
  character.system.attributes.exhaustion = 1;
  character.items[1].system.hd.spent = 0;
  failClasses = true;
  assert.equal((await applyArmorRest(character, 1)).status, "failed");
  assert.equal(character.system.attributes.exhaustion, 2);
  assert.equal(character.getFlag(MODULE_ID, "lastArmorRest").phase, "attributes");
  failClasses = false;
  assert.equal((await applyArmorRest(character, 1)).status, "applied");
  assert.equal(character.system.attributes.exhaustion, 2);
  assert.equal(character.items[1].system.hd.spent, 6);
});

test("short-rest discard prevents all armor effects", async () => {
  settings.armorRules = { ...DEFAULT_ARMOR_RULES, mode: "custom" };
  const character = actor();
  rememberArmorRest(character);
  discardArmorRest(character);
  assert.equal((await applyArmorRest(character, 1)).status, "no-effect");
});

test("Exhaustion recovery restoration is additive to quality penalties and respects cap", () => {
  assert.equal(armorExhaustion(3, 3, 2, { preventRecovery: true, exhaustion: 1 }, 5), 5);
  assert.equal(armorExhaustion(1, 3, 2, { preventRecovery: false, exhaustion: 0 }, 5), 1);
  assert.equal(armorExhaustion(4, 5, 4, { preventRecovery: true, exhaustion: 2 }, 5), 5);
});

test("GM-only administrative retry rejects ordinary players", async () => {
  const { retryArmorRest } = await import("../scripts/armor-engine.js");
  game.user.isGM = false;
  assert.throws(() => retryArmorRest(actor()), /GM permission/);
});

test("corrupt armor settings do not interrupt a Long Rest", () => {
  settings.armorRules = { mode: "unknown" };
  const prior = console.error;
  console.error = () => {};
  try {
    const character = actor();
    assert.doesNotThrow(() => rememberArmorRest(character));
  } finally { console.error = prior; }
});
