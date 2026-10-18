// The combat tracker: initiative order, rounds and turns, plus the creatures
// in the fight (NPCs, monsters, summons and companions) with stat blocks you
// can edit. One encounter per campaign, saved as combat.json in its folder.

import { ABILITIES, type Ability } from "./character/types.ts";
import { BaseDirectory, exists, readTextFile, writeTextFile } from "./fsapi.ts";
import { NOTES_ROOT } from "./store.ts";

export interface CombatAction {
  name: string;
  /** Attack bonus, or null when it isn't an attack roll. */
  toHit: number | null;
  /** Damage on a hit, each part rolled separately: [{ dice: "1d6+2", type: "slashing" }]. */
  damage: { dice: string; type: string }[];
  /** Saving throw it forces, if any. */
  save?: { ability: Ability; dc: number };
  /** The rules text, with 5e.tools tags. */
  text: string;
}

export interface StatBlock {
  /** What it's based on, if it came from the bestiary ("Goblin|MM"). */
  ref?: string;
  size?: string;
  type?: string;
  ac: number;
  acNote?: string;
  hpMax: number;
  hpFormula?: string;
  speed: string;
  abilities: Record<Ability, number>;
  /** Saving throw bonuses it lists (others use the ability modifier). */
  saves: Partial<Record<Ability, number>>;
  skills: Record<string, number>;
  senses?: string;
  languages?: string;
  cr?: string;
  traits: { name: string; text: string }[];
  actions: CombatAction[];
  /** Legendary actions: how many a round, and what they are. */
  legendary?: { count: number; actions: CombatAction[] };
}

export type CombatantKind = "pc" | "npc" | "summon" | "ally";

export interface Combatant {
  id: string;
  name: string;
  kind: CombatantKind;
  /** Initiative rolled (or typed); null = not rolled yet. */
  init: number | null;
  /** Initiative modifier (Dex, Alert…), used to roll and to break ties. */
  initMod: number;
  ac: number;
  /** HP is tracked here for creatures; player characters keep theirs on their sheet. */
  hp?: number;
  hpMax?: number;
  tempHp?: number;
  conditions: string[];
  notes?: string;
  stats?: StatBlock;
  /** Player characters: their file in Characters/. */
  charFile?: string;
  /** Summons and companions: who controls them. */
  owner?: string;
  /** A companion kept on a character's sheet: changes here are saved there too. */
  companionOf?: { file: string; id: string };
  /** Recharge abilities used and not back yet, by action name. */
  spent?: string[];
  /** Legendary actions used since its last turn. */
  legendaryUsed?: number;
  /** Things that last a number of rounds, counted down at the start of its turn. */
  timers?: Timer[];
}

export interface Timer {
  id: string;
  name: string;
  /** Rounds left. */
  rounds: number;
}

/** A creature a character controls (summon, familiar, steed, hireling, NPC), kept on their sheet. */
export type Companion = Omit<Combatant, "init" | "charFile" | "owner" | "companionOf">;

export interface Encounter {
  version: 1;
  round: number;
  /** Whose turn it is (combatant id), or null before the fight starts. */
  current: string | null;
  combatants: Combatant[];
}

export const emptyEncounter = (): Encounter => ({ version: 1, round: 0, current: null, combatants: [] });

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const abilityMod = (score: number) => Math.floor((score - 10) / 2);

const SIZES: Record<string, string> = { T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" };
const ABILITY_OF: Record<string, Ability> = {
  str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
  strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha",
};
const num = (s: unknown) => Number(String(s ?? "").replace(/[^\d-]/g, "")) || 0;
const plainTag = (s: string) => s.replace(/\{@\w+ ([^|}]+)[^}]*\}/g, "$1").replace(/\{@\w+\}/g, "");

/** Flatten an entries tree to text, keeping the 5e.tools tags. */
function entriesText(x: any): string {
  if (typeof x === "string") return x;
  if (Array.isArray(x)) return x.map(entriesText).filter(Boolean).join(" ");
  if (x && typeof x === "object") return [x.name ? `${x.name}.` : "", entriesText(x.entries ?? x.items ?? [])].filter(Boolean).join(" ");
  return "";
}

/**
 * Read an action's attack bonus, damage and saving throw from its 5e.tools
 * text: "{@hit 4} to hit … {@h}5 ({@damage 1d6 + 2}) slashing damage".
 */
