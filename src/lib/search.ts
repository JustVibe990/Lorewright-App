// In-memory search over all imported entries.
// Matching order: exact name -> word-form variants (plurals, -ed, -ing,
// leading "the") -> names containing the text -> fuzzy (edit distance).

import type { CampaignConfig, Entry, Kind } from "./types.ts";
import { entryKey } from "./types.ts";

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/'s\b/g, "")
    .replace(/[^a-z0-9' ]+/g, " ")
    // Plural possessives ("owlbears'") and stray quotes.
    .replace(/'(?=\s|$)|(^|\s)'/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const LEADING_WORDS = /^(the|a|an|my|his|her|their|our|your|its|some|this|that|these|those) /;

/** Candidate base forms for a highlighted phrase: "the owlbears" -> ["owlbears", "owlbear", ...]. */
export function wordForms(text: string): string[] {
  const base = normalize(text).replace(LEADING_WORDS, "");
  const forms = new Set<string>([base]);
  const words = base.split(" ");
  const last = words[words.length - 1] ?? "";
  const head = words.slice(0, -1).join(" ");
  const withLast = (w: string) => (head ? `${head} ${w}` : w);

  const variants: string[] = [];
  if (last.endsWith("ies")) variants.push(last.slice(0, -3) + "y");
  if (last.endsWith("ves")) variants.push(last.slice(0, -3) + "f", last.slice(0, -3) + "fe");
  if (last.endsWith("es")) variants.push(last.slice(0, -2));
  if (last.endsWith("s") && !last.endsWith("ss")) variants.push(last.slice(0, -1));
  if (last.endsWith("ed")) variants.push(last.slice(0, -2), last.slice(0, -1));
  if (last.endsWith("ing")) variants.push(last.slice(0, -3), last.slice(0, -3) + "e");
  if (last === "men") variants.push("man");
  // Conditions: "paralysis" -> "paralyzed", "grappling" -> "grappled", etc.
  if (last.endsWith("sis")) variants.push(last.slice(0, -3) + "zed");
  if (last.endsWith("ing")) variants.push(last.slice(0, -3) + "ed");
  if (!last.endsWith("ed")) variants.push(last + "ed", last + "d");

  for (const v of variants) if (v.length > 1) forms.add(withLast(v));
  // Plurals earlier in the phrase: "potions of healing" -> "potion of healing".
  words.slice(0, -1).forEach((w, i) => {
    for (const s of singulars(w)) {
      forms.add([...words.slice(0, i), s, ...words.slice(i + 1)].join(" "));
    }
  });
  return [...forms];
}

function singulars(w: string): string[] {
  const out: string[] = [];
  if (w.endsWith("ies")) out.push(w.slice(0, -3) + "y");
  else if (w.endsWith("ves")) out.push(w.slice(0, -3) + "f", w.slice(0, -3) + "fe");
  else if (w.endsWith("es")) out.push(w.slice(0, -2), w.slice(0, -1));
  else if (w.endsWith("s") && !w.endsWith("ss")) out.push(w.slice(0, -1));
  return out.filter((s) => s.length > 1);
}

/** Levenshtein distance, capped for speed. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export interface Match {
  entry: Entry;
  score: number; // lower is better
  how: "exact" | "form" | "partial" | "contains" | "fuzzy";
}

export interface SearchOptions {
  allowedSources?: string[]; // empty or undefined = all
  kinds?: Kind[];
  limit?: number;
}

/** Newer printings first, then the 2014 books, then the SRD, then everything else. */
const PREFERRED = ["XPHB", "XMM", "XDMG", "PHB", "MM", "DMG", "SRD"];
export function sourceRank(source: string): number {
  const i = PREFERRED.indexOf(source.toUpperCase());
  return i === -1 ? PREFERRED.length : i;
}

export class SearchIndex {
  private byName = new Map<string, Entry[]>();
  private all: { norm: string; entry: Entry }[] = [];

  constructor(entries: Entry[] = []) {
    this.add(entries);
  }

  add(entries: Entry[]) {
    for (const e of entries) {
      const n = normalize(e.name);
      const list = this.byName.get(n) ?? [];
      // Same name + kind + source twice (e.g. re-import) replaces, never duplicates.
      const i = list.findIndex(
        (x) => x.kind === e.kind && x.source.toLowerCase() === e.source.toLowerCase(),
      );
      if (i >= 0) {
        const j = this.all.findIndex((a) => a.entry === list[i]);
        if (j >= 0) this.all[j] = { norm: n, entry: e };
        list[i] = e;
      } else {
        list.push(e);
        this.all.push({ norm: n, entry: e });
      }
      this.byName.set(n, list);
    }
  }

  get size(): number {
    return this.all.length;
  }

  entries(): Entry[] {
    return this.all.map((a) => a.entry);
  }

  /** The exact entry a link points at, or undefined (shown as a broken link). */
  find(kind: string, name: string, source: string): Entry | undefined {
    return (this.byName.get(normalize(name)) ?? []).find(
      (e) => e.kind === kind && e.source.toLowerCase() === source.toLowerCase(),
    );
  }

  /** By name alone (item text names spells without a source): the PHB one if there's a choice. */
  findName(kind: string, name: string): Entry | undefined {
    const list = (this.byName.get(normalize(name)) ?? []).filter((e) => e.kind === kind);
    return list.find((e) => e.source === "PHB") ?? list.find((e) => !e.source.startsWith("X")) ?? list[0];
  }

  findByKey(key: string): Entry | undefined {
    const [kind, name, source] = key.split("|");
    return this.find(kind, name ?? "", source ?? "");
  }

  search(text: string, opts: SearchOptions = {}): Match[] {
    const limit = opts.limit ?? 12;
    const allowed = (opts.allowedSources ?? []).map((s) => s.toLowerCase());
    const ok = (e: Entry) =>
      (!allowed.length || allowed.includes(e.source.toLowerCase())) &&
      (!opts.kinds?.length || opts.kinds.includes(e.kind));

    const seen = new Set<Entry>();
    const out: Match[] = [];
    const push = (entry: Entry, score: number, how: Match["how"]) => {
      if (seen.has(entry) || !ok(entry)) return;
      seen.add(entry);
      out.push({ entry, score: score + sourceRank(entry.source) * 0.01, how });
    };

    const q = normalize(text);
    if (!q) return [];
    for (const e of this.byName.get(q) ?? []) push(e, 0, "exact");
    wordForms(text).forEach((f, i) => {
      for (const e of this.byName.get(f) ?? []) push(e, 1 + i * 0.05, "form");
    });
    // "the owlbear's claw": also try the leading word(s) on their own.
    const words = normalize(text).replace(LEADING_WORDS, "").split(" ");
    for (let n = words.length - 1; n >= 1; n--) {
      for (const f of wordForms(words.slice(0, n).join(" "))) {
        for (const e of this.byName.get(f) ?? []) push(e, 2 + (words.length - n) * 0.1, "partial");
      }
    }
    if (q.length >= 3) {
      for (const { norm, entry } of this.all) {
        if (norm.startsWith(q)) push(entry, 3 + norm.length / 100, "contains");
        else if (norm.includes(q)) push(entry, 4 + norm.length / 100, "contains");
      }
    }
    if (out.length < limit && q.length >= 3) {
      const max = q.length < 7 ? 1 : 2;
      for (const { norm, entry } of this.all) {
        const d = editDistance(q, norm, max);
        if (d <= max) push(entry, 5 + d, "fuzzy");
      }
    }
    return out.sort((a, b) => a.score - b.score).slice(0, limit);
  }
}

/** Key for remembered picker choices: the selection, normalised. */
export function choiceKey(text: string): string {
  return normalize(text);
}

export type Resolution =
  | { type: "link"; entry: Entry; why: "remembered" | "unique" }
  | { type: "pick"; matches: Match[] };

/**
 * Decide what highlighting `text` should do:
 * 1. a remembered choice for this campaign links instantly;
 * 2. if every exact (or word-form) match is the same rules entry, link the newest printing;
 * 3. otherwise show the picker.
 */
export function resolveSelection(index: SearchIndex, text: string, cfg?: CampaignConfig): Resolution {
  const allowedSources = cfg?.allowedSources ?? [];
  const remembered = cfg?.choices[choiceKey(text)];
  if (remembered) {
    const e = index.findByKey(remembered);
    const allowed = !allowedSources.length || (e && allowedSources.some((s) => s.toLowerCase() === e.source.toLowerCase()));
    if (e && allowed) return { type: "link", entry: e, why: "remembered" };
  }
  const matches = index.search(text, { allowedSources, limit: 30 });
  const exact = matches.filter((m) => m.how === "exact");
  const top = exact.length ? exact : matches.filter((m) => m.how === "form");
  if (top.length) {
    const same = new Set(top.map((m) => `${m.entry.kind}|${normalize(m.entry.name)}`));
    if (same.size === 1) {
      const best = [...top].sort((a, b) => sourceRank(a.entry.source) - sourceRank(b.entry.source))[0];
      return { type: "link", entry: best.entry, why: "unique" };
    }
  }
  return { type: "pick", matches: matches.slice(0, 12) };
}

export { entryKey };
