// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("dashboard structurally matches the dashboard header, tabs, panels and actor cards", async () => {
  const template = await read("../templates/dashboard.hbs");
  const css = await read("../styles/module.css");
  for (const element of ["rs-app-shell", "rs-app-header", "rs-header-status", "rs-tabs", "rs-content",
    "rs-overview-grid", "rs-panel", "rs-actor-list", "rs-actor-group", "rs-actor-row", "rs-state-columns",
    "rs-selection-toolbar", "rs-actor-identity", "rs-actor-pagination", "rs-permissions-panel"]) {
    assert.ok(template.includes(element), `missing dashboard component: ${element}`);
    assert.ok(css.includes(`.${element}`), `missing dashboard CSS: ${element}`);
  }
  assert.ok(css.includes("--rs-accent-strong: #f0ca82"));
  assert.ok(css.includes("--rs-panel: #23262c"));
  assert.ok(css.includes("@container (max-width: 560px)"));
  const foreignModule = ["garb", "-and-", "grime"].join("");
  assert.doesNotMatch(css, new RegExp(`\\.${foreignModule}|\\.gag-|--gag-`));
});

test("permission and settings sections have useful controls and no nonsensical dirt features", async () => {
  const template = await read("../templates/dashboard.hbs");
  for (const action of ["savePermissions", "resetPermissions", "settings", "bulk", "clear", "sheet", "rules", "help"]) {
    assert.ok(template.includes(`data-action="${action}"`));
  }
  assert.doesNotMatch(template, /soap|contamination|laundry|\bcleaning\b|maintenance/i);
  assert.ok(template.includes('data-sleep-requires-selection'));
});
