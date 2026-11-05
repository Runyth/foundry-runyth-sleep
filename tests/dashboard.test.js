// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dashboardRows, getDashboardClass, groupDashboardRows, openDashboard, sanitizeDashboardUi } from "../scripts/dashboard.js";
import { DEFAULT_CHOICES, DEFAULT_OUTCOMES, DEFAULT_THRESHOLDS, MODULE_ID } from "../scripts/domain.js";
import { resetGeometryCache } from "../scripts/geometry.js";

let actors;
let settings;
let writes;
let classCreated;
function character(id, options = {}) {
  return {
    id, uuid: `Actor.${id}`, type: "character", name: options.name ?? id,
    img: `images/${id}.png`, isOwner: options.isOwner ?? true,
    folder: options.folder ?? null,
    sheet: { render() {} },
    update: async () => {},
    getFlag: (namespace, key) => options[key] ?? null
  };
}

beforeEach(() => {
  resetGeometryCache();
  writes = [];
  settings = new Map([
    ["thresholds", DEFAULT_THRESHOLDS], ["outcomes", DEFAULT_OUTCOMES],
    ["dashboardUi", { activeTab: "overview", search: "", status: "all", folder: "all", page: 1 }],
    ["permissions", { roleMinimums: { viewOwn: 1, viewParty: 5, viewLast: 1, planOwn: 5 }, userOverrides: {} }],
    ["dashboardPosition", { width: 1000, height: 700, left: 150, top: 80 }]
  ]);
  actors = [character("Dante", { pendingPlan: { schema: 1, id: "abc1234567", createdAt: 12, choices: { ...DEFAULT_CHOICES, moisture: "soaked" } } }),
    character("Lilith", { folder: { id: "woods", name: "Camp" } }),
    character("Mike", { name: "Mike Milligan", lastResult: { tier: "excellent", appliedAt: 1700000000000 } })];
  globalThis.window = { innerWidth: 1280, innerHeight: 900 };
  globalThis.canvas = { scene: { name: "Velia" } };
  globalThis.game = {
    user: { id: "gm", isGM: true, role: 4 },
    actors: { contents: actors },
    modules: new Map([[MODULE_ID, { version: "1.0.3" }]]),
    i18n: { lang: "en", localize: key => key, format: (key, data) => `${key} ${JSON.stringify(data)}` },
    settings: {
      get: (namespace, key) => settings.get(key),
      set: async (namespace, key, value) => { writes.push(key); settings.set(key, value); }
    }
  };
  globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };
  globalThis.foundry = { applications: { api: {
    ApplicationV2: class {
      constructor() { this.rendered = false; this.position = {}; }
      render() { this.rendered = true; return Promise.resolve(this); }
      setPosition(position) { this.position = position; }
      bringToFront() { this.brought = true; }
      _onFirstRender() {}
      _onRender() {}
      _onPosition() {}
      _onClose() {}
    },
    HandlebarsApplicationMixin: Base => Base
  } } };
  classCreated = getDashboardClass();
});

test("dashboard exposes full party statuses without writing Actor documents", () => {
  const rows = dashboardRows(actors, { search: "", folder: "all", status: "all" });
  assert.equal(rows.length, 3);
  assert.equal(rows.find(row => row.name === "Dante").quality, "RUNYTH_SLEEP.Tier.poor");
  assert.equal(rows.find(row => row.name === "Mike Milligan").last, "RUNYTH_SLEEP.Tier.excellent");
  assert.equal(rows.find(row => row.name === "Lilith").hasPlan, false);
});

test("dashboard filters search, folder, queued and unplanned statuses", () => {
  assert.deepEqual(dashboardRows(actors, { search: "mike", folder: "all", status: "all" }).map(r => r.name), ["Mike Milligan"]);
  assert.deepEqual(dashboardRows(actors, { search: "", folder: "woods", status: "all" }).map(r => r.name), ["Lilith"]);
  assert.equal(dashboardRows(actors, { search: "", folder: "all", status: "planned" }).length, 1);
  assert.equal(dashboardRows(actors, { search: "", folder: "all", status: "unplanned" }).length, 2);
});

test("dashboard only exposes owned characters to non-GM clients", async () => {
  game.user.isGM = false;
  game.user.role = 1;
  actors[2].isOwner = false;
  const app = new classCreated();
  const context = await app._prepareContext();
  app.filter.activeTab = "actors";
  const actorContext = await app._prepareContext();
  assert.equal(context.total, 2);
  assert.equal(context.gm, false);
  assert.ok(actorContext.rows.every(row => row.uuid !== "Actor.Mike"));
});

