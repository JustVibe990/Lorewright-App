// Spell casting maths from 5e.tools spell data: attack or save, damage or
// healing dice (with upcasting and cantrip scaling), concentration, ritual,
// and which slots can pay for a cast.

const ABILITY_OF_SAVE: Record<string, string> = {
  strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha",
};

export interface CastInfo {
  level: number;
  attack: "melee" | "ranged" | null;
  /** Saving throw abilities ("dex"), if the spell forces a save. */
  save: string[];
  /** Damage dice at this cast level, with the spell modifier added when the text says so. */
  damage: string | null;
  damageTypes: string[];
  /** Healing dice (healing spells). */
  heal: string | null;
  concentration: boolean;
  ritual: boolean;
}

/** All strings in an entries tree, in order. */
function strings(x: any, out: string[] = []): string[] {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) x.forEach((y) => strings(y, out));
  else if (x && typeof x === "object") Object.values(x).forEach((y) => strings(y, out));
  return out;
}

/** "8d6" + "2d6" → "10d6"; different dice are added: "8d6+1d8". */
function addDice(base: string, extra: string): string {
  const a = base.match(/^(\d*)d(\d+)(.*)$/);
  const b = extra.match(/^(\d*)d(\d+)$/);
  if (a && b && a[2] === b[2]) return `${Number(a[1] || 1) + Number(b[1] || 1)}d${a[2]}${a[3]}`;
  return `${base}+${extra}`;
}

const mult = (dice: string, n: number) => {
  const m = dice.match(/^(\d*)d(\d+)$/);
  return m ? `${Number(m[1] || 1) * n}d${m[2]}` : dice;
};

/** "3-9" → [3..9]; "2,4,6,8" → [2,4,6,8]. */
function scaleLevels(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const [a, b] = part.split("-").map((x) => Number(x.trim()));
    if (Number.isNaN(a)) continue;
    for (let l = a; l <= (Number.isNaN(b) || b == null ? a : b); l++) out.push(l);
  }
  return out;
}

const withMod = (dice: string, mod: number) => (mod ? `${dice}${mod > 0 ? "+" : ""}${mod}` : dice);

/**
 * How a spell plays out when cast at `castLevel`, for a character of
 * `characterLevel` with spellcasting modifier `spellMod`.
 */
export function castInfo(spell: any, castLevel: number, characterLevel: number, spellMod: number): CastInfo {
  const level = Number(spell?.level ?? 0);
  const texts = strings(spell?.entries ?? []);
  const healing = (spell?.miscTags ?? []).includes("HL");
  const info: CastInfo = {
    level,
    attack: spell?.spellAttack?.includes("M") ? "melee" : spell?.spellAttack?.length ? "ranged" : null,
    save: (spell?.savingThrow ?? []).map((s: string) => ABILITY_OF_SAVE[s] ?? s),
    damage: null,
    damageTypes: spell?.damageInflict ?? [],
    heal: null,
    concentration: (spell?.duration ?? []).some((d: any) => d?.concentration),
    ritual: !!spell?.meta?.ritual,
  };

  // The first damage (or, for healing spells, dice) tag in the rules text.
  const tag = healing ? /\{@(?:dice|damage) ([^}|]+)/ : /\{@damage ([^}|]+)/;
  let text = "";
  let dice: string | null = null;
  for (const t of texts) {
    const m = t.match(tag);
    if (m) {
      dice = m[1].replace(/\s+/g, "");
      text = t;
      break;
    }
  }
  if (!dice) return info;

  // Cantrips grow with character level.
  if (level === 0 && spell?.scalingLevelDice) {
    const sc = Array.isArray(spell.scalingLevelDice) ? spell.scalingLevelDice[0] : spell.scalingLevelDice;
    let best: string | null = null;
    for (const [lvl, d] of Object.entries<string>(sc?.scaling ?? {})) if (Number(lvl) <= characterLevel) best = d;
    if (best) dice = best.replace(/\s+/g, "");
  }

  // Upcasting: {@scaledamage 8d6|3-9|1d6} adds 1d6 for each slot level from 4th
  // to 9th; {@scaledamage 1d8|2,4,6,8|1d8} adds 1d8 at 4th, 6th and 8th only.
  if (castLevel > level && level > 0) {
    const scale = strings(spell?.entriesHigherLevel ?? []).join(" ").match(/\{@scale(?:damage|dice) [^|}]+\|([^|}]+)\|([^|}]+)\}/);
    if (scale) {
      const per = scale[2].replace(/\s+/g, "");
      const steps = scaleLevels(scale[1]).filter((l) => l > level && l <= castLevel).length;
      if (/^\d*d\d+$/.test(per) && steps) dice = addDice(dice, mult(per, steps));
    }
  }

  // "…+ your spellcasting ability modifier" (Cure Wounds, Spiritual Weapon).
  const result = /spellcasting ability modifier/i.test(text) && !/[+-]\d+$/.test(dice) ? withMod(dice, spellMod) : dice;
  if (healing) info.heal = result;
  else info.damage = result;
  return info;
}

export interface SlotOption {
  id: string;
  label: string;
  /** Level the spell is cast at. */
  level: number;
  kind: "slot" | "pact" | "ritual" | "free" | "cantrip" | "item";
  /** Slot level index to spend (0 = 1st), for kind "slot". */
  slotIndex?: number;
}

/** Ways to pay for a spell: a slot of its level or higher, a pact slot, a ritual, or free. */
export function slotOptions(
  spellLevel: number,
  slots: number[],
  slotsUsed: number[],
  pact: { slots: number; level: number } | null,
  pactUsed: number,
  opts: { ritual?: boolean; free?: string } = {},
): SlotOption[] {
  if (spellLevel === 0) return [{ id: "cantrip", label: "Cantrip (no slot)", level: 0, kind: "cantrip" }];
  const out: SlotOption[] = [];
  const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
  for (let i = spellLevel - 1; i < slots.length; i++) {
    const left = (slots[i] ?? 0) - (slotsUsed[i] ?? 0);
    if (left > 0) out.push({ id: `slot${i + 1}`, label: `${ORD[i]}-level slot (${left} left)`, level: i + 1, kind: "slot", slotIndex: i });
  }
  if (pact && pact.level >= spellLevel && pact.slots - pactUsed > 0) {
    out.push({ id: "pact", label: `Pact slot, ${ORD[pact.level - 1]} level (${pact.slots - pactUsed} left)`, level: pact.level, kind: "pact" });
  }
  if (opts.ritual) out.push({ id: "ritual", label: "As a ritual (no slot, +10 minutes)", level: spellLevel, kind: "ritual" });
  if (opts.free) out.push({ id: "free", label: opts.free, level: spellLevel, kind: "free" });
  return out;
}