export function parseAction(name: string, entries: any): CombatAction {
  const text = entriesText(entries);
  const hit = text.match(/\{@hit (-?\d+)\}/);
  const damage: CombatAction["damage"] = [];
  for (const m of text.matchAll(/\{@damage ([^}|]+)\}\)?\s*([a-z]+)?/gi)) {
    damage.push({ dice: m[1].replace(/\s+/g, ""), type: (m[2] ?? "").toLowerCase().replace(/^damage$/, "") });
  }
  const dc = text.match(/\{@dc (\d+)\}\s*([A-Za-z]+)/);
  const save = dc && ABILITY_OF[dc[2].toLowerCase()] ? { ability: ABILITY_OF[dc[2].toLowerCase()], dc: Number(dc[1]) } : undefined;
  return { name, toHit: hit ? Number(hit[1]) : null, damage, save, text };
}

/** A bestiary creature as an editable stat block. */
export function statsFromCreature(raw: any): StatBlock {
  const acEntry = Array.isArray(raw?.ac) ? raw.ac[0] : raw?.ac;
  const ac = typeof acEntry === "number" ? acEntry : num(acEntry?.ac);
  const acNote = typeof acEntry === "object" && acEntry?.from ? plainTag(acEntry.from.join(", ")) : undefined;
  const speed = Object.entries<any>(raw?.speed ?? {})
    .filter(([k]) => k !== "canHover")
    .map(([k, v]) => `${k === "walk" ? "" : `${k} `}${typeof v === "object" ? v.number : v} ft.`)
    .join(", ");
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, Number(raw?.[a] ?? 10)])) as Record<Ability, number>;
  const saves: StatBlock["saves"] = {};
  for (const [k, v] of Object.entries<any>(raw?.save ?? {})) if (ABILITY_OF[k]) saves[ABILITY_OF[k]] = num(v);
  const skills: Record<string, number> = {};
  for (const [k, v] of Object.entries<any>(raw?.skill ?? {})) if (typeof v === "string") skills[k] = num(v);
  const type = typeof raw?.type === "string" ? raw.type : raw?.type?.type;
  const block = (list: any[] | undefined) => (list ?? []).map((t: any) => ({ name: plainTag(String(t.name ?? "")), text: entriesText(t.entries) }));
  const actionName = (a: any) => plainTag(rechargeTag(String(a.name ?? "")));
  const actions = [...(raw?.action ?? []), ...(raw?.bonus ?? []).map((b: any) => ({ ...b, name: `${b.name} (bonus action)` })), ...(raw?.reaction ?? []).map((r: any) => ({ ...r, name: `${r.name} (reaction)` }))].map(
    (a: any) => parseAction(actionName(a), a.entries),
  );
  const legendary = raw?.legendary?.length ? { count: Number(raw.legendaryActions) || 3, actions: raw.legendary.map((a: any) => parseAction(actionName(a), a.entries)) } : undefined;
  return {
    ref: raw?.name ? `${raw.name}|${raw.source}` : undefined,
    size: (raw?.size ?? []).map((s: string) => SIZES[s] ?? s).join("/") || undefined,
    type: typeof type === "string" ? type : undefined,
    ac,
    acNote,
    hpMax: Number(raw?.hp?.average ?? 0) || num(raw?.hp?.special) || 1,
    hpFormula: raw?.hp?.formula,
    speed: speed || "30 ft.",
    abilities,
    saves,
    skills,
    senses: [...(raw?.senses ?? []), raw?.passive != null ? `passive Perception ${raw.passive}` : ""].filter(Boolean).join(", ") || undefined,
    languages: (raw?.languages ?? []).join(", ") || undefined,
    cr: typeof raw?.cr === "string" ? raw.cr : raw?.cr?.cr,
    traits: block(raw?.trait).map((t) => ({ ...t, name: rechargeTag(t.name) })),
    actions,
    legendary,
  };
}

/** "{@recharge 5}" → "(Recharge 5–6)", "{@recharge}" → "(Recharge 6)". */
const rechargeTag = (s: string) => s.replace(/\{@recharge (\d)\}/g, "(Recharge $1–6)").replace(/\{@recharge\}/g, "(Recharge 6)");

/** The lowest d6 roll that brings a recharge ability back, or null. */
export function rechargeMin(name: string): number | null {
  const m = name.match(/\(Recharge (\d)(?:[–-]6)?\)/i);
  return m ? Number(m[1]) : null;
}

/** HP it regains at the start of its turn (Regeneration), or 0. */
export function regeneration(stats?: StatBlock): number {
  for (const t of stats?.traits ?? []) {
    const m = t.text.match(/regains (\d+) hit points at the start of its turn/i);
    if (m) return Number(m[1]);
  }
  return 0;
}

export interface TurnNote {
  text: string;
  /** Offer to heal this much (Regeneration). */
  heal?: number;
}

