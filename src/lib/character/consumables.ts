// Drinking a potion (or using another consumable): read what it does from its
// 5e.tools text, so Use can roll the healing into your HP, give temp HP, deal
// its damage, add or remove conditions, and switch on an effect for its
// duration (resistance, a Strength score, Bless, Haste…).

import type { ActiveEffect, Character } from "./types.ts";

export interface ConsumableEffect {
  /** Healing dice ("2d4+2"), rolled and added to HP. */
  heal?: string;
  /** Temporary hit points gained. */
  temp?: number;
  /** Damage dice and type, rolled and taken (Potion of Poison). */
  damage?: { dice: string; type: string };
  /** Conditions it removes (Elixir of Health). */
  removes?: string[];
  /** Removes all exhaustion (Potion of Vitality). */
  clearsExhaustion?: boolean;
  /** Dice for the duration, when it's random ("1d4" hours): rolled when used. */
  durationDice?: { dice: string; unit: string };
  /** The effect switched on, if any. */
  active?: ActiveEffect;
  /** A line for the "used" message. */
  summary: string;
}

const CONDITION_NAMES = ["blinded", "charmed", "deafened", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const code = (t: unknown) => String(t ?? "").split("|")[0].toUpperCase();

/** Every string in the entries, keeping 5e.tools tags. */
function flat(x: any): string {
  if (typeof x === "string") return x;
  if (Array.isArray(x)) return x.map(flat).join(" ");
  if (x && typeof x === "object") return flat(x.entries ?? x.items ?? []);
  return "";
}
const plain = (s: string) => s.replace(/\{@\w+ ([^|}]+)[^}]*\}/g, "$1");

/** Potions, elixirs, philters, oils: things that are used up. */
export function isConsumable(raw: any, name = ""): boolean {
  const t = code(raw?.type);
  return t === "P" || !!raw?.poison || /\b(potion|elixir|philter|draught|tonic)\b/i.test(name || raw?.name || "");
}

/** What using it does. */
export function consumableEffect(raw: any, name = raw?.name ?? "Item"): ConsumableEffect {
  const tagged = flat(raw?.entries ?? []);
  const text = plain(tagged);
  const out: ConsumableEffect = { summary: "" };
  const parts: string[] = [];

  // How long it lasts: "for 1 hour", "for {@dice 1d4} hours", "For 1 minute after".
  const dur = tagged.match(/for (?:the next )?(?:\{@dice ([^}]+)\}|(\d+)) (minute|hour|day|round)s?/i);
  let until = dur ? (dur[2] ? `${dur[2]} ${dur[3]}${Number(dur[2]) > 1 ? "s" : ""}` : undefined) : undefined;
  // "…or when 1 hour has passed" (Potion of Fire Breath).
  const passed = !until && text.match(/(\d+) (minute|hour)s? (?:has|have) passed/i);
  if (passed) until = `${passed[1]} ${passed[2]}${Number(passed[1]) > 1 ? "s" : ""}`;
  if (dur?.[1]) out.durationDice = { dice: dur[1].replace(/\s+/g, ""), unit: `${dur[3]}s` };

  // "{@dice 2d4 + 2}", or plain "2d4 + 2" in homebrew text.
  const heal = tagged.match(/regain (?:an? )?(?:\{@dice ([^}]+)\}|(\d+d\d+(?:\s*[+-]\s*\d+)?)) hit points/i);
  if (heal) {
    out.heal = (heal[1] ?? heal[2]).replace(/\s+/g, "");
    parts.push(`heals ${out.heal}`);
  }
  const temp = text.match(/gain (\d+) temporary hit points/i);
  if (temp) {
    out.temp = Number(temp[1]);
    parts.push(`${out.temp} temp HP`);
  }
  const dmg = tagged.match(/you take \{@damage ([^}]+)\} (\w+) damage/i);
  if (dmg) {
    out.damage = { dice: dmg[1].replace(/\s+/g, ""), type: dmg[2].toLowerCase() };
    parts.push(`${out.damage.dice} ${out.damage.type} damage`);
  }
  if (/removes? (?:any |all )?\{@condition exhaustion\}|removes any exhaustion/i.test(tagged)) {
    out.clearsExhaustion = true;
    parts.push("removes exhaustion");
  }
  const removes = tagged.match(/removes? the ((?:\{@condition \w+\}(?:,| and|, and)?\s*)+) conditions?/i);
  if (removes) {
    out.removes = [...removes[1].matchAll(/\{@condition (\w+)\}/gi)].map((m) => cap(m[1].toLowerCase()));
    parts.push(`removes ${out.removes.join(", ").toLowerCase()}`);
  }

  // The lasting effect.
  const effect: ActiveEffect = { name };
  let lasting = false;
  // "you become {@condition invisible}" — but not "the next time you see… you become charmed".
  const cond = tagged.match(/you become \{@condition (\w+)\}/i);
  if (cond && CONDITION_NAMES.includes(cond[1].toLowerCase()) && !/next time/i.test(tagged.slice(0, cond.index ?? 0))) {
    effect.condition = cap(cond[1].toLowerCase());
    lasting = true;
    parts.push(effect.condition.toLowerCase());
  }
  // Potion of Fire Resistance → resistance to fire; Invulnerability → all damage.
  const resistName = name.match(/potion of (\w+) resistance/i);
  if (resistName) effect.resist = [resistName[1].toLowerCase()];
  else if (/resistance to all damage/i.test(text)) effect.resist = ["all"];
  else {
    const r = text.match(/you have resistance to (\w+) damage/i);
    if (r) effect.resist = [r[1].toLowerCase()];
  }
  if (effect.resist) {
    lasting = true;
    parts.push(`resistance to ${effect.resist[0] === "all" ? "all damage" : `${effect.resist.join(", ")} damage`}`);
    until ??= /potion of \w+ resistance/i.test(name) ? "1 hour" : until;
  }
  const str = text.match(/your Strength score changes to (\d+)/i);
  if (str) {
    effect.abilitySet = { str: Number(str[1]) };
    lasting = true;
    parts.push(`Strength ${str[1]}`);
  }
  const spell = tagged.match(/(?:effect of|under the effect of|cast) the \{@spell ([^|}]+)/i);
  if (spell) {
    effect.note = `As the ${cap(spell[1])} spell${/no \{@status concentration\} required|no concentration required/i.test(tagged) ? " (no concentration)" : ""}`;
    lasting = true;
    if (!parts.length) parts.push(`${cap(spell[1])} effect`);
  }
  // Anything else that lasts a while (flying, climbing, water breathing…).
  if (!lasting && until && !out.heal && !out.damage) lasting = true;
  // A power you can use for a while after drinking (fire breath).
  if (!lasting && /after drinking[^.]*you can use (?:a bonus action|an action|your action)/i.test(text)) lasting = true;
  if (lasting) {
    effect.until = until;
    if (!effect.note) {
      const first = text.split(/(?<=\.)\s/).find((s) => /\b(you|your)\b/i.test(s) && !/container|liquid|smell|glimmer|bubbl/i.test(s));
      if (first && !effect.condition && !effect.resist && !effect.abilitySet) effect.note = first.trim();
    }
    out.active = effect;
    if (until) parts.push(`for ${until}`);
  }
  out.summary = parts.join(", ") || "used up";
  return out;
}

