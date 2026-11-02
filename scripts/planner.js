import {
  DEFAULT_CHOICES, DEFAULT_OUTCOMES, DEFAULT_THRESHOLDS, FACTORS, TIERS,
  evaluate, sanitizeChoices, sanitizeOutcomes, sanitizeThresholds
} from "./domain.js";
import { MODULE_ID } from "./domain.js";
import {
  ABILITIES, DEFAULT_MECHANICS, DIE_FACES, descriptionFor, sanitizeMechanics
} from "./mechanics.js";
import { clearPlans, getLastResult, getPlan, setPlans } from "./engine.js";
import { ARMOR_CATEGORIES, ARMOR_MODES, DEFAULT_ARMOR_RULES, sanitizeArmorRules } from "./armor.js";
import { readWindowPosition, saveWindowPosition } from "./geometry.js";
import { canPlanActor, canViewActor, canSeeLastResult } from "./permissions.js";
import { readRules, ruleRevision, canModifyRules, saveRuleConfiguration, resetRuleConfiguration } from "./rules-store.js";

const t = key => game.i18n.localize(`RUNYTH_SLEEP.${key}`);
const DIALOG = () => foundry.applications.api.DialogV2;
const html = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const wiredRoots = new WeakSet();
const openDialogs = new Map();

// Reuse a visible dialog and bring it forward rather than generating overlapping windows.
function showDialog(kind, config) {
  const active = openDialogs.get(kind);
  if (active) {
    active.dialog?.bringToFront();
    return active.promise;
  }
  const { targetKey, ...dialogConfig } = config;
  const entry = { dialog: null, promise: null, targetKey: targetKey ?? "" };
  openDialogs.set(kind, entry);
  entry.promise = Promise.resolve().then(() => DIALOG().wait({
    ...dialogConfig,
    classes: ["runyth-sleep-window"],
    position: readWindowPosition(kind),
    render: (event, dialog) => {
      entry.dialog = dialog;
      config.render?.(event, dialog);
    },
    close: (event, dialog) => {
      saveWindowPosition(kind, dialog);
      config.close?.(event, dialog);
    }
  })).finally(() => {
    if (openDialogs.get(kind) === entry) openDialogs.delete(kind);
  });
  return entry.promise;
}

function reportOpenError(error) {
  console.error(`${MODULE_ID} | Could not open sleep dialog`, error);
  ui.notifications.error(t("Errors.OpenFailed"));
}

function openAuxiliary(handler) {
  void Promise.resolve().then(handler).catch(reportOpenError);
}

function readonlyChoices(plan) {
  if (!plan) return `<p>${html(t("Planner.None"))}</p>`;
  try {
    const choices = sanitizeChoices(plan.choices);
    return `<dl>${Object.entries(choices).map(([factor, value]) =>
      `<div><dt>${html(t(`Factor.${factor}`))}</dt><dd>${html(t(`Choice.${factor}.${value}`))}</dd></div>`
    ).join("")}</dl>`;
  } catch {
    return `<p>${html(t("Errors.InvalidRules"))}</p>`;
  }
}

function optionsMarkup(factor, current) {
  return Object.entries(FACTORS[factor]).map(([key, value]) =>
    `<option value="${key}" ${current === key ? "selected" : ""}>` +
    `${html(t(`Choice.${factor}.${key}`))} (${value > 0 ? "+" : ""}${value})</option>`
  ).join("");
}

function factorMarkup(choices) {
  return Object.keys(FACTORS).map(factor => `
    <label class="runyth-sleep-field"><span>${html(t(`Factor.${factor}`))}</span>
      <select name="${factor}">${optionsMarkup(factor, choices[factor])}</select>
    </label>`).join("");
}

function choicesFromForm(form) {
  return sanitizeChoices(Object.fromEntries(Object.keys(FACTORS).map(key => [key, form.elements.namedItem(key)?.value])));
}

function targetActors(explicit) {
  if (explicit) {
    const actors = Array.isArray(explicit) ? explicit : [explicit];
    return [...new Map(actors.filter(actor => actor?.type === "character" && canViewActor(actor)).map(actor => [actor.uuid, actor])).values()];
  }
  const selected = canvas?.tokens?.controlled?.map(token => token.actor)
    .filter(actor => actor?.type === "character" && canViewActor(actor)) ?? [];
  return [...new Map(selected.map(actor => [actor.uuid, actor])).values()];
}

