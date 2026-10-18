// Ctrl+K quick search: one list across the campaign's notes, its characters,
// the 5e.tools entries and the character rules (classes, subclasses, species,
// backgrounds, class options), best matches first within each group.

import { searchNotes, type NoteText } from "./notesearch.ts";
import type { SearchIndex } from "./search.ts";
import type { Entry } from "./types.ts";

/** A rules page: opened through the rules' linkEntry, like a compendium. */
export interface RuleItem {
  kind: string;
  name: string;
  source: string;
  label: string;
  hint: string;
}

export type QuickItem =
  | { type: "note"; file: string; title: string; snippet?: [string, string, string] }
  | { type: "character"; file: string; name: string; detail: string }
  | { type: "entry"; entry: Entry }
  | { type: "rule"; rule: RuleItem }
  | { type: "table"; id: string; name: string; size: number };

export interface QuickSources {
  notes: NoteText[];
  characters: { file: string; name: string; detail: string }[];
  index?: Pick<SearchIndex, "search">;
  rules?: RuleItem[];
  /** The DM's random tables: picking one rolls on it. */
  tables?: { id: string; name: string; size: number }[];
}

const has = (s: string, q: string) => s.toLowerCase().includes(q);
const starts = (s: string, q: string) => s.toLowerCase().startsWith(q);

/** Classes first, then subclasses, then the rest, so "fighter" lists the class before its options. */
const RULE_ORDER: Record<string, number> = { class: 0, subclass: 1, race: 2, background: 3, optfeature: 4 };

/**
 * Results for `query`. With an empty query: recent notes and all characters.
 * Characters and notes whose title matches come before rules and 5e entries,
 * then notes that only mention the words in their text.
 */
export function quickSearch(query: string, src: QuickSources, limit = 40): QuickItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [
      ...src.characters.map((c): QuickItem => ({ type: "character", ...c })),
      ...src.notes.slice(0, 8).map((n): QuickItem => ({ type: "note", file: n.file, title: n.title })),
    ].slice(0, limit);
  }
  const byStart = <T,>(list: T[], name: (x: T) => string) =>
    list.filter((x) => has(name(x), q)).sort((a, b) => Number(starts(name(b), q)) - Number(starts(name(a), q)) || name(a).localeCompare(name(b)));

  const chars = byStart(src.characters, (c) => c.name).map((c): QuickItem => ({ type: "character", ...c }));
  const noteHits = searchNotes(src.notes, q);
  const titled = noteHits.filter((h) => h.inTitle).map((h): QuickItem => ({ type: "note", file: h.file, title: h.title }));
  const mentions = noteHits
    .filter((h) => !h.inTitle)
    .map((h): QuickItem => {
      // Notes usually start with their title as a heading: don't show it twice.
      const before = h.snippet[0].startsWith(h.title) ? h.snippet[0].slice(h.title.length).trimStart() : h.snippet[0];
      return { type: "note", file: h.file, title: h.title, snippet: [before, h.snippet[1], h.snippet[2]] };
    });
  // Rules match their name, or their class for subclasses ("wizard" lists every tradition).
  const rules = (src.rules ?? [])
    .filter((r) => has(r.label, q) || (r.kind === "subclass" && has(r.hint, q)))
    .sort(
      (a, b) =>
        Number(starts(b.label, q)) - Number(starts(a.label, q)) ||
        Number(has(b.label, q)) - Number(has(a.label, q)) ||
        (RULE_ORDER[a.kind] ?? 9) - (RULE_ORDER[b.kind] ?? 9) ||
        a.label.localeCompare(b.label),
    )
    .slice(0, 15)
    .map((rule): QuickItem => ({ type: "rule", rule }));
  const entries = (src.index?.search(query, { limit: 12 }) ?? []).map((m): QuickItem => ({ type: "entry", entry: m.entry }));
  const tables = byStart(src.tables ?? [], (t) => t.name).map((t): QuickItem => ({ type: "table", ...t }));

  return [...chars, ...titled, ...tables, ...rules, ...entries, ...mentions].slice(0, limit);
}
