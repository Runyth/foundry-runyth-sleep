import {
  MODULE_ID, PLAN_VERSION, calculateUpdates, evaluate, sanitizeChoices, validatePlan
} from "./domain.js";

import { canPlanActor } from "./permissions.js";
import { readRules } from "./rules-store.js";
import {
  calculateDC, DEFAULT_MECHANICS, exhaustionAfterSave, hpFormula,
  hpFromRoll, sanitizeMechanics
} from "./mechanics.js";

import { rememberArmorRest, discardArmorRest, applyArmorRest, resetArmorRuntimeState } from "./armor-engine.js";

const inProgress = new Map();
const activeUpdates = new Set();
const resolvedRolls = new Map();
const i18n = key => game.i18n.localize(`RUNYTH_SLEEP.${key}`);

function rules() {
  return readRules();
}

function requireGM() {
  if (!game.user?.isGM) throw new Error(i18n("Errors.GMOnly"));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function asActor(document) {
  if (!document || typeof document.update !== "function" || typeof document.getFlag !== "function") {
    throw new TypeError("An Actor document is required.");
  }
  if (document.type !== "character") throw new TypeError("Only character actors support sleep plans.");
  return document;
}

export function getPlan(actor) {
  return asActor(actor).getFlag(MODULE_ID, "pendingPlan") ?? null;
}

export function getLastResult(actor) {
  return asActor(actor).getFlag(MODULE_ID, "lastResult") ?? null;
}

// Bound parallel Actor updates to avoid slow serial group operations and load spikes.
async function updateGroup(actors, updateActor) {
  const unique = [...new Map(actors.map(actor => [asActor(actor).uuid, actor])).values()];
  if (!unique.length) throw new Error(i18n("Errors.NoActors"));
  const results = new Array(unique.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, async () => {
    while (cursor < unique.length) {
      const index = cursor++;
      const actor = unique[index];
      try {
        await updateActor(actor);
        results[index] = { actor: actor.name, success: true };
      } catch (error) {
        console.error(`${MODULE_ID} | Could not update sleep plan for ${actor.uuid}`, error);
        results[index] = { actor: actor.name, success: false };
      }
    }
  }));
  return results;
}

export async function setPlans(actors, choices, note = "") {
  if (!Array.isArray(actors) || !actors.length || actors.some(actor => !canPlanActor(actor))) {
    throw new Error(i18n("Errors.PermissionDenied"));
  }
  const checked = sanitizeChoices(choices);
  const trimmedNote = String(note ?? "").slice(0, 200);
  return updateGroup(actors, async actor => {
    const plan = {
      schema: PLAN_VERSION,
      id: foundry.utils.randomID(),
      choices: checked,
      note: trimmedNote,
      createdAt: Date.now(),
      createdBy: game.user.id
    };
    await actor.update({ [`flags.${MODULE_ID}.pendingPlan`]: plan });
    inProgress.delete(actor.uuid);
    resolvedRolls.delete(actor.uuid);
  });
}

export async function clearPlans(actors) {
  if (!Array.isArray(actors) || !actors.length || actors.some(actor => !canPlanActor(actor))) {
    throw new Error(i18n("Errors.PermissionDenied"));
  }
  return updateGroup(actors, async actor => {
    if (getPlan(actor)) await actor.update({ [`flags.${MODULE_ID}.pendingPlan`]: null });
    inProgress.delete(actor.uuid);
    resolvedRolls.delete(actor.uuid);
  });
}

export function onPreLongRest(actor) {
  if (!actor || actor.type !== "character") return;
  rememberArmorRest(actor);
  const plan = actor.getFlag(MODULE_ID, "pendingPlan");
  inProgress.delete(actor.uuid);
  if (!plan) {
    inProgress.set(actor.uuid, { unplanned: true, started: Date.now() });
    return;
  }
  try {
    validatePlan(plan);
    inProgress.set(actor.uuid, { id: plan.id, started: Date.now() });
  } catch (error) {
    console.warn(`${MODULE_ID} | Invalid pending plan ignored`, error);
    // Armor processing must continue even if the unrelated bedding plan is malformed.
    inProgress.set(actor.uuid, { unplanned: true, started: Date.now() });
  }
}

export function onPreShortRest(actor) {
  if (actor?.uuid) inProgress.delete(actor.uuid);
  discardArmorRest(actor);
}

function wasShortRest(result, config) {
  return result?.longRest === false || result?.type === "short" || result?.type === "shortRest" ||
    config?.type === "short" || config?.type === "shortRest" || config?.longRest === false;
}

function firstRoll(result) {
  if (Array.isArray(result)) return result[0];
  if (Array.isArray(result?.rolls)) return result.rolls[0];
  if (Array.isArray(result?.results)) return result.results[0]?.roll ?? result.results[0];
  return result?.roll ?? result;
}