function actorsFromForm(form, preset) {
  if (preset.length) return preset;
  const uuid = form.elements.namedItem("actor")?.value;
  const actor = game.actors.contents.find(candidate => candidate.uuid === uuid);
  return actor ? [actor] : [];
}

function showSummary(form, output, presetActors = []) {
  try {
    const rules = readRules();
    const result = evaluate(choicesFromForm(form), rules.thresholds, rules.outcomes);
    const currentActor = actorsFromForm(form, presetActors)?.[0] ?? targetActors()?.[0];
    const details = descriptionFor(result.tier,
      rules.mechanics,
      rules.outcomes, currentActor, result.score,
      rules.thresholds, {
        save: t("Mechanics.test.save"), check: t("Mechanics.test.check"),
        dc: t("Mechanics.Preview.DC"), noSave: t("Mechanics.Preview.NoSave"),
        tempHp: t("Mechanics.Preview.TempHP"), minimum: t("Mechanics.Preview.Minimum"),
        noHp: t("Mechanics.Preview.NoHP"), modifiers: t("Mechanics.Preview.Modifiers")
      });
    output.textContent = `${t("Planner.Score")}: ${result.score} | ${t(`Tier.${result.tier}`)} | ` +
      `${t("Rules.Exhaustion")}: +${result.effects.exhaustion} | ${details}`;
  } catch {
    output.textContent = t("Errors.InvalidRules");
  }
}

function lastResultText(last) {
  if (!last || !TIERS.includes(last.tier)) return "";
  const parts = [`${t("Planner.Last")}: ${t(`Tier.${last.tier}`)} (${Number(last.score)})`];
  if (last.save && Number.isFinite(Number(last.save.total)) && Number.isFinite(Number(last.save.dc))) {
    parts.push(`${String(last.save.ability ?? "con").toUpperCase()} ` +
      `${Number(last.save.total)} / ${t("Mechanics.Preview.DC")} ${Number(last.save.dc)} ` +
      `(${t(last.save.success ? "Chat.Passed" : "Chat.Failed")})`);
  }
  if (last.hpRoll && Number.isFinite(Number(last.hpRoll.granted))) {
    parts.push(`${t("Chat.AvailableTempHP")}: ${Number(last.hpRoll.granted)}`);
  }
  return parts.join(" • ");
}

function showSavedResults(results) {
  if (results.every(result => result.success)) {
    ui.notifications.info(`${t("Planner.Saved")} (${results.length})`);
  } else {
    ui.notifications.error(`${t("Errors.SaveFailed")}: ` +
      results.filter(result => !result.success).map(result => result.actor).join(", "));
  }
}

export function openPlanner({ actors } = {}) {
  const active = openDialogs.get("planner");
  if (active && actors) {
    const requested = targetActors(actors).map(actor => actor.uuid).join("|");
    if (requested !== active.targetKey && active.dialog) {
      // Never show another actor's data when switching from the dashboard.
      return Promise.resolve(active.dialog.close()).then(() => active.promise).then(() => showPlanner({ actors }));
    }
  }
  if (active) {
    active.dialog?.bringToFront();
    return active.promise;
  }
  return showPlanner({ actors });
}

