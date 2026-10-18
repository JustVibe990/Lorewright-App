// Parse and write 5e.tools inline tags, e.g. {@spell fireball|PHB|fireballs}.
// Notes are stored as Markdown containing these tags, so they stay readable
// in any editor (and in Obsidian). Inside the app they become links.

import type { Kind } from "./types.ts";

/** Tag names as 5e.tools writes them, mapped to our kinds. */
export const TAG_TO_KIND: Record<string, Kind> = {
  spell: "spell",
  creature: "creature",
  item: "item",
  condition: "condition",
  feat: "feat",
};

export const KIND_TO_TAG: Record<Kind, string> = {
  spell: "spell",
  creature: "creature",
  item: "item",
  condition: "condition",
  feat: "feat",
};

export interface LinkTag {
  kind: Kind;
  name: string;
  source: string;
  display: string;
}

const TAG_RE = /\{@(spell|creature|item|condition|feat) ([^}]+)\}/g;

/** Read the parts of a tag body ("name|source|display"). Missing parts fall back sensibly. */
export function parseTagBody(kind: Kind, body: string): LinkTag {
  const [name = "", source = "", display = ""] = body.split("|");
  return {
    kind,
    name: name.trim(),
    source: source.trim() || defaultSource(kind),
    display: display.trim() || name.trim(),
  };
}

/** 5e.tools assumes these sources when a tag doesn't name one. */
export function defaultSource(kind: Kind): string {
  switch (kind) {
    case "creature":
      return "MM";
    case "item":
      return "DMG";
    default:
      return "PHB";
  }
}

export function writeTag(t: LinkTag): string {
  const clean = (s: string) => s.replace(/[|{}]/g, "");
  return `{@${KIND_TO_TAG[t.kind]} ${clean(t.name)}|${clean(t.source)}|${clean(t.display)}}`;
}

/** Find every link tag in a piece of text. */
export function findTags(text: string): { tag: LinkTag; start: number; end: number }[] {
  const out: { tag: LinkTag; start: number; end: number }[] = [];
  for (const m of text.matchAll(TAG_RE)) {
    out.push({
      tag: parseTagBody(TAG_TO_KIND[m[1]], m[2]),
      start: m.index!,
      end: m.index! + m[0].length,
    });
  }
  return out;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Turn tags in stored Markdown into HTML spans the editor understands.
 * Used when a note is loaded. The reverse happens in the editor's Markdown serializer.
 */
export function tagsToHtml(markdown: string): string {
  return markdown.replace(TAG_RE, (_all, tagName: string, body: string) => {
    const t = parseTagBody(TAG_TO_KIND[tagName], body);
    return (
      `<span data-5e="${t.kind}" data-name="${escapeAttr(t.name)}" data-source="${escapeAttr(t.source)}">` +
      `${escapeText(t.display)}</span>`
    );
  });
}

/** Plain-text version of a note (tags replaced by their display text). Used for search. */
export function stripTags(markdown: string): string {
  return markdown.replace(TAG_RE, (_all, tagName: string, body: string) =>
    parseTagBody(TAG_TO_KIND[tagName], body).display,
  );
}