test("dashboard pages large parties instead of building every row in the DOM", async () => {
  actors.push(...Array.from({ length: 125 }, (_, i) => character(`Other${i}`)));
  const app = new classCreated();
  app.filter.activeTab = "actors";
  const context = await app._prepareContext();
  assert.equal(context.rows.length, 40);
  assert.equal(context.total, 128);
  assert.equal(context.pageCount, 4);
  app.filter.page = 4;
  const last = await app._prepareContext();
  assert.equal(last.rows.length, 8);
});

test("module settings and sidebar entry reuse the same dashboard", () => {
  const one = openDashboard();
  const two = openDashboard();
  assert.equal(one, two);
  assert.equal(two.brought, true);
  assert.deepEqual(one.constructor.PARTS.main.template, `modules/${MODULE_ID}/templates/dashboard.hbs`);
});

test("dashboard close persists filters and window geometry per client", async () => {
  const app = new classCreated();
  app.filter.search = "Mike";
  app.position = { left: 35, top: 42, width: 880, height: 690 };
  await app._onClose({});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settings.get("dashboardUi").search, "Mike");
  assert.equal(settings.get("dashboardPosition").left, 35);
  assert.deepEqual(writes.sort(), ["dashboardPosition", "dashboardUi"]);
});


test("selection buttons mark the page rows directly, without depending on the re-render", async () => {
  const app = new classCreated();
  app.filter.activeTab = "actors";
  await app._prepareContext();
  const rows = actors.map(actor => actor.uuid);
  const inputs = new Map(rows.map(uuid => [uuid, {
    dataset: { sleepSelect: uuid }, checked: false,
    closest: () => ({ classList: { toggle() {} } })
  }]));
  const label = { textContent: "?" };
  const bulk = { disabled: true };
  const selectionInputs = rows.map(uuid => inputs.get(uuid));
  app.element = {
    querySelector: selector => selector === "[data-sleep-selected-count]" ? label : null,
    querySelectorAll: selector => {
      if (selector === "input[data-sleep-select]") return selectionInputs;
      if (selector === "[data-sleep-requires-selection]") return [bulk];
      return [];
    }
  };
  app.rendered = true;
  let banner;
  ui.notifications.info = message => { banner = message; };

  classCreated.selectVisible.call(app, { preventDefault() {} }, null);
  assert.ok(Number.isFinite(Number(label.textContent)), `counter updated: ${label.textContent}`);
  assert.ok(Number(label.textContent) > 0);
  for (const input of selectionInputs) assert.ok(input.checked, `ticked via DOM sync: ${input.dataset.sleepSelect}`);
  assert.ok(banner, "counted banner shown");
  assert.ok(app.selected.size > 0);

  app.filter.page = 1;
  const context = await app._prepareContext();
  assert.ok(context.rows.every(row => row.selected), `prepare context maps the selection: ${JSON.stringify(context.rows.map(r => [r.uuid, r.selected]))} vs ${[...app.selected]}`);

  classCreated.clearSelection.call(app, { preventDefault() {} }, null);
  assert.equal(label.textContent, "0");
  for (const input of selectionInputs) assert.equal(input.checked, false, "deselected via DOM sync");
  assert.ok(bulk.disabled, "requires-selection buttons disable with an empty selection");

  app.selected.add(rows[0]);
  classCreated.selectFolder.call(app, { preventDefault() {}, target: { closest: () => null } },
    { dataset: { folder: actors[1].folder.id } });
  assert.equal(label.textContent, "2", "folder select adds its folder rows and keeps the rest");
  for (const [uuid, input] of inputs) assert.equal(input.checked, uuid !== rows[2]);
});

