// Homebrew creatures (Creature Builder) and items (Item Builder), saved for
// the whole app next to the homebrew spells. Each becomes a 5e.tools-shaped
// entry from the "Homebrew" source, so creatures show up in the bestiary
// (combat tracker, encounters, NPCs, cards and note links) and items in every
// item search (inventories, treasure).

import type { CombatAction, StatBlock } from "./combat.ts";
import type { InventoryItem } from "./character/types.ts";
import { BaseDirectory, exists, readTextFile, writeTextFile } from "./fsapi.ts";
import { HOMEBREW_SOURCE } from "./homebrew.ts";
import type { Entry } from "./types.ts";

export interface HomebrewCreature {
  id: string;
  name: string;
  alignment?: string;
  stats: StatBlock;
}

export interface HomebrewItem {
  id: string;
  /** How it was made: a base item or from scratch, with Item Forge changes. */
  inv: InventoryItem;
  /** Its data, worked out when it was saved (base item, variant and changes applied). */
  raw: any;
}

const SIZE_CODE: Record<string, string> = { tiny: "T", small: "S", medium: "M", large: "L", huge: "H", gargantuan: "G" };
const ABILITY_WORD: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** "30 ft., fly 60 ft. (hover)" → { walk: 30, fly: 60 }. */
export function parseSpeed(s: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(?:(walk|fly|swim|climb|burrow)\s+)?(\d+)/i);
    if (m) out[(m[1] ?? "walk").toLowerCase()] = Number(m[2]);
  }
  if (!Object.keys(out).length) out.walk = 30;
  return out;
}