function showPlanner({ actors } = {}) {
  const isGM = Boolean(game.user?.isGM);
  const canEditRules = canModifyRules();
  const rules = readRules();
  const preset = targetActors(actors);
  const canEdit = isGM || (preset.length === 1 && canPlanActor(preset[0]));
  const candidates = game.actors.contents.filter(actor => canViewActor(actor))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (!preset.length && !candidates.length) {
    ui.notifications.warn(t("Errors.NoActors"));
    return null;
  }
  const initialActor = preset[0] ?? candidates[0];
  const sceneChoices = canvas?.scene?.getFlag(MODULE_ID, "defaultChoices");
  const existing = getPlan(initialActor);
  let choices;
  try {
    choices = sanitizeChoices(existing?.choices ?? sceneChoices ?? DEFAULT_CHOICES);
  } catch {
    choices = { ...DEFAULT_CHOICES };
  }
  const actorSummary = preset.length
    ? `<p class="runyth-sleep-targets">${html(t("Planner.Targets"))}: ${preset.map(actor => html(actor.name)).join(", ")}</p>`
    : `<label class="runyth-sleep-field"><span>${html(t("Planner.Actor"))}</span><select name="actor">` +
      candidates.map(actor => `<option value="${html(actor.uuid)}">${html(actor.name)}</option>`).join("") +
      `</select></label>`;
  let currentSummary = t("Planner.None");
  if (existing) {
    try {
      const quality = evaluate(existing.choices,
        rules.thresholds, rules.outcomes);
      currentSummary = `${t("Planner.Existing")}: ${t(`Tier.${quality.tier}`)}`;
    } catch {
      currentSummary = t("Errors.InvalidRules");
    }
  }
  const last = canSeeLastResult(initialActor) ? getLastResult(initialActor) : null;
  const note = existing?.note ?? "";
  const content = `<div class="runyth-sleep" data-runyth-sleep>
    <p class="runyth-sleep-intro">${html(t("Planner.Intro"))}</p>
    ${actorSummary}
    <p class="runyth-sleep-existing">${html(currentSummary)}</p>
    ${canEdit ? `<div class="runyth-sleep-fields">${factorMarkup(choices)}</div>
      <label class="runyth-sleep-field runyth-sleep-note"><span>${html(t("Planner.Note"))}</span>
        <textarea name="note" maxlength="200" rows="2">${html(note)}</textarea></label>
      <div class="runyth-sleep-score" role="status" aria-live="polite"></div>
      <div class="runyth-sleep-links"><button type="button" data-sleep-help>${html(t("Planner.Help"))}</button>
        ${canEditRules ? `<button type="button" data-sleep-rules>${html(t("Planner.Rules"))}</button>
        ${isGM ? `<button type="button" data-sleep-scene ${canvas?.scene ? "" : "disabled"}>${html(t("Planner.SaveScene"))}</button>` : ""}` : ""}</div>`
      : `<p>${html(t("Planner.PlayerNotice"))}</p>
        <div class="runyth-sleep-readonly" data-sleep-readonly>${readonlyChoices(existing)}</div>
        <button type="button" data-sleep-help>${html(t("Planner.Help"))}</button>
        ${canEditRules ? `<button type="button" data-sleep-rules>${html(t("Planner.Rules"))}</button>` : ""}`}
    <p class="runyth-sleep-last">${html(lastResultText(last))}</p>
  </div>`;
  const buttons = canEdit ? [
    {
      action: "save", label: t("Planner.Save"), default: true, icon: "fas fa-save",
      callback: async (event, button) => {
        const form = button.form;
        const requested = actorsFromForm(form, preset);
        if (requested.some(actor => !canPlanActor(actor))) throw new Error(t("Errors.PermissionDenied"));
        const result = await setPlans(requested, choicesFromForm(form), form.elements.note.value);
        showSavedResults(result);
        return result;
      }
    },
    {
      action: "clear", label: t("Planner.Clear"), icon: "fas fa-eraser",
      callback: async (event, button) => {
        const proceed = await DIALOG().confirm({
          window: { title: t("Planner.Clear") }, content: `<p>${html(t("Planner.ConfirmClear"))}</p>`, rejectClose: false
        });
        if (!proceed) return null;
        const requested = actorsFromForm(button.form, preset);
        if (requested.some(actor => !canPlanActor(actor))) throw new Error(t("Errors.PermissionDenied"));
        const result = await clearPlans(requested);
        showSavedResults(result);
        return result;
      }
    },
    { action: "cancel", label: t("Planner.Cancel") }
  ] : [{ action: "close", label: t("Planner.Close"), default: true }];
  return showDialog("planner", {
    targetKey: preset.map(actor => actor.uuid).join("|"),
    window: { title: t("Planner.Title"), resizable: true },
    content,
    buttons,
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element.querySelector("[data-runyth-sleep]");
      const form = root?.closest("form");
      if (!root || !form || wiredRoots.has(root)) return;
      wiredRoots.add(root);
      const actorSelector = form.elements.namedItem("actor");
      actorSelector?.addEventListener("change", () => {
        const selectedActor = candidates.find(actor => actor.uuid === actorSelector.value);
        if (!selectedActor) return;
        const queued = getPlan(selectedActor);
        let chosen;
        try {
          chosen = sanitizeChoices(queued?.choices ?? sceneChoices ?? DEFAULT_CHOICES);
        } catch {
          chosen = { ...DEFAULT_CHOICES };
        }
        for (const [factor, value] of Object.entries(chosen)) {
          const field = form.elements.namedItem(factor);
          if (field) field.value = value;
        }
        const notes = form.elements.namedItem("note");
        if (notes) notes.value = queued?.note ?? "";
        const existingLabel = root.querySelector(".runyth-sleep-existing");
        if (existingLabel) {
          try {
            const summary = queued ? evaluate(queued.choices,
              rules.thresholds, rules.outcomes) : null;
            existingLabel.textContent = summary ? `${t("Planner.Existing")}: ${t(`Tier.${summary.tier}`)}` : t("Planner.None");
          } catch {
            existingLabel.textContent = t("Errors.InvalidRules");
          }
        }
        const previous = canSeeLastResult(selectedActor) ? getLastResult(selectedActor) : null;
        const lastLabel = root.querySelector(".runyth-sleep-last");
        if (lastLabel) lastLabel.textContent = lastResultText(previous);
        const scoreOutput = root.querySelector(".runyth-sleep-score");
        if (scoreOutput) showSummary(form, scoreOutput, preset);
        const readonly = root.querySelector("[data-sleep-readonly]");
        if (readonly) readonly.innerHTML = readonlyChoices(queued);
      });
      const summary = root.querySelector(".runyth-sleep-score");
      if (summary) {
        showSummary(form, summary, preset);
        form.addEventListener("change", event => {
          if (Object.hasOwn(FACTORS, event.target?.name)) showSummary(form, summary, preset);
        });
      }
      root.querySelector("[data-sleep-help]")?.addEventListener("click", () => openAuxiliary(openHelp));
      root.querySelector("[data-sleep-rules]")?.addEventListener("click", () => openAuxiliary(openRules));
      root.querySelector("[data-sleep-scene]")?.addEventListener("click", async () => {
        if (!isGM || !canvas?.scene) return;
        try {
          await canvas.scene.setFlag(MODULE_ID, "defaultChoices", choicesFromForm(form));
          ui.notifications.info(t("Planner.SceneSaved"));
        } catch (error) {
          console.error(`${MODULE_ID} | Scene defaults could not be saved`, error);
          ui.notifications.error(t("Errors.SaveFailed"));
        }
      });
    }
  });
}

