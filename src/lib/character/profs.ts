// Read 5e.tools proficiency blocks: arrays of alternatives like
// [{ perception: true }], [{ choose: { from: [...], count: 2 } }], [{ any: 1 }],
// [{ common: true, anyStandard: 1 }]. Fixed grants are returned directly;
// anything the player picks becomes a choice request.

import { SKILLS } from "./types.ts";

export interface ChoiceRequest {
  /** Suffix for the choice id. */
  key: string;
  count: number;
  options: string[];
  label: string;
}

export interface ProfResult {
  fixed: string[];
  choices: ChoiceRequest[];
}

const STANDARD_LANGUAGES = ["Common", "Dwarvish", "Elvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orc"];
const EXOTIC_LANGUAGES = ["Abyssal", "Celestial", "Draconic", "Deep Speech", "Infernal", "Primordial", "Sylvan", "Undercommon"];
export const ALL_LANGUAGES = [...STANDARD_LANGUAGES, ...EXOTIC_LANGUAGES];
export const ARTISANS_TOOLS = [
  "alchemist's supplies", "brewer's supplies", "calligrapher's supplies", "carpenter's tools", "cartographer's tools",
  "cobbler's tools", "cook's utensils", "glassblower's tools", "jeweler's tools", "leatherworker's tools",
  "mason's tools", "painter's supplies", "potter's tools", "smith's tools", "tinker's tools", "weaver's tools",
  "woodcarver's tools",
];
export const MUSICAL_INSTRUMENTS = ["bagpipes", "drum", "dulcimer", "flute", "lute", "lyre", "horn", "pan flute", "shawm", "viol"];
export const GAMING_SETS = ["dice set", "dragonchess set", "playing card set", "three-dragon ante set"];
export const ALL_TOOLS = [
  ...ARTISANS_TOOLS, ...MUSICAL_INSTRUMENTS, ...GAMING_SETS,
  "disguise kit", "forgery kit", "herbalism kit", "navigator's tools", "poisoner's kit", "thieves' tools",
  "vehicles (land)", "vehicles (water)",
];

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
/** "{@item thieves' tools|PHB}" → "thieves' tools"; "longsword|phb" → "longsword". */
export const stripRef = (s: string) =>
  String(s)
    .replace(/\{@\w+ ([^|}]+)[^}]*\}/g, "$1")
    .split("|")[0]
    .trim();

/** Skills: [{ perception: true }], [{ choose: { from, count } }], [{ any: 2 }]. */
export function readSkills(block: any[] | undefined, label: string): ProfResult {
  const out: ProfResult = { fixed: [], choices: [] };
  const alt = block?.[0];
  if (!alt) return out;
  for (const [k, v] of Object.entries<any>(alt)) {
    if (k === "choose") {
      out.choices.push({ key: "skills", count: v.count ?? 1, options: (v.from ?? []).map(String), label });
    } else if (k === "any") {
      out.choices.push({ key: "skills", count: Number(v) || 1, options: Object.keys(SKILLS), label });
    } else if (v === true && k in SKILLS) out.fixed.push(k);
  }
  return out;
}

/** Languages: [{ common: true, elvish: true, anyStandard: 1 }], [{ any: 1 }], [{ choose: { from } }]. */
export function readLanguages(block: any[] | undefined, label: string): ProfResult {
  const out: ProfResult = { fixed: [], choices: [] };
  const alt = block?.[0];
  if (!alt) return out;
  for (const [k, v] of Object.entries<any>(alt)) {
    if (k === "anyStandard") out.choices.push({ key: "languages", count: Number(v) || 1, options: ALL_LANGUAGES, label });
    else if (k === "any") out.choices.push({ key: "languages", count: Number(v) || 1, options: ALL_LANGUAGES, label });
    else if (k === "anyExotic") out.choices.push({ key: "languages:exotic", count: Number(v) || 1, options: EXOTIC_LANGUAGES, label });
    else if (k === "choose") out.choices.push({ key: "languages", count: v.count ?? 1, options: (v.from ?? []).map(cap), label });
    else if (v === true) out.fixed.push(cap(k === "other" ? "One extra language" : k));
  }
  return out;
}

