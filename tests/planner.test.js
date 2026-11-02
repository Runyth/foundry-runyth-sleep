import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHOICES, DEFAULT_OUTCOMES, DEFAULT_THRESHOLDS } from "../scripts/domain.js";
import { DEFAULT_MECHANICS } from "../scripts/mechanics.js";
import { DEFAULT_ARMOR_RULES } from "../scripts/armor.js";
import { openHelp, openPlanner, openRules } from "../scripts/planner.js";
import { readRules } from "../scripts/rules-store.js";
import { resetGeometryCache } from "../scripts/geometry.js";

const config = { thresholds: DEFAULT_THRESHOLDS, outcomes: DEFAULT_OUTCOMES };
const positions = new Map();
const dialogs = [];
const saves = [];
let rulesData;

beforeEach(() => {
  resetGeometryCache();
  dialogs.length = 0;
  positions.clear();
  saves.length = 0;
  rulesData = { schema: 1, revision: 1, rules: { thresholds: DEFAULT_THRESHOLDS, outcomes: DEFAULT_OUTCOMES, mechanics: DEFAULT_MECHANICS, armorRules: DEFAULT_ARMOR_RULES } };
  globalThis.window = { innerWidth: 1280, innerHeight: 850 };
  globalThis.game = {
    user: { id: "gm", isGM: true },
    journal: { get: id => id === "sleep-rules" ? {
      getFlag: () => rulesData,
      testUserPermission: () => true,
      update: async changes => { rulesData = changes["flags.runyth-sleep.ruleConfiguration"]; saves.push("ruleConfiguration"); }
    } : null },
    actors: { contents: [{ type: "character", name: "Dante", uuid: "Actor.Dante", isOwner: true,
      getFlag: () => null, update: async () => {} }] },
    i18n: { localize: key => key },
    settings: {
      get: (namespace, key) => key === "rulesJournalId" ? "sleep-rules" : config[key] ?? positions.get(key) ?? null,
      set: async (namespace, key, value) => { saves.push(key); positions.set(key, value); }
    }
  };
  globalThis.canvas = { tokens: { controlled: [] }, scene: null };
  globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };
  globalThis.foundry = { applications: { api: { DialogV2: {
    wait(options) {
      const fake = {
        position: { left: 50, top: 60, ...options.position },
        front: 0,
        bringToFront() { this.front++; },
        element: { querySelector: () => null }
      };
      const record = { options, fake, done: null, close() {
        options.close?.(null, fake);
        this.done("closed");
      } };
      dialogs.push(record);
      options.render?.(null, fake);
      return new Promise(resolve => { record.done = resolve; });
    },
    confirm: async () => true
  } } } };
});

afterEach(() => {
  for (const dialog of dialogs) if (dialog.done) dialog.close();
});

test("reopening the planner raises one dialog instead of creating an overlay", async () => {
  const first = openPlanner();
  const second = openPlanner();
  assert.equal(first, second);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].fake.front, 0);
  assert.equal(openPlanner(), first);
  assert.equal(dialogs[0].fake.front, 1);
  dialogs[0].close();
  await first;
});

test("planner, rule editor, help can open independently and save own geometry", async () => {
  const running = [openPlanner(), openRules(), openHelp()];
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dialogs.length, 3);
  assert.deepEqual(dialogs.map(dialog => dialog.options.position), [
    { width: 660, height: 670 },
    { width: 610, height: 650 },
    { width: 580, height: 540 }
  ]);
  for (const dialog of dialogs) dialog.close();
  await Promise.all(running);
  assert.deepEqual(saves.sort(), ["helpPosition", "plannerPosition", "rulesPosition"]);
});

test("player plan is human-readable and no GM controls are shown", async () => {
  game.user.isGM = false;
  game.user.role = 1;
  game.actors.contents[0].getFlag = (namespace, key) => key === "pendingPlan" ? {
    schema: 1, id: "abcdefghijklmnop", createdAt: 42, choices: DEFAULT_CHOICES
  } : null;
  const pending = openPlanner();
  await new Promise(resolve => setImmediate(resolve));
  const content = dialogs[0].options.content;
  assert.ok(content.includes("runyth-sleep-readonly"));
  assert.ok(content.includes("Choice.bedding.bedroll"));
  assert.ok(!content.includes('action="save"'));
  assert.equal(dialogs[0].options.buttons.length, 1);
  dialogs[0].close();
  await pending;
});

