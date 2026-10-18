import { describe, expect, it } from "vitest";
import { plainText, searchNotes } from "../src/lib/notesearch.ts";

const notes = [
  { file: "Session 1.md", title: "Session 1", text: "# Arrival\n\nThe wizard cast {@spell Fireball|XPHB|fireballs} at **goblins**.\n" },
  { file: "Session 2.md", title: "Session 2", text: "- Met an {@creature Owlbear|XMM|owlbear}\n- Another owlbear later\n" },
  { file: "Owlbear lair.md", title: "Owlbear lair", text: "A cave in the woods.\n" },
];

describe("note search", () => {
  it("reduces tags and Markdown to plain text", () => {
    expect(plainText(notes[0].text)).toBe("Arrival The wizard cast fireballs at goblins.");
  });

  it("searches link display text, not tag syntax", () => {
    expect(searchNotes(notes, "fireballs").map((h) => h.file)).toEqual(["Session 1.md"]);
    expect(searchNotes(notes, "XPHB")).toEqual([]);
    expect(searchNotes(notes, "spell")).toEqual([]);
  });

  it("ranks title matches first, then match count", () => {
    const hits = searchNotes(notes, "owlbear");
    expect(hits.map((h) => h.file)).toEqual(["Owlbear lair.md", "Session 2.md"]);
    expect(hits[1].count).toBe(2);
  });

  it("returns a snippet around the first match", () => {
    const [hit] = searchNotes(notes, "GOBLINS");
    expect(hit.snippet).toEqual(["Arrival The wizard cast fireballs at ", "goblins", "."]);
  });

  it("ignores empty queries", () => {
    expect(searchNotes(notes, "  ")).toEqual([]);
  });
});
