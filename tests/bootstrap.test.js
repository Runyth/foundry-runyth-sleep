// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_OUTCOMES, DEFAULT_THRESHOLDS, FACTORS, MODULE_ID } from "../scripts/domain.js";

test("module v13 registration, scene tool and public API initialize safely", async () => {
  const callbacks = new Map();
  const settings = new Map();
  const plugin = { api: null };
  const menus = new Map();
  class FakeApplication {}
  globalThis.foundry = { applications: { api: {
    ApplicationV2: FakeApplication, HandlebarsApplicationMixin: Base => Base
  } } };
  globalThis.Hooks = {
    once: (name, fn) => callbacks.set(name, fn),
    on: (name, fn) => callbacks.set(name, fn)
  };
  globalThis.game = {
    system: { id: "dnd5e" },
    user: { id: "gm", isGM: true },
    modules: new Map([[MODULE_ID, plugin]]),
    settings: {
      register: (namespace, name, options) => settings.set(name, options),
      registerMenu: (namespace, name, options) => menus.set(name, options),
      get: (namespace, key) => {
        if (key === "thresholds") return DEFAULT_THRESHOLDS;
        if (key === "outcomes") return DEFAULT_OUTCOMES;
        return settings.get(key)?.default;
      }
    }
  };
  globalThis.ui = { notifications: { warn: () => {} } };
  await import("../scripts/main.js");
  callbacks.get("init")();
  assert.equal(settings.get("autoApply").scope, "world");
  assert.equal(settings.get("unplannedRestAction").default, "notice");
  assert.ok(menus.has("dashboard"));
  assert.equal(menus.get("dashboard").restricted, false);
  assert.equal(typeof menus.get("dashboard").type, "function");
  assert.equal(settings.get("dashboardPosition").scope, "client");
  assert.equal(settings.get("plannerPosition").scope, "client");
  assert.equal(settings.get("permissions").scope, "world");
  assert.equal(settings.get("permissions").config, false);
  assert.equal(settings.get("rulesPosition").scope, "client");
  assert.equal(settings.get("helpPosition").scope, "client");
  assert.equal(settings.get("outcomes").config, false);
  assert.equal(settings.get("armorRules").config, false);
  callbacks.get("ready")();
  assert.ok(plugin.api);
  assert.equal(typeof plugin.api.openDashboard, "function");
  assert.ok(Object.isFrozen(plugin.api));
  assert.equal(plugin.api.version, "1.1.0");
  assert.equal(plugin.api.evaluate({ bedding: "bed", shelter: "indoor" }).tier, "comfortable");
  for (const hook of ["dnd5e.preLongRest", "dnd5e.preShortRest", "dnd5e.restCompleted"]) {
    assert.equal(typeof callbacks.get(hook), "function");
  }
  const controls = { tokens: { tools: {} } };
  callbacks.get("getSceneControlButtons")(controls);
  assert.equal(controls.tokens.tools[MODULE_ID].button, true);
  assert.equal(controls.tokens.tools[MODULE_ID].visible, true);
});

test("English and German localization cover all factors, choices and identical key trees", async () => {
  const en = JSON.parse(await readFile(new URL("../languages/en.json", import.meta.url), "utf8")).RUNYTH_SLEEP;
  const de = JSON.parse(await readFile(new URL("../languages/de.json", import.meta.url), "utf8")).RUNYTH_SLEEP;
  const compare = (left, right) => {
    assert.deepEqual(Object.keys(left).sort(), Object.keys(right).sort());
    for (const key of Object.keys(left)) {
      if (typeof left[key] === "object") compare(left[key], right[key]);
      else {
        assert.equal(typeof left[key], "string");
        assert.equal(typeof right[key], "string");
        assert.ok(left[key].length && right[key].length);
      }
    }
  };
  compare(en, de);
  for (const [factor, options] of Object.entries(FACTORS)) {
    assert.ok(en.Factor[factor]);
    for (const option of Object.keys(options)) assert.ok(en.Choice[factor][option]);
  }
});

test("install manifest targets Foundry 13 and references only packaged assets", async () => {
  const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
  assert.equal(manifest.id, MODULE_ID);
  assert.equal(manifest.version, "1.1.0");
  assert.equal(manifest.compatibility.minimum, "13");
  assert.equal(manifest.compatibility.verified, "13");
  assert.deepEqual(manifest.relationships.systems.map(system => system.id), ["dnd5e"]);
  for (const path of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(lang => lang.path),
    "scripts/dashboard.js", "scripts/launchers.js", "templates/dashboard.hbs", "assets/bed.svg"]) {
    const file = await readFile(new URL(`../${path}`, import.meta.url));
    assert.ok(file.length, path);
  }
});
