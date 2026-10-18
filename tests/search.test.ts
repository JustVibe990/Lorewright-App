import { describe, expect, it } from "vitest";
import { editDistance, normalize, resolveSelection, SearchIndex, wordForms } from "../src/lib/search.ts";
import type { Entry, Kind } from "../src/lib/types.ts";
import { entryKey } from "../src/lib/types.ts";

const e = (kind: Kind, name: string, source: string): Entry => ({ kind, name, source, raw: { name, source } });

const ENTRIES = [
  e("spell", "Fireball", "PHB"),
  e("spell", "Fireball", "XPHB"),
  e("spell", "Delayed Blast Fireball", "PHB"),
  e("spell", "Shield", "PHB"),
  e("spell", "Shield", "XPHB"),
  e("item", "Shield", "PHB"),
  e("item", "Shield", "XPHB"),
  e("spell", "Hold Person", "PHB"),
  e("creature", "Owlbear", "MM"),
  e("creature", "Owlbear", "XMM"),
  e("creature", "Wolf", "MM"),
  e("creature", "Harpy", "MM"),
  e("condition", "Paralyzed", "PHB"),
  e("condition", "Paralyzed", "XPHB"),
  e("condition", "Grappled", "PHB"),
  e("spell", "Magic Missile", "SRD"),
  e("item", "Potion of Healing", "DMG"),
];
const index = new SearchIndex(ENTRIES);
const top = (q: string, opts = {}) => index.search(q, opts)[0]?.entry;

describe("normalize", () => {
  it("lowercases and drops possessives and punctuation", () => {
    expect(normalize("The Owlbear's")).toBe("the owlbear");
    expect(normalize("owlbears’")).toBe("owlbears");
    expect(normalize("  Half-Orc!  ")).toBe("half orc");
  });
});

describe("word forms", () => {
  it("handles plurals", () => {
    expect(wordForms("fireballs")).toContain("fireball");
    expect(wordForms("harpies")).toContain("harpy");
    expect(wordForms("wolves")).toContain("wolf");
    expect(wordForms("boxes")).toContain("box");
  });
  it("handles plurals earlier in a phrase", () => {
    expect(wordForms("potions of healing")).toContain("potion of healing");
    expect(wordForms("bags of holding")).toContain("bag of holding");
  });
  it("drops leading articles", () => {
    expect(wordForms("the owlbears")).toContain("owlbear");
  });
  it("handles -ed / -ing and paralysis", () => {
    expect(wordForms("grappling")).toContain("grappled");
    expect(wordForms("paralysis")).toContain("paralyzed");
    expect(wordForms("paralyze")).toContain("paralyzed");
  });
});

describe("edit distance", () => {
  it("counts edits and caps early", () => {
    expect(editDistance("fireball", "firebal")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("a", "abcdefgh", 2)).toBe(3);
  });
});

describe("search", () => {
  it("ranks newer printings first", () => {
    expect(top("fireball")).toMatchObject({ source: "XPHB" });
    expect(top("owlbear")).toMatchObject({ source: "XMM" });
  });
  it("resolves word forms", () => {
    expect(top("fireballs")).toMatchObject({ name: "Fireball" });
    expect(top("the owlbear's")).toMatchObject({ name: "Owlbear" });
    expect(top("paralysis")).toMatchObject({ name: "Paralyzed" });
    expect(top("wolves")).toMatchObject({ name: "Wolf" });
  });
  it("tries the leading words of a longer phrase", () => {
    expect(top("the owlbear's claw")).toMatchObject({ name: "Owlbear" });
  });
  it("falls back to substring matches", () => {
    expect(index.search("blast").map((m) => m.entry.name)).toContain("Delayed Blast Fireball");
  });
  it("falls back to fuzzy matches", () => {
    expect(top("firebal")).toMatchObject({ name: "Fireball" });
    expect(top("fierball")).toMatchObject({ name: "Fireball" });
    expect(top("wolg")).toMatchObject({ name: "Wolf" });
  });
  it("respects allowed sources", () => {
    expect(top("fireball", { allowedSources: ["PHB"] })).toMatchObject({ source: "PHB" });
    expect(index.search("magic missile", { allowedSources: ["PHB"] })).toEqual([]);
  });
  it("finds exact link targets only", () => {
    expect(index.find("spell", "fireball", "phb")).toBeDefined();
    expect(index.find("spell", "Fireball", "TCE")).toBeUndefined();
  });
  it("doesn't duplicate on re-import", () => {
    const i = new SearchIndex(ENTRIES);
    i.add([e("spell", "Fireball", "PHB")]);
    expect(i.size).toBe(ENTRIES.length);
  });
});

describe("resolveSelection", () => {
  const cfg = { allowedSources: [], choices: {} as Record<string, string> };

  it("links a single entry instantly, newest printing", () => {
    expect(resolveSelection(index, "fireballs", cfg)).toMatchObject({ type: "link", entry: { name: "Fireball", source: "XPHB" } });
    expect(resolveSelection(index, "the owlbear", cfg)).toMatchObject({ type: "link", entry: { source: "XMM" } });
    expect(resolveSelection(index, "paralysis", cfg)).toMatchObject({ type: "link", entry: { name: "Paralyzed" } });
  });

  it("asks when the name means different things", () => {
    const r = resolveSelection(index, "shield", cfg);
    expect(r.type).toBe("pick");
    if (r.type === "pick") expect(new Set(r.matches.map((m) => m.entry.kind))).toEqual(new Set(["spell", "item"]));
  });

  it("uses a remembered choice", () => {
    const remembered = { ...cfg, choices: { shield: entryKey({ kind: "item", name: "Shield", source: "PHB" }) } };
    expect(resolveSelection(index, "Shield", remembered)).toMatchObject({
      type: "link", why: "remembered", entry: { kind: "item", source: "PHB" },
    });
  });

  it("ignores a remembered choice outside the allowed sources", () => {
    const c = { allowedSources: ["XPHB"], choices: { shield: entryKey({ kind: "item", name: "Shield", source: "PHB" }) } };
    expect(resolveSelection(index, "shield", c).type).toBe("pick");
  });
});
