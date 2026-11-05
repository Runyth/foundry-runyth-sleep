// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { DEFAULT_OUTCOMES, DEFAULT_THRESHOLDS, evaluate, MODULE_ID } from "./domain.js";
import {
  applyPending, clearPlans, getLastResult, getPlan, onPreLongRest,
  onPreShortRest, onRestCompleted, setPlans
} from "./engine.js";
import { openHelp, openPlanner, openRules } from "./planner.js";
import { getDashboardClass, openDashboard, refreshDashboard } from "./dashboard.js";
import { registerLaunchers } from "./launchers.js";
import { DEFAULT_PERMISSIONS, canViewActor, canPlanActor } from "./permissions.js";
import { DEFAULT_MECHANICS, sanitizeMechanics, calculateDC } from "./mechanics.js";
import { DEFAULT_ARMOR_RULES, sanitizeArmorRules } from "./armor.js";
import { retryArmorRest } from "./armor-engine.js";
import { readRules, ensureRuleDocument, syncRuleDocumentAccess, saveRuleConfiguration, canModifyRules } from "./rules-store.js";

const setting = (key, configuration) => game.settings.register(MODULE_ID, key, configuration);
const label = key => `RUNYTH_SLEEP.Settings.${key}`;

Hooks.once("init", () => {
  setting("autoApply", {
    name: label("AutoApplyName"), hint: label("AutoApplyHint"),
    scope: "world", config: true, type: Boolean, default: true
  });
  setting("exhaustionCap", {
    name: label("CapName"), hint: label("CapHint"),
    scope: "world", config: true, type: Number, range: { min: 0, max: 6, step: 1 }, default: 5
  });
  setting("chatVisibility", {
    name: label("ChatName"), hint: label("ChatHint"),
    scope: "world", config: true, type: String, default: "public",
    choices: {
      public: label("ChatPublic"), gm: label("ChatGM"), off: label("ChatOff")
    }
  });
  setting("unplannedRestAction", {
    name: label("UnplannedName"), hint: label("UnplannedHint"),
    scope: "world", config: true, type: String, default: "notice",
    choices: {
      notice: label("UnplannedNotice"), dashboard: label("UnplannedDashboard"), off: label("UnplannedOff")
    }
  });
  game.settings.registerMenu(MODULE_ID, "dashboard", {
    name: "RUNYTH_SLEEP.Dashboard.MenuName", label: "RUNYTH_SLEEP.Dashboard.MenuLabel",
    hint: "RUNYTH_SLEEP.Dashboard.MenuHint", icon: "fa-solid fa-bed",
    type: getDashboardClass(), restricted: false
  });
  setting("dashboardUi", { scope: "client", config: false, type: Object, default: { activeTab: "overview", search: "", status: "all", folder: "all", includeSubfolders: true, page: 1, pageSize: 40 } });
  setting("selectionButtonsOneShot", {
    name: label("OneShotSelectionName"), hint: label("OneShotSelectionHint"),
    scope: "client", config: true, type: Boolean, default: false
  });
  setting("dashboardPosition", { scope: "client", config: false, type: Object, default: { width: 1040, height: 740 } });
  setting("rulesJournalId", { scope: "world", config: false, type: String, default: "" });
  setting("permissions", { scope: "world", config: false, type: Object, default: DEFAULT_PERMISSIONS,
    onChange: () => {
      refreshDashboard();
      if (game.user?.isGM) void syncRuleDocumentAccess().catch(error => {
        console.warn(`${MODULE_ID} | Could not synchronize delegated rule access`, error);
      });
    } });
  registerLaunchers();
  setting("thresholds", { scope: "world", config: false, type: Object, default: DEFAULT_THRESHOLDS });
  setting("outcomes", { scope: "world", config: false, type: Object, default: DEFAULT_OUTCOMES });
  setting("mechanics", { scope: "world", config: false, type: Object, default: DEFAULT_MECHANICS });
  setting("armorRules", { scope: "world", config: false, type: Object, default: DEFAULT_ARMOR_RULES });
  setting("plannerPosition", {
    scope: "client", config: false, type: Object, default: { width: 660, height: 670 }
  });
  setting("rulesPosition", {
    scope: "client", config: false, type: Object, default: { width: 610, height: 650 }
  });
  setting("helpPosition", {
    scope: "client", config: false, type: Object, default: { width: 580, height: 540 }
  });
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") {
    if (game.user.isGM) ui.notifications.warn(game.i18n.localize("RUNYTH_SLEEP.Errors.WrongSystem"));
    return;
  }
  if (game.user.isGM) void ensureRuleDocument().catch(error => {
    console.error(`${MODULE_ID} | Rules document provisioning failed`, error);
    ui.notifications.warn(game.i18n.localize("RUNYTH_SLEEP.Errors.RulesUnavailable"));
  });
  const module = game.modules.get(MODULE_ID);
  if (!module) return;
  module.api = Object.freeze({
    version: "1.3.0",
    sanitizeArmorRules,
    readRules,
    canModifyRules,
    saveRuleConfiguration,
    retryArmorRest,
    calculateDC,
    sanitizeMechanics,
    canViewActor,
    canPlanActor,
    openDashboard,
    openPlanner,
    openHelp,
    openRules,
    getPlan,
    getLastResult,
    evaluate,
    setPlans,
    clearPlans,
    // GM-only recovery mechanism if the automatic post-rest update failed.
    retryApply: actor => applyPending(actor, { fromRest: false })
  });
  Hooks.on("dnd5e.preLongRest", onPreLongRest);
  Hooks.on("dnd5e.preShortRest", onPreShortRest);
  Hooks.on("dnd5e.restCompleted", (actor, result, config) => {
    void onRestCompleted(actor, result, config).catch(error => {
      console.error(`${MODULE_ID} | Unexpected post-rest error`, error);
    });
  });
  Hooks.on("updateJournalEntry", doc => {
    if (doc?.id === game.settings.get(MODULE_ID, "rulesJournalId")) refreshDashboard();
  });
  Hooks.on("updateActor", actor => { if (actor?.type === "character") refreshDashboard(); });
  Hooks.on("createActor", () => refreshDashboard());
  Hooks.on("deleteActor", () => refreshDashboard());
  console.info(`${MODULE_ID} | v1.1.0 initialized`);
});

Hooks.on("getSceneControlButtons", controls => {
  if (game.system.id !== "dnd5e" || !controls.tokens?.tools) return;
  controls.tokens.tools[MODULE_ID] = {
    name: MODULE_ID,
    title: "RUNYTH_SLEEP.Dashboard.Title",
    icon: "fa-solid fa-bed",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => {
      try { openDashboard(); } catch (error) {
        console.error(`${MODULE_ID} | Dashboard failed`, error);
        ui.notifications.error(game.i18n.localize("RUNYTH_SLEEP.Errors.OpenFailed"));
      }
    }
  };
});