test("re-rendering same planner root does not duplicate listeners or reset inputs", async () => {
  const opened = openPlanner();
  await new Promise(resolve => setImmediate(resolve));
  const record = dialogs[0];
  const callbacks = new Map();
  const controls = new Map(Object.entries(DEFAULT_CHOICES).map(([key, value]) => [key, { name: key, value }]));
  controls.set("actor", { value: "Actor.Dante", addEventListener: () => {} });
  controls.set("note", { name: "note", value: "hello" });
  const form = { elements: { namedItem: key => controls.get(key) ?? null }, addEventListener: (kind, fn) => {
    callbacks.set(kind, [...(callbacks.get(kind) ?? []), fn]);
  } };
  const score = { textContent: "" };
  const root = {
    closest: () => form,
    querySelector: selector => selector === ".runyth-sleep-score" ? score : null
  };
  record.fake.element.querySelector = selector => selector === "[data-runyth-sleep]" ? root : null;
  record.options.render(null, record.fake);
  assert.equal(callbacks.get("change").length, 1);
  const before = score.textContent;
  record.options.render(null, record.fake);
  assert.equal(callbacks.get("change").length, 1);
  controls.get("bedding").value = "luxurious";
  callbacks.get("change")[0]({ target: controls.get("bedding") });
  assert.notEqual(score.textContent, before);
  const after = score.textContent;
  controls.get("note").value = "another value";
  callbacks.get("change")[0]({ target: controls.get("note") });
  assert.equal(score.textContent, after);
  record.close();
  await opened;
});

test("player actor switch refreshes translated conditions and last sleep", async () => {
  game.user.isGM = false;
  game.user.role = 1;
  const other = {
    type: "character", isOwner: true, name: "Lilith", uuid: "Actor.Lilith",
    update: async () => {},
    getFlag: (namespace, key) => key === "pendingPlan" ? {
      id: "abcdefghijklmnop", schema: 1, createdAt: 42,
      choices: { ...DEFAULT_CHOICES, bedding: "luxurious", shelter: "indoor" }
    } : key === "lastResult" ? { score: 5, tier: "excellent" } : null
  };
  game.actors.contents.push(other);
  const opened = openPlanner();
  await new Promise(resolve => setImmediate(resolve));
  const record = dialogs[0];
  const actorSelector = { value: "Actor.Dante", change: null, addEventListener(kind, fn) { this.change = fn; } };
  const form = { elements: { namedItem: key => key === "actor" ? actorSelector : null } };
  const output = { innerHTML: "", textContent: "" };
  const last = { textContent: "" };
  const existing = { textContent: "" };
  const root = {
    closest: () => form,
    querySelector: selector => ({
      "[data-sleep-readonly]": output,
      ".runyth-sleep-last": last,
      ".runyth-sleep-existing": existing
    })[selector] ?? null
  };
  record.fake.element.querySelector = selector => selector === "[data-runyth-sleep]" ? root : null;
  record.options.render(null, record.fake);
  actorSelector.value = "Actor.Lilith";
  actorSelector.change();
  assert.ok(output.innerHTML.includes("Choice.bedding.luxurious"));
  assert.ok(existing.textContent.includes("Planner.Existing"));
  assert.ok(last.textContent.includes("Tier.excellent"));
  record.close();
  await opened;
});

test("dashboard selecting a different character replaces old planner instead of showing wrong actor", async () => {
  const another = { type: "character", name: "Mike Milligan", uuid: "Actor.Mike", isOwner: true,
    getFlag: () => null, update: async () => {} };
  game.actors.contents.push(another);
  const previous = openPlanner({ actors: [game.actors.contents[0]] });
  await new Promise(resolve => setImmediate(resolve));
  // Real DialogV2.close resolves DialogV2.wait. Model that behavior here.
  dialogs[0].fake.close = async () => dialogs[0].close();
  const next = openPlanner({ actors: [another] });
  await new Promise(resolve => setImmediate(resolve));
  await previous;
  assert.equal(dialogs.length, 2);
  assert.match(dialogs[1].options.content, /Mike Milligan/);
  assert.doesNotMatch(dialogs[1].options.content, /Dante/);
  dialogs[1].close();
  await next;
});

test("GM advanced rule editor exposes independent save and HP controls for all tiers", async () => {
  const opened = openRules();
  await new Promise(resolve => setImmediate(resolve));
  const markup = dialogs[0].options.content;
  for (const tier of ["miserable", "poor", "ordinary", "comfortable", "excellent"]) {
    assert.ok(markup.includes(`name="${tier}_save_dc"`));
    assert.ok(markup.includes(`name="${tier}_save_qualityStep"`));
    assert.ok(markup.includes(`name="${tier}_save_rollMode"`));
    assert.ok(markup.includes(`name="${tier}_hp_diceCount"`));
    assert.ok(markup.includes(`name="${tier}_hp_abilityMultiplier"`));
    assert.ok(markup.includes(`name="${tier}_base_exhaustion"`));
  }
  assert.equal((markup.match(/class="rs-sleep-profile"/g) ?? []).length, 9);
  assert.match(markup, /name="armor_mode"/);
  assert.match(markup, /name="armor_heavy_save_dc"/);
  assert.ok(markup.includes("rs-sleep-advanced"));
  assert.ok(dialogs[0].options.buttons.some(button => button.action === "reset"));
  dialogs[0].close();
  await opened;
});

