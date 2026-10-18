// What conditions (and exhaustion, and a few effects like Raging) do to your
// rolls, under the 2014 rules: rolls the sheet makes get advantage or
// disadvantage on their own, with the reason in the roll log, and saves that
// automatically fail say so. Reminders list what each condition means.

import type { Ability, Character } from "./types.ts";

/** What kind of d20 roll is being made. */
export interface RollKind {
  kind: "attack" | "check" | "save" | "death" | "initiative";
  ability?: Ability;
  /** Melee or ranged attack (Prone and Raging care). */
  range?: "melee" | "ranged";
}

export interface RollMods {
  adv: string[];
  dis: string[];
  autoFail: string[];
}

/** One-line reminders of what each condition does, for the sheet. */
export const CONDITION_REMINDERS: Record<string, string[]> = {
  Blinded: ["Can't see: fails checks that need sight", "Disadvantage on your attacks", "Attacks against you have advantage"],
  Charmed: ["Can't attack the charmer or target it with harmful effects", "The charmer has advantage on social checks with you"],
  Deafened: ["Can't hear: fails checks that need hearing"],
  Frightened: ["Disadvantage on checks and attacks while you can see the source", "Can't move closer to the source"],
  Grappled: ["Speed 0"],
  Incapacitated: ["No actions or reactions"],
  Invisible: ["Advantage on your attacks", "Attacks against you have disadvantage", "Hidden for hiding purposes"],
  Paralyzed: ["Incapacitated, can't move or speak", "Fails Strength and Dexterity saves", "Attacks against you have advantage; hits within 5 ft. are crits"],
  Petrified: ["Incapacitated, can't move or speak", "Fails Strength and Dexterity saves", "Resistance to all damage; immune to poison and disease", "Attacks against you have advantage"],
  Poisoned: ["Disadvantage on attacks and ability checks"],
  Prone: ["Disadvantage on your attacks", "Melee attacks within 5 ft. against you have advantage; ranged ones disadvantage", "Standing up costs half your speed"],
  Restrained: ["Speed 0", "Disadvantage on your attacks and Dexterity saves", "Attacks against you have advantage"],
  Stunned: ["Incapacitated, can't move, can barely speak", "Fails Strength and Dexterity saves", "Attacks against you have advantage"],
  Unconscious: ["Incapacitated, drops what it holds, falls prone", "Fails Strength and Dexterity saves", "Attacks against you have advantage; hits within 5 ft. are crits"],
  Concentrating: ["Damage means a Constitution save (DC 10 or half the damage)"],
};

export const EXHAUSTION_REMINDERS = [
  "Disadvantage on ability checks",
  "Speed halved",
  "Disadvantage on attacks and saving throws",
  "Hit point maximum halved",
  "Speed 0",
  "Death",
];

const FAILS_STR_DEX = ["Paralyzed", "Petrified", "Stunned", "Unconscious"];

/** Advantage, disadvantage and automatic failures from the character's conditions and effects. */
export function rollMods(ch: Character, r: RollKind): RollMods {
  const has = (c: string) => ch.state.conditions.some((x) => x.toLowerCase() === c.toLowerCase());
  const active = (n: string) => (ch.state.active ?? []).some((x) => x.name === n);
  const ex = ch.state.exhaustion;
  const out: RollMods = { adv: [], dis: [], autoFail: [] };
  if (r.kind === "attack") {
    for (const c of ["Blinded", "Frightened", "Poisoned", "Prone", "Restrained"]) if (has(c)) out.dis.push(c);
    if (has("Invisible")) out.adv.push("Invisible");
    if (ex >= 3) out.dis.push(`Exhaustion ${ex}`);
    if (active("Reckless") && r.range !== "ranged") out.adv.push("Reckless Attack");
  }
  if (r.kind === "check" || r.kind === "initiative") {
    for (const c of ["Frightened", "Poisoned"]) if (has(c)) out.dis.push(c);
    if (ex >= 1) out.dis.push(`Exhaustion ${ex}`);
    if (active("Raging") && r.ability === "str") out.adv.push("Raging");
  }
  if (r.kind === "save" || r.kind === "death") {
    if (ex >= 3) out.dis.push(`Exhaustion ${ex}`);
  }
  if (r.kind === "save") {
    if (r.ability === "dex" && has("Restrained")) out.dis.push("Restrained");
    if (r.ability === "str" || r.ability === "dex") for (const c of FAILS_STR_DEX) if (has(c)) out.autoFail.push(c);
    if (active("Raging") && r.ability === "str") out.adv.push("Raging");
  }
  return out;
}

/**
 * Apply them to a d20 roll. The roll may already have advantage ("2d20kh1…",
 * Shift-click) or disadvantage ("2d20kl1…"); one of each cancels out, as in the rules.
 */
export function applyRollMods(expr: string, label: string, m: RollMods): { expr: string; label: string } {
  const head = expr.match(/^\s*(1?d20|2d20k([hl])1)/i);
  if (!head || (!m.adv.length && !m.dis.length && !m.autoFail.length)) return { expr, label };
  const rest = expr.slice(head[0].length);
  const userAdv = head[2]?.toLowerCase() === "h";
  const userDis = head[2]?.toLowerCase() === "l";
  const adv = userAdv || m.adv.length > 0;
  const dis = userDis || m.dis.length > 0;
  const die = adv && !dis ? "2d20kh1" : dis && !adv ? "2d20kl1" : "1d20";
  const notes: string[] = [];
  if (m.adv.length) notes.push(`advantage: ${m.adv.join(", ")}`);
  if (m.dis.length) notes.push(`disadvantage: ${m.dis.join(", ")}`);
  if (adv && dis) notes.push("they cancel out");
  if (m.autoFail.length) notes.push(`automatically fails (${m.autoFail.join(", ")})`);
  // The user's own "(advantage)" in the label would now be wrong when it's cancelled.
  const base = adv && dis ? label.replace(/ \((advantage|disadvantage)\)$/, "") : label;
  return { expr: die + rest, label: `${base} · ${notes.join(" · ")}` };
}
