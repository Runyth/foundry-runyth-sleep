// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
/** Browser-based layout smoke test against the module's actual DialogV2 markup and CSS.
 *  Requires local Chromium; uses no network or third-party JavaScript dependencies.
 *  The Foundry shell is a structural mock, not a substitute for in-world testing.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DEFAULT_CHOICES, DEFAULT_OUTCOMES, DEFAULT_THRESHOLDS } from "../scripts/domain.js";
import { DEFAULT_MECHANICS } from "../scripts/mechanics.js";
import { openHelp, openPlanner, openRules } from "../scripts/planner.js";

const css = await readFile(new URL("../styles/module.css", import.meta.url), "utf8");
const dialogs = [];
const configuration = {
  thresholds: DEFAULT_THRESHOLDS, outcomes: DEFAULT_OUTCOMES, mechanics: DEFAULT_MECHANICS
};

globalThis.game = {
  user: { id: "gm", role: 4, isGM: true },
  actors: { contents: [{ type: "character", uuid: "Actor.smoke", name: "Smoke Test", isOwner: true,
    getFlag: () => null, update: async () => {} }] },
  i18n: { localize: key => key },
  settings: { get: (namespace, key) => configuration[key] ?? null }
};
globalThis.window = { innerWidth: 1400, innerHeight: 1000 };
globalThis.canvas = { tokens: { controlled: [] }, scene: null };
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };
globalThis.foundry = { applications: { api: { DialogV2: {
  wait: async options => { dialogs.push(options); return "closed"; },
  confirm: async () => false
} } } };

await openRules();
await openPlanner();
await openHelp();
assert.equal(dialogs.length, 3);

const shellCss = `
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; font: 14px Arial, sans-serif; color: #ececec; background: #191a1d; }
  .window-app { display: flex; flex-direction: column; position: absolute; left: 16px; top: 16px;
    background: #282b30; border: 1px solid #555; overflow: hidden; }
  .window-header { flex: 0 0 40px; padding: 10px; border-bottom: 1px solid #555; }
  .window-content { flex: 1 1 auto; min-height: 0; padding: 8px; }
  .dialog-form { display: flex; flex-direction: column; height: 100%; margin: 0; }
  .dialog-content { flex: 1 1 auto; min-height: 0; padding: 8px; }
  .dialog-buttons { display: flex; align-items: center; justify-content: end; flex-wrap: wrap;
    gap: 6px; padding: 7px; min-height: 46px; border-top: 1px solid #555; }
  input, select, textarea { background: #18191e; color: #eee; border: 1px solid #777; }
  label { color: #eee; }
  button { padding: 6px; }
`;

function documentFor(dialog, height, width) {
  return `<!doctype html><html><head><meta charset="UTF-8"><style>${shellCss}\n${css}</style></head><body>
    <section id="window" class="window-app runyth-sleep-window" style="width:${width}px;height:${height}px">
      <header class="window-header">${dialog.window.title}</header>
      <section class="window-content"><form class="dialog-form">
        <div class="dialog-content">${dialog.content}</div>
        <footer class="dialog-buttons">${dialog.buttons.map(button => `<button type="button">${button.label}</button>`).join("")}</footer>
      </form></section>
    </section>
    <output id="metrics"></output>
    <script>
      const by = selector => document.querySelector(selector);
      const app = by('#window');
      const form = by('.dialog-form');
      const content = by('.dialog-content');
      const buttons = by('.dialog-buttons');
      const inner = by('.runyth-sleep');
      const rect = element => element.getBoundingClientRect();
      const values = {
        appHeight: rect(app).height,
        contentHeight: rect(content).height,
        formHeight: rect(form).height,
        footerHeight: rect(buttons).height,
        innerMaxHeight: getComputedStyle(inner).maxHeight,
        innerOverflowY: getComputedStyle(inner).overflowY,
        contentOverflowY: getComputedStyle(content).overflowY,
        footerBelowContent: rect(buttons).top >= rect(content).bottom - 2,
        footerInWindow: rect(buttons).bottom <= rect(app).bottom + 2,
        contentFill: rect(content).height >= rect(form).height - rect(buttons).height - 2,
        scrollable: content.scrollHeight > content.clientHeight + 2,
        nestedScroll: inner.scrollHeight > inner.clientHeight + 2,
        horizontalOverflow: content.scrollWidth > content.clientWidth + 3
      };
      by('#metrics').textContent = 'LAYOUT_METRICS=' + JSON.stringify(values);
    </script></body></html>`;
}

const browser = process.env.CHROMIUM ?? "chromium";
const scenarios = [
  { label: "rules normal", dialog: dialogs[0], height: 650, width: 610, viewport: "1400,1000" },
  { label: "rules enlarged", dialog: dialogs[0], height: 870, width: 950, viewport: "1400,1000" },
  { label: "rules narrow", dialog: dialogs[0], height: 430, width: 360, viewport: "440,520" },
  { label: "planner normal", dialog: dialogs[1], height: 670, width: 660, viewport: "1400,1000" },
  { label: "planner enlarged", dialog: dialogs[1], height: 870, width: 900, viewport: "1400,1000" },
  { label: "planner narrow", dialog: dialogs[1], height: 430, width: 360, viewport: "440,520" },
  { label: "help normal", dialog: dialogs[2], height: 540, width: 580, viewport: "1400,1000" },
  { label: "help enlarged", dialog: dialogs[2], height: 850, width: 850, viewport: "1400,1000" },
  { label: "help narrow", dialog: dialogs[2], height: 430, width: 360, viewport: "440,520" }
];
const workspace = await mkdtemp(join(tmpdir(), "runyth-sleep-layout-"));
try {
  for (const [index, scenario] of scenarios.entries()) {
    const file = join(workspace, `case-${index}.html`);
    await writeFile(file, documentFor(scenario.dialog, scenario.height, scenario.width), "utf8");
    const result = spawnSync(browser, [
      "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
      "--no-first-run", "--disable-extensions", `--window-size=${scenario.viewport}`,
      "--dump-dom", pathToFileURL(file).href
    ], { encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 0, `${scenario.label}: Chromium failed: ${result.stderr.slice(-800)}`);
    const match = result.stdout.match(/LAYOUT_METRICS=([^<]*)/);
    assert.ok(match, `${scenario.label}: missing browser metrics: ${result.stdout.slice(-900)} / ${result.stderr.slice(-400)}`);
    const metrics = JSON.parse(match[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
    assert.equal(metrics.innerMaxHeight, "none", `${scenario.label}: child height capped`);
    assert.equal(metrics.innerOverflowY, "visible", `${scenario.label}: nested root scroll`);
    assert.equal(metrics.contentOverflowY, "auto", `${scenario.label}: content not scrollable`);
    assert.equal(metrics.contentFill, true, `${scenario.label}: content does not fill dialog`);
    assert.equal(metrics.footerBelowContent, true, `${scenario.label}: footer overlaps scroll region`);
    assert.equal(metrics.footerInWindow, true, `${scenario.label}: footer clipped`);
    assert.equal(metrics.nestedScroll, false, `${scenario.label}: nested scrollbar`);
    assert.equal(metrics.horizontalOverflow, false, `${scenario.label}: horizontal scroll`);
    console.log(`PASS ${scenario.label}: content=${metrics.contentHeight}px, scroll=${metrics.scrollable}`);
  }
} finally {
  await rm(workspace, { recursive: true, force: true });
}