test("GM rule editor validates and persists configured per-tier save DCs and dice profiles", async () => {
  const opened = openRules();
  await new Promise(resolve => setImmediate(resolve));
  const controls = new Map();
  for (const [tier, entry] of Object.entries(DEFAULT_MECHANICS)) {
    for (const [part, profile] of Object.entries(entry)) {
      for (const [key, value] of Object.entries(profile)) {
        controls.set(`${tier}_${part}_${key}`, typeof value === "boolean"
          ? { checked: value } : { value: String(value) });
      }
    }
    for (const [key, value] of Object.entries(DEFAULT_OUTCOMES[tier])) {
      controls.set(`${tier}_base_${key}`, { value: String(value) });
    }
  }
  for (const [key, value] of Object.entries(DEFAULT_THRESHOLDS)) controls.set(`threshold_${key}`, { value: String(value) });
  controls.set("armor_mode", { value: "custom" });
  for (const [category, profile] of Object.entries(DEFAULT_ARMOR_RULES.custom)) {
    controls.set(`armor_${category}_profile_enabled`, { checked: profile.enabled });
    for (const part of ["save", "failure", "success"]) {
      for (const [key, value] of Object.entries(profile[part])) {
        controls.set(`armor_${category}_${part}_${key}`, typeof value === "boolean"
          ? { checked: value } : { value: String(value) });
      }
    }
  }
  controls.get("armor_heavy_save_dc").value = "18";
  controls.get("poor_save_dc").value = "14";
  controls.get("comfortable_hp_diceFaces").value = "8";
  controls.get("comfortable_hp_diceCount").value = "2";
  const elements = { namedItem: key => controls.get(key) ?? null };
  const save = dialogs[0].options.buttons.find(button => button.action === "save");
  assert.equal(await save.callback(null, { form: { elements } }), true);
  assert.equal(readRules().mechanics.poor.save.dc, 14);
  assert.equal(readRules().armorRules.custom.heavy.save.dc, 18);
  assert.equal(readRules().armorRules.mode, "custom");
  assert.equal(readRules().mechanics.comfortable.hp.diceFaces, 8);
  assert.equal(readRules().mechanics.comfortable.hp.diceCount, 2);
  const prior = JSON.stringify(readRules().mechanics);
  controls.get("comfortable_hp_diceCount").value = "999";
  assert.equal(await save.callback(null, { form: { elements } }), false);
  assert.equal(JSON.stringify(readRules().mechanics), prior);
  dialogs[0].close();
  await opened;
});

test("help describes every shelter grade, preparation examples, live score ranges and native-save behavior", async () => {
  const opened = openHelp();
  await new Promise(resolve => setImmediate(resolve));
  const content = dialogs[0].options.content;
  for (const id of ["exposed", "improvised", "careful", "indoor"]) {
    assert.ok(content.includes(`Choice.shelter.${id}`));
    assert.ok(content.includes(`Help.ShelterExample.${id}`));
  }
  assert.ok(content.includes("Help.ScoringDetails"));
  assert.ok(content.includes("Help.SaveExplanation"));
  assert.ok(content.includes("-4 – -2"));
  assert.ok(content.includes("≥ 5"));
  dialogs[0].close();
  await opened;
});

test("planner renders the localized Sleep Note field with saved note data", async () => {
  const opened = openPlanner();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(dialogs[0].options.content.includes("RUNYTH_SLEEP.Planner.Note"));
  assert.ok(dialogs[0].options.content.includes('name="note"'));
  dialogs[0].close();
  await opened;
});

test("explicitly delegated non-GM rule editor can use Rules UI but cannot save scene defaults", async () => {
  const initial = config.permissions;
  config.permissions = { roleMinimums: { viewOwn: 1, viewParty: 5, viewLast: 1, planOwn: 5, editRules: 5 },
    userOverrides: { gm: { editRules: true } } };
  const old = game.user;
  game.user = { id: "gm", isGM: false, role: 2 };
  try {
    const opened = openRules();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(dialogs[0].options.content.includes('name="poor_save_dc"'));
    dialogs[0].close();
    await opened;
    const planner = openPlanner();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(!dialogs[1].options.content.includes('data-sleep-scene'));
    dialogs[1].close();
    await planner;
  } finally {
    game.user = old;
    if (initial === undefined) delete config.permissions;
    else config.permissions = initial;
  }
});
