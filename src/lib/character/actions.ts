// Features you use at the table: what they cost (an action, a bonus action,
// a reaction, and a use of Rage, Ki, Channel Divinity…), and what using one
// does: heal (Second Wind), switch on an effect (Raging, Dodging, Hexblade's
// Curse) or start concentration. Well-known features have their effect
// spelled out; any other feature whose text says "as a bonus action…" is
// listed too, and spends a matching resource if it has one.

import type { Character, Sheet } from "./types.ts";

export type ActionTime = "action" | "bonus" | "reaction" | "free";

export interface FeatureAction {
  /** The feature's name, also its id. */
  name: string;
  from: string;
  time: ActionTime;
  /** Resource spent (sheet.resources id) and how much. */
  cost?: { id: string; amount: number; label: string };
  /** Healing rolled and added to your HP. */
  heal?: string;
  /** A roll to make when used (not healing). */
  roll?: { expr: string; label: string };
  /** Effect switched on, shown until you end it. */
  status?: { name: string; note?: string; until?: string };
  /** Using it means concentrating on it (as if on a spell). */
  concentration?: boolean;
  /** One line on what it does. */
  summary: string;
}

const TIME_LABEL: Record<ActionTime, string> = { action: "Action", bonus: "Bonus action", reaction: "Reaction", free: "No action" };
export const timeLabel = (t: ActionTime) => TIME_LABEL[t];

/** Flatten a feature's entries to plain text (tags reduced to their words). */
function text(x: any): string {
  if (typeof x === "string") return x.replace(/\{@\w+ ([^|}]+)[^}]*\}/g, "$1");
  if (Array.isArray(x)) return x.map(text).join(" ");
  if (x && typeof x === "object") return text(x.entries ?? x.items ?? []);
  return "";
}

/** When the text says how it's used: "As a bonus action, you can…", "you can use your action to…". */
export function detectTime(t: string): ActionTime | null {
  if (/\b(as a|use your|using a|take a) bonus action\b/i.test(t) || /\bbonus action (to|on)\b/i.test(t)) return "bonus";
  if (/\buse your reaction\b|\bas a reaction\b|\byou can use your reaction\b/i.test(t)) return "reaction";
  if (/\b(as an|use your|using your|take the) action\b|\byou can use your action\b|\bas an action\b/i.test(t)) return "action";
  return null;
}

/** Concentrating on it "as if concentrating on a spell" (some features say so). */
export const needsConcentration = (t: string) => /concentrat\w* (on it |on this )?(as if|like)[^.]*spell/i.test(t) || /\brequires concentration\b/i.test(t);

