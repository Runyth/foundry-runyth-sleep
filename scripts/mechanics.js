// Pure, validated house-rule profiles; Foundry dice rolls are handled by engine.js.
import { DEFAULT_THRESHOLDS, TIERS } from "./domain.js";

export const ABILITIES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
export const DIE_FACES = Object.freeze([4, 6, 8, 10, 12, 20]);

function profile(dc, enabled, hpMode, diceFaces, hpAbilityMultiplier) {
  return {
    save: {
      enabled, test: "save", ability: "con", dc, qualityStep: 2, qualityGain: 1,
      exhaustionGain: 0, levelStep: 0, levelGain: 0, abilityMultiplier: 0,
      proficiencyMultiplier: 0, modifier: 0, minDC: 5, maxDC: 30,
      rollMode: "normal", success: "negate", reduction: 1
    },
    hp: {
      mode: hpMode, diceCount: hpMode === "dice" ? 1 : 0, diceFaces,
      flat: 0, ability: "con", abilityMultiplier: hpAbilityMultiplier,
      proficiencyMultiplier: 0, levelStep: 0, levelGain: 0, minimum: 0, maximum: 100
    }
  };
}

export const DEFAULT_MECHANICS = Object.freeze({
  miserable: profile(15, true, "none", 4, 0),
  poor: profile(12, true, "none", 4, 0),
  ordinary: profile(10, false, "fixed", 4, 0),
  comfortable: profile(10, false, "dice", 4, 1),
  excellent: profile(10, false, "dice", 6, 2)
});

function whole(value, min, max, field) {
  if (value === null || value === "" || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw new RangeError(`Invalid ${field}; expected an integer from ${min} to ${max}.`);
  }
  return Number(value);
}

function oneOf(value, options, field) {
  if (!options.includes(value)) throw new RangeError(`Invalid ${field}.`);
  return value;
}

export function sanitizeMechanics(input = DEFAULT_MECHANICS) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid mechanics configuration.");
  return Object.fromEntries(TIERS.map(tier => {
    const entry = input[tier];
    if (!entry || typeof entry !== "object") throw new TypeError(`Missing ${tier} mechanics.`);
    const save = entry.save;
    const hp = entry.hp;
    if (!save || !hp || typeof save !== "object" || typeof hp !== "object") throw new TypeError(`Missing ${tier} save or HP rules.`);
    if (typeof save.enabled !== "boolean") throw new TypeError(`Invalid ${tier} save enabled toggle.`);
    const validated = {
      save: {
        enabled: save.enabled,
        test: oneOf(save.test, ["save", "check"], `${tier}.test`),
        ability: oneOf(save.ability, ABILITIES, `${tier}.ability`),
        dc: whole(save.dc, 0, 40, `${tier}.dc`),
        qualityStep: whole(save.qualityStep, 0, 20, `${tier}.qualityStep`),
        qualityGain: whole(save.qualityGain, -10, 10, `${tier}.qualityGain`),
        exhaustionGain: whole(save.exhaustionGain, -10, 10, `${tier}.exhaustionGain`),
        levelStep: whole(save.levelStep, 0, 20, `${tier}.levelStep`),
        levelGain: whole(save.levelGain, -10, 10, `${tier}.levelGain`),
        abilityMultiplier: whole(save.abilityMultiplier, -5, 5, `${tier}.abilityMultiplier`),
        proficiencyMultiplier: whole(save.proficiencyMultiplier, -5, 5, `${tier}.proficiencyMultiplier`),
        modifier: whole(save.modifier, -20, 20, `${tier}.modifier`),
        minDC: whole(save.minDC, 0, 40, `${tier}.minDC`),
        maxDC: whole(save.maxDC, 0, 40, `${tier}.maxDC`),
        rollMode: oneOf(save.rollMode, ["normal", "advantage", "disadvantage"], `${tier}.rollMode`),
        success: oneOf(save.success, ["negate", "half", "reduce", "unchanged"], `${tier}.success`),
        reduction: whole(save.reduction, 0, 6, `${tier}.reduction`)
      },
      hp: {
        mode: oneOf(hp.mode, ["none", "fixed", "dice"], `${tier}.hp.mode`),
        diceCount: whole(hp.diceCount, 0, 10, `${tier}.hp.diceCount`),
        diceFaces: whole(hp.diceFaces, 4, 20, `${tier}.hp.diceFaces`),
        flat: whole(hp.flat, -100, 100, `${tier}.hp.flat`),
        ability: oneOf(hp.ability, ABILITIES, `${tier}.hp.ability`),
        abilityMultiplier: whole(hp.abilityMultiplier, -10, 10, `${tier}.hp.abilityMultiplier`),
        proficiencyMultiplier: whole(hp.proficiencyMultiplier, -10, 10, `${tier}.hp.proficiencyMultiplier`),
        levelStep: whole(hp.levelStep, 0, 20, `${tier}.hp.levelStep`),
        levelGain: whole(hp.levelGain, -20, 20, `${tier}.hp.levelGain`),
        minimum: whole(hp.minimum, 0, 100, `${tier}.hp.minimum`),
        maximum: whole(hp.maximum, 0, 100, `${tier}.hp.maximum`)
      }
    };
    if (validated.save.minDC > validated.save.maxDC) throw new RangeError(`Invalid ${tier} DC bounds.`);
    if (validated.hp.minimum > validated.hp.maximum) throw new RangeError(`Invalid ${tier} HP bounds.`);
    if (!DIE_FACES.includes(validated.hp.diceFaces)) throw new RangeError(`Unsupported ${tier} HP die.`);
    if (validated.hp.mode === "dice" && !validated.hp.diceCount) throw new RangeError(`Dice mode needs dice for ${tier}.`);
    return [tier, validated];
  }));
}

