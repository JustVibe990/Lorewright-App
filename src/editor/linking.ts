// Editor-side helpers for highlight-to-link: what text is selected, where else
// it appears, and applying or removing links.

import { getMarkRange, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Entry } from "../lib/types.ts";

export interface TextRange {
  from: number;
  to: number;
  text: string;
}

const LEAD = /^[\s"“‘(\[]+/;
const TRAIL = /[\s"”’)\].,;:!?]+$/;

/**
 * The selected text, trimmed of surrounding spaces and punctuation, with the
 * matching document range. With an empty selection, the word under the cursor.
 * Null if nothing usable is selected or the selection spans several blocks.
 */
export function selectedRange(editor: Editor): TextRange | null {
  const { state } = editor;
  let { from, to, empty, $from, $to } = state.selection;
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return null;
  if (empty) {
    const word = wordAt(state.doc, from);
    if (!word) return null;
    ({ from, to } = word);
  }
  const raw = state.doc.textBetween(from, to, "\n", "\n");
  const lead = raw.match(LEAD)?.[0].length ?? 0;
  const trail = raw.slice(lead).match(TRAIL)?.[0].length ?? 0;
  const text = raw.slice(lead, raw.length - trail);
  if (!text.trim() || text.includes("\n")) return null;
  return { from: from + lead, to: to - trail, text };
}

/** The word (letters, digits, apostrophes, hyphens) around a position. */
function wordAt(doc: PMNode, pos: number): { from: number; to: number } | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return null;
  const text = parent.textBetween(0, parent.content.size, "\n", "￼");
  const offset = $pos.parentOffset;
  const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}'’-]/u.test(c);
  let a = offset;
  let b = offset;
  while (isWord(text[a - 1])) a--;
  while (isWord(text[b])) b++;
  if (a === b) return null;
  const start = $pos.start();
  return { from: start + a, to: start + b };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Other places in the document where `text` appears as whole words and isn't
 * already linked. Case-insensitive. Matches must sit inside one text run.
 */
export function findMentions(doc: PMNode, text: string, linkMark = "fiveLink"): TextRange[] {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(text)}(?![\\p{L}\\p{N}])`, "giu");
  const out: TextRange[] = [];
  doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text) return;
    if (node.marks.some((m) => m.type.name === linkMark || m.type.name === "code")) return;
    if (parent?.type.name === "codeBlock") return;
    for (const m of node.text.matchAll(re)) {
      out.push({ from: pos + m.index!, to: pos + m.index! + m[0].length, text: m[0] });
    }
  });
  return out;
}

/** Link a range to an entry, keeping its wording, and put the cursor after it. */
export function applyLink(editor: Editor, range: { from: number; to: number }, entry: Entry, moveCursor = true) {
  const chain = editor
    .chain()
    .setTextSelection(range)
    .setFiveLink({ kind: entry.kind, name: entry.name, source: entry.source });
  (moveCursor ? chain.setTextSelection(range.to) : chain).run();
}

/** Link several ranges in one undo step. */
export function applyLinks(editor: Editor, ranges: { from: number; to: number }[], entry: Entry) {
  const markType = editor.schema.marks.fiveLink;
  const tr = editor.state.tr;
  for (const r of ranges) tr.addMark(r.from, r.to, markType.create({ kind: entry.kind, name: entry.name, source: entry.source }));
  editor.view.dispatch(tr);
}

export interface LinkAt {
  from: number;
  to: number;
  attrs: { kind: string; name: string; source: string };
}

/**
 * The link touched by the selection (the whole link, not just the selected
 * part), or null. With an empty selection: the link the cursor is in or at the end of.
 */
export function linkAtSelection(editor: Editor): LinkAt | null {
  const { state } = editor;
  const type = state.schema.marks.fiveLink;
  const { from, to, empty } = state.selection;
  let pos = from;
  if (!empty) {
    if (!state.doc.rangeHasMark(from, to, type)) return null;
    // First position inside the selection that carries the mark.
    state.doc.nodesBetween(from, to, (node, p) => {
      if (pos === from && node.isText && node.marks.some((m) => m.type === type)) pos = Math.max(p, from);
      return pos === from;
    });
  }
  const range = getMarkRange(state.doc.resolve(pos), type);
  if (!range) return null;
  const mark = state.doc.nodeAt(range.from)?.marks.find((m) => m.type === type);
  return mark ? { ...range, attrs: mark.attrs as LinkAt["attrs"] } : null;
}