/** An action's rules text: the user's own, or one written from its numbers. */
function actionEntries(a: CombatAction): string[] {
  if (/\{@(hit|damage|dc)\b/.test(a.text)) return [a.text];
  const parts: string[] = [];
  if (a.toHit != null) parts.push(`{@atk mw} {@hit ${a.toHit}} to hit, reach 5 ft., one target.`);
  if (a.damage.length) {
    const dmg = a.damage.map((d) => `{@damage ${d.dice}} ${d.type || ""} damage`.replace(/\s+/g, " ")).join(" plus ");
    parts.push(a.toHit != null ? `{@h}${dmg}.` : `${dmg[0].toUpperCase()}${dmg.slice(1)}.`);
  }
  if (a.save) parts.push(`The target must make a {@dc ${a.save.dc}} ${ABILITY_WORD[a.save.ability]} saving throw.`);
  if (a.text.trim()) parts.push(a.text.trim());
  return [parts.join(" ") || "—"];
}

/** A homebrew creature as 5e.tools bestiary data. */
export function creatureData(c: HomebrewCreature): any {
  const s = c.stats;
  const wis = Math.floor((s.abilities.wis - 10) / 2);
  const senses = (s.senses ?? "").split(",").map((x) => x.trim()).filter((x) => x && !/^passive/i.test(x));
  const passive = Number((s.senses ?? "").match(/passive Perception (\d+)/i)?.[1]) || 10 + (s.skills.perception ?? wis);
  const kinds: Record<"action" | "bonus" | "reaction", any[]> = { action: [], bonus: [], reaction: [] };
  for (const a of s.actions) {
    const m = a.name.match(/^(.*) \((bonus action|reaction)\)$/i);
    const list = m ? kinds[m[2].toLowerCase() === "reaction" ? "reaction" : "bonus"] : kinds.action;
    list.push({ name: (m ? m[1] : a.name) || "Action", entries: actionEntries(a) });
  }
  return {
    name: c.name.trim() || "Unnamed creature",
    source: HOMEBREW_SOURCE,
    size: [SIZE_CODE[(s.size ?? "medium").toLowerCase()] ?? "M"],
    type: s.type || "humanoid",
    alignment: c.alignment ? [c.alignment] : undefined,
    ac: [s.acNote ? { ac: s.ac, from: [s.acNote] } : s.ac],
    hp: s.hpFormula ? { average: s.hpMax, formula: s.hpFormula } : { special: String(s.hpMax) },
    speed: parseSpeed(s.speed),
    ...s.abilities,
    save: Object.keys(s.saves).length ? Object.fromEntries(Object.entries(s.saves).map(([k, v]) => [k, signed(v!)])) : undefined,
    skill: Object.keys(s.skills).length ? Object.fromEntries(Object.entries(s.skills).map(([k, v]) => [k, signed(v)])) : undefined,
    senses: senses.length ? senses : undefined,
    passive,
    languages: s.languages ? s.languages.split(",").map((x) => x.trim()).filter(Boolean) : undefined,
    cr: s.cr || "0",
    trait: s.traits.length ? s.traits.filter((t) => t.name.trim() || t.text.trim()).map((t) => ({ name: t.name || "Trait", entries: [t.text] })) : undefined,
    action: kinds.action.length ? kinds.action : undefined,
    bonus: kinds.bonus.length ? kinds.bonus : undefined,
    reaction: kinds.reaction.length ? kinds.reaction : undefined,
    homebrew: true,
  };
}

export const creatureEntry = (c: HomebrewCreature): Entry => ({ kind: "creature", name: c.name.trim() || "Unnamed creature", source: HOMEBREW_SOURCE, raw: creatureData(c) }) as Entry;

/**
 * A homebrew item's data from what the Item Forge made: its own name and source,
 * and the Forge's charges and spells in the shape the sheet reads.
 */
export function itemDataFor(inv: InventoryItem, raw: any, entries: any[]): any {
  const f = inv.forge ?? {};
  const out: any = { ...raw, name: inv.name.trim() || raw?.name || "Homebrew item", source: HOMEBREW_SOURCE, entries, homebrew: true };
  delete out._forge;
  delete out.variantOf;
  delete out.page;
  if (f.charges) {
    out.charges = f.charges;
    if (f.recharge) out.recharge = f.recharge === "long" ? "restLong" : f.recharge === "short" ? "restShort" : f.recharge;
    if (f.regain && f.regain !== "all") out.rechargeAmount = /d/i.test(f.regain) ? `{@dice ${f.regain}}` : Number(f.regain) || undefined;
  }
  const att: any = {};
  for (const s of f.spells ?? []) {
    const name = s.ref.split("|")[0].toLowerCase();
    const ch = s.note.match(/(\d+)\s*charges?/i);
    const day = s.note.match(/(\d+)\s*\/\s*day/i);
    if (ch && f.charges) (att.charges ??= {})[ch[1]] = [...(att.charges?.[ch[1]] ?? []), name];
    else if (day) (att.daily ??= {})[`${day[1]}e`] = [...(att.daily?.[`${day[1]}e`] ?? []), name];
    else if (/at will/i.test(s.note)) (att.will ??= []).push(name);
  }
  if (Object.keys(att).length) out.attachedSpells = att;
  return out;
}

export const itemEntry = (h: HomebrewItem): Entry => ({ kind: "item", name: h.raw.name, source: HOMEBREW_SOURCE, raw: h.raw }) as Entry;

// ---------- saving ----------

const APP = { baseDir: BaseDirectory.AppData };

async function readList<T>(file: string, key: string): Promise<T[]> {
  try {
    if (!(await exists(file, APP))) return [];
    const raw = JSON.parse(await readTextFile(file, APP));
    return Array.isArray(raw?.[key]) ? raw[key] : [];
  } catch {
    return [];
  }
}

export const loadHomebrewCreatures = () => readList<HomebrewCreature>("homebrew-creatures.json", "creatures");
export const loadHomebrewItems = () => readList<HomebrewItem>("homebrew-items.json", "items");

export async function saveHomebrewCreatures(list: HomebrewCreature[]): Promise<void> {
  await writeTextFile("homebrew-creatures.json", JSON.stringify({ version: 1, creatures: list }, null, 2), APP);
}
export async function saveHomebrewItems(list: HomebrewItem[]): Promise<void> {
  await writeTextFile("homebrew-items.json", JSON.stringify({ version: 1, items: list }, null, 2), APP);
}
