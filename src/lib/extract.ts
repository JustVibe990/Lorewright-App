// Turn raw 5e.tools JSON files into Entry objects. Pure functions (no I/O),
// so they can be unit-tested.

import type { Entry, Kind } from "./types.ts";

/** What to download for each kind, relative to the site root. */
export interface CategorySpec {
  kind: Kind;
  label: string;
  /** Either an index file listing one JSON file per source... */
  index?: string;
  /** ...or fixed files. */
  files?: string[];
  /** The array keys inside each file that hold entries of this kind. */
  keys: string[];
}

export const CATEGORIES: CategorySpec[] = [
  { kind: "spell", label: "Spells", index: "data/spells/index.json", keys: ["spell"] },
  { kind: "creature", label: "Monsters", index: "data/bestiary/index.json", keys: ["monster"] },
  { kind: "item", label: "Items", files: ["data/items.json", "data/items-base.json"], keys: ["item", "baseitem"] },
  { kind: "condition", label: "Conditions", files: ["data/conditionsdiseases.json"], keys: ["condition", "disease", "status"] },
  { kind: "feat", label: "Feats", files: ["data/feats.json"], keys: ["feat"] },
];

/**
 * Rules data for the character builder. Not linkable from notes; downloaded
 * whole (every source) and cached alongside the linkable data.
 */
export interface RulesSpec {
  id: "class" | "race" | "background" | "optionalfeature" | "spellsource" | "magicvariant";
  label: string;
  index?: string;
  files?: string[];
}

export const RULES: RulesSpec[] = [
  { id: "class", label: "Classes and subclasses", index: "data/class/index.json" },
  { id: "race", label: "Species", files: ["data/races.json"] },
  { id: "background", label: "Backgrounds", files: ["data/backgrounds.json"] },
  { id: "optionalfeature", label: "Class options", files: ["data/optionalfeatures.json"] },
  { id: "spellsource", label: "Class spell lists", files: ["data/spells/sources.json"] },
  { id: "magicvariant", label: "Magic item variants", files: ["data/magicvariants.json"] },
];

/** Manifest kind for a rules file, e.g. "rules:class". */
export const rulesKind = (id: RulesSpec["id"]) => `rules:${id}`;

/** Resolve a category's index file into the list of data files to fetch. */
export function filesFromIndex(spec: { index?: string }, index: Record<string, string>, onlySources?: string[]) {
  const dir = spec.index!.replace(/[^/]+$/, "");
  return Object.entries(index)
    .filter(([src]) => !onlySources?.length || onlySources.map((s) => s.toLowerCase()).includes(src.toLowerCase()))
    .map(([src, file]) => ({ source: src, path: dir + file }));
}

export function extractEntries(spec: CategorySpec, json: any, onlySources?: string[]): Entry[] {
  const allowed = onlySources?.map((s) => s.toLowerCase());
  const out: Entry[] = [];
  for (const key of spec.keys) {
    for (const raw of json?.[key] ?? []) {
      if (!raw?.name || !raw?.source) continue;
      if (allowed?.length && !allowed.includes(String(raw.source).toLowerCase())) continue;
      out.push({ kind: spec.kind, name: raw.name, source: raw.source, page: raw.page, raw });
    }
  }
  return out;
}

/**
 * Tidy a pasted URL: add https://, drop #hash and ?query, drop a trailing
 * page like spells.html, and drop trailing slashes.
 */
export function normalizeBaseUrl(url: string): string {
  let u = url.trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u
    .replace(/#.*$/, "")
    .replace(/\?.*$/, "")
    .replace(/\/[^/]*\.html?$/i, "")
    .replace(/\/+$/, "");
}

/** Cheap content hash so sync can report which files actually changed. */
export function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16) + ":" + s.length;
}