async function savingThrow(actor, options, dc) {
  const fn = options.test === "check" ? actor.rollAbilityCheck : actor.rollSavingThrow;
  // Never fabricate an ability roll: system saves must include proficiencies, effects and modifiers.
  if (typeof fn !== "function") throw new Error(`D&D 5e ${options.test} API unavailable.`);
  const config = {
    ability: options.ability, target: dc,
    ...(options.rollMode === "advantage" ? { advantage: true } : {}),
    ...(options.rollMode === "disadvantage" ? { disadvantage: true } : {})
  };
  // dnd5e v5 accepts three argument objects: process, dialog and chat-message options.
  // Passing a pseudo "dialog" property inside config would open an unwanted save dialog.
  const raw = await fn.call(actor, config, { configure: false }, { create: false });
  const roll = firstRoll(raw);
  const total = Number(roll?.total);
  if (!Number.isFinite(total)) throw new Error("Saving throw was canceled or returned no usable total.");
  return { test: options.test, ability: options.ability, total, dc, success: total >= dc,
    rollMode: options.rollMode };
}

async function sleepEffects(actor, evaluation, thresholds, outcomes, mechanics) {
  const profile = sanitizeMechanics(mechanics)[evaluation.tier];
  const effect = { ...evaluation.effects };
  let save = null;
  let hpRoll = null;
  if (effect.exhaustion > 0 && profile.save.enabled) {
    const dc = calculateDC(profile.save, actor, evaluation.score, evaluation.tier, thresholds);
    save = await savingThrow(actor, profile.save, dc);
    effect.exhaustion = exhaustionAfterSave(effect.exhaustion, profile.save, save.success);
  }
  if (profile.hp.mode !== "none") {
    const formula = hpFormula(profile.hp, actor);
    let total;
    if (profile.hp.mode === "dice") {
      if (typeof Roll !== "function") throw new Error("Foundry dice roller unavailable.");
      // Validated integers and fixed dice sizes only: no arbitrary user-provided formulas.
      const rolled = await new Roll(formula).evaluate();
      total = Number(rolled?.total);
    } else {
      // For fixed HP, use only modifiers (the old fixed minimum remains the floor).
      total = Number(formula.replace(/^0\s*[+-]\s*/, match => match.includes("-") ? "-" : ""));
    }
    if (!Number.isFinite(total)) throw new Error("Invalid temporary HP result.");
    effect.tempHp = hpFromRoll(profile.hp, effect.tempHp, total);
    hpRoll = { formula, total, granted: effect.tempHp };
  } else effect.tempHp = 0;
  return { effects: effect, save, hpRoll };
}

async function postChat(actor, data, changes, rolls) {
  const visibility = game.settings.get(MODULE_ID, "chatVisibility");
  if (visibility === "off") return;
  const tier = i18n(`Tier.${data.tier}`);
  const save = rolls.save ? `<p>${escapeHTML(i18n("Chat.Save"))}: ${escapeHTML(rolls.save.ability.toUpperCase())} ` +
    `${escapeHTML(i18n(`Mechanics.test.${rolls.save.test}`))} ${rolls.save.total} / DC ${rolls.save.dc} — ` +
    `${escapeHTML(i18n(rolls.save.success ? "Chat.Passed" : "Chat.Failed"))}</p>` : "";
  const bonus = rolls.hpRoll ? `<p>${escapeHTML(i18n("Chat.BonusRoll"))}: ` +
    `${escapeHTML(rolls.hpRoll.formula)} = ${rolls.hpRoll.total}; ` +
    `${escapeHTML(i18n("Chat.AvailableTempHP"))}: ${rolls.hpRoll.granted}</p>` : "";
  const content = `<div class="runyth-sleep-chat"><h3>${escapeHTML(i18n("Chat.Title"))}</h3>` +
    `<p><strong>${escapeHTML(actor.name)}</strong> — ${escapeHTML(tier)} (${data.score})</p>` +
    save + bonus +
    `<p>${escapeHTML(i18n("Chat.Exhaustion"))}: +${changes.actual.exhaustion}; ` +
    `${escapeHTML(i18n("Chat.TemporaryHP"))}: +${changes.actual.tempHp}</p></div>`;
  const whisper = visibility === "gm" ? ChatMessage.getWhisperRecipients("GM").map(user => user.id) : undefined;
  await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }), ...(whisper ? { whisper } : {}) });
}

