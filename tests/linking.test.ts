// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { applyLink, applyLinks, findMentions, linkAtSelection, selectedRange } from "../src/editor/linking.ts";
import { fileShape, fromEditor, noteExtensions, toEditorContent } from "../src/editor/markdown.ts";
import type { Entry } from "../src/lib/types.ts";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});
const load = (text: string) => (editor = new Editor({ extensions: noteExtensions(), content: toEditorContent(text) }));
const save = (ed: Editor) => fromEditor(ed, fileShape("x\n"));
/** Position of the n-th occurrence of `s` in the first paragraph's text. */
const at = (ed: Editor, s: string, n = 0) => {
  let found = -1;
  ed.state.doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return;
    let i = -1;
    for (let k = 0; k <= n; k++) i = node.text!.indexOf(s, i + 1);
    if (i >= 0) found = pos + i;
  });
  return found;
};

const fireball: Entry = { kind: "spell", name: "Fireball", source: "XPHB", raw: {} };

describe("selectedRange", () => {
  it("trims spaces and punctuation", () => {
    const ed = load("He cast fireballs, twice.\n");
    const from = at(ed, " fireballs,");
    ed.commands.setTextSelection({ from, to: from + " fireballs,".length });
    expect(selectedRange(ed)).toMatchObject({ text: "fireballs", from: from + 1, to: from + 10 });
  });

  it("uses the word under the cursor when nothing is selected", () => {
    const ed = load("The owlbear's roar\n");
    ed.commands.setTextSelection(at(ed, "bear"));
    expect(selectedRange(ed)?.text).toBe("owlbear's");
  });

  it("refuses selections across paragraphs", () => {
    const ed = load("One fire\n\nTwo fire\n");
    ed.commands.setTextSelection({ from: 2, to: ed.state.doc.content.size - 2 });
    expect(selectedRange(ed)).toBeNull();
  });
});

describe("findMentions", () => {
  it("finds whole-word, case-insensitive, unlinked mentions", () => {
    const ed = load("Fireball! A fireball, then fireballs and {@spell Fireball|PHB|fireball}.\n\n`fireball` too.\n");
    expect(findMentions(ed.state.doc, "fireball").map((m) => m.text)).toEqual(["Fireball", "fireball"]);
  });
});

describe("linking", () => {
  it("links a range keeping the original wording", () => {
    const ed = load("Then fireballs everywhere\n");
    const from = at(ed, "fireballs");
    applyLink(ed, { from, to: from + 9 }, fireball);
    expect(save(ed)).toBe("Then {@spell Fireball|XPHB|fireballs} everywhere\n");
  });

  it("links several mentions at once", () => {
    const ed = load("goblin and Goblin and goblins\n");
    applyLinks(ed, findMentions(ed.state.doc, "goblin"), { kind: "creature", name: "Goblin", source: "XMM", raw: {} });
    expect(save(ed)).toBe("{@creature Goblin|XMM|goblin} and {@creature Goblin|XMM|Goblin} and goblins\n");
  });

  it("finds the whole link from inside it", () => {
    const ed = load("A {@spell Hold Person|XPHB|hold person} spell\n");
    ed.commands.setTextSelection(at(ed, "person"));
    expect(linkAtSelection(ed)).toMatchObject({ attrs: { name: "Hold Person", source: "XPHB" } });
    const l = linkAtSelection(ed)!;
    expect(ed.state.doc.textBetween(l.from, l.to)).toBe("hold person");
  });

  it("doesn't treat text next to a link as linked", () => {
    const ed = load("A {@spell Shield|XPHB|shield} wall\n");
    const from = at(ed, " wall") + 1;
    ed.commands.setTextSelection({ from, to: from + 4 });
    expect(linkAtSelection(ed)).toBeNull();
  });

  it("unlinks the whole link", () => {
    const ed = load("A {@spell Hold Person|XPHB|hold person} spell\n");
    ed.commands.setTextSelection(at(ed, "old"));
    ed.commands.unsetFiveLink();
    expect(save(ed)).toBe("A hold person spell\n");
  });
});