/** Apply a used consumable to the character: HP rolled outside (heal/damage totals), one less in the pack. */
export function applyConsumable(
  ch: Character,
  itemId: string,
  e: ConsumableEffect,
  rolled: { heal?: number; damage?: number; duration?: number },
  maxHp: number,
): Character {
  const st = { ...ch.state };
  if (rolled.heal) st.hp = Math.min(maxHp, st.hp + rolled.heal);
  if (e.temp) st.tempHp = Math.max(st.tempHp, e.temp);
  if (rolled.damage) {
    const fromTemp = Math.min(st.tempHp, rolled.damage);
    st.tempHp -= fromTemp;
    st.hp = Math.max(0, st.hp - (rolled.damage - fromTemp));
  }
  if (e.removes?.length) st.conditions = st.conditions.filter((c) => !e.removes!.some((r) => r.toLowerCase() === c.toLowerCase()));
  if (e.clearsExhaustion) st.exhaustion = 0;
  if (e.active) {
    const active: ActiveEffect = { ...e.active };
    if (e.durationDice && rolled.duration) active.until = `${rolled.duration} ${rolled.duration === 1 ? e.durationDice.unit.replace(/s$/, "") : e.durationDice.unit}`;
    st.active = [...(st.active ?? []).filter((x) => x.name !== active.name), active];
    if (active.condition && !st.conditions.includes(active.condition)) st.conditions = [...st.conditions, active.condition];
  }
  // Revived from 0 HP by healing: death saves reset.
  if (rolled.heal && ch.state.hp === 0 && st.hp > 0) st.deathSaves = { successes: 0, failures: 0 };
  const inventory = ch.inventory.flatMap((i) => (i.id !== itemId ? [i] : i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : []));
  return { ...ch, state: st, inventory };
}

/** End an active effect, removing the condition it gave. */
export function endEffect(ch: Character, name: string): Character {
  const gone = (ch.state.active ?? []).find((x) => x.name === name);
  return {
    ...ch,
    state: {
      ...ch.state,
      active: (ch.state.active ?? []).filter((x) => x.name !== name),
      conditions: gone?.condition ? ch.state.conditions.filter((c) => c !== gone.condition) : ch.state.conditions,
    },
  };
}
