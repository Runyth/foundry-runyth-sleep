// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHOICES, DEFAULT_OUTCOMES, DEFAULT_THRESHOLDS, MODULE_ID
} from "../scripts/domain.js";
import {
  applyPending, clearPlans, getLastResult, getPlan, onPreLongRest,
  onPreShortRest, onRestCompleted, resetRuntimeState, setPlans
} from "../scripts/engine.js";

const POOR_CHOICES = { ...DEFAULT_CHOICES, moisture: "soaked" };
let config;
let messages;
let alerts;
let updateFailures;
let nextSaveTotal;
let saveCalls;
let diceCalls;

function actor(name = "Dante") {
  const flags = {};
  const result = {
    uuid: `Actor.${name}`,
    name,
    type: "character",
    isOwner: true,
    flags,
    system: { attributes: { exhaustion: 0, hp: { temp: 0 } } },
    updates: [],
    systemSaveResults: [],
    async rollSavingThrow(options) {
      saveCalls.push(options);
      return { total: nextSaveTotal };
    },
    async rollAbilityCheck(options) {
      saveCalls.push(options);
      return [{ total: nextSaveTotal }];
    },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key] ?? null; },
    async update(change) {
      if (updateFailures) throw new Error("Simulated storage failure");
      this.updates.push(change);
      this.flags[MODULE_ID] ??= {};
      for (const [key, value] of Object.entries(change)) {
        if (key === `flags.${MODULE_ID}.pendingPlan`) this.flags[MODULE_ID].pendingPlan = value;
        if (key === `flags.${MODULE_ID}.lastResult`) this.flags[MODULE_ID].lastResult = value;
        if (key === "system.attributes.exhaustion") this.system.attributes.exhaustion = value;
        if (key === "system.attributes.hp.temp") this.system.attributes.hp.temp = value;
      }
    }
  };
  return result;
}

beforeEach(() => {
  resetRuntimeState();
  config = { thresholds: DEFAULT_THRESHOLDS, outcomes: DEFAULT_OUTCOMES, exhaustionCap: 5, autoApply: true, chatVisibility: "public", unplannedRestAction: "notice" };
  messages = [];
  alerts = [];
  updateFailures = false;
  nextSaveTotal = 5;
  saveCalls = [];
  diceCalls = [];
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; diceCalls.push(formula); }
    async evaluate() {
      const match = this.formula.match(/^(\d+)d(\d+)\s*([+-])\s*(\d+)$/);
      if (!match) throw new Error("Invalid formula in test");
      return { total: Number(match[1]) * 2 + (match[3] === "-" ? -1 : 1) * Number(match[4]) };
    }
  };
  globalThis.game = {
    system: { id: "dnd5e" },
    user: { id: "gm", isGM: true },
    i18n: { localize: key => key },
    settings: { get: (moduleId, key) => config[key] }
  };
  globalThis.foundry = { utils: { randomID: () => "uniqueRandomID_12345" } };
  globalThis.ChatMessage = {
    getWhisperRecipients: () => [{ id: "gm" }],
    getSpeaker: ({ actor: current }) => ({ actor: current.name }),
    create: async message => { messages.push(message); }
  };
  globalThis.ui = { notifications: { error: message => alerts.push(message), warn: message => alerts.push(message), info: message => alerts.push(message) } };
});

test("long rest consumes a one-shot approved plan and announces after updating actor", async () => {
  const character = actor();
  await setPlans([character], POOR_CHOICES);
  assert.ok(getPlan(character));
  onPreLongRest(character);
  await onRestCompleted(character, { longRest: true });
  assert.equal(character.system.attributes.exhaustion, 1);
  assert.equal(getPlan(character), null);
  assert.equal(getLastResult(character).tier, "poor");
  assert.equal(messages.length, 1);
  assert.equal(character.updates.length, 2);
  assert.deepEqual(Object.keys(character.updates[1]).sort(), [
    `flags.${MODULE_ID}.lastResult`, `flags.${MODULE_ID}.pendingPlan`, "system.attributes.exhaustion"
  ].sort());
  await onRestCompleted(character, { longRest: true });
  assert.equal(character.system.attributes.exhaustion, 1);
  assert.equal(messages.length, 1);
});