/**
 * The start of a creature's turn: recharge rolls (`rollD6` rolls and logs one),
 * legendary actions back, timers counted down (a condition of the same name
 * ends with its timer), and reminders of what it's under.
 */
export function startOfTurn(c: Combatant, rollD6: (label: string) => number): { c: Combatant; notes: TurnNote[] } {
  const notes: TurnNote[] = [];
  let next: Combatant = { ...c };
  // Recharge abilities.
  const spent: string[] = [];
  for (const name of c.spent ?? []) {
    const min = rechargeMin(name);
    if (!min) continue;
    const r = rollD6(name.replace(/\s*\(Recharge[^)]*\)/i, ""));
    if (r >= min) notes.push({ text: `${name.replace(/\s*\(Recharge[^)]*\)/i, "")} recharged (rolled ${r})` });
    else {
      spent.push(name);
      notes.push({ text: `${name.replace(/\s*\(Recharge[^)]*\)/i, "")} not back yet (rolled ${r}, needs ${min}+)` });
    }
  }
  next.spent = spent.length ? spent : undefined;
  if (c.stats?.legendary) {
    if (c.legendaryUsed) notes.push({ text: `Legendary actions back: ${c.stats.legendary.count}` });
    next.legendaryUsed = 0;
  }
  // Timers.
  const timers: Timer[] = [];
  for (const t of c.timers ?? []) {
    const left = t.rounds - 1;
    if (left > 0) {
      timers.push({ ...t, rounds: left });
      notes.push({ text: `${t.name}: ${left} round${left === 1 ? "" : "s"} left` });
    } else {
      notes.push({ text: `${t.name} ends` });
      next.conditions = next.conditions.filter((k) => k.toLowerCase() !== t.name.toLowerCase());
    }
  }
  next.timers = timers.length ? timers : undefined;
  const regen = regeneration(c.stats);
  if (regen && (c.hp ?? 0) > 0 && (c.hp ?? 0) < (c.hpMax ?? 0)) notes.push({ text: `Regeneration: regains ${regen} HP unless it took acid or fire damage since its last turn`, heal: regen });
  if (next.conditions.length) notes.push({ text: `Under: ${next.conditions.join(", ")}` });
  if (c.kind !== "pc" && (c.hp ?? 1) <= 0 && c.hpMax != null) notes.push({ text: "It's at 0 HP" });
  if (!next.spent) delete next.spent;
  if (!next.timers) delete next.timers;
  return { c: next, notes };
}

/** A blank stat block for a homemade NPC or summon. */
export const blankStats = (): StatBlock => ({
  ac: 12,
  hpMax: 10,
  speed: "30 ft.",
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  saves: {},
  skills: {},
  traits: [],
  actions: [{ name: "Attack", toHit: 3, damage: [{ dice: "1d6+1", type: "bludgeoning" }], text: "" }],
});

export const saveBonus = (s: StatBlock, a: Ability) => s.saves[a] ?? abilityMod(s.abilities[a]);

