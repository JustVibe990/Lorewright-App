// The DM's side of a campaign: planned encounters (with 2014 difficulty
// maths), named NPCs, treasure rolled and handed out, and session notes.
// Encounters, NPCs and treasure are kept in dm.json in the campaign folder;
// sessions are ordinary notes.

import type { Companion } from "./combat.ts";
import { roll } from "./dice.ts";
import { BaseDirectory, exists, readTextFile, writeTextFile } from "./fsapi.ts";
import { NOTES_ROOT } from "./store.ts";
import type { RandomTable } from "./tables.ts";
import type { Clock } from "./clock.ts";

// ---------- encounters ----------

export interface EncounterMonster {
  /** "Goblin|MM". */
  ref: string;
  name: string;
  cr: string;
  count: number;
}

export interface PlannedEncounter {
  id: string;
  name: string;
  monsters: EncounterMonster[];
  /** Characters in the party for this fight (files in Characters/); none = everyone. */
  party?: string[];
  /** Extra party members by level (players without a sheet here, sidekicks…). */
  extraLevels?: number[];
  notes?: string;
  /** XP handed out for winning it. */
  awarded?: { at: string; each: number; to: number };
}

/** XP for each challenge rating. */
export const CR_XP: Record<string, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000,
};

/** XP thresholds per character level: easy, medium, hard, deadly. */
const THRESHOLDS: [number, number, number, number][] = [
  [25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100],
  [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100], [550, 1100, 1600, 2400], [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700],
];

const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

/** The multiplier for this many monsters, shifted for small (under 3) or large (6+) parties. */
export function xpMultiplier(monsters: number, partySize: number): number {
  if (monsters <= 0) return 1;
  let i = monsters === 1 ? 1 : monsters === 2 ? 2 : monsters <= 6 ? 3 : monsters <= 10 ? 4 : monsters <= 14 ? 5 : 6;
  if (partySize > 0 && partySize < 3) i += 1;
  else if (partySize >= 6) i -= 1;
  return MULTIPLIERS[Math.max(0, Math.min(MULTIPLIERS.length - 1, i))];
}

export type Difficulty = "trivial" | "easy" | "medium" | "hard" | "deadly";

export interface DifficultyReport {
  /** XP the party earns (unadjusted), and the adjusted XP that sets the difficulty. */
  xp: number;
  adjusted: number;
  multiplier: number;
  /** Party thresholds: easy, medium, hard, deadly. */
  thresholds: [number, number, number, number];
  rating: Difficulty;
  /** XP per character. */
  perCharacter: number;
}

export function crXp(cr: string): number {
  return CR_XP[String(cr).trim()] ?? 0;
}

export function encounterDifficulty(monsters: { cr: string; count: number }[], levels: number[]): DifficultyReport {
  const count = monsters.reduce((n, m) => n + Math.max(0, m.count), 0);
  const xp = monsters.reduce((n, m) => n + crXp(m.cr) * Math.max(0, m.count), 0);
  const multiplier = xpMultiplier(count, levels.length);
  const adjusted = Math.round(xp * multiplier);
  const thresholds = levels.reduce<[number, number, number, number]>(
    (t, l) => {
      const row = THRESHOLDS[Math.max(1, Math.min(20, l)) - 1];
      return [t[0] + row[0], t[1] + row[1], t[2] + row[2], t[3] + row[3]];
    },
    [0, 0, 0, 0],
  );
  const rating: Difficulty = !levels.length || !count ? "trivial" : adjusted >= thresholds[3] ? "deadly" : adjusted >= thresholds[2] ? "hard" : adjusted >= thresholds[1] ? "medium" : adjusted >= thresholds[0] ? "easy" : "trivial";
  return { xp, adjusted, multiplier, thresholds, rating, perCharacter: levels.length ? Math.floor(xp / levels.length) : 0 };
}

export const crOf = (raw: any): string => String(typeof raw?.cr === "string" ? raw.cr : raw?.cr?.cr ?? "0");

/** CR as a number, for sorting and treasure ("1/4" → 0.25). */
export function crNumber(cr: string): number {
  const [a, b] = String(cr).split("/").map(Number);
  return b ? a / b : a || 0;
}

// ---------- NPCs ----------

export type Attitude = "friendly" | "indifferent" | "hostile";

/** A named NPC: who they are, where, how they feel about the party, and a stat block. */
export interface Npc extends Companion {
  description?: string;
  location?: string;
  attitude?: Attitude;
  /** Their note in the campaign ("Lady Elyse.md"). */
  note?: string;
}

// ---------- treasure ----------

export type Coins = { cp: number; sp: number; ep: number; gp: number; pp: number };
export const noCoins = (): Coins => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });

