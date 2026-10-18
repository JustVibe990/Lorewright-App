import { describe, expect, it } from "vitest";
import { DataStore, srdEntries } from "../src/lib/data.ts";
import { CATEGORIES, extractEntries, filesFromIndex, hashText, normalizeBaseUrl } from "../src/lib/extract.ts";
import { resolveSelection } from "../src/lib/search.ts";

describe("SRD starter set", () => {
  const store = new DataStore();

  it("has the promised entries", () => {
    const names = srdEntries().map((e) => e.name);
    for (const n of ["Fireball", "Hold Person", "Shield", "Magic Missile", "Cure Wounds", "Goblin", "Owlbear", "Bag of Holding", "Potion of Healing", "Grappler"]) {
      expect(names).toContain(n);
    }
    expect(store.stats().condition).toBe(15);
    expect(srdEntries().every((e) => e.source === "SRD")).toBe(true);
  });

  it("resolves selections with nothing imported", () => {
    const cfg = { allowedSources: [], choices: {} };
    expect(resolveSelection(store.index, "fireballs", cfg)).toMatchObject({ type: "link", entry: { name: "Fireball" } });
    expect(resolveSelection(store.index, "the owlbear", cfg)).toMatchObject({ type: "link", entry: { name: "Owlbear" } });
    expect(resolveSelection(store.index, "paralysis", cfg)).toMatchObject({ type: "link", entry: { name: "Paralyzed" } });
    expect(resolveSelection(store.index, "shield", cfg)).toMatchObject({ type: "link", entry: { kind: "spell" } });
  });

  it("renders every SRD card without throwing", () => {
    for (const e of srdEntries()) expect(store.card(e)).toContain(e.name);
  });

  it("links inside SRD text point at SRD entries", () => {
    const hold = store.find("spell", "Hold Person", "SRD")!;
    expect(store.card(hold)).toContain('data-name="paralyzed" data-source="SRD"');
    expect(store.find("condition", "paralyzed", "SRD")).toBeDefined();
  });
});

describe("extract", () => {
  const spells = CATEGORIES.find((c) => c.kind === "spell")!;
  const items = CATEGORIES.find((c) => c.kind === "item")!;

  it("resolves an index file to data files", () => {
    expect(filesFromIndex(spells, { PHB: "spells-phb.json", XPHB: "spells-xphb.json" }, ["xphb"])).toEqual([
      { source: "XPHB", path: "data/spells/spells-xphb.json" },
    ]);
  });

  it("normalises pasted URLs", () => {
    expect(normalizeBaseUrl("example.org/tools/")).toBe("https://example.org/tools");
    expect(normalizeBaseUrl(" https://example.org/spells.html#fireball_phb ")).toBe("https://example.org");
    expect(normalizeBaseUrl("http://localhost:5050/index.html?x=1")).toBe("http://localhost:5050");
    expect(normalizeBaseUrl("")).toBe("");
  });

  it("hashes content so changes are detectable", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });

  it("pulls entries from every key and filters sources", () => {
    const json = { item: [{ name: "A", source: "DMG" }, { name: "B", source: "XDMG" }], baseitem: [{ name: "Club", source: "PHB" }], other: [{ name: "x", source: "y" }] };
    expect(extractEntries(items, json).map((e) => e.name)).toEqual(["A", "B", "Club"]);
    expect(extractEntries(items, json, ["XDMG"]).map((e) => e.name)).toEqual(["B"]);
  });
});
