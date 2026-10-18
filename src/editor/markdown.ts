// Loading and saving notes between Markdown files and the TipTap editor.

import type { Editor, Extensions } from "@tiptap/core";
import Text from "@tiptap/extension-text";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { tagsToHtml } from "../lib/tags.ts";
import { FiveLink } from "./FiveLink.ts";

/**
 * tiptap-markdown writes "<" as "&lt;" so it won't be read back as HTML.
 * Our loader escapes "<" in prose itself, so text can be saved exactly as typed.
 */
const PlainText = Text.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: { text: (s: string) => void }, node: { text: string }) {
          state.text(node.text);
        },
        parse: {},
      },
    };
  },
});

/** Editor extensions shared by the app and the round-trip tests. */
export function noteExtensions(extra: Extensions = []): Extensions {
  return [
    StarterKit.configure({ text: false }),
    PlainText,
    Markdown.configure({
      html: true, // needed: link tags become <span data-5e> before parsing
      tightLists: true,
      bulletListMarker: "-",
      linkify: false,
      breaks: false,
      transformPastedText: true,
    }),
    FiveLink,
    ...extra,
  ];
}

/** How the file was written, so saving keeps the same line endings. */
export interface FileShape {
  eol: "\n" | "\r\n";
  trailingNewline: boolean;
}

export function fileShape(text: string): FileShape {
  return { eol: text.includes("\r\n") ? "\r\n" : "\n", trailingNewline: /\n$/.test(text) || text === "" };
}

/** Plain prose: escape & and < so only our link spans are read as HTML, then convert tags. */
const prose = (s: string) => tagsToHtml(s.replace(/&/g, "&amp;").replace(/</g, "&lt;"));

/** Convert one line-run of non-fenced text, leaving `code spans` untouched. */
function convertInline(text: string): string {
  let out = "";
  let i = 0;
  const re = /(`+)[\s\S]*?\1/g;
  for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
    out += prose(text.slice(i, m.index)) + m[0];
    i = m.index + m[0].length;
  }
  return out + prose(text.slice(i));
}

/** Markdown file text -> what the editor's setContent() takes. */
export function toEditorContent(fileText: string): string {
  const text = fileText.replace(/\r\n/g, "\n").replace(/\n$/, "");
  // Fenced code blocks are kept exactly as written.
  const parts = text.split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?(?:\n(?:```|~~~)[ \t]*(?=\n|$)|$))/m);
  return parts.map((p, i) => (i % 2 ? p : convertInline(p))).join("");
}

/** Editor -> Markdown file text. */
export function fromEditor(editor: Editor, shape: FileShape): string {
  const md: string = (editor.storage as any).markdown.getMarkdown();
  const body = shape.eol === "\r\n" ? md.replace(/\n/g, "\r\n") : md;
  return body && shape.trailingNewline ? body + shape.eol : body;
}
