// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { MODULE_ID, TIERS, evaluate } from "./domain.js";
import { getPlan, getLastResult, clearPlans } from "./engine.js";
import { readRules, canModifyRules, syncRuleDocumentAccess } from "./rules-store.js";
import { openPlanner, openRules, openHelp } from "./planner.js";
import { readWindowPosition, saveWindowPosition } from "./geometry.js";
import { canViewActor, canPlanActor, canSeeLastResult, DEFAULT_PERMISSIONS, PERMISSION_IDS, sanitizePermissions } from "./permissions.js";

const loc = key => game.i18n.localize(`RUNYTH_SLEEP.${key}`);
const DEFAULT_UI = Object.freeze({
  activeTab: "overview", search: "", status: "all", folder: "all", includeSubfolders: true,
  page: 1, pageSize: 40
});
const TABS = ["overview", "actors", "rules", "permissions", "settings"];
const PAGE_SIZES = [20, 40, 80, 120];
const TIER_CLASS = Object.freeze({ miserable: "bad", poor: "warning", ordinary: "neutral", comfortable: "good", excellent: "excellent" });

export function sanitizeDashboardUi(saved = {}) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
  return {
    activeTab: TABS.includes(saved.activeTab) ? saved.activeTab : "overview",
    search: typeof saved.search === "string" ? saved.search.slice(0, 160) : "",
    status: ["all", "planned", "unplanned"].includes(saved.status) ? saved.status : "all",
    folder: typeof saved.folder === "string" && saved.folder.length <= 160 ? saved.folder : "all",
    includeSubfolders: typeof saved.includeSubfolders === "boolean" ? saved.includeSubfolders : true,
    page: Number.isInteger(saved.page) && saved.page > 0 ? saved.page : 1,
    pageSize: PAGE_SIZES.includes(saved.pageSize) ? saved.pageSize : 40
  };
}

function visibleActors() {
  return game.actors.contents.filter(actor => canViewActor(actor));
}

function folderPath(folder) {
  if (!folder) return loc("Dashboard.NoFolder");
  const names = [];
  const seen = new Set();
  let current = folder;
  while (current && names.length < 20 && !seen.has(current.id)) {
    names.unshift(current.name);
    seen.add(current.id);
    current = current.folder ?? current.parent ?? null;
  }
  return names.join(" / ");
}

function descendantsOf(folderId, folder, includeSubfolders) {
  if (folderId === "all") return true;
  if (folder?.id === folderId) return true;
  if (!includeSubfolders) return false;
  const seen = new Set();
  let current = folder?.folder ?? folder?.parent;
  while (current && !seen.has(current.id)) {
    if (current.id === folderId) return true;
    seen.add(current.id);
    current = current.folder ?? current.parent;
  }
  return false;
}

function safeEvaluation(plan, rules) {
  try {
    return plan ? evaluate(plan.choices, rules.thresholds, rules.outcomes) : null;
  } catch {
    return null;
  }
}

export function dashboardRows(actors, state) {
  const rules = readRules();
  const rows = actors.map(actor => {
    const plan = getPlan(actor);
    const result = canSeeLastResult(actor) ? getLastResult(actor) : null;
    const quality = safeEvaluation(plan, rules);
    const tier = quality?.tier ?? "ordinary";
    return {
      uuid: actor.uuid, id: actor.id, name: actor.name,
      image: actor.img || `modules/${MODULE_ID}/assets/bed.svg`,
      folder: actor.folder?.id ?? "", folderName: folderPath(actor.folder), folderObject: actor.folder,
      hasPlan: Boolean(plan), invalidPlan: Boolean(plan && !quality),
      score: quality?.score ?? null,
      quality: quality ? loc(`Tier.${quality.tier}`) : plan ? loc("Dashboard.Invalid") : loc("Dashboard.Unplanned"),
      stateClass: plan ? (quality ? TIER_CLASS[tier] : "bad") : "neutral",
      last: result?.tier && TIERS.includes(result.tier) ? loc(`Tier.${result.tier}`) : loc("Dashboard.Never"),
      lastAt: Number.isFinite(result?.appliedAt) ? new Date(result.appliedAt).toLocaleString() : "",
      canEdit: canPlanActor(actor), selected: false
    };
  });
  return filterDashboardRows(rows, state);
}