export async function applyPending(actor, { fromRest = false } = {}) {
  const current = asActor(actor);
  if (game.system.id !== "dnd5e") return { status: "unsupported" };
  if (!game.user?.isGM && !current.isOwner) return { status: "unauthorized" };
  if (!fromRest) requireGM();
  if (!game.settings.get(MODULE_ID, "autoApply") && fromRest) return { status: "disabled" };
  if (activeUpdates.has(current.uuid)) return { status: "busy" };
  const plan = getPlan(current);
  if (!plan) return { status: "no-plan" };
  let choices;
  try {
    choices = validatePlan(plan);
  } catch (error) {
    console.error(`${MODULE_ID} | Malformed pending plan`, error);
    return { status: "invalid-plan" };
  }
  if (getLastResult(current)?.planId === plan.id) return { status: "already-applied" };
  activeUpdates.add(current.uuid);
  try {
    const { thresholds, outcomes, mechanics } = rules();
    const evaluation = evaluate(choices, thresholds, outcomes);
    const ruleFingerprint = JSON.stringify({ thresholds, outcomes, mechanics });
    const saved = resolvedRolls.get(current.uuid);
    const rolled = saved?.planId === plan.id && saved.ruleFingerprint === ruleFingerprint
      ? saved.rolled
      : await sleepEffects(current, evaluation, thresholds, outcomes, mechanics);
    // Preserve rolled outcomes on transient document failures, so a retry is not a free reroll.
    resolvedRolls.set(current.uuid, { planId: plan.id, ruleFingerprint, rolled });
    // An administrator can replace a plan while a roll is in progress; never consume its successor.
    if (getPlan(current)?.id !== plan.id) {
      resolvedRolls.delete(current.uuid);
      return { status: "stale-plan" };
    }
    evaluation.effects = rolled.effects;
    const changes = calculateUpdates({
      exhaustion: current.system?.attributes?.exhaustion,
      tempHp: current.system?.attributes?.hp?.temp
    }, evaluation, game.settings.get(MODULE_ID, "exhaustionCap"));
    const lastResult = {
      schema: PLAN_VERSION,
      planId: plan.id,
      score: evaluation.score,
      tier: evaluation.tier,
      appliedAt: Date.now(),
      appliedBy: game.user.id,
      changes,
      save: rolled.save,
      hpRoll: rolled.hpRoll
    };
    const update = {
      [`flags.${MODULE_ID}.pendingPlan`]: null,
      [`flags.${MODULE_ID}.lastResult`]: lastResult
    };
    if (changes.actual.exhaustion > 0) update["system.attributes.exhaustion"] = changes.next.exhaustion;
    if (changes.actual.tempHp > 0) update["system.attributes.hp.temp"] = changes.next.tempHp;
    // One document update bundles effect changes and replay ledger.
    await current.update(update);
    resolvedRolls.delete(current.uuid);
    try {
      await postChat(current, evaluation, changes, rolled);
    } catch (error) {
      // A chat failure cannot cause a second exhaustion or HP application.
      console.warn(`${MODULE_ID} | Sleep applied, but notification failed`, error);
      ui.notifications.warn(i18n("Errors.ChatFailed"));
    }
    return { status: "applied", evaluation, changes };
  } catch (error) {
    console.error(`${MODULE_ID} | Sleep consequences were not applied`, error);
    ui.notifications.error(i18n("Errors.ApplyFailed"));
    return { status: "failed", error };
  } finally {
    activeUpdates.delete(current.uuid);
  }
}

export async function onRestCompleted(actor, result, config) {
  if (!actor?.uuid) return;
  const started = inProgress.get(actor.uuid);
  inProgress.delete(actor.uuid);
  if (!started || wasShortRest(result, config) || Date.now() - started.started > 20 * 60_000) {
    discardArmorRest(actor);
    return;
  }
  // Capture the post-system-rest exhaustion before applying any sleep-quality house rules.
  const restExhaustion = Number(actor.system?.attributes?.exhaustion) || 0;
  let sleepResult;
  if (started.unplanned) {
    const action = game.settings.get(MODULE_ID, "unplannedRestAction") ?? "notice";
    if (action !== "off" && (game.user.isGM || actor.isOwner)) {
      ui.notifications.info(i18n("Dashboard.NoPlanNotice"));
      if (action === "dashboard" && game.user.isGM) {
        try { game.modules?.get(MODULE_ID)?.api?.openDashboard?.(); }
        catch (error) { console.warn(`${MODULE_ID} | Dashboard launch after rest failed`, error); }
      }
    }
    sleepResult = { status: "unplanned" };
  } else {
    const plan = actor.getFlag(MODULE_ID, "pendingPlan");
    if (plan?.id === started.id) sleepResult = await applyPending(actor, { fromRest: true });
  }
  // Equipped armor is evaluated whether or not the GM queued sleeping conditions.
  const armorResult = await applyArmorRest(actor, restExhaustion);
  return { ...sleepResult, armorResult };
}

export function resetRuntimeState() {
  inProgress.clear();
  activeUpdates.clear();
  resolvedRolls.clear();
  resetArmorRuntimeState();
}
