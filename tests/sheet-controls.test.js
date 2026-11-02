// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Tiny DOM fixture: exercise actual render hooks without a browser dependency.
class FakeElement {
  constructor(tagName = "div", classes = []) {
    this.tagName = tagName.toUpperCase();
    this.classNames = new Set(classes);
    this.classList = {
      contains: name => this.classNames.has(name),
      add: (...names) => names.forEach(name => this.classNames.add(name))
    };
    this.children = [];
    this.dataset = {};
    this.attrs = new Map();
    this.listeners = new Map();
    this.parent = null;
    this.isConnected = true;
  }
  get nextElementSibling() {
    if (!this.parent) return null;
    return this.parent.children[this.parent.children.indexOf(this) + 1] ?? null;
  }
  hasAttribute(name) { return this.attrs.has(name); }
  setAttribute(name, value) { this.attrs.set(name, value); }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  append(...elements) { for (const element of elements) this.insertBefore(element, null); }
  insertBefore(element, anchor) {
    if (element.parent) element.parent.children.splice(element.parent.children.indexOf(element), 1);
    element.parent = this;
    const position = anchor ? this.children.indexOf(anchor) : this.children.length;
    assert.ok(position >= 0, "anchor must be an existing child");
    this.children.splice(position, 0, element);
  }
  insertAdjacentElement(where, element) {
    assert.equal(where, "afterend");
    assert.ok(this.parent);
    this.parent.insertBefore(element, this.nextElementSibling);
  }
  all() { return [this, ...this.children.flatMap(child => child.all())]; }
  querySelector(query) {
    for (const selector of query.split(",").map(value => value.trim())) {
      const scoped = selector.startsWith(":scope > ");
      const term = scoped ? selector.slice(9) : selector;
      const pool = scoped ? this.children : this.all().slice(1);
      const match = pool.find(child => {
        if (term.startsWith(".")) return term.slice(1).split(".").every(name => child.classNames.has(name));
        if (term === '[data-sleep-launcher="sheet"]') return child.dataset.sleepLauncher === "sheet";
        if (term.startsWith('[data-tidy-sheet-part="')) return child.dataset.tidySheetPart === term.match(/"([^"]+)"/)[1];
        if (term.startsWith("[data-action='")) return child.attrs.get("data-action") === term.match(/'([^']+)'/)[1];
        return false;
      });
      if (match) return match;
    }
    return null;
  }
}

globalThis.Element = FakeElement;
globalThis.document = { createElement: name => new FakeElement(name) };
globalThis.game = {
  system: { id: "dnd5e" },
  user: { id: "test-gm", isGM: true },
  i18n: { localize: key => key }
};
const callbacks = new Map();
globalThis.Hooks = { on: (name, callback) => callbacks.set(name, callback) };

const { registerLaunchers, insertSheetHeaderButton, isTidySheet } = await import("../scripts/launchers.js");
registerLaunchers();
const actor = { documentName: "Actor", type: "character", name: "Mike Milligan" };
const render = (hook, root, targetedActor = actor) => callbacks.get(hook)({ actor: targetedActor, element: root }, root);
const buttons = root => root.all().filter(element => element.dataset.sleepLauncher === "sheet");

function tidyFixture() {
  const root = new FakeElement("section", ["tidy5e-sheet"]);
  const identity = new FakeElement("div");
  const name = new FakeElement("input");
  name.dataset.tidySheetPart = "actor-name";
  identity.append(name);
  root.append(identity);
  return { root, identity, name };
}

test("Tidy uses the actor-name accessory location with a compact, accessible control", async () => {
  const { root, name } = tidyFixture();
  assert.equal(isTidySheet(root), true);
  render("renderActorSheetV2", root);
  await Promise.resolve();
  assert.equal(buttons(root).length, 1);
  const control = buttons(root)[0];
  assert.equal(name.nextElementSibling, control);
  assert.equal(control.type, "button");
  assert.equal(control.dataset.tidyRenderScheme, "handlebars");
  assert.equal(control.classList.contains("inline-transparent-button"), true);
  assert.equal(control.classList.contains("runyth-sleep-sheet-control"), true);
  assert.ok(control.attrs.get("aria-label"));
  assert.equal(control.children[1].textContent, "RUNYTH_SLEEP.Sheet.Button");
});

test("Tidy stays to the left of other modules independently of hook ordering", async () => {
  const { root, identity, name } = tidyFixture();
  render("renderActorSheetV2", root);
  const otherModuleControl = new FakeElement("button");
  // Another module independently inserts after the same documented name anchor.
  name.insertAdjacentElement("afterend", otherModuleControl);
  assert.equal(name.nextElementSibling, otherModuleControl);
  await Promise.resolve();
  assert.equal(name.nextElementSibling, buttons(root)[0]);
  assert.equal(buttons(root)[0].nextElementSibling, otherModuleControl);
  // Multiple Foundry and Tidy render notifications cannot duplicate the button.
  render("tidy5e-sheet.renderActorSheet", root);
  render("renderActorSheet", root);
  await Promise.resolve();
  assert.equal(buttons(root).length, 1);
  assert.equal(identity.children.length, 3);
});