function actorStatistic(actor, ability) {
  const mod = Number(actor?.system?.abilities?.[ability]?.mod);
  return Number.isFinite(mod) ? Math.trunc(mod) : 0;
}

function actorLevel(actor) {
  const level = Number(actor?.system?.details?.level);
  return Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
}

function proficiency(actor) {
  const value = Number(actor?.system?.attributes?.prof);
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

export function calculateDC(save, actor, quality, tier, thresholds = DEFAULT_THRESHOLDS) {
  const anchor = tier === "miserable" ? thresholds.miserable : tier === "poor" ? thresholds.poor : 0;
  const deficit = Math.max(0, anchor - quality);
  const scaling = save.qualityStep ? Math.floor(deficit / save.qualityStep) * save.qualityGain : 0;
  const levelScaling = save.levelStep ? Math.floor((actorLevel(actor) - 1) / save.levelStep) * save.levelGain : 0;
  const exhausted = Math.max(0, Number(actor?.system?.attributes?.exhaustion) || 0);
  const dc = save.dc + scaling + levelScaling + exhausted * save.exhaustionGain +
    actorStatistic(actor, save.ability) * save.abilityMultiplier + proficiency(actor) * save.proficiencyMultiplier + save.modifier;
  return Math.max(save.minDC, Math.min(save.maxDC, Math.round(dc)));
}

export function exhaustionAfterSave(base, save, succeeded) {
  if (!succeeded) return base;
  if (save.success === "negate") return 0;
  if (save.success === "half") return Math.floor(base / 2);
  if (save.success === "reduce") return Math.max(0, base - save.reduction);
  return base;
}

export function hpFormula(hp, actor) {
  const dice = hp.mode === "dice" ? `${hp.diceCount}d${hp.diceFaces}` : "0";
  const other = hp.flat + actorStatistic(actor, hp.ability) * hp.abilityMultiplier +
    proficiency(actor) * hp.proficiencyMultiplier +
    (hp.levelStep ? Math.floor((actorLevel(actor) - 1) / hp.levelStep) * hp.levelGain : 0);
  return `${dice} ${other < 0 ? "-" : "+"} ${Math.abs(other)}`;
}

export function hpFromRoll(hp, oldMinimum, total) {
  if (hp.mode === "none") return 0;
  if (!Number.isFinite(total)) throw new TypeError("Invalid temporary HP roll.");
  // Old v1.0.x configured temp HP remains a floor, so migrations do not silently nerf benefits.
  return Math.max(hp.minimum, Math.min(hp.maximum, Math.max(0, oldMinimum, Math.floor(total))));
}

export function descriptionFor(tier, mechanics, outcomes, actor, score, thresholds, words = {}) {
  const language = {
    save: "save", check: "check", dc: "DC", noSave: "No saving throw",
    tempHp: "temp HP", minimum: "minimum", noHp: "No temp HP",
    modifiers: "modifiers", ...words
  };
  const { save, hp } = mechanics[tier];
  const saveText = save.enabled && outcomes[tier].exhaustion > 0
    ? `${save.ability.toUpperCase()} ${language[save.test]} ${language.dc} ${calculateDC(save, actor, score, tier, thresholds)} (${save.success})`
    : language.noSave;
  const benefit = hp.mode === "dice" ? `${hpFormula(hp, actor)} ${language.tempHp} (${language.minimum} ${outcomes[tier].tempHp})`
    : hp.mode === "fixed" ? `${outcomes[tier].tempHp} + ${language.modifiers} ${language.tempHp}` : language.noHp;
  return `${saveText}; ${benefit}`;
}