test("selection buttons toggle with coverage highlights and never scroll-jump via re-render", async () => {
  const app = new classCreated();
  let renderCalls = 0;
  const label = { textContent: "?" };
  const uuidOf = actor => `Actor.${actor.id}`;
  const rowHighlights = [];
  const makeButton = dataset => {
    const state = { classSet: new Set(), attrs: new Map() };
    return {
      dataset,
      classList: { toggle: (cls, on) => { if (on) state.classSet.add(cls); else state.classSet.delete(cls); }, contains: cls => state.classSet.has(cls) },
      setAttribute: (attr, value) => state.attrs.set(attr, value),
      state
    };
  };
  const visibleButton = makeButton({});
  const woodsButton = makeButton({ folder: actors[1].folder.id });
  const inputs = new Map();
  for (const actor of actors) {
    inputs.set(uuidOf(actor), {
      dataset: { sleepSelect: uuidOf(actor) }, checked: false,
      closest: () => ({ classList: { toggle: (cls, on) => rowHighlights.push(on ?? undefined) } })
    });
  }
  const woodsInput = inputs.get(uuidOf(actors[1]));
  woodsButton.closest = () => ({ querySelectorAll: () => [woodsInput] });
  const inputsOf = () => [...inputs.values()];
  app.element = {
    querySelector: selector => selector === "[data-sleep-selected-count]" ? label
      : selector === "button[data-action='selectVisible']" ? visibleButton : null,
    querySelectorAll: selector => {
      if (selector === "input[data-sleep-select]") return inputsOf();
      if (selector === "button[data-action='selectFolder']") return [woodsButton];
      return [];
    }
  };
  app.rendered = true;
  app.render = () => { renderCalls += 1; return Promise.resolve(app); };
  const banners = [];
  ui.notifications.info = message => banners.push(message);
  ui.notifications.warn = message => banners.push(message);

  classCreated.selectVisible.call(app, { preventDefault() {} }, null);
  assert.equal(app.selected.size, actors.length, "first press selects every selectable page row");
  for (const input of inputsOf()) assert.ok(input.checked);
  assert.ok(visibleButton.state.classSet.has("rs-active"), "select visible stays highlighted while covered");
  assert.equal(visibleButton.state.attrs.get("aria-pressed"), "true");
  assert.ok(woodsButton.state.classSet.has("rs-active"), "fully covered folder stays highlighted");
  assert.ok(banners.some(b => b.startsWith("RUNYTH_SLEEP.Dashboard.SelectedCounted")));

  classCreated.selectVisible.call(app, { preventDefault() {} }, null);
  assert.equal(app.selected.size, 0, "second press empties the covered rows again");
  for (const input of inputsOf()) assert.equal(input.checked, false);
  assert.equal(visibleButton.state.classSet.has("rs-active"), false);
  assert.equal(visibleButton.state.attrs.get("aria-pressed"), "false");
  assert.equal(woodsButton.state.classSet.has("rs-active"), false);
  assert.ok(banners.some(b => b.startsWith("RUNYTH_SLEEP.Dashboard.DeselectedCounted")));
  assert.equal(renderCalls, 0, "selection toggles never re-render, the window keeps its scroll");

  classCreated.selectVisible.call(app, { preventDefault() {} }, null);
  app.selected.delete(uuidOf(actors[0]));
  app._syncSelectionDom();
  assert.equal(visibleButton.state.classSet.has("rs-active"), false, "manual deselection clears the highlight");
  app.selected.add(uuidOf(actors[0]));
  app._syncSelectionDom();
  assert.ok(visibleButton.state.classSet.has("rs-active"), "manual re-selection restores the highlight");
  assert.equal(visibleButton.state.attrs.get("aria-pressed"), "true");

  classCreated.selectFolder.call(app, { preventDefault() {} }, woodsButton);
  assert.equal(woodsInput.checked, false, "fully covered folder button empties its own group");
  assert.equal(app.selected.size, actors.length - 1, "other rows keep their selection");
  assert.equal(woodsButton.state.classSet.has("rs-active"), false);
  classCreated.selectFolder.call(app, { preventDefault() {} }, woodsButton);
  assert.ok(app.selected.has(uuidOf(actors[1])), "covered-off folder re-selects its rows");
  assert.ok(woodsButton.state.classSet.has("rs-active"), "folder highlight restored");

  settings.set("selectionButtonsOneShot", true);
  app._syncSelectionDom();
  assert.equal(visibleButton.state.classSet.has("rs-active"), false, "one-shot mode paints no pressed state");
  app.selected.clear();
  classCreated.selectVisible.call(app, { preventDefault() {} }, null);
  assert.equal(app.selected.size, actors.length, "one-shot press selects instead of toggling");
  classCreated.selectVisible.call(app, { preventDefault() {} }, null);
  assert.equal(app.selected.size, actors.length, "one-shot second press keeps everything selected");
  settings.delete("selectionButtonsOneShot");
});

test("corrupt saved dashboard filters fall back to safe defaults", () => {
  assert.deepEqual(sanitizeDashboardUi({ search: null, status: "magic", folder: 14, page: -50 }),
    { activeTab: "overview", search: "", status: "all", folder: "all", includeSubfolders: true, page: 1, pageSize: 40 });
  assert.equal(sanitizeDashboardUi({ search: "x".repeat(300) }).search.length, 160);
});
