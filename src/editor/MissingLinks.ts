// Marks links whose entry isn't in the loaded data (e.g. after a re-import
// without that source) with a "lk-missing" class: red wavy underline.

import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type LinkAttrs = { kind: string; name: string; source: string };

export const missingLinksKey = new PluginKey<DecorationSet>("missingLinks");

export interface MissingLinksOptions {
  isMissing: (attrs: LinkAttrs) => boolean;
}

export const MissingLinks = Extension.create<MissingLinksOptions>({
  name: "missingLinks",

  addOptions() {
    return { isMissing: () => false };
  },

  addProseMirrorPlugins() {
    const isMissing = (a: LinkAttrs) => this.options.isMissing(a);
    const build = (doc: PMNode) => {
      const decos: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (!node.isText) return;
        const mark = node.marks.find((m) => m.type.name === "fiveLink");
        if (mark && isMissing(mark.attrs as LinkAttrs)) {
          decos.push(Decoration.inline(pos, pos + node.nodeSize, { class: "lk-missing" }));
        }
      });
      return DecorationSet.create(doc, decos);
    };
    return [
      new Plugin({
        key: missingLinksKey,
        state: {
          init: (_, state) => build(state.doc),
          // Rebuild on edits, or when told the data changed (meta set by recheckLinks).
          apply: (tr, old) => (tr.docChanged || tr.getMeta(missingLinksKey) ? build(tr.doc) : old),
        },
        props: {
          decorations: (state) => missingLinksKey.getState(state),
        },
      }),
    ];
  },
});
