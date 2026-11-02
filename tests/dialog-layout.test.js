import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../styles/module.css", import.meta.url), "utf8");

function declaration(selector) {
  // Only top-level selector blocks without nested braces are expected here.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`));
  assert.ok(block, `Missing layout selector: ${selector}`);
  return block[1];
}

test("dialogs use one elastic scrolling region instead of viewport-capped inner panels", () => {
  const root = declaration(".runyth-sleep");
  const editor = declaration(".rs-sleep-advanced");
  for (const [name, rules] of [["shared inner content", root], ["rules editor", editor]]) {
    assert.doesNotMatch(rules, /max-height\s*:/, `${name} should not have a second height limit`);
    assert.doesNotMatch(rules, /overflow-y\s*:\s*auto/, `${name} should not create nested scrolling`);
  }
  const outer = declaration(".runyth-sleep-window .window-content");
  assert.match(outer, /display\s*:\s*flex/);
  assert.match(outer, /overflow\s*:\s*hidden/);
  assert.match(outer, /min-height\s*:\s*0/);
  const form = declaration(".runyth-sleep-window form.dialog-form");
  assert.match(form, /flex\s*:\s*1\s+1\s+auto/);
  assert.match(form, /min-height\s*:\s*0/);
  const content = declaration(".runyth-sleep-window .dialog-content");
  assert.match(content, /flex\s*:\s*1\s+1\s+auto/);
  assert.match(content, /overflow-y\s*:\s*auto/);
  assert.match(content, /min-height\s*:\s*0/);
  assert.match(declaration(".runyth-sleep-window form.dialog-form > footer"), /flex\s*:\s*0\s+0\s+auto/);
});

test("saved window-size limits remain viewport bound, and the dashboard keeps its own scrolling", () => {
  assert.match(declaration(".runyth-sleep-window"), /max-height\s*:\s*calc\(100dvh\s*-\s*12px\)/);
  assert.match(declaration(".runyth-sleep-dashboard .window-content"), /overflow\s*:\s*hidden/);
  assert.match(declaration(".rs-content"), /overflow\s*:\s*auto/);
  assert.match(declaration(".rs-app-shell"), /height\s*:\s*100%/);
});