// Advanced rules: edit access is separately delegated, never global settings access. Accordion sections avoid overloading smaller displays.
const numberSpec = {
  exhaustion: [0, 6], tempHp: [0, 100], dc: [0, 40], qualityStep: [0, 20], qualityGain: [-10, 10],
  exhaustionGain: [-10, 10], levelStep: [0, 20], levelGain: [-10, 10],
  abilityMultiplier: [-5, 5], proficiencyMultiplier: [-5, 5], modifier: [-20, 20],
  minDC: [0, 40], maxDC: [0, 40], reduction: [0, 6],
  diceCount: [0, 10], flat: [-100, 100], minimum: [0, 100], maximum: [0, 100]
};

function options(values, current, prefix) {
  return values.map(value => `<option value="${html(value)}" ${value === current ? "selected" : ""}>` +
    `${html(t(`Mechanics.${prefix}.${value}`))}</option>`).join("");
}

function ruleInput(tier, section, key, current) {
  const field = `${tier}_${section}_${key}`;
  const label = html(t(`Mechanics.Fields.${key}`));
  if (typeof current === "boolean") return `<label class="rs-sleep-rule-toggle"><input type="checkbox" name="${field}" ` +
    `${current ? "checked" : ""}><span>${label}</span></label>`;
  const choices = section === "save" ? {
    test: ["save", "check"], ability: ABILITIES, rollMode: ["normal", "advantage", "disadvantage"],
    success: ["negate", "half", "reduce", "unchanged"]
  } : { mode: ["none", "fixed", "dice"], ability: ABILITIES, diceFaces: DIE_FACES };
  if (choices[key]) {
    const list = key === "diceFaces" ? DIE_FACES.map(face => `<option value="${face}" ${face === current ? "selected" : ""}>d${face}</option>`).join("")
      : options(choices[key], current, key === "ability" ? "Abilities" : key);
    return `<label class="runyth-sleep-field"><span>${label}</span><select name="${field}">${list}</select></label>`;
  }
  const [min, max] = numberSpec[key] ?? [0, 20];
  return `<label class="runyth-sleep-field"><span>${label}</span>` +
    `<input type="number" name="${field}" min="${min}" max="${max}" step="1" value="${current}" required></label>`;
}

