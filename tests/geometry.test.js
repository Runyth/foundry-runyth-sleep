// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  readWindowPosition, resetGeometryCache, sanitizePosition, saveWindowPosition, windowSetting
} from "../scripts/geometry.js";

const settings = new Map();
const saves = [];

beforeEach(() => {
  resetGeometryCache();
  settings.clear();
  saves.length = 0;
  globalThis.window = { innerWidth: 1280, innerHeight: 900 };
  globalThis.game = { settings: {
    get: (namespace, key) => settings.get(key) ?? null,
    set: async (namespace, key, value) => { saves.push([key, value]); settings.set(key, value); }
  } };
});

test("all three dialogs use distinct client settings and defaults", () => {
  assert.equal(windowSetting("planner"), "plannerPosition");
  assert.equal(windowSetting("rules"), "rulesPosition");
  assert.equal(windowSetting("help"), "helpPosition");
  assert.deepEqual(readWindowPosition("planner"), { width: 660, height: 670 });
  assert.deepEqual(readWindowPosition("rules"), { width: 610, height: 650 });
  assert.deepEqual(readWindowPosition("help"), { width: 580, height: 540 });
  assert.throws(() => windowSetting("unknown"), RangeError);
});

test("geometry is restored and bounded after resizing the display", () => {
  const result = sanitizePosition("planner", { left: 5000, top: -400, width: 7000, height: 3000 },
    { width: 1024, height: 768 });
  assert.deepEqual(result, { left: 32, top: 0, width: 992, height: 736 });
  assert.deepEqual(sanitizePosition("help", { left: NaN, top: Infinity, width: "auto", height: -10 },
    { width: 320, height: 380 }), { width: 288, height: 250 });
});

test("closing a dialog persists exactly once, and no-op closes do not re-write", async () => {
  const dialog = { position: { left: 44, top: 82, width: 625, height: 560 } };
  saveWindowPosition("rules", dialog);
  assert.deepEqual(readWindowPosition("rules"), dialog.position);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saves.length, 1);
  saveWindowPosition("rules", dialog);
  assert.equal(saves.length, 1);
  saveWindowPosition("planner", dialog);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saves.length, 2);
});

test("failed persistence clears the temporary geometry cache", async () => {
  const warnings = [];
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  game.settings.set = async () => { throw new Error("disk write rejected"); };
  try {
    saveWindowPosition("help", { position: { left: 12, top: 20, width: 500, height: 440 } });
    assert.equal(readWindowPosition("help").left, 12);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(readWindowPosition("help"), { width: 580, height: 540 });
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalConsoleWarn;
  }
});


test("rapid consecutive window closes persist newest position, in order", async () => {
  let unblock;
  const blocker = new Promise(resolve => { unblock = resolve; });
  const sequence = [];
  game.settings.set = async (namespace, key, value) => {
    sequence.push(value.left);
    if (value.left === 10) await blocker;
    positions.set(key, value);
  };
  const positions = new Map();
  saveWindowPosition("planner", { position: { left: 10, top: 20, width: 660, height: 600 } });
  saveWindowPosition("planner", { position: { left: 80, top: 70, width: 660, height: 600 } });
  assert.equal(readWindowPosition("planner").left, 80);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sequence, [10]);
  unblock();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sequence, [10, 80]);
  assert.equal(positions.get("plannerPosition").left, 80);
});
