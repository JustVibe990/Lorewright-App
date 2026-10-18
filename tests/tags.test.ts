import { describe, expect, it } from "vitest";
import { defaultSource, findTags, parseTagBody, stripTags, tagsToHtml, writeTag } from "../src/lib/tags.ts";

describe("tag parser", () => {
  it("reads name, source and display text", () => {
    expect(parseTagBody("spell", "Fireball|XPHB|fireballs")).toEqual({
      kind: "spell", name: "Fireball", source: "XPHB", display: "fireballs",
    });
  });

  it("falls back to the default source and the name as display", () => {
    expect(parseTagBody("creature", "goblin")).toMatchObject({ source: "MM", display: "goblin" });
    expect(parseTagBody("item", "bag of holding||the bag")).toMatchObject({ source: "DMG", display: "the bag" });
    expect(defaultSource("spell")).toBe("PHB");
    expect(defaultSource("condition")).toBe("PHB");
  });

  it("finds every link tag with its position", () => {
    const text = "Cast {@spell Fireball|PHB|fireball} at the {@creature Goblin|MM|goblins}.";
    const tags = findTags(text);
    expect(tags.map((t) => t.tag.display)).toEqual(["fireball", "goblins"]);
    expect(text.slice(tags[1].start, tags[1].end)).toBe("{@creature Goblin|MM|goblins}");
  });

  it("ignores non-link tags", () => {
    expect(findTags("Deals {@damage 2d6} damage")).toEqual([]);
  });
});

describe("tag writer", () => {
  it("always writes name|source|display in full", () => {
    expect(writeTag({ kind: "spell", name: "Fireball", source: "XPHB", display: "fireballs" })).toBe(
      "{@spell Fireball|XPHB|fireballs}",
    );
  });

  it("strips characters that would break the tag", () => {
    expect(writeTag({ kind: "item", name: "Odd|Name", source: "DMG", display: "a {weird} one" })).toBe(
      "{@item OddName|DMG|a weird one}",
    );
  });

  it("round-trips through the parser", () => {
    const t = { kind: "condition" as const, name: "Paralyzed", source: "XPHB", display: "paralysis" };
    expect(findTags(writeTag(t))[0].tag).toEqual(t);
  });
});

describe("tags to editor HTML", () => {
  it("makes spans with escaped attributes", () => {
    expect(tagsToHtml('See {@spell Tasha\'s Hideous Laughter|PHB|"laughter"} & more')).toBe(
      'See <span data-5e="spell" data-name="Tasha\'s Hideous Laughter" data-source="PHB">"laughter"</span> & more',
    );
  });

  it("escapes markup in display text", () => {
    expect(tagsToHtml("{@item Rope|PHB|<rope>}")).toContain("&lt;rope&gt;</span>");
  });

  it("strips tags to display text for search", () => {
    expect(stripTags("The {@creature Owlbear|MM|owlbear} roars")).toBe("The owlbear roars");
  });
});