export interface LootItem {
  name: string;
  /** "Bag of Holding|DMG" for items from the rules data. */
  ref?: string;
  rarity?: string;
  /** Gems and art: worth in gp each. */
  value?: number;
  /** Character file it was given to. */
  givenTo?: string;
}

export interface LootRoll {
  id: string;
  at: string;
  label: string;
  coins: Coins;
  /** Who got the coins: a character file, or "split". */
  coinsGiven?: string;
  items: LootItem[];
}

export type LootKind = "individual" | "hoard";

/** Treasure bands by challenge rating. */
export const LOOT_BANDS = [
  { label: "CR 0–4", max: 4 },
  { label: "CR 5–10", max: 10 },
  { label: "CR 11–16", max: 16 },
  { label: "CR 17+", max: 99 },
];
export const bandOf = (cr: number) => Math.max(0, LOOT_BANDS.findIndex((b) => cr <= b.max));

// Lorewright's own treasure tables, scaled by band (not copies of the DMG's).
// Each coin entry: [coin, dice, multiplier].
type CoinRoll = [keyof Coins, string, number];
const INDIVIDUAL: CoinRoll[][] = [
  [["cp", "4d6", 1], ["sp", "2d6", 1], ["gp", "1d6", 1]],
  [["sp", "4d6", 10], ["gp", "3d6", 1], ["gp", "1d6", 10]],
  [["gp", "4d6", 10], ["pp", "1d6", 1]],
  [["gp", "2d6", 100], ["pp", "2d6", 10]],
];
const HOARD_COINS: CoinRoll[][] = [
  [["cp", "6d6", 10], ["sp", "3d6", 10], ["gp", "2d6", 10]],
  [["cp", "2d6", 10], ["sp", "2d6", 100], ["gp", "6d6", 100], ["pp", "3d6", 10]],
  [["gp", "4d6", 1000], ["pp", "5d6", 100]],
  [["gp", "12d6", 1000], ["pp", "8d6", 1000]],
];
/** Gems and art: how many, and what each is worth. */
const VALUABLES: { count: string; values: number[] }[] = [
  { count: "1d4", values: [10, 25] },
  { count: "1d6", values: [50, 100] },
  { count: "1d6", values: [250, 750] },
  { count: "1d8", values: [1000, 2500] },
];
const GEMS: Record<number, string[]> = {
  10: ["azurite", "banded agate", "hematite", "lapis lazuli", "malachite", "obsidian", "tiger eye", "turquoise"],
  25: ["bloodstone", "carnelian", "chalcedony", "citrine", "jasper", "moonstone", "onyx", "quartz"],
  50: ["bloodstone", "carnelian", "chalcedony", "jasper", "moonstone", "onyx", "star rose quartz", "zircon"],
  100: ["amber", "amethyst", "coral", "garnet", "jade", "jet", "pearl", "tourmaline"],
  250: ["alexandrite", "aquamarine", "black pearl", "blue spinel", "peridot", "topaz"],
  750: ["black opal", "blue sapphire", "emerald", "fire opal", "opal", "star ruby"],
  1000: ["black sapphire", "diamond", "jacinth", "ruby", "emerald", "star sapphire"],
  2500: ["flawless diamond", "great ruby", "great emerald", "great sapphire"],
};
const ART = [
  "silver ewer", "carved bone statuette", "gold bracelet", "embroidered silk cloak", "brass mug with jade inlay", "painted portrait",
  "silver chalice", "gold locket with a painted portrait", "jeweled dagger", "small gold idol", "obsidian statuette", "silk tapestry",
  "gold music box", "jeweled crown", "platinum ring", "jade game board",
];
/** How many magic items in a hoard, and the odds for each rarity. */
const MAGIC: { count: string; odds: [string, number][] }[] = [
  { count: "1d3", odds: [["common", 55], ["uncommon", 45]] },
  { count: "1d4", odds: [["uncommon", 55], ["rare", 38], ["very rare", 7]] },
  { count: "1d4", odds: [["rare", 50], ["very rare", 42], ["legendary", 8]] },
  { count: "1d6", odds: [["rare", 20], ["very rare", 45], ["legendary", 35]] },
];

const pick = <T,>(list: T[], rng: () => number) => list[Math.floor(rng() * list.length)];
const rollN = (dice: string, rng: () => number) => roll(dice, rng).total;

/**
 * Roll treasure for a creature (`individual`) or a hoard at challenge rating
 * `cr`. Magic items come from `magicItems` (the imported items, by rarity).
 */
