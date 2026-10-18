// Homebrew spells from the Spell Maker. Each is saved as a simple form and
// turned into a 5e.tools-shaped spell, so it shows up everywhere a spell can:
// class spell lists, cards and note links, and casting (slots, attack or
// save, damage or healing with upcasting and cantrip scaling).
// Saved for the whole app in homebrew-spells.json next to the data cache.

import { BaseDirectory, exists, readTextFile, writeTextFile } from "./fsapi.ts";
import type { Entry } from "./types.ts";

export const HOMEBREW_SOURCE = "Homebrew";

export interface HomebrewSpell {
  id: string;
  name: string;
  /** 0 = cantrip. */
  level: number;
  /** School code: A abjuration, C conjuration, D divination, E enchantment, V evocation, I illusion, N necromancy, T transmutation. */
  school: string;
  time: { number: number; unit: "action" | "bonus" | "reaction" | "minute" | "hour" };
  range: { kind: "feet" | "self" | "touch" | "sight" | "unlimited"; feet?: number };
  components: { v: boolean; s: boolean; m?: string };
  duration: { kind: "instant" | "round" | "minute" | "hour" | "day" | "permanent"; amount?: number; concentration: boolean };
  ritual: boolean;
  /** How it hits: a spell attack, a saving throw, or neither. */
  attack?: "melee" | "ranged";
  save?: "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
  /** Damage (or healing) dice and type. */
  effect?: { kind: "damage" | "healing"; dice: string; type?: string; addMod?: boolean };
  /** Extra dice for each slot level above the spell's (leveled spells). */
  upcast?: string;
  /** Cantrips: dice grow at 5th, 11th and 17th level. */
  scales?: boolean;
  /** Classes whose spell list it's on ("Wizard", "Cleric"…; PHB classes). */
  classes: string[];
  description: string;
}

export const blankSpell = (id: string): HomebrewSpell => ({
  id,
  name: "",
  level: 1,
  school: "V",
  time: { number: 1, unit: "action" },
  range: { kind: "feet", feet: 60 },
  components: { v: true, s: true },
  duration: { kind: "instant", concentration: false },
  ritual: false,
  classes: [],
  description: "",
});

const dicePattern = /^\d*d\d+$/;
const mulDice = (dice: string, n: number) => {
  const m = dice.match(/^(\d*)d(\d+)$/);
  return m ? `${Number(m[1] || 1) * n}d${m[2]}` : dice;
};

/** The spell in 5e.tools format. */
export function spellData(s: HomebrewSpell): any {
  const raw: any = {
    name: s.name.trim() || "Unnamed spell",
    source: HOMEBREW_SOURCE,
    level: s.level,
    school: s.school,
    time: [{ number: s.time.number || 1, unit: s.time.unit }],
    range:
      s.range.kind === "feet"
        ? { type: "point", distance: { type: "feet", amount: s.range.feet ?? 30 } }
        : { type: "point", distance: { type: s.range.kind } },
    components: { ...(s.components.v ? { v: true } : {}), ...(s.components.s ? { s: true } : {}), ...(s.components.m?.trim() ? { m: s.components.m.trim() } : {}) },
    duration:
      s.duration.kind === "instant"
        ? [{ type: "instant" }]
        : s.duration.kind === "permanent"
          ? [{ type: "permanent", ends: ["dispel"] }]
          : [{ type: "timed", duration: { type: s.duration.kind, amount: s.duration.amount || 1 }, ...(s.duration.concentration ? { concentration: true } : {}) }],
    entries: [] as any[],
    homebrew: true,
  };
  if (s.ritual) raw.meta = { ritual: true };
  if (s.attack) raw.spellAttack = [s.attack === "melee" ? "M" : "R"];
  if (s.save) raw.savingThrow = [s.save];

  const desc = s.description.trim();
  if (desc) raw.entries.push(...desc.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean));
  // The dice line casting reads: {@damage 2d6} fire damage, or {@dice 1d8} healing.
  const e = s.effect;
  const dice = e?.dice.replace(/\s+/g, "") ?? "";
  if (e && dicePattern.test(dice)) {
    const mod = e.addMod ? " + your spellcasting ability modifier" : "";
    if (e.kind === "healing") {
      raw.miscTags = ["HL"];
      raw.entries.push(`The target regains hit points equal to {@dice ${dice}}${mod}.`);
    } else {
      if (e.type) raw.damageInflict = [e.type.toLowerCase()];
      raw.entries.push(`On a hit or failed save: {@damage ${dice}}${mod} ${e.type?.toLowerCase() ?? ""} damage.`.replace(/\s+\./, "."));
    }
    if (s.level > 0 && s.upcast && dicePattern.test(s.upcast.replace(/\s+/g, ""))) {
      const per = s.upcast.replace(/\s+/g, "");
      const tag = e.kind === "healing" ? "scaledice" : "scaledamage";
      raw.entriesHigherLevel = [
        { type: "entries", name: "At Higher Levels", entries: [`When you cast this spell using a spell slot of ${ord(s.level + 1)} level or higher, it increases by {@${tag} ${dice}|${s.level}-9|${per}} for each slot level above ${ord(s.level)}.`] },
      ];
    }
    if (s.level === 0 && s.scales) {
      raw.scalingLevelDice = { label: `${e.type ?? ""} damage`.trim(), scaling: { 1: dice, 5: mulDice(dice, 2), 11: mulDice(dice, 3), 17: mulDice(dice, 4) } };
      raw.entries.push(`This spell's damage increases by one die when you reach 5th level, 11th level and 17th level.`);
    }
  }
  if (!raw.entries.length) raw.entries.push("No description.");
  return raw;
}

const ord = (n: number) => ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"][n] ?? `${n}th`;

export const spellEntry = (s: HomebrewSpell): Entry => ({ kind: "spell", name: s.name.trim() || "Unnamed spell", source: HOMEBREW_SOURCE, raw: spellData(s) }) as Entry;

/** The class lists, shaped like 5e.tools' spells/sources.json, for the character rules. */
export function spellSources(list: HomebrewSpell[]): any {
  const out: Record<string, any> = {};
  for (const s of list) {
    if (s.classes.length) out[s.name.trim() || "Unnamed spell"] = { class: s.classes.map((name) => ({ name, source: "PHB" })) };
  }
  return { [HOMEBREW_SOURCE]: out };
}

// ---------- saving ----------

const FILE = "homebrew-spells.json";
const APP = { baseDir: BaseDirectory.AppData };

export async function loadHomebrewSpells(): Promise<HomebrewSpell[]> {
  try {
    if (!(await exists(FILE, APP))) return [];
    const raw = JSON.parse(await readTextFile(FILE, APP));
    return Array.isArray(raw?.spells) ? raw.spells : [];
  } catch {
    return [];
  }
}

export async function saveHomebrewSpells(list: HomebrewSpell[]): Promise<void> {
  await writeTextFile(FILE, JSON.stringify({ version: 1, spells: list }, null, 2), APP);
}