test("Tidy partial render replaces the accessory without accumulating controls", async () => {
  const { root, identity, name } = tidyFixture();
  render("renderActorSheetV2", root);
  await Promise.resolve();
  identity.children = [name];
  name.parent = identity;
  render("renderActorSheetV2", root);
  await Promise.resolve();
  assert.equal(buttons(root).length, 1);
  assert.equal(name.nextElementSibling, buttons(root)[0]);
});

test("Foundry frame header inserts before extension buttons and native controls", () => {
  const root = new FakeElement("section");
  const header = new FakeElement("header", ["window-header"]);
  const title = new FakeElement("h2", ["window-title"]);
  const otherModuleControl = new FakeElement("button");
  const controls = new FakeElement("div", ["window-controls"]);
  header.append(title, otherModuleControl, controls);
  root.append(header);
  render("renderActorSheetV2", root);
  assert.deepEqual(header.children, [title, buttons(root)[0], otherModuleControl, controls]);
  render("renderActorSheet", root);
  assert.equal(buttons(root).length, 1);
  assert.equal(buttons(root)[0].parent, header);
});

test("Foundry frame header without another module stays before native close actions", () => {
  const header = new FakeElement("header", ["window-header"]);
  const title = new FakeElement("h2");
  const close = new FakeElement("button");
  close.setAttribute("data-action", "close");
  header.append(title, close);
  const control = new FakeElement("button");
  insertSheetHeaderButton(header, control);
  assert.deepEqual(header.children, [title, control, close]);
});

test("unsupported actors do not receive a control", () => {
  const root = tidyFixture().root;
  render("renderActorSheetV2", root, { documentName: "Actor", type: "npc" });
  assert.equal(buttons(root).length, 0);
});

test("Tidy falls back to the name-container slot", async () => {
  const root = new FakeElement("section", ["tidy5e-sheet"]);
  const wrapper = new FakeElement("div");
  const nameContainer = new FakeElement("div");
  nameContainer.dataset.tidySheetPart = "name-container";
  wrapper.append(nameContainer);
  root.append(wrapper);
  render("tidy5e-sheet.renderActorSheet", root);
  await Promise.resolve();
  assert.equal(nameContainer.nextElementSibling, buttons(root)[0]);
});

test("an owned player character gets a view-only control, not a plan permission escalation", async () => {
  const previous = game.user;
  const previousSettings = game.settings;
  game.user = { id: "player", isGM: false, role: 1 };
  game.settings = { get: () => ({ roleMinimums: { viewOwn: 1, viewParty: 5, viewLast: 1, planOwn: 5 }, userOverrides: {} }) };
  try {
    const owned = { ...actor, testUserPermission: () => true };
    const root = tidyFixture().root;
    render("renderActorSheetV2", root, owned);
    await Promise.resolve();
    assert.equal(buttons(root).length, 1);
    assert.equal(buttons(root)[0].title, "RUNYTH_SLEEP.Dashboard.ViewPlan");
    const denied = tidyFixture().root;
    render("renderActorSheetV2", denied, { ...actor, testUserPermission: () => false });
    await Promise.resolve();
    assert.equal(buttons(denied).length, 0);
  } finally {
    game.user = previous;
    game.settings = previousSettings;
  }
});

test("the window-header fallback never targets sheet controls in auxiliary actor dialogs", () => {
  const root = new FakeElement("section");
  const header = new FakeElement("header", ["window-header"]);
  root.append(header);
  assert.equal(callbacks.has("renderApplicationV2"), false);
  assert.equal(buttons(root).length, 0);
});

test("isolated sheet CSS constrains width, height and wrapping without touching dashboard buttons", async () => {
  const css = await readFile(new URL("../styles/module.css", import.meta.url), "utf8");
  const source = await readFile(new URL("../scripts/launchers.js", import.meta.url), "utf8");
  assert.match(css, /\.runyth-sleep-sheet-control\.runyth-sleep-launcher\s*\{[^}]*width:\s*auto\s*!important;/s);
  assert.match(css, /\.tidy5e-sheet \.runyth-sleep-sheet-control\s*\{/);
  assert.match(css, /\.window-header > \.runyth-sleep-sheet-control\s*\{/);
  assert.match(css, /\.runyth-sleep-sheet-header\.window-header > \.window-controls/);
  assert.match(css, /\.runyth-sleep-sheet-control > span\s*\{/);
  const foreignModule = ["garb", "-and-", "grime"].join("");
  const itemsModule = ["item-", "piles"].join("");
  assert.doesNotMatch(source, new RegExp(`${foreignModule}|gag-sheet|${itemsModule}`, "i"));
});