export function rollLoot(cr: number, kind: LootKind, magicItems: { name: string; source: string; rarity: string }[], rng: () => number = Math.random): Omit<LootRoll, "id" | "at"> {
  const band = bandOf(cr);
  const coins = noCoins();
  for (const [coin, dice, mult] of (kind === "hoard" ? HOARD_COINS : INDIVIDUAL)[band]) coins[coin] += rollN(dice, rng) * mult;
  const items: LootItem[] = [];
  if (kind === "hoard") {
    const v = VALUABLES[band];
    const n = rollN(v.count, rng);
    const gems = rng() < 0.6;
    const value = pick(v.values, rng);
    for (let i = 0; i < n; i++) items.push({ name: gems ? cap(pick(GEMS[value], rng)) : cap(pick(ART, rng)), value });
    const m = MAGIC[band];
    // Not every hoard has magic items: about two in three do.
    if (rng() < 0.65) {
      const count = rollN(m.count, rng);
      for (let i = 0; i < count; i++) {
        let r = rng() * 100;
        const rarity = m.odds.find(([, w]) => (r -= w) < 0)?.[0] ?? m.odds[0][0];
        const pool = magicItems.filter((x) => x.rarity === rarity);
        if (!pool.length) continue;
        const it = pick(pool, rng);
        items.push({ name: it.name, ref: `${it.name}|${it.source}`, rarity });
      }
    }
  }
  const label = `${kind === "hoard" ? "Hoard" : "Individual treasure"}, ${LOOT_BANDS[band].label}`;
  return { label, coins, items };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Coins split evenly between `n` characters; the rest goes to the first. */
export function splitCoins(c: Coins, n: number): Coins[] {
  const out = Array.from({ length: Math.max(1, n) }, () => noCoins());
  for (const k of Object.keys(c) as (keyof Coins)[]) {
    const each = Math.floor(c[k] / out.length);
    out.forEach((o) => (o[k] = each));
    out[0][k] += c[k] - each * out.length;
  }
  return out;
}

export const coinsText = (c: Coins) =>
  (["pp", "gp", "ep", "sp", "cp"] as const)
    .filter((k) => c[k])
    .map((k) => `${c[k].toLocaleString()} ${k}`)
    .join(", ") || "no coins";

/** Items the treasure roller can give: imported magic items with a rarity. */
export function magicItemPool(items: { name: string; source: string; raw: any }[]) {
  const ok = new Set(["common", "uncommon", "rare", "very rare", "legendary"]);
  return items
    .filter((e) => ok.has(String(e.raw?.rarity ?? "").toLowerCase()) && !e.raw?._copy && !/^\$|^(TG|\$G|\$A|\$C)\b/.test(String(e.raw?.type ?? "")))
    .map((e) => ({ name: e.name, source: e.source, rarity: String(e.raw.rarity).toLowerCase() }));
}

// ---------- sessions ----------

/** "Session 12" notes, newest number first. */
export function sessionNumber(title: string): number | null {
  const m = title.match(/^session\s+(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** What a new session note starts with. */
export function sessionTemplate(n: number, date: string, lastNext?: string): string {
  return [
    `# Session ${n}`,
    "",
    `*${date}*`,
    "",
    "## Last time",
    "",
    lastNext?.trim() || "",
    "",
    "## What happened",
    "",
    "- ",
    "",
    "## NPCs met",
    "",
    "- ",
    "",
    "## Loot",
    "",
    "- ",
    "",
    "## Next time",
    "",
    "- ",
    "",
  ].join("\n");
}

/** The "Next time" section of a session note, to carry into the next one. */
export function nextTimeOf(text: string): string {
  const m = text.match(/##\s*Next time\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const body = m?.[1].trim() ?? "";
  return body === "-" ? "" : body;
}

/** Which of these names a note's text mentions (whole words, any case). */
export function mentions(text: string, names: string[]): string[] {
  const t = text.toLowerCase();
  return names.filter((n) => {
    const s = n.trim().toLowerCase();
    if (s.length < 3) return false;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u");
    return re.test(t);
  });
}

// ---------- saving ----------

export interface DmData {
  version: 1;
  encounters: PlannedEncounter[];
  npcs: Npc[];
  loot: LootRoll[];
  tables: RandomTable[];
  clock?: Clock;
}

export const emptyDm = (): DmData => ({ version: 1, encounters: [], npcs: [], loot: [], tables: [] });

const DOCS = { baseDir: BaseDirectory.Document };
const file = (campaign: string) => `${NOTES_ROOT}/${campaign}/dm.json`;

export async function loadDm(campaign: string): Promise<DmData> {
  try {
    if (!(await exists(file(campaign), DOCS))) return emptyDm();
    const raw = JSON.parse(await readTextFile(file(campaign), DOCS));
    return { ...emptyDm(), ...raw };
  } catch {
    return emptyDm();
  }
}

export async function saveDm(campaign: string, d: DmData): Promise<void> {
  await writeTextFile(file(campaign), JSON.stringify(d, null, 2), DOCS);
}
