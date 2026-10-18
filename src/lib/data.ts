// The loaded rules data: built-in SRD starter set plus whatever the user
// imported from their 5e.tools URL, with search and card rendering on top.

import srdJson from "../data/srd.json";
import { CATEGORIES, extractEntries } from "./extract.ts";
import { renderCard } from "./render.ts";
import { SearchIndex } from "./search.ts";
import type { Entry, Kind } from "./types.ts";

export const SRD_ATTRIBUTION: string = (srdJson as any)._meta.attribution;

/** Entries from the bundled SRD 5.1 file, in the same JSON shape 5e.tools uses. */
export function srdEntries(): Entry[] {
  return CATEGORIES.flatMap((spec) => extractEntries(spec, srdJson));
}

export class DataStore {
  readonly index: SearchIndex;

  /** SRD first, then imported entries (imports never replace SRD; they have their own sources). */
  constructor(imported: Entry[] = [], includeSrd = true) {
    this.index = new SearchIndex(includeSrd ? srdEntries() : []);
    this.index.add(imported);
  }

  find(kind: string, name: string, source: string): Entry | undefined {
    return this.index.find(kind, name, source);
  }

  findName(kind: string, name: string): Entry | undefined {
    return this.index.findName(kind, name);
  }

  /** Card HTML, with `_copy` entries merged onto their base entry of the same kind. */
  card(entry: Entry): string {
    return renderCard(entry, (name, source) => this.index.find(entry.kind, name, source)?.raw);
  }

  /** Entry counts per kind, for the settings screen. */
  stats(): Record<Kind, number> {
    const out: Record<Kind, number> = { spell: 0, creature: 0, item: 0, condition: 0, feat: 0 };
    for (const e of this.index.entries()) out[e.kind]++;
    return out;
  }

  /** Every source code present, sorted, for the per-campaign source filter. */
  sources(): string[] {
    return [...new Set(this.index.entries().map((e) => e.source))].sort();
  }
}