/** "Goblin", "Goblin 2", "Goblin 3"… so copies can be told apart. */
export function uniqueName(names: string[], base: string): string {
  const taken = new Set(names.map((n) => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** A combatant made from a stat block (bestiary creature or homemade). */
export function combatantFromStats(stats: StatBlock, name: string, kind: CombatantKind = "npc", owner?: string): Combatant {
  return { id: uid(), name, kind, init: null, initMod: abilityMod(stats.abilities.dex), ac: stats.ac, hp: stats.hpMax, hpMax: stats.hpMax, tempHp: 0, conditions: [], stats, owner };
}

/** Initiative order: highest first; ties go to the higher modifier, then by name. */
export function turnOrder(list: Combatant[]): Combatant[] {
  return [...list].sort((a, b) => (b.init ?? -99) - (a.init ?? -99) || b.initMod - a.initMod || a.name.localeCompare(b.name));
}

/** Move to the next (or previous) turn; passing the top of the order starts a new round. */
export function advanceTurn(enc: Encounter, step: 1 | -1 = 1): Encounter {
  const order = turnOrder(enc.combatants);
  if (!order.length) return { ...enc, round: 0, current: null };
  if (!enc.current || !order.some((c) => c.id === enc.current)) return { ...enc, round: Math.max(1, enc.round), current: order[0].id };
  const i = order.findIndex((c) => c.id === enc.current);
  let j = i + step;
  let round = enc.round;
  if (j >= order.length) {
    j = 0;
    round += 1;
  } else if (j < 0) {
    if (round <= 1) return enc;
    j = order.length - 1;
    round -= 1;
  }
  return { ...enc, round, current: order[j].id };
}

/** Damage takes temp HP first; healing can't go over the max. */
export function applyHp(c: Combatant, kind: "damage" | "heal" | "temp", n: number): Combatant {
  const hp = c.hp ?? 0;
  const max = c.hpMax ?? hp;
  const temp = c.tempHp ?? 0;
  if (kind === "temp") return { ...c, tempHp: Math.max(temp, n) };
  if (kind === "heal") return { ...c, hp: Math.min(max, hp + n) };
  const fromTemp = Math.min(temp, n);
  return { ...c, tempHp: temp - fromTemp, hp: Math.max(0, hp - (n - fromTemp)) };
}

// ---------- companions on a character's sheet ----------

/** What a companion and its copy in the fight share (initiative and side stay in the fight). */
const SHARED = ["name", "initMod", "ac", "hp", "hpMax", "tempHp", "conditions", "notes", "stats"] as const;

const pick = (c: Companion | Combatant) => Object.fromEntries(SHARED.map((k) => [k, c[k]])) as Pick<Companion, (typeof SHARED)[number]>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A companion as it appears on the sheet, from its row (the row's own id is the companion's). */
export function companionFrom(c: Combatant, kind: CombatantKind = c.kind): Companion {
  return { id: c.id, kind, ...pick(c) };
}

/** A companion as a row on the sheet (no initiative there). */
export const companionRow = (comp: Companion): Combatant => ({ ...comp, conditions: comp.conditions ?? [], init: null });

/** A companion joining the fight, linked back to the sheet. */
export function companionToCombatant(comp: Companion, file: string, owner: string): Combatant {
  return { ...structuredClone(comp), id: uid(), init: null, owner, companionOf: { file, id: comp.id } };
}

/** Copy the sheet's companions into their rows in the fight. Null when nothing changed. */
export function syncCompanionsIntoEncounter(enc: Encounter, file: string, companions: Companion[]): Encounter | null {
  let changed = false;
  const combatants = enc.combatants.map((c) => {
    if (c.companionOf?.file !== file) return c;
    const comp = companions.find((x) => x.id === c.companionOf!.id);
    if (!comp || same(pick(comp), pick(c))) return c;
    changed = true;
    return { ...c, ...structuredClone(pick(comp)) };
  });
  return changed ? { ...enc, combatants } : null;
}

/** Copy fight rows back into the sheet's companions. Null when nothing changed. */
export function syncEncounterIntoCompanions(companions: Companion[], file: string, rows: Combatant[]): Companion[] | null {
  let changed = false;
  const out = companions.map((comp) => {
    const row = rows.find((c) => c.companionOf?.file === file && c.companionOf.id === comp.id);
    if (!row || same(pick(comp), pick(row))) return comp;
    changed = true;
    return { ...comp, ...structuredClone(pick(row)) };
  });
  return changed ? out : null;
}

/** Save the sheet's companions into the fight, if any of them are in it. */
export async function pushCompanions(campaign: string, file: string, companions: Companion[]): Promise<void> {
  const enc = await loadEncounter(campaign);
  const next = syncCompanionsIntoEncounter(enc, file, companions);
  if (next) await saveEncounter(campaign, next);
}

/** Put companions into the fight (ones already in it are left as they are). */
export async function addCompanionsToFight(campaign: string, file: string, owner: string, list: Companion[]): Promise<Encounter> {
  const enc = await loadEncounter(campaign);
  const inFight = new Set(enc.combatants.filter((c) => c.companionOf?.file === file).map((c) => c.companionOf!.id));
  const add = list.filter((c) => !inFight.has(c.id)).map((c) => companionToCombatant(c, file, owner));
  const next = { ...enc, combatants: [...enc.combatants, ...add] };
  if (add.length) await saveEncounter(campaign, next);
  return next;
}

// ---------- saving ----------

const DOCS = { baseDir: BaseDirectory.Document };
const file = (campaign: string) => `${NOTES_ROOT}/${campaign}/combat.json`;

export async function loadEncounter(campaign: string): Promise<Encounter> {
  try {
    if (!(await exists(file(campaign), DOCS))) return emptyEncounter();
    const raw = JSON.parse(await readTextFile(file(campaign), DOCS));
    return { ...emptyEncounter(), ...raw, combatants: (raw?.combatants ?? []).map((c: any) => ({ conditions: [], initMod: 0, ac: 10, ...c })) };
  } catch {
    return emptyEncounter();
  }
}

export async function saveEncounter(campaign: string, enc: Encounter): Promise<void> {
  await writeTextFile(file(campaign), JSON.stringify(enc, null, 2), DOCS);
}
