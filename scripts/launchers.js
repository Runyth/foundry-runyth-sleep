import { openDashboard } from "./dashboard.js";
import { openPlanner } from "./planner.js";
import { canViewActor, canPlanActor } from "./permissions.js";

const t = key => game.i18n.localize(`RUNYTH_SLEEP.${key}`);
const SHEET_SELECTOR = '[data-sleep-launcher="sheet"]';
const pendingTidyPlacements = new WeakSet();

const rootOf = (app, html) => {
  const element = app?.element ?? html;
  return element instanceof Element ? element : element?.[0] instanceof Element ? element[0] : null;
};

function button(label, action, icon = "fa-bed", handler = openDashboard) {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "runyth-sleep-launcher";
  control.dataset.sleepLauncher = action;
  const glyph = document.createElement("i");
  glyph.className = `fa-solid ${icon}`;
  glyph.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = label;
  control.append(glyph, text);
  control.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    try { void Promise.resolve(handler()).catch(error => { console.error("runyth-sleep | Launcher error", error); ui.notifications.error(t("Errors.OpenFailed")); }); }
    catch (error) {
      console.error("runyth-sleep | Could not open dashboard", error);
      ui.notifications.error(t("Errors.OpenFailed"));
    }
  });
  return control;
}

function sidebar(app, html, key, anchor) {
  if (game.system?.id !== "dnd5e") return;
  const root = rootOf(app, html);
  if (!root || root.querySelector(`[data-sleep-entry="${key}"]`)) return;
  const section = document.createElement("section");
  section.dataset.sleepEntry = key;
  section.className = "runyth-sleep-sidebar-entry";
  const heading = document.createElement("strong");
  heading.textContent = t("Dashboard.MenuName");
  const description = document.createElement("p");
  description.textContent = t("Dashboard.SidebarHint");
  section.append(heading, description, button(t("Dashboard.Open"), key));
  if (key === "actors") {
    const header = root.querySelector(".directory-header");
    if (header) header.insertAdjacentElement("afterend", section);
    else {
      const list = root.querySelector(".directory-list, .directory-items");
      if (list) list.before(section);
      else root.prepend(section);
    }
  } else {
    (root.querySelector(anchor) ?? root).prepend(section);
  }
}

/**
 * Tidy's documented name anchors are stable across normal and partial renders.
 * Placing the control after the name (rather than inside it) avoids expanding
 * the input or creating a new row on custom character sheets.
 */
export function tidyNameAnchor(root) {
  return root.querySelector('[data-tidy-sheet-part="actor-name"]')
    ?? root.querySelector('[data-tidy-sheet-part="name-container"]');
}

export function isTidySheet(root) {
  return root.classList?.contains("tidy5e-sheet")
    || Boolean(root.querySelector(".tidy5e-sheet, [data-tidy-sheet-part]"));
}

/**
 * Position after other synchronous Actor-sheet render hooks have completed.
 * This makes the sleep control the leftmost accessory beside the character
 * name regardless of module registration order, without inspecting other
 * modules' names or classes. At most one microtask is queued per sheet root.
 */
function queueTidyPlacement(root) {
  if (pendingTidyPlacements.has(root)) return;
  pendingTidyPlacements.add(root);
  queueMicrotask(() => {
    pendingTidyPlacements.delete(root);
    if (root.isConnected === false) return;
    const anchor = tidyNameAnchor(root);
    const control = root.querySelector(SHEET_SELECTOR);
    if (anchor && control && anchor.nextElementSibling !== control) {
      anchor.insertAdjacentElement("afterend", control);
    }
  });
}

/**
 * Generic header-control placement: put our button before other lightweight
 * extension buttons, but never inside Foundry's native window-control group.
 * These selectors deliberately contain no dependencies on other modules.
 */
export function insertSheetHeaderButton(header, control) {
  header.classList.add("runyth-sleep-sheet-header");
  const extension = Array.from(header.children).find(child =>
    child !== control
    && child.tagName === "BUTTON"
    && !child.hasAttribute("data-action")
    && !child.classList.contains("header-control")
    && !child.classList.contains("close")
    && !child.classList.contains("window-controls")
  );
  const nativeControls = header.querySelector(":scope > .window-controls")
    ?? header.querySelector(":scope > [data-action='toggleControls']")
    ?? header.querySelector(":scope > [data-action='close']")
    ?? header.querySelector(":scope > .header-control.close")
    ?? header.querySelector(":scope > .close");
  const anchor = extension ?? nativeControls;
  if (anchor) header.insertBefore(control, anchor);
  else header.append(control);
}

function actorSheet(app, html) {
  if (game.system?.id !== "dnd5e") return;
  const actor = app?.actor ?? app?.document;
  if (actor?.documentName !== "Actor" || actor.type !== "character" || !canViewActor(actor)) return;
  const root = rootOf(app, html);
  if (!root) return;

  const tidy = isTidySheet(root);
  // Tidy can emit multiple render hooks for one render and re-render a fragment.
  // Even when an indicator exists, its relative order may have changed.
  if (root.querySelector(SHEET_SELECTOR)) {
    if (tidy) queueTidyPlacement(root);
    return;
  }

  const control = button(t("Sheet.Button"), "sheet", "fa-bed", () => openPlanner({ actors: [actor] }));
  control.classList.add("runyth-sleep-sheet-control");
  control.title = t(canPlanActor(actor) ? "Dashboard.SetPlan" : "Dashboard.ViewPlan");
  control.setAttribute("aria-label", control.title);

  if (tidy) {
    control.classList.add("inline-transparent-button");
    control.dataset.tidyRenderScheme = "handlebars";
    const anchor = tidyNameAnchor(root);
    if (anchor) anchor.insertAdjacentElement("afterend", control);
    else {
      const fallback = root.querySelector('[data-tidy-sheet-part="header"], .sheet-header');
      if (!fallback) return;
      fallback.append(control);
    }
    queueTidyPlacement(root);
    return;
  }

  const header = root.querySelector(".window-header") ?? root.querySelector(".sheet-header");
  if (header) insertSheetHeaderButton(header, control);
}

export function registerLaunchers() {
  Hooks.on("renderSettings", (app, html) => sidebar(app, html, "settings", ".settings-sidebar, .scrollable, .sidebar-tab"));
  Hooks.on("renderActorDirectory", (app, html) => sidebar(app, html, "actors", ".directory-header, .sidebar-tab"));
  Hooks.on("renderActorSheet", actorSheet);
  Hooks.on("renderActorSheetV2", actorSheet);
  Hooks.on("tidy5e-sheet.renderActorSheet", actorSheet);
}