export function featureActions(ch: Character, sheet: Sheet): FeatureAction[] {
  const level = (cls: string) => ch.classes.filter((c) => c.name === cls).reduce((n, c) => n + c.level, 0);
  const has = (name: string) => sheet.featureNames.includes(name);
  const res = (id: string) => sheet.resources.find((r) => r.id === id);
  const cost = (id: string, amount = 1) => {
    const r = res(id);
    return r ? { id, amount, label: amount > 1 ? `${amount} ${r.name}` : r.name } : undefined;
  };
  const table = (label: RegExp) => sheet.classTable.find((t) => label.test(t.label))?.value;
  const pb = sheet.proficiencyBonus;
  const out: FeatureAction[] = [];
  const add = (a: FeatureAction) => out.push(a);

  if (has("Rage")) {
    const dmg = table(/rage damage/i) ?? "+2";
    add({
      name: "Rage",
      from: "Barbarian",
      time: "bonus",
      cost: cost("rage"),
      status: { name: "Raging", until: "1 minute", note: `${dmg} damage on Strength melee attacks, resistance to bludgeoning, piercing and slashing, advantage on Strength checks and saves` },
      summary: `${dmg} melee damage, resist weapon damage, 1 minute`,
    });
  }
  if (has("Reckless Attack"))
    add({ name: "Reckless Attack", from: "Barbarian", time: "free", status: { name: "Reckless", until: "your next turn", note: "advantage on Strength melee attacks; attacks against you have advantage" }, summary: "advantage on Str melee attacks this turn" });
  if (has("Second Wind")) {
    const fl = level("Fighter");
    add({ name: "Second Wind", from: "Fighter", time: "bonus", cost: cost("secondwind"), heal: `1d10+${fl}`, summary: `heal 1d10 + ${fl}` });
  }
  if (has("Action Surge")) add({ name: "Action Surge", from: "Fighter", time: "free", cost: cost("actionsurge"), summary: "one more action this turn" });
  if (has("Indomitable")) add({ name: "Indomitable", from: "Fighter", time: "free", cost: cost("indomitable"), summary: "reroll a failed saving throw" });
  if (has("Hexblade's Curse"))
    add({
      name: "Hexblade's Curse",
      from: "Hexblade",
      time: "bonus",
      cost: cost("hexcurse"),
      status: { name: "Hexblade's Curse", until: "1 minute", note: `+${pb} damage against the cursed target, critical hits on 19–20, regain HP when it dies` },
      summary: `+${pb} damage vs one target, crit on 19–20`,
    });
  if (has("Bardic Inspiration")) {
    const die = table(/bardic (die|inspiration)/i) ?? "d6";
    add({ name: "Bardic Inspiration", from: "Bard", time: "bonus", cost: cost("bardic"), summary: `give a creature a ${die} to add to one roll` });
  }
  if (has("Channel Divinity")) add({ name: "Channel Divinity", from: res("channel")?.from ?? "Cleric", time: "action", cost: cost("channel"), summary: "use one of your Channel Divinity options" });
  if (has("Sacred Weapon"))
    add({ name: "Sacred Weapon", from: "Devotion", time: "action", cost: cost("channel"), status: { name: "Sacred Weapon", until: "1 minute", note: `+${Math.max(1, sheet.abilities.cha.mod)} to attack rolls with your weapon; it sheds light` }, summary: "add Charisma to weapon attack rolls" });
  if (has("Vow of Enmity"))
    add({ name: "Vow of Enmity", from: "Vengeance", time: "bonus", cost: cost("channel"), status: { name: "Vow of Enmity", until: "1 minute", note: "advantage on attack rolls against the chosen creature" }, summary: "advantage on attacks vs one creature" });
  if (has("Wild Shape")) add({ name: "Wild Shape", from: "Druid", time: has("Combat Wild Shape") ? "bonus" : "action", cost: cost("wildshape"), status: { name: "Wild Shape", until: `${Math.max(1, Math.floor(level("Druid") / 2))} hours` }, summary: "turn into a beast" });
  if (has("Divine Sense")) add({ name: "Divine Sense", from: "Paladin", time: "action", cost: cost("divinesense"), summary: "sense celestials, fiends and undead within 60 ft." });
  if (has("Lay on Hands")) add({ name: "Lay on Hands", from: "Paladin", time: "action", cost: cost("layonhands", 5), heal: "5", summary: "heal from your pool (5 at a time; change the amount)" });
  if (has("Flurry of Blows")) add({ name: "Flurry of Blows", from: "Monk", time: "bonus", cost: cost("ki"), summary: "two unarmed strikes" });
  if (has("Patient Defense")) add({ name: "Patient Defense", from: "Monk", time: "bonus", cost: cost("ki"), status: { name: "Dodging", until: "your next turn", note: "attacks against you have disadvantage; advantage on Dex saves" }, summary: "Dodge as a bonus action" });
  if (has("Step of the Wind")) add({ name: "Step of the Wind", from: "Monk", time: "bonus", cost: cost("ki"), status: { name: "Step of the Wind", until: "this turn", note: "Dash or Disengage; jump distance doubled" }, summary: "Dash or Disengage, double jump" });
  if (has("Cunning Action")) add({ name: "Cunning Action", from: "Rogue", time: "bonus", summary: "Dash, Disengage or Hide" });
  if (has("Uncanny Dodge")) add({ name: "Uncanny Dodge", from: "Rogue", time: "reaction", summary: "halve an attack's damage against you" });

  // Any other feature that says how it's used.
  const known = new Set(out.map((a) => a.name));
  for (const f of sheet.features) {
    if (known.has(f.name)) continue;
    // Only the feature's own paragraphs: parents like "The Hexblade" or "Pact Boon" hold
    // other features (and choices) inside them, which are listed on their own.
    const t = text((f.entries ?? []).filter((e: any) => typeof e === "string" || (e?.type === "entries" && !e.name) || e?.type === "list"));
    const time = detectTime(t);
    if (!time) continue;
    known.add(f.name);
    const r = sheet.resources.find((x) => x.name.toLowerCase() === f.name.toLowerCase());
    const sentence = t.match(/[^.]*\b(bonus action|reaction|action)\b[^.]*\./i)?.[0].trim() ?? "";
    add({
      name: f.name,
      from: f.from,
      time,
      cost: r ? { id: r.id, amount: 1, label: r.name } : undefined,
      concentration: needsConcentration(t) || undefined,
      summary: sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence,
    });
  }
  const order: Record<ActionTime, number> = { action: 0, bonus: 1, reaction: 2, free: 3 };
  return out.sort((a, b) => order[a.time] - order[b.time] || a.name.localeCompare(b.name));
}

/**
 * Spend a feature's cost and switch on its effect. Returns the new character,
 * or null if there aren't enough uses left.
 */
export function useFeature(ch: Character, sheet: Sheet, a: FeatureAction, amount = a.cost?.amount ?? 1): Character | null {
  const state = { ...ch.state };
  if (a.cost) {
    const r = sheet.resources.find((x) => x.id === a.cost!.id);
    if (!r || r.max - r.used < amount) return null;
    state.resourcesUsed = { ...state.resourcesUsed, [r.id]: r.used + amount };
  }
  if (a.status) state.active = [...(state.active ?? []).filter((x) => x.name !== a.status!.name), a.status];
  if (a.concentration) state.concentration = { ref: `feature:${a.name}`, name: a.name, level: 0 };
  return { ...ch, state };
}

export const isActive = (ch: Character, name: string) => (ch.state.active ?? []).some((x) => x.name === name);
