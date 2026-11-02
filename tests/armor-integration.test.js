// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHOICES, DEFAULT_OUTCOMES, DEFAULT_THRESHOLDS, MODULE_ID } from "../scripts/domain.js";
import { DEFAULT_ARMOR_RULES } from "../scripts/armor.js";
import { onPreLongRest, onPreShortRest, onRestCompleted, resetRuntimeState } from "../scripts/engine.js";

let config, rolls, messages, notifications;
function makeActor() {
  const flags = {};
  const armor = { id: "plate", type: "equipment", system: { equipped: true, type: { value: "heavy" } } };
  const fighter = { id: "class1", type: "class", system: { hd: { spent: 4 } } };
  const current = {
    name: "Mike Milligan", uuid: "Actor.Mike", type: "character", isOwner: true,
    items: [armor, fighter], system: { attributes: { exhaustion: 2, hp: { temp: 0 } } },
    getFlag: (id, key) => flags[id]?.[key],
    async update(data) {
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(`flags.${MODULE_ID}.`)) {
          flags[MODULE_ID] ??= {}; flags[MODULE_ID][key.slice(`flags.${MODULE_ID}.`.length)] = value;
        }
        if (key === "system.attributes.exhaustion") this.system.attributes.exhaustion = value;
        if (key === "system.attributes.hp.temp") this.system.attributes.hp.temp = value;
      }
    },
    async updateEmbeddedDocuments(type, updates) {
      assert.equal(type, "Item");
      for (const update of updates) {
        this.items.find(item => item.id === update._id).system.hd.spent = update["system.hd.spent"];
      }
    },
    async rollSavingThrow({ ability, target }) { rolls.push({ ability, target }); return { total: 3 }; }
  };
  return current;
}
beforeEach(() => {
  resetRuntimeState();
  config = { thresholds: DEFAULT_THRESHOLDS, outcomes: DEFAULT_OUTCOMES,
    autoApply: true, exhaustionCap: 5, chatVisibility: "off", unplannedRestAction: "off",
    armorRules: { ...DEFAULT_ARMOR_RULES, mode: "custom" } };
  rolls = []; messages = []; notifications = [];
  globalThis.game = { system: { id: "dnd5e" }, user: { isGM: true, id: "gm" },
    settings: { get: (id, key) => config[key] }, i18n: { localize: key => key } };
  globalThis.foundry = { utils: { randomID: () => "abcdefghijklmnopqrst" } };
  globalThis.ui = { notifications: { error: msg => notifications.push(msg), info: msg => notifications.push(msg), warn: msg => notifications.push(msg) } };
  globalThis.ChatMessage = { getSpeaker: () => ({}), create: async msg => messages.push(msg) };
});

test("equipped armor consequence runs after completed Long Rest without a queued bedding plan", async () => {
  const character = makeActor();
  onPreLongRest(character);
  character.system.attributes.exhaustion = 1;
  const result = await onRestCompleted(character, { longRest: true });
  assert.equal(result.status, "unplanned");
  assert.equal(result.armorResult.status, "applied");
  assert.equal(character.system.attributes.exhaustion, 2);
  assert.deepEqual(rolls, [{ ability: "con", target: 15 }]);
  assert.equal((await onRestCompleted(character, { longRest: true })), undefined);
  assert.equal(rolls.length, 1);
});

test("interrupted or short rest does not apply the armor rule", async () => {
  const character = makeActor();
  onPreLongRest(character);
  onPreShortRest(character);
  assert.equal(await onRestCompleted(character, { longRest: false }), undefined);
  assert.equal(rolls.length, 0);
  assert.equal(character.system.attributes.exhaustion, 2);
});

test("Xanathar recovery is independent of planned bedding quality", async () => {
  config.armorRules = { ...DEFAULT_ARMOR_RULES, mode: "xanathar" };
  const character = makeActor();
  const flags = character;
  await character.update({ [`flags.${MODULE_ID}.pendingPlan`]: {
    schema: 1, id: "abcdefghijklmnop", choices: { ...DEFAULT_CHOICES, moisture: "soaked" }, createdAt: 1234
  } });
  onPreLongRest(character);
  character.system.attributes.exhaustion = 1;
  character.items[1].system.hd.spent = 0;
  const result = await onRestCompleted(character, { longRest: true });
  assert.equal(result.armorResult.status, "applied");
  assert.equal(character.items[1].system.hd.spent, 3);
  assert.equal(rolls.length, 1); // Bedding quality CON save, armor itself has no save.
});


test("malformed queued bedding does not suppress independent armored sleep", async () => {
  const character = makeActor();
  await character.update({ [`flags.${MODULE_ID}.pendingPlan`]: {
    schema: 1, id: "bad!", createdAt: 42, choices: DEFAULT_CHOICES
  } });
  const prior = console.warn;
  console.warn = () => {};
  try { onPreLongRest(character); }
  finally { console.warn = prior; }
  character.system.attributes.exhaustion = 1;
  const result = await onRestCompleted(character, { longRest: true });
  assert.equal(result.armorResult.status, "applied");
  assert.equal(rolls.length, 1);
});
