// The `fiveLink` mark: a span of note text linked to a 5e.tools entry.
// In the editor it's <span data-5e="spell" data-name=".." data-source="..">;
// in the saved Markdown it's {@spell Name|SOURCE|display text}.

import { Mark, mergeAttributes } from "@tiptap/core";
import type { Kind } from "../lib/types.ts";

export interface FiveLinkAttrs {
  kind: Kind;
  name: string;
  source: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fiveLink: {
      setFiveLink: (attrs: FiveLinkAttrs) => ReturnType;
      unsetFiveLink: () => ReturnType;
    };
  }
}

/** Characters that would break the tag syntax inside a name or source. */
const clean = (s: string) => String(s ?? "").replace(/[|{}]/g, "");

export const FiveLink = Mark.create({
  name: "fiveLink",
  // Typing at the edge of a link doesn't extend it.
  inclusive: false,
  // Links never nest inside other links.
  excludes: "fiveLink",
  // Low priority = innermost mark, so bold/italic wrap the tag ("**{@spell ...}**")
  // rather than ending up inside its display text.
  priority: 50,

  addAttributes() {
    return {
      kind: { default: "spell", parseHTML: (el) => el.getAttribute("data-5e"), renderHTML: () => ({}) },
      name: { default: "", parseHTML: (el) => el.getAttribute("data-name") ?? "", renderHTML: () => ({}) },
      source: { default: "", parseHTML: (el) => el.getAttribute("data-source") ?? "", renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-5e]" }];
  },

  renderHTML({ mark, HTMLAttributes }) {
    const { kind, name, source } = mark.attrs as FiveLinkAttrs;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: `lk lk-${kind}`,
        "data-5e": kind,
        "data-name": name,
        "data-source": source,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setFiveLink:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      // Removes the whole link under the cursor or selection, not just the selected part.
      unsetFiveLink:
        () =>
        ({ chain }) =>
          chain().extendMarkRange(this.name).unsetMark(this.name, { extendEmptyMarkRange: true }).run(),
    };
  },

  // Read by tiptap-markdown when saving.
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (_state: unknown, mark: { attrs: FiveLinkAttrs }) =>
            `{@${mark.attrs.kind} ${clean(mark.attrs.name)}|${clean(mark.attrs.source)}|`,
          close: "}",
          mixable: true,
          // tiptap-markdown's whitespace handling assumes a fixed string delimiter,
          // which a per-link opening tag isn't. Linking trims the selection instead.
          expelEnclosingWhitespace: false,
        },
        // Loading goes through HTML: tagsToHtml() runs before the Markdown parser.
        parse: {},
      },
    };
  },
});