function readProfile(elements, tier, example) {
  const next = {};
  for (const part of ["save", "hp"]) {
    next[part] = {};
    for (const [key, old] of Object.entries(example[part])) {
      const element = elements.namedItem(`${tier}_${part}_${key}`);
      if (!element) throw new Error(`Missing ${tier}.${part}.${key} input.`);
      next[part][key] = typeof old === "boolean" ? element.checked
        : typeof old === "number" ? Number(element.value) : element.value;
    }
  }
  return next;
}

function armorRuleInput(category, part, key, current) {
  const field = `armor_${category}_${part}_${key}`;
  const caption = html(t(`Armor.Fields.${key}`));
  if (typeof current === "boolean") return `<label class="rs-sleep-rule-toggle"><input type="checkbox" name="${field}" ${current ? "checked" : ""}><span>${caption}</span></label>`;
  if (key === "ability" || key === "rollMode") {
    const values = key === "ability" ? ABILITIES : ["normal", "advantage", "disadvantage"];
    return `<label class="runyth-sleep-field"><span>${caption}</span><select name="${field}">` +
      values.map(value => `<option value="${value}" ${value === current ? "selected" : ""}>${html(key === "ability" ? t(`Mechanics.Abilities.${value}`) : t(`Mechanics.rollMode.${value}`))}</option>`).join("") + `</select></label>`;
  }
  const max = key === "dc" ? 40 : key === "hitDicePercent" ? 100 : 6;
  return `<label class="runyth-sleep-field"><span>${caption}</span><input type="number" name="${field}" min="0" max="${max}" step="1" required value="${current}"></label>`;
}

function armorSection(rules) {
  const intro = html(t("Armor.Intro"));
  const modeOptions = ARMOR_MODES.map(mode => `<option value="${mode}" ${mode === rules.mode ? "selected" : ""}>${html(t(`Armor.Preset.${mode}`))}</option>`).join("");
  const profiles = ARMOR_CATEGORIES.map(category => {
    const profile = rules.custom[category];
    return `<details class="rs-sleep-profile"><summary><strong>${html(t(`Armor.Category.${category}`))}</strong></summary>
      <div class="rs-sleep-profile-content"><div class="rs-sleep-rule-grid">
      ${armorRuleInput(category, "profile", "enabled", profile.enabled)}</div>
      <h3>${html(t("Armor.Save"))}</h3><div class="rs-sleep-rule-grid">${Object.entries(profile.save).map(([key, value]) => armorRuleInput(category, "save", key, value)).join("")}</div>
      <h3>${html(t("Armor.Failure"))}</h3><div class="rs-sleep-rule-grid">${Object.entries(profile.failure).map(([key, value]) => armorRuleInput(category, "failure", key, value)).join("")}</div>
      <h3>${html(t("Armor.Success"))}</h3><div class="rs-sleep-rule-grid">${Object.entries(profile.success).map(([key, value]) => armorRuleInput(category, "success", key, value)).join("")}</div>
      </div></details>`;
  }).join("");
  return `<details class="rs-sleep-profile rs-sleep-armor-rules"><summary><strong>${html(t("Armor.Title"))}</strong><span>${html(t("Armor.Configurable"))}</span></summary>
    <div class="rs-sleep-profile-content"><p class="hint">${intro}</p>
    <label class="runyth-sleep-field"><span>${html(t("Armor.PresetLabel"))}</span><select name="armor_mode">${modeOptions}</select></label>
    <p class="hint">${html(t("Armor.ModeHint"))}</p>${profiles}</div></details>`;
}