test("a completed short rest never consumes a plan", async () => {
  const character = actor();
  await setPlans([character], POOR_CHOICES);
  onPreLongRest(character);
  onPreShortRest(character);
  await onRestCompleted(character, { longRest: false });
  assert.equal(character.system.attributes.exhaustion, 0);
  assert.ok(getPlan(character));
});

test("a canceled or missing long-rest start never consumes a plan", async () => {
  const character = actor();
  await setPlans([character], POOR_CHOICES);
  await onRestCompleted(character, { longRest: true });
  assert.ok(getPlan(character));
});

test("a replacement plan cannot be consumed by earlier rest", async () => {
  const character = actor();
  await setPlans([character], POOR_CHOICES);
  onPreLongRest(character);
  globalThis.foundry.utils.randomID = () => "anotherRandomID_987";
  await setPlans([character], { ...DEFAULT_CHOICES, bedding: "luxurious" });
  await onRestCompleted(character, { longRest: true });
  assert.ok(getPlan(character));
  assert.equal(character.system.attributes.exhaustion, 0);
});

test("an update failure keeps the pending plan for an explicit GM retry", async () => {
  const character = actor();
  await setPlans([character], POOR_CHOICES);
  onPreLongRest(character);
  updateFailures = true;
  assert.equal((await onRestCompleted(character, { longRest: true })).status, "failed");
  assert.ok(getPlan(character));
  assert.equal(character.system.attributes.exhaustion, 0);
  updateFailures = false;
  const retried = await applyPending(character);
  assert.equal(retried.status, "applied");
  assert.equal(character.system.attributes.exhaustion, 1);
});

test("chat failure does not permit double-application", async () => {
  const character = actor();
  await setPlans([character], POOR_CHOICES);
  ChatMessage.create = async () => { throw new Error("Chat down"); };
  const outcome = await applyPending(character);
  assert.equal(outcome.status, "applied");
  assert.equal(character.system.attributes.exhaustion, 1);
  assert.equal(getPlan(character), null);
  assert.equal((await applyPending(character)).status, "no-plan");
  assert.equal(alerts.length, 1);
});

test("player cannot configure or manually apply; owner can complete a planned rest", async () => {
  const character = actor();
  await setPlans([character], POOR_CHOICES);
  game.user = { id: "player", isGM: false };
  await assert.rejects(setPlans([character], POOR_CHOICES));
  await assert.rejects(clearPlans([character]));
  await assert.rejects(applyPending(character));
  onPreLongRest(character);
  await onRestCompleted(character, { longRest: true });
  assert.equal(character.system.attributes.exhaustion, 1);
});

test("a non-owner has no authority to apply effects", async () => {
  const character = actor();
  await setPlans([character], POOR_CHOICES);
  game.user = { id: "player", isGM: false };
  character.isOwner = false;
  onPreLongRest(character);
  await onRestCompleted(character, { longRest: true });
  assert.ok(getPlan(character));
});

test("rich sleeping conditions grant temp HP but do not replace larger values", async () => {
  const character = actor();
  await setPlans([character], {
    ...DEFAULT_CHOICES, bedding: "luxurious", shelter: "indoor", noise: "quiet", safety: "guarded"
  });
  character.system.attributes.hp.temp = 2;
  onPreLongRest(character);
  await onRestCompleted(character, { longRest: true });
  assert.equal(character.system.attributes.hp.temp, 5);
  assert.equal(character.system.attributes.exhaustion, 0);
  assert.equal(getLastResult(character).changes.actual.tempHp, 3);
});

test("disabling autoApply leaves plans in place until manual action", async () => {
  const character = actor();
  await setPlans([character], POOR_CHOICES);
  config.autoApply = false;
  onPreLongRest(character);
  await onRestCompleted(character, { longRest: true });
  assert.ok(getPlan(character));
  assert.equal((await applyPending(character)).status, "applied");
});

test("duplicate actor selections create only one plan", async () => {
  const character = actor();
  const results = await setPlans([character, character], DEFAULT_CHOICES);
  assert.equal(results.length, 1);
  assert.equal(character.updates.length, 1);
});