/** Tools: [{ "thieves' tools": true }], [{ anyArtisansTool: 1 }], [{ anyMusicalInstrument: 1 }], [{ choose }]. */
export function readTools(block: any[] | undefined, label: string): ProfResult {
  const out: ProfResult = { fixed: [], choices: [] };
  const alt = block?.[0];
  if (!alt) return out;
  for (const [k, v] of Object.entries<any>(alt)) {
    if (k === "anyArtisansTool") out.choices.push({ key: "tools:artisan", count: Number(v) || 1, options: ARTISANS_TOOLS, label });
    else if (k === "anyMusicalInstrument") out.choices.push({ key: "tools:instrument", count: Number(v) || 1, options: MUSICAL_INSTRUMENTS, label });
    else if (k === "anyGamingSet") out.choices.push({ key: "tools:gaming", count: Number(v) || 1, options: GAMING_SETS, label });
    else if (k === "any") out.choices.push({ key: "tools", count: Number(v) || 1, options: ALL_TOOLS, label });
    else if (k === "choose") out.choices.push({ key: "tools", count: v.count ?? 1, options: (v.from ?? []).map((x: string) => stripRef(x)), label });
    else if (v === true) out.fixed.push(stripRef(k));
  }
  return out;
}

const TEXT_ARMOR: Record<string, string> = { "light armor": "light", "medium armor": "medium", "heavy armor": "heavy", shields: "shield", shield: "shield" };
const TEXT_WEAPONS: Record<string, string> = { "simple weapons": "simple", "martial weapons": "martial" };
// PHB weapons, so a named item ("the scimitar") is only read when it's a weapon (not "smith's tools").
const WEAPON_NAMES = new Set([
  "club", "dagger", "greatclub", "handaxe", "javelin", "light hammer", "mace", "quarterstaff", "sickle", "spear",
  "light crossbow", "dart", "shortbow", "sling", "battleaxe", "flail", "glaive", "greataxe", "greatsword", "halberd",
  "lance", "longsword", "maul", "morningstar", "pike", "rapier", "scimitar", "shortsword", "trident", "war pick",
  "warhammer", "whip", "blowgun", "hand crossbow", "heavy crossbow", "longbow", "net",
]);

/**
 * Armor and weapon proficiencies that subclass features only give in their
 * rules text ("You gain proficiency with medium armor, shields, and martial
 * weapons." — Hexblade, College of Valor, War Domain…). Only the plain
 * categories are read; anything else in the sentence is left alone.
 */
export function textProficiencies(entries: any): { armor: string[]; weapons: string[] } {
  const armor = new Set<string>();
  const weapons = new Set<string>();
  const texts: string[] = [];
  const walk = (x: any) => {
    if (typeof x === "string") texts.push(x);
    else if (Array.isArray(x)) x.forEach(walk);
    // "options" blocks are choices (one of several); their text isn't something the character has.
    else if (x && typeof x === "object" && x.type !== "options") walk(x.entries ?? x.items ?? []);
  };
  walk(entries);
  for (const t of texts) {
    for (const m of t.matchAll(/\bgains? proficiency with ([^.;]+)/gi)) {
      // A named weapon ("the {@item scimitar|phb}") counts too.
      const named = new Set([...m[1].matchAll(/\{@item ([^|}]+)/gi)].map((x) => x[1].toLowerCase()));
      const list = m[1].replace(/\{@\w+ ([^|}]+)[^}]*\}/g, "$1").toLowerCase();
      for (const part of list.split(/,\s*(?:and\s+)?|\s+and\s+/)) {
        const p = part.trim();
        if (TEXT_ARMOR[p]) armor.add(TEXT_ARMOR[p]);
        if (TEXT_WEAPONS[p]) weapons.add(TEXT_WEAPONS[p]);
        const item = p.replace(/^the\s+/, "");
        if (named.has(item) && WEAPON_NAMES.has(item)) weapons.add(item);
      }
    }
  }
  return { armor: [...armor], weapons: [...weapons] };
}

/** Armor / weapon blocks: [{ light: true, "longsword|phb": true }] or plain string lists. */
export function readFlags(block: any[] | undefined, plain?: string[]): string[] {
  const alt = block?.[0];
  if (alt && typeof alt === "object") return Object.entries(alt).filter(([, v]) => v === true).map(([k]) => stripRef(k));
  return (plain ?? []).map((s) => stripRef(s));
}