function readArmorRules(elements, old) {
  const readPart = (category, part, values) => Object.fromEntries(Object.entries(values).map(([key, oldValue]) => {
    const control = elements.namedItem(`armor_${category}_${part}_${key}`);
    if (!control) throw new Error(`Missing armor field ${category}.${part}.${key}`);
    return [key, typeof oldValue === "boolean" ? control.checked
      : typeof oldValue === "number" ? Number(control.value) : control.value];
  }));
  return sanitizeArmorRules({
    mode: elements.namedItem("armor_mode")?.value,
    custom: Object.fromEntries(ARMOR_CATEGORIES.map(category => [category, {
      enabled: readPart(category, "profile", { enabled: old.custom[category].enabled }).enabled,
      save: readPart(category, "save", old.custom[category].save),
      failure: readPart(category, "failure", old.custom[category].failure),
      success: readPart(category, "success", old.custom[category].success)
    }]))
  });
}

export function openRules() {
  if (!canModifyRules()) throw new Error(t("Errors.PermissionDenied"));
  if (openDialogs.has("rules")) return showDialog("rules", {});
  const { thresholds, outcomes, mechanics, armorRules } = readRules();
  const initialRevision = ruleRevision();
  const thresholdsHTML = Object.keys(DEFAULT_THRESHOLDS).map(key => `
    <label class="runyth-sleep-field"><span>${html(t(`Tier.${key}`))}</span>
      <input name="threshold_${key}" type="number" step="1" min="-30" max="30" value="${thresholds[key]}"></label>`).join("");
  const profiles = TIERS.map(tier => {
    const profile = mechanics[tier];
    return `<details class="rs-sleep-profile" ${tier === "poor" ? "open" : ""}>
      <summary><strong>${html(t(`Tier.${tier}`))}</strong><span>${html(t("Mechanics.ConfigureTier"))}</span></summary>
      <div class="rs-sleep-profile-content">
        <h3>${html(t("Mechanics.BaseOutcomes"))}</h3>
        <div class="rs-sleep-rule-grid">
          ${ruleInput(tier, "base", "exhaustion", outcomes[tier].exhaustion)}
          ${ruleInput(tier, "base", "tempHp", outcomes[tier].tempHp)}
        </div>
        <h3>${html(t("Mechanics.SavingThrow"))}</h3>
        <p class="hint">${html(t("Mechanics.SaveHelp"))}</p>
        <div class="rs-sleep-rule-grid">${Object.entries(profile.save).map(([key, value]) => ruleInput(tier, "save", key, value)).join("")}</div>
        <h3>${html(t("Mechanics.TempHP"))}</h3>
        <p class="hint">${html(t("Mechanics.HPHelp"))}</p>
        <div class="rs-sleep-rule-grid">${Object.entries(profile.hp).map(([key, value]) => ruleInput(tier, "hp", key, value)).join("")}</div>
      </div></details>`;
  }).join("");
  return showDialog("rules", {
    window: { title: t("Rules.Title"), resizable: true },
    content: `<div class="runyth-sleep rs-sleep-advanced"><p>${html(t("Mechanics.Intro"))}</p>
      <h3>${html(t("Rules.Thresholds"))}</h3><div class="runyth-sleep-fields">${thresholdsHTML}</div>
      <h3>${html(t("Rules.Outcomes"))}</h3>${profiles}
      ${armorSection(armorRules)}</div>`,
    buttons: [{
      action: "save", label: t("Rules.Save"), default: true,
      callback: async (event, button) => {
        const elements = button.form.elements;
        try {
          const nextThresholds = sanitizeThresholds(Object.fromEntries(Object.keys(DEFAULT_THRESHOLDS)
            .map(key => [key, Number(elements.namedItem(`threshold_${key}`).value)])));
          const nextOutcomes = sanitizeOutcomes(Object.fromEntries(TIERS.map(tier => [tier, {
            exhaustion: Number(elements.namedItem(`${tier}_base_exhaustion`).value),
            tempHp: Number(elements.namedItem(`${tier}_base_tempHp`).value)
          }])));
          const nextMechanics = sanitizeMechanics(Object.fromEntries(TIERS.map(tier => [tier,
            readProfile(elements, tier, mechanics[tier])])));
          const nextArmor = readArmorRules(elements, armorRules);
          await saveRuleConfiguration({ thresholds: nextThresholds, outcomes: nextOutcomes,
            mechanics: nextMechanics, armorRules: nextArmor }, { expectedRevision: initialRevision });
          ui.notifications.info(t("Rules.Saved"));
          return true;
        } catch (error) {
          console.warn(`${MODULE_ID} | Invalid rules`, error);
          ui.notifications.error(`${t("Errors.InvalidRules")}: ${error.message}`);
          return false;
        }
      }
    }, {
      action: "reset", label: t("Mechanics.ResetDefaults"),
      callback: async () => {
        const confirmed = await DIALOG().confirm({
          window: { title: t("Mechanics.ResetDefaults") },
          content: `<p>${html(t("Mechanics.ResetConfirm"))}</p>`, rejectClose: false
        });
        if (!confirmed) return false;
        try {
          await resetRuleConfiguration({ expectedRevision: initialRevision });
          ui.notifications.info(t("Rules.Saved"));
          return true;
        } catch (error) {
          console.error(`${MODULE_ID} | Could not reset sleep rules`, error);
          ui.notifications.error(t("Errors.SaveFailed"));
          return false;
        }
      }
    }, { action: "cancel", label: t("Planner.Cancel") }], rejectClose: false
  });
}

