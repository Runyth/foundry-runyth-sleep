import { readRules } from "./rules-store.js";
import { MODULE_ID } from "./domain.js";
import {
  armorExhaustion, armorOutcome, armorProfile, hitDiceTarget, takeRestSnapshot, DEFAULT_ARMOR_RULES
} from "./armor.js";

const pending = new Map();
const busy = new Set();
const i18n = key => game.i18n.localize(`RUNYTH_SLEEP.Armor.${key}`);

function rollResult(input) {
  const raw = Array.isArray(input) ? input[0] : input?.roll ?? input?.rolls?.[0] ?? input;
  const value = Number(raw?.total);
  if (!Number.isFinite(value)) throw new Error("Armor saving throw was canceled or invalid.");
  return value;
}

export function rememberArmorRest(actor) {
  if (actor?.type !== "character" || !actor.uuid) return;
  const rules = readRules().armorRules;
  const snapshot = takeRestSnapshot(actor);
  let profile;
  try { profile = armorProfile(rules, snapshot.category); }
  catch (error) {
    // Corrupt world settings must never block Foundry's native Long Rest.
    console.error(`${MODULE_ID} | Invalid armor rules ignored`, error);
    profile = null;
  }
  pending.set(actor.uuid, {
    id: foundry.utils.randomID(), ...snapshot, profile, mode: rules?.mode ?? "core2024", started: Date.now(), rolled: null
  });
}

export function discardArmorRest(actor) {
  if (actor?.uuid) pending.delete(actor.uuid);
}

async function determineOutcome(actor, entry) {
  if (entry.rolled) return entry.rolled;
  const save = entry.profile.save;
  let result = null;
  let passed = false;
  if (save.enabled) {
    if (typeof actor.rollSavingThrow !== "function") throw new Error("D&D 5e saving throw API unavailable.");
    const raw = await actor.rollSavingThrow({
      ability: save.ability, target: save.dc,
      ...(save.rollMode === "advantage" ? { advantage: true } : {}),
      ...(save.rollMode === "disadvantage" ? { disadvantage: true } : {})
    }, { configure: false }, { create: false });
    const total = rollResult(raw);
    passed = total >= save.dc;
    result = { ability: save.ability, dc: save.dc, total, passed, rollMode: save.rollMode };
  }
  entry.rolled = { save: result, effect: armorOutcome(entry.profile, passed) };
  return entry.rolled;
}

async function chatResult(actor, entry, rolled, before, after, updatedDice) {
  const visibility = game.settings.get(MODULE_ID, "chatVisibility");
  if (visibility === "off") return;
  const escaped = value => String(value).replace(/[&<>"']/g, symbol => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[symbol]);
  const mode = entry.mode;
  const saved = rolled.save ? `${rolled.save.ability.toUpperCase()} ${rolled.save.total} / DC ${rolled.save.dc} (${rolled.save.passed ? i18n("Passed") : i18n("Failed")})` : i18n("NoSave");
  const content = `<div class="runyth-sleep-chat"><h3>${escaped(i18n("Title"))}</h3><p><strong>${escaped(actor.name)}</strong>: ${escaped(i18n(`Category.${entry.category}`))} (${escaped(i18n(`Preset.${mode}`))})</p><p>${escaped(saved)}</p><p>${escaped(i18n("Exhaustion"))}: ${before} → ${after}; ${escaped(i18n("HitDice"))}: ${updatedDice}</p></div>`;
  const whisper = visibility === "gm" ? ChatMessage.getWhisperRecipients("GM").map(user => user.id) : undefined;
  await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }), ...(whisper ? { whisper } : {}) });
}

// Never fire for a canceled/short rest. Failures retain the snapshot and rolled save
// for a same-session GM retry. Actor-attribute changes are idempotent via a phase flag.
export async function applyArmorRest(actor, restExhaustion = null) {
  const entry = pending.get(actor?.uuid);
  if (!entry || !entry.profile) {
    if (entry) pending.delete(actor.uuid);
    return { status: "no-effect" };
  }
  if (!game.user?.isGM && !actor.isOwner) return { status: "unauthorized" };
  if (busy.has(actor.uuid)) return { status: "busy" };
  busy.add(actor.uuid);
  try {
    if (Date.now() - entry.started > 20 * 60_000) {
      pending.delete(actor.uuid);
      return { status: "expired" };
    }
    const rolled = await determineOutcome(actor, entry);
    const target = hitDiceTarget(entry.hitDice, rolled.effect.hitDicePercent);
    const previous = actor.getFlag(MODULE_ID, "lastArmorRest");
    const phase = previous?.restId === entry.id ? previous.phase : null;
    const postRestExhaustion = entry.postRestExhaustion ??= Number.isFinite(Number(restExhaustion))
      ? Number(restExhaustion) : Number(actor.system?.attributes?.exhaustion) || 0;
    const currentExhaustion = Number(actor.system?.attributes?.exhaustion) || 0;
    const cap = game.settings.get(MODULE_ID, "exhaustionCap") ?? 5;
    const nextExhaustion = armorExhaustion(currentExhaustion, entry.exhaustion,
      postRestExhaustion, rolled.effect, cap);
    if (!phase) {
      const update = { [`flags.${MODULE_ID}.lastArmorRest`]: {
        restId: entry.id, phase: target.length ? "attributes" : "complete",
        category: entry.category, save: rolled.save, effect: rolled.effect, at: Date.now()
      } };
      if (nextExhaustion !== currentExhaustion) update["system.attributes.exhaustion"] = nextExhaustion;
      await actor.update(update);
    }
    if (target.length && phase !== "complete") {
      const changes = target.filter(item => {
        const actual = actor.items.get?.(item.id) ?? [...actor.items].find(doc => doc.id === item.id);
        if (!actual) throw new Error(`A class item disappeared during armored rest: ${item.id}`);
        return Number(actual.system?.hd?.spent) !== item.spent;
      }).map(item => ({ _id: item.id, "system.hd.spent": item.spent }));
      if (changes.length) {
        if (typeof actor.updateEmbeddedDocuments !== "function") throw new Error("Embedded class-item API unavailable.");
        await actor.updateEmbeddedDocuments("Item", changes);
      }
      await actor.update({ [`flags.${MODULE_ID}.lastArmorRest`]: {
        restId: entry.id, phase: "complete", category: entry.category,
        save: rolled.save, effect: rolled.effect, at: Date.now()
      } });
    }
    pending.delete(actor.uuid);
    try { await chatResult(actor, entry, rolled, postRestExhaustion, Number(actor.system?.attributes?.exhaustion) || 0, target.length); }
    catch (error) { console.warn(`${MODULE_ID} | Armor rest applied, chat failed`, error); }
    return { status: "applied", category: entry.category, save: rolled.save };
  } catch (error) {
    console.error(`${MODULE_ID} | Armor rest consequence failed`, error);
    ui.notifications.error(i18n("ApplyFailed"));
    return { status: "failed", error };
  } finally {
    busy.delete(actor.uuid);
  }
}

// Recovery is explicitly GM-authorized: players cannot invoke the administrative retry.
export function retryArmorRest(actor) {
  if (!game.user?.isGM) throw new Error("GM permission required for armor rest recovery.");
  return applyArmorRest(actor);
}

export function resetArmorRuntimeState() {
  pending.clear();
  busy.clear();
}