test("batch changes are capped at four simultaneous writes and retain input order", async () => {
  let concurrent = 0;
  let peak = 0;
  let generated = 0;
  foundry.utils.randomID = () => `uniqueSleepId_${String(++generated).padStart(8, "0")}`;
  const actors = Array.from({ length: 20 }, (_, index) => actor(`PC${index}`));
  for (const character of actors) {
    const original = character.update.bind(character);
    character.update = async change => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await new Promise(resolve => setTimeout(resolve, 1));
      try { await original(change); } finally { concurrent--; }
    };
  }
  const results = await setPlans(actors, DEFAULT_CHOICES);
  assert.equal(results.length, 20);
  assert.equal(peak, 4);
  assert.deepEqual(results.map(result => result.actor), actors.map(character => character.name));
  assert.equal(new Set(actors.map(character => getPlan(character).id)).size, 20);
  const beforeClear = actors.map(character => character.updates.length);
  await clearPlans(actors);
  assert.ok(actors.every(character => !getPlan(character)));
  assert.deepEqual(actors.map(character => character.updates.length), beforeClear.map(value => value + 1));
  // Redundant clears must not write to any Actor or redraw associated sheets.
  await clearPlans(actors);
  assert.deepEqual(actors.map(character => character.updates.length), beforeClear.map(value => value + 1));
});

test("a new long rest without a plan clears stale in-progress state", async () => {
  const character = actor();
  await setPlans([character], POOR_CHOICES);
  onPreLongRest(character);
  await clearPlans([character]);
  onPreLongRest(character);
  await onRestCompleted(character, { longRest: true });
  assert.equal(character.system.attributes.exhaustion, 0);
});


test("an unplanned long rest explains why no effects were applied", async () => {
  const character = actor("Mike Milligan");
  onPreLongRest(character);
  assert.equal((await onRestCompleted(character, { longRest: true })).status, "unplanned");
  assert.equal(character.updates.length, 0);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /Dashboard.NoPlanNotice/);
  await onRestCompleted(character, { longRest: true });
  assert.equal(alerts.length, 1);
});

test("unplanned short rests and canceled long rests do not show misleading notices", async () => {
  const character = actor("Mike Milligan");
  onPreLongRest(character);
  onPreShortRest(character);
  await onRestCompleted(character, { longRest: false });
  assert.equal(alerts.length, 0);
  onPreLongRest(character);
  // Cancellation means restCompleted never fires.
  assert.equal(alerts.length, 0);
});

test("GM can opt into opening dashboard after an unplanned completed long rest", async () => {
  const character = actor("Mike Milligan");
  let opened = 0;
  config.unplannedRestAction = "dashboard";
  game.modules = new Map([[MODULE_ID, { api: { openDashboard: () => { opened++; } } }]]);
  onPreLongRest(character);
  await onRestCompleted(character, { longRest: true });
  assert.equal(opened, 1);
  assert.equal(alerts.length, 1);
});

test("unplanned rest notifications can be disabled", async () => {
  config.unplannedRestAction = "off";
  const character = actor("Dante");
  onPreLongRest(character);
  await onRestCompleted(character, { longRest: true });
  assert.equal(alerts.length, 0);
});

test("successful native CON save prevents poor-sleep exhaustion and records exact result", async () => {
  const character = actor("Fortified");
  nextSaveTotal = 18;
  await setPlans([character], POOR_CHOICES);
  onPreLongRest(character);
  const result = await onRestCompleted(character, { longRest: true });
  assert.equal(result.status, "applied");
  assert.equal(character.system.attributes.exhaustion, 0);
  assert.equal(getLastResult(character).save.success, true);
  assert.equal(getLastResult(character).save.dc, 12);
  assert.equal(getLastResult(character).save.total, 18);
  assert.equal(saveCalls[0].ability, "con");
  assert.equal(saveCalls[0].target, 12);
  assert.equal(saveCalls[0].advantage, undefined);
  assert.equal(character.updates.length, 2);
  assert.equal(character.updates[1]["system.attributes.exhaustion"], undefined);
});

