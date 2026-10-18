// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { fileShape, fromEditor, noteExtensions, toEditorContent } from "../src/editor/markdown.ts";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function load(text: string): Editor {
  editor = new Editor({ extensions: noteExtensions(), content: toEditorContent(text) });
  return editor;
}
const roundTrip = (text: string) => fromEditor(load(text), fileShape(text));

const NOTE = `# Session 12: The Sunless Citadel

The party met {@creature Meepo|DMG|Meepo} near the entrance.

## Fights

- Two {@creature Goblin|XMM|goblins} ambushed them in the courtyard.
- The wizard cast {@spell Fireball|XPHB|fireballs} and then **{@spell Shield|XPHB|shield}**.
- Kara was {@condition Paralyzed|XPHB|paralysed} for a round.

1. Loot: a {@item Bag of Holding|XDMG|bag of holding}
2. 120 gp

> The {@creature Owlbear|XMM|owlbear's} roar echoed through the halls.

Plain *italic* and **bold** text, with \`code\` too.

---

Next time: find the {@item Potion of Healing|XDMG|potions}.
`;

describe("Markdown round trip", () => {
  it("leaves a typical note byte-identical", () => {
    expect(roundTrip(NOTE)).toBe(NOTE);
  });

  it("keeps Windows line endings", () => {
    const crlf = NOTE.replace(/\n/g, "\r\n");
    expect(roundTrip(crlf)).toBe(crlf);
  });

  it("keeps a missing trailing newline missing", () => {
    expect(roundTrip("One {@spell Fireball|PHB|fireball} line")).toBe("One {@spell Fireball|PHB|fireball} line");
  });

  it("handles empty notes", () => {
    expect(roundTrip("")).toBe("");
  });

  it("turns tags into fiveLink marks with attributes", () => {
    const ed = load("Cast {@spell Fireball|XPHB|fireballs} now");
    const marks: any[] = [];
    ed.state.doc.descendants((n) => {
      n.marks.forEach((m) => marks.push({ type: m.type.name, ...m.attrs, text: n.text }));
    });
    expect(marks).toEqual([{ type: "fiveLink", kind: "spell", name: "Fireball", source: "XPHB", text: "fireballs" }]);
  });

  it("writes short tags out in full", () => {
    expect(roundTrip("A {@creature goblin} appears\n")).toBe("A {@creature goblin|MM|goblin} appears\n");
  });

  it("writes new links in full tag syntax", () => {
    const ed = load("Then fireballs everywhere\n");
    // Select "fireballs" (positions are 1-based inside the paragraph).
    const from = 1 + "Then ".length;
    ed.chain().setTextSelection({ from, to: from + "fireballs".length }).setFiveLink({ kind: "spell", name: "Fireball", source: "XPHB" }).run();
    expect(fromEditor(ed, { eol: "\n", trailingNewline: true })).toBe("Then {@spell Fireball|XPHB|fireballs} everywhere\n");
    // Unlinking part of a link removes the whole link.
    ed.chain().setTextSelection({ from: from + 2, to: from + 2 }).unsetFiveLink().run();
    expect(fromEditor(ed, { eol: "\n", trailingNewline: true })).toBe("Then fireballs everywhere\n");
  });

  it("keeps tricky characters intact", () => {
    const text = "Names: {@spell Tasha's Hideous Laughter|XPHB|Tasha's laughter} & <angle> brackets\n";
    expect(roundTrip(text)).toBe(text);
  });

  it("leaves tags and HTML inside code alone", () => {
    const text = "Use `{@spell Fireball}` and `a <b> c` here\n\n```\n{@creature Goblin|MM|x} & <tag>\n```\n";
    expect(roundTrip(text)).toBe(text);
    const ed = load(text);
    let links = 0;
    ed.state.doc.descendants((n) => {
      if (n.marks.some((m) => m.type.name === "fiveLink")) links++;
    });
    expect(links).toBe(0);
  });

  it("is stable after a second save", () => {
    const once = roundTrip("* star list\n* item two\n\n_underscore italic_\n");
    expect(roundTrip(once)).toBe(once);
  });
});
