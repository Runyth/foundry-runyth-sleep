// Window geometry is stored per-client, only when a dialog closes. No drag-time writes.
import { MODULE_ID } from "./domain.js";

export const WINDOW_DEFAULTS = Object.freeze({
  dashboard: Object.freeze({ width: 1040, height: 740 }),
  planner: Object.freeze({ width: 660, height: 670 }),
  rules: Object.freeze({ width: 610, height: 650 }),
  help: Object.freeze({ width: 580, height: 540 })
});

const latest = new Map();
const writes = new Map();
const MARGIN = 16;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function windowSetting(kind) {
  if (!Object.hasOwn(WINDOW_DEFAULTS, kind)) throw new RangeError("Unknown window type.");
  return `${kind}Position`;
}

// On a smaller display or after switching monitors, keep the header reachable.
export function sanitizePosition(kind, saved, viewport = {}) {
  const defaults = WINDOW_DEFAULTS[kind];
  if (!defaults) throw new RangeError("Unknown window type.");
  const maxWidth = finite(viewport.width) ? Math.max(240, viewport.width - 2 * MARGIN) : 4096;
  const maxHeight = finite(viewport.height) ? Math.max(180, viewport.height - 2 * MARGIN) : 4096;
  const width = Math.min(maxWidth, Math.max(Math.min(360, maxWidth),
    finite(saved?.width) ? saved.width : defaults.width));
  const height = Math.min(maxHeight, Math.max(Math.min(250, maxHeight),
    finite(saved?.height) ? saved.height : defaults.height));
  const result = { width: Math.round(width), height: Math.round(height) };
  if (finite(saved?.left) && finite(saved?.top)) {
    result.left = Math.round(Math.min(Math.max(0, saved.left), Math.max(0, (viewport.width ?? 4096) - width)));
    result.top = Math.round(Math.min(Math.max(0, saved.top), Math.max(0, (viewport.height ?? 4096) - height)));
  }
  return result;
}

function viewportSize() {
  return typeof window === "undefined" ? {} : { width: window.innerWidth, height: window.innerHeight };
}

export function readWindowPosition(kind) {
  const key = windowSetting(kind);
  const saved = latest.get(key) ?? game.settings.get(MODULE_ID, key);
  return sanitizePosition(kind, saved, viewportSize());
}

export function saveWindowPosition(kind, dialog) {
  const key = windowSetting(kind);
  const position = dialog?.position;
  if (!position) return;
  const next = sanitizePosition(kind, position, viewportSize());
  const previous = latest.get(key) ?? game.settings.get(MODULE_ID, key);
  if (JSON.stringify(previous) === JSON.stringify(next)) return;
  // Cache synchronously: immediately reopening must restore the latest coordinates.
  latest.set(key, next);
  // Serialize consecutive closes to prevent slow earlier writes overwriting newer ones.
  const preceding = writes.get(key) ?? Promise.resolve();
  const task = preceding.catch(() => {}).then(() => game.settings.set(MODULE_ID, key, next));
  writes.set(key, task);
  void task.catch(error => {
    if (latest.get(key) === next) latest.delete(key);
    console.warn(`${MODULE_ID} | Could not persist ${kind} window geometry`, error);
  }).finally(() => {
    if (writes.get(key) === task) writes.delete(key);
  });
}

export function resetGeometryCache() {
  latest.clear();
  writes.clear();
}