test("system saves are automatic and hidden until summarized: no default dialog and no duplicate roll card", async () => {
  const character = actor();
  character.rollSavingThrow = async (config, dialog, message) => {
    assert.deepEqual(dialog, { configure: false });
    assert.deepEqual(message, { create: false });
    assert.equal(config.target, 12);
    return [{ total: 7 }];
  };
  await setPlans([character], POOR_CHOICES);
  const result = await applyPending(character);
  assert.equal(result.status, "applied");
  assert.equal(character.system.attributes.exhaustion, 1);
  assert.match(messages[0].content, /7 \/ DC 12/);
});

test("miserable rest fails harder DC and adds two Exhaustion only after its normal long rest", async () => {
  const character = actor("Exposed");
  await setPlans([character], { ...DEFAULT_CHOICES, bedding: "ground", shelter: "exposed", temperature: "dangerous" });
  onPreLongRest(character);
  await onRestCompleted(character, { longRest: true });
  assert.equal(character.system.attributes.exhaustion, 2);
  assert.ok(saveCalls[0].target >= 15);
});

test("high CON yields more rolled temporary HP, existing greater temporary HP never replaced", async () => {
  const character = actor("HighCon");
  character.system.abilities = { con: { mod: 5 } };
  const options = { ...DEFAULT_CHOICES, bedding: "comfortable", shelter: "indoor" };
  await setPlans([character], options);
  onPreLongRest(character);
  await onRestCompleted(character, { longRest: true });
  assert.equal(character.system.attributes.hp.temp, 7); // test dice: 1d4 (2) + CON +5
  assert.deepEqual(diceCalls, ["1d4 + 5"]);
  assert.equal(getLastResult(character).hpRoll.total, 7);
  await setPlans([character], options);
  character.system.attributes.hp.temp = 19;
  await applyPending(character);
  assert.equal(character.system.attributes.hp.temp, 19);
});

test("cancelled save never consumes plan, fails closed and avoids random exhaustion", async () => {
  const character = actor();
  character.rollSavingThrow = async () => null;
  await setPlans([character], POOR_CHOICES);
  assert.equal((await applyPending(character)).status, "failed");
  assert.ok(getPlan(character));
  assert.equal(character.system.attributes.exhaustion, 0);
  assert.equal(character.updates.length, 1);
});

test("a new sleep plan queued while dice are rolling is never overwritten or consumed", async () => {
  const character = actor();
  const rich = { ...DEFAULT_CHOICES, bedding: "luxurious", shelter: "indoor", noise: "quiet", safety: "guarded" };
  await setPlans([character], rich);
  const originalId = getPlan(character).id;
  const oldRoll = globalThis.Roll;
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; }
    async evaluate() {
      foundry.utils.randomID = () => "alternateValidId_987654";
      await setPlans([character], POOR_CHOICES);
      return { total: 12 };
    }
  };
  try {
    assert.equal((await applyPending(character)).status, "stale-plan");
    assert.notEqual(getPlan(character).id, originalId);
    assert.equal(character.system.attributes.hp.temp, 0);
  } finally { globalThis.Roll = oldRoll; }
});

test("retrying a storage failure reuses the exact prior save rather than rerolling", async () => {
  const character = actor("NoFreeRerolls");
  await setPlans([character], POOR_CHOICES);
  nextSaveTotal = 3;
  updateFailures = true;
  assert.equal((await applyPending(character)).status, "failed");
  assert.equal(saveCalls.length, 1);
  nextSaveTotal = 20;
  updateFailures = false;
  assert.equal((await applyPending(character)).status, "applied");
  assert.equal(saveCalls.length, 1);
  assert.equal(character.system.attributes.exhaustion, 1);
});

test("replaced plans clear cached rolls so the next night rolls anew", async () => {
  const character = actor("PlanReplacement");
  await setPlans([character], POOR_CHOICES);
  updateFailures = true;
  await applyPending(character);
  assert.equal(saveCalls.length, 1);
  updateFailures = false;
  foundry.utils.randomID = () => "differentValidId_1234";
  await setPlans([character], POOR_CHOICES);
  nextSaveTotal = 20;
  assert.equal((await applyPending(character)).status, "applied");
  assert.equal(saveCalls.length, 2);
  assert.equal(character.system.attributes.exhaustion, 0);
});