function helpScoreTable() {
  const { thresholds, mechanics, outcomes } = readRules();
  const cells = [
    ["miserable", `≤ ${thresholds.miserable}`],
    ["poor", `${thresholds.miserable + 1} – ${thresholds.poor}`],
    ["ordinary", `${thresholds.poor + 1} – ${thresholds.comfortable - 1}`],
    ["comfortable", `${thresholds.comfortable} – ${thresholds.excellent - 1}`],
    ["excellent", `≥ ${thresholds.excellent}`]
  ];
  return `<table class="rs-help-score-table"><thead><tr><th>${html(t("Help.QualityTier"))}</th>` +
    `<th>${html(t("Help.ScoreRange"))}</th><th>${html(t("Help.RollNeeded"))}</th></tr></thead><tbody>` +
    cells.map(([tier, range]) => {
      const rolls = [];
      if (mechanics[tier].save.enabled && outcomes[tier].exhaustion > 0) rolls.push(t("Help.SaveRequired"));
      if (mechanics[tier].hp.mode === "dice") rolls.push(t("Help.ComfortRoll"));
      return `<tr><td>${html(t(`Tier.${tier}`))}</td><td>${html(range)}</td>` +
        `<td>${html(rolls.length ? rolls.join(" + ") : t("Help.NoRoll"))}</td></tr>`;
    }).join("") +
    `</tbody></table><p class="hint">${html(t("Help.ConfiguredThresholds"))}</p>`;
}

function helpFactorTable() {
  return `<table class="rs-help-score-table"><thead><tr><th>${html(t("Help.Condition"))}</th>` +
    `<th>${html(t("Help.ScoreRange"))}</th><th>${html(t("Help.Example"))}</th></tr></thead><tbody>` +
    Object.entries(FACTORS.shelter).map(([id, points]) => `<tr><td>${html(t(`Choice.shelter.${id}`))}</td>` +
      `<td>${points > 0 ? "+" : ""}${points}</td><td>${html(t(`Help.ShelterExample.${id}`))}</td></tr>`).join("") +
    `</tbody></table>`;
}

export function openHelp() {
  return showDialog("help", {
    window: { title: t("Help.Title"), resizable: true },
    content: `<div class="runyth-sleep runyth-sleep-help">
      <p>${html(t("Help.Overview"))}</p>
      <ol><li>${html(t("Help.StepOne"))}</li><li>${html(t("Help.StepTwo"))}</li>
      <li>${html(t("Help.StepThree"))}</li></ol>
      <h3>${html(t("Help.ShelterHeading"))}</h3>${helpFactorTable()}
      <p class="hint">${html(t("Help.TimingHouseRules"))}</p>
      <h3>${html(t("Help.ScoringHeading"))}</h3>
      <p>${html(t("Help.ScoringDetails"))}</p>${helpScoreTable()}
      <p>${html(t("Help.SaveExplanation"))}</p>
      <p>${html(t("Help.Rules"))}</p><p>${html(t("Help.Authority"))}</p>
      <p>${html(t("Help.Recovery"))}</p></div>`,
    buttons: [{ action: "close", label: t("Planner.Close"), default: true }], rejectClose: false
  });
}