export function filterDashboardRows(rows, state) {
  const normalized = String(state.search ?? "").slice(0, 160).trim().toLocaleLowerCase();
  return rows.filter(row => (!normalized || `${row.name} ${row.folderName}`.toLocaleLowerCase().includes(normalized))
    && (state.status === "all" || (state.status === "planned" ? row.hasPlan : !row.hasPlan))
    && descendantsOf(state.folder ?? "all", row.folderObject, state.includeSubfolders !== false)
  ).sort((a, b) => a.folderName.localeCompare(b.folderName, game.i18n.lang || undefined) ||
    a.name.localeCompare(b.name, game.i18n.lang || undefined));
}

export function groupDashboardRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const id = row.folder || "unfiled";
    if (!groups.has(id)) groups.set(id, { id, label: row.folderName, rows: [] });
    groups.get(id).rows.push(row);
  }
  return [...groups.values()];
}

let DashboardClass;
let dashboard;
const actorByUuid = uuid => visibleActors().find(actor => actor.uuid === uuid) ?? null;
function failure(error) {
  console.error(`${MODULE_ID} | Dashboard action failed`, error);
  ui.notifications.error(loc("Errors.OpenFailed"));
}

/** Foundry v13 ApplicationV2 dashboard; presentation follows the shared Runyth language. */
export function getDashboardClass() {
  if (DashboardClass) return DashboardClass;
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
  DashboardClass = class SleepDashboard extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: "runyth-sleep-dashboard",
      classes: ["runyth-sleep-dashboard", "rs-window", "rs-manager"],
      window: { title: "RUNYTH_SLEEP.Dashboard.Title", icon: "fa-solid fa-bed", resizable: true },
      position: { width: 1040, height: 740 },
      actions: {
        switchTab: SleepDashboard.switchTab,
        plan: SleepDashboard.plan,
        bulk: SleepDashboard.bulk,
        clear: SleepDashboard.clear,
        selectVisible: SleepDashboard.selectVisible,
        selectFolder: SleepDashboard.selectFolder,
        clearSelection: SleepDashboard.clearSelection,
        sheet: SleepDashboard.sheet,
        rules: SleepDashboard.rules,
        help: SleepDashboard.help,
        settings: SleepDashboard.settings,
        savePermissions: SleepDashboard.savePermissions,
        resetPermissions: SleepDashboard.resetPermissions,
        reset: SleepDashboard.reset,
        previous: SleepDashboard.previous,
        next: SleepDashboard.next
      }
    };
    static PARTS = { main: { template: `modules/${MODULE_ID}/templates/dashboard.hbs` } };

    constructor(options = {}) {
      if (dashboard) return dashboard;
      super(options);
      dashboard = this;
      this.filter = sanitizeDashboardUi(game.settings.get(MODULE_ID, "dashboardUi") ?? DEFAULT_UI);
      if (!game.user.isGM && ["permissions", "settings"].includes(this.filter.activeTab)) this.filter.activeTab = "overview";
      this.selected = new Set();
      this._refreshTimer = null;
      this._positionTimer = null;
    }

    async _prepareContext(options) {
      if (!game.user.isGM && ["permissions", "settings"].includes(this.filter.activeTab)) {
        this.filter.activeTab = "overview";
      }
      const candidates = visibleActors();
      const validUuids = new Set(candidates.filter(canPlanActor).map(actor => actor.uuid));
      for (const uuid of this.selected) if (!validUuids.has(uuid)) this.selected.delete(uuid);
      const isActors = this.filter.activeTab === "actors";
      const isOverview = this.filter.activeTab === "overview";
      const allRows = (isActors || isOverview) ? dashboardRows(candidates, { ...DEFAULT_UI, status: "all" }) : [];
      const planned = allRows.filter(row => row.hasPlan).length;
      const filtered = isActors ? filterDashboardRows(allRows, this.filter) : [];
      const pageCount = Math.max(1, Math.ceil(filtered.length / this.filter.pageSize));
      this.filter.page = Math.min(pageCount, Math.max(1, this.filter.page));
      const start = (this.filter.page - 1) * this.filter.pageSize;
      const pageRows = filtered.slice(start, start + this.filter.pageSize).map(row => ({
        ...row, selected: this.selected.has(row.uuid)
      }));
      const folders = [...new Map(candidates.filter(actor => actor.folder)
        .map(actor => [actor.folder.id, actor.folder])).values()]
        .sort((a, b) => folderPath(a).localeCompare(folderPath(b)));
      const tab = this.filter.activeTab;
      const permissions = game.user.isGM ? sanitizePermissions(game.settings.get(MODULE_ID, "permissions")) : DEFAULT_PERMISSIONS;
      const userOptions = game.user.isGM ? [...(game.users?.contents ?? game.users ?? [])]
        .filter(user => !user.isGM && user.id).map(user => ({
          id: user.id, name: user.name,
          permissions: PERMISSION_IDS.map(id => {
            const value = permissions.userOverrides[user.id]?.[id];
            return {
              id, label: loc(`Permissions.${id}`),
              inherit: typeof value !== "boolean", allow: value === true, deny: value === false
            };
          })
        })) : [];
      return {
        gm: game.user.isGM,
        canEditRules: canModifyRules(),
        version: game.modules.get(MODULE_ID)?.version ?? "1.1.0",
        sceneName: canvas?.scene?.name ?? loc("Dashboard.NoScene"),
        tabs: TABS.filter(id => game.user.isGM || !["permissions", "settings"].includes(id))
          .map(id => ({ id, label: loc(`Tabs.${id}`), active: id === tab })),
        overview: isOverview, actorsTab: isActors, rulesTab: tab === "rules",
        permissionsTab: tab === "permissions", settingsTab: tab === "settings",
        total: candidates.length, planned, unplanned: candidates.length - planned,
        recent: allRows.filter(row => row.lastAt).length,
        selectedCount: this.selected.size,
        selectedCanModify: this.selected.size > 0,
        previewRows: allRows.filter(row => row.hasPlan).slice(0, 8),
        actorGroups: groupDashboardRows(pageRows), rows: pageRows,
        visible: filtered.length, page: this.filter.page, pageCount,
        rangeStart: filtered.length ? start + 1 : 0, rangeEnd: Math.min(start + this.filter.pageSize, filtered.length),
        hasPrev: this.filter.page > 1, hasNext: this.filter.page < pageCount,
        showBulk: candidates.some(actor => canPlanActor(actor)),
        search: this.filter.search, statusOptions: ["all", "planned", "unplanned"]
          .map(id => ({ id, label: loc(id === "all" ? "Dashboard.All" : id === "planned" ? "Dashboard.Planned" : "Dashboard.Unplanned"), selected: this.filter.status === id })),
        folderOptions: [
          { id: "all", name: loc("Dashboard.AllFolders"), selected: this.filter.folder === "all" },
          ...folders.map(folder => ({ id: folder.id, name: folderPath(folder), selected: this.filter.folder === folder.id }))
        ],
        includeSubfolders: this.filter.includeSubfolders,
        pageSizes: PAGE_SIZES.map(size => ({ value: size, selected: size === this.filter.pageSize })),
        permissionRows: PERMISSION_IDS.map(id => ({
          id, label: loc(`Permissions.${id}`),
          roles: [5, 1, 2, 3, 4].map(role => ({ value: role,
            label: loc(`Permissions.Role${role}`), selected: permissions.roleMinimums[id] === role }))
        })),
        userOptions,
        autoApply: game.settings.get(MODULE_ID, "autoApply"),
        unplannedMode: game.settings.get(MODULE_ID, "unplannedRestAction")
      };
    }

    async _onFirstRender(context, options) {
      await super._onFirstRender(context, options);
      this.setPosition(readWindowPosition("dashboard"));
    }

    _onPosition(position) {
      super._onPosition(position);
      if (!this.rendered) return;
      clearTimeout(this._positionTimer);
      this._positionTimer = setTimeout(() => saveWindowPosition("dashboard", this), 300);
    }

    _onRender(context, options) {
      super._onRender(context, options);
      const root = this.element?.querySelector("[data-sleep-dashboard]");
      if (!root || root.dataset.sleepBound) return;
      root.dataset.sleepBound = "yes";
      root.addEventListener("input", event => {
        if (event.target?.dataset.sleepFilter !== "search") return;
        this.filter.search = event.target.value;
        this.filter.page = 1;
        clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => {
          const field = root.querySelector('[data-sleep-filter="search"]');
          const selection = field ? [field.selectionStart, field.selectionEnd] : null;
          void this.render({ force: true }).then(() => {
            const replacement = this.element?.querySelector('[data-sleep-filter="search"]');
            if (replacement && selection) {
              replacement.focus();
              replacement.setSelectionRange(...selection);
            }
          }).catch(failure);
        }, 220);
      });
      root.addEventListener("change", event => {
        const element = event.target;
        if (element?.dataset.sleepSelect) {
          if (element.checked) this.selected.add(element.dataset.sleepSelect);
          else this.selected.delete(element.dataset.sleepSelect);
          element.closest(".rs-actor-row")?.classList.toggle("selected", element.checked);
          this._updateSelectionLabel();
          return;
        }
        if (element?.dataset.sleepFilter) {
          const field = element.dataset.sleepFilter;
          if (!["status", "folder", "pageSize", "includeSubfolders"].includes(field)) return;
          this.filter[field] = field === "pageSize" ? Number(element.value)
            : field === "includeSubfolders" ? element.checked : element.value;
          this.filter.page = 1;
          void this.render({ force: true }).catch(failure);
        }
      });
    }

    _updateSelectionLabel() {
      const label = this.element?.querySelector("[data-sleep-selected-count]");
      if (label) label.textContent = String(this.selected.size);
      for (const button of this.element?.querySelectorAll("[data-sleep-requires-selection]") ?? []) {
        button.disabled = this.selected.size === 0;
      }
    }

    refresh() {
      if (!this.rendered) return;
      clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => {
        if (this.element?.querySelector('[data-sleep-filter="search"]') === document.activeElement) return;
        void this.render({ force: true }).catch(failure);
      }, 160);
    }

    async _onClose(options) {
      clearTimeout(this._refreshTimer);
      clearTimeout(this._positionTimer);
      saveWindowPosition("dashboard", this);
      const next = { ...this.filter, page: 1 };
      try {
        if (JSON.stringify(next) !== JSON.stringify(game.settings.get(MODULE_ID, "dashboardUi"))) {
          await game.settings.set(MODULE_ID, "dashboardUi", next);
        }
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not save dashboard filters`, error);
      }
      if (dashboard === this) dashboard = null;
      return super._onClose(options);
    }

    static switchTab(event, button) {
      const id = button?.dataset?.tab;
      if (!TABS.includes(id) || (!game.user.isGM && ["permissions", "settings"].includes(id))) return;
      this.filter.activeTab = id;
      void this.render({ force: true }).catch(failure);
    }

    static async plan(event, button) {
      const actor = actorByUuid(button?.dataset?.actorUuid);
      if (!actor && game.user.isGM && !button?.dataset?.actorUuid) return openPlanner();
      if (!actor) return ui.notifications.warn(loc("Errors.NoActors"));
      await openPlanner({ actors: [actor] });
    }

    static async bulk(event, button) {
      const targets = [...this.selected].map(actorByUuid).filter(actor => actor && canPlanActor(actor));
      if (!targets.length) return ui.notifications.warn(loc("Dashboard.SelectFirst"));
      await openPlanner({ actors: targets });
    }

    static async clear(event, button) {
      const uuid = button?.dataset?.actorUuid;
      const targets = (uuid ? [actorByUuid(uuid)] : [...this.selected].map(actorByUuid))
        .filter(actor => actor && canPlanActor(actor));
      if (!targets.length) return ui.notifications.warn(loc("Dashboard.SelectFirst"));
      const proceed = await foundry.applications.api.DialogV2.confirm({
        window: { title: loc("Planner.Clear") }, content: `<p>${loc("Planner.ConfirmClear")}</p>`, rejectClose: false
      });
      if (!proceed) return;
      const results = await clearPlans(targets);
      if (results.some(result => !result.success)) ui.notifications.error(loc("Errors.SaveFailed"));
      else ui.notifications.info(loc("Dashboard.Cleared"));
      await this.render({ force: true });
    }

    static selectVisible() {
      const before = this.selected.size;
      let eligible = 0;
      for (const row of this._pageActors()) {
        if (row && canPlanActor(row)) { eligible += 1; this.selected.add(row.uuid); }
      }
      const added = this.selected.size - before;
      if (!eligible) ui.notifications.warn(loc("Dashboard.SelectNone"));
      else ui.notifications.info(game.i18n.format("RUNYTH_SLEEP.Dashboard.SelectedCounted", { count: added }));
      void this.render({ force: true }).catch(failure);
    }
    static selectFolder(event, button) {
      const folder = button?.dataset?.folder;
      const before = this.selected.size;
      let eligible = 0;
      for (const row of this._pageActors()) {
        if ((row?.folder?.id ?? "unfiled") === folder && canPlanActor(row)) {
          eligible += 1;
          this.selected.add(row.uuid);
        }
      }
      if (!eligible) ui.notifications.warn(loc("Dashboard.SelectNone"));
      else ui.notifications.info(game.i18n.format("RUNYTH_SLEEP.Dashboard.SelectedCounted", { count: this.selected.size - before }));
      void this.render({ force: true }).catch(failure);
    }
    static clearSelection() {
      this.selected.clear();
      ui.notifications.info(game.i18n.format("RUNYTH_SLEEP.Dashboard.SelectedCounted", { count: 0 }));
      void this.render({ force: true }).catch(failure);
    }
    _pageActors() {
      const filtered = dashboardRows(visibleActors(), this.filter);
      const start = (this.filter.page - 1) * this.filter.pageSize;
      return filtered.slice(start, start + this.filter.pageSize).map(row => actorByUuid(row.uuid));
    }
    static sheet(event, button) {
      const actor = actorByUuid(button?.dataset?.actorUuid);
      if (actor?.sheet) actor.sheet.render(true);
    }
    static rules() {
      if (canModifyRules()) void openRules().catch(failure);
    }
    static help() { void openHelp().catch(failure); }
    static settings() { if (game.user.isGM) game.settings.sheet?.render(true); }
    static async savePermissions() {
      if (!game.user.isGM) return ui.notifications.error(loc("Errors.GMOnly"));
      const root = this.element?.querySelector("[data-sleep-dashboard]");
      if (!root) return;
      const roleMinimums = {};
      for (const id of PERMISSION_IDS) {
        const input = root.querySelector(`[data-sleep-permission="${id}"]`);
        if (!input) return;
        roleMinimums[id] = Number(input.value);
      }
      const userOverrides = {};
      for (const select of root.querySelectorAll("[data-sleep-user-id][data-sleep-override]")) {
        const userId = select.dataset.sleepUserId;
        const id = select.dataset.sleepOverride;
        if (!PERMISSION_IDS.includes(id) || !/^[\w-]{1,100}$/.test(userId) || ["__proto__", "prototype", "constructor"].includes(userId)) continue;
        if (select.value === "inherit") continue;
        if (!userOverrides[userId]) userOverrides[userId] = {};
        userOverrides[userId][id] = select.value === "allow";
      }
      const sanitized = sanitizePermissions({ roleMinimums, userOverrides });
      try {
        await game.settings.set(MODULE_ID, "permissions", sanitized);
        await syncRuleDocumentAccess();
        ui.notifications.info(loc("Permissions.Saved"));
        await this.render({ force: true });
      } catch (error) { failure(error); }
    }
    static async resetPermissions() {
      if (!game.user.isGM) return;
      const proceed = await foundry.applications.api.DialogV2.confirm({
        window: { title: loc("Permissions.Reset") }, content: `<p>${loc("Permissions.ResetConfirm")}</p>`, rejectClose: false
      });
      if (!proceed) return;
      try {
        await game.settings.set(MODULE_ID, "permissions", sanitizePermissions(DEFAULT_PERMISSIONS));
        await syncRuleDocumentAccess();
        await this.render({ force: true });
      } catch (error) { failure(error); }
    }
    static reset() {
      this.filter = { ...this.filter, search: "", status: "all", folder: "all", includeSubfolders: true, page: 1 };
      void this.render({ force: true }).catch(failure);
    }
    static previous() {
      this.filter.page = Math.max(1, this.filter.page - 1);
      void this.render({ force: true }).catch(failure);
    }
    static next() {
      this.filter.page++;
      void this.render({ force: true }).catch(failure);
    }
  };
  return DashboardClass;
}

export function openDashboard() {
  const Dashboard = getDashboardClass();
  if (dashboard?.rendered) {
    dashboard.bringToFront();
    return dashboard;
  }
  if (dashboard) {
    void dashboard.render({ force: true }).catch(failure);
    return dashboard;
  }
  const opened = new Dashboard();
  void opened.render({ force: true }).catch(failure);
  return opened;
}

export function refreshDashboard() {
  dashboard?.refresh();
}
