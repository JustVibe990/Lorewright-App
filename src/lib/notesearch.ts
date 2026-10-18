// Full-text search across a campaign's notes. Link tags are reduced to their
// display text first, so searching "fireballs" finds {@spell Fireball|PHB|fireballs}.

import { stripTags } from "./tags.ts";

export interface NoteText {
  file: string;
  title: string;
  text: string; // raw Markdown
}

export interface NoteHit {
  file: string;
  title: string;
  /** Snippet split around the match: before, match, after. */
  snippet: [string, string, string];
  count: number;
  inTitle: boolean;
}

/** Markdown -> plain text good enough for searching and snippets. */
export function plainText(md: string): string {
  return stripTags(md)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/(\*\*|__|\*|_|~~|`)/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>])/g, "$1")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SNIPPET = 48;

export function searchNotes(notes: NoteText[], query: string, limit = 50): NoteHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: (NoteHit & { score: number })[] = [];
  for (const n of notes) {
    const body = plainText(n.text);
    const lower = body.toLowerCase();
    const inTitle = n.title.toLowerCase().includes(q);
    let count = 0;
    for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) count++;
    if (!count && !inTitle) continue;
    const at = lower.indexOf(q);
    let snippet: [string, string, string];
    if (at === -1) {
      snippet = [body.slice(0, SNIPPET * 2) + (body.length > SNIPPET * 2 ? "…" : ""), "", ""];
    } else {
      const start = Math.max(0, at - SNIPPET);
      const end = Math.min(body.length, at + q.length + SNIPPET);
      snippet = [
        (start > 0 ? "…" : "") + body.slice(start, at),
        body.slice(at, at + q.length),
        body.slice(at + q.length, end) + (end < body.length ? "…" : ""),
      ];
    }
    hits.push({ file: n.file, title: n.title, snippet, count, inTitle, score: (inTitle ? 100 : 0) + count });
  }
  return hits
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map(({ score: _s, ...h }) => h);
}
