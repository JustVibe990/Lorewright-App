import { describe, expect, it } from "vitest";
import { quickSearch } from "../src/lib/quicksearch.ts";
import { SearchIndex } from "../src/lib/search.ts";
import type { Entry } from "../src/lib/types.ts";

const entry = (name: string, kind: Entry["kind"] = "spell"): Entry => ({ kind, name, source: "PHB", raw: {} }) as Entry;

const src = {
  notes: [
    { file: "Session 3.md", title: "Session 3", text: "The party cast {@spell Fireball|PHB} at the goblins." },
    { file: "Fire Giants.md", title: "Fire Giants", text: "Big." },
    { file: "Shopping.md", title: "Shopping", text: "Rope." },
  ],
  characters: [
    { file: "Ash.json", name: "Ash", detail: "Wizard 5" },
    { file: "Firenze.json", name: "Firenze", detail: "Rogue 3" },
  ],
  index: new SearchIndex([entry("Fireball"), entry("Fire Bolt"), entry("Fire Giant", "creature")]),
};

describe("quickSearch", () => {
  it("puts characters and note titles first, then entries, then mentions", () => {
    const r = quickSearch("fire", src);
    const names = r.map((x) => (x.type === "entry" ? `entry:${x.entry.name}` : x.type === "note" ? `note:${x.title}` : `char:${x.name}`));
    expect(names.slice(0, 2)).toEqual(["char:Firenze", "note:Fire Giants"]);
    // Entries keep the 5e search's own order.
    expect(names.slice(2, 5).sort()).toEqual(["entry:Fire Bolt", "entry:Fire Giant", "entry:Fireball"]);
    expect(names[5]).toBe("note:Session 3");
    const mention = r.at(-1);
    expect(mention?.type === "note" && mention.snippet?.[1]).toBe("Fire");
  });

  it("shows characters and recent notes for an empty query", () => {
    expect(quickSearch("  ", src).map((x) => x.type)).toEqual(["character", "character", "note", "note", "note"]);
  });

  it("finds nothing for nonsense", () => {
    expect(quickSearch("zzzq", src)).toEqual([]);
  });
});

describe("quickSearch compendium", () => {
  const rules = [
    { kind: "class", name: "Wizard", source: "PHB", label: "Wizard", hint: "Class · PHB" },
    { kind: "subclass", name: "Bladesinging|TCE|Wizard|PHB", source: "TCE", label: "Bladesinging", hint: "Wizard subclass · TCE" },
    { kind: "subclass", name: "Evocation|PHB|Wizard|PHB", source: "PHB", label: "School of Evocation", hint: "Wizard subclass · PHB" },
    { kind: "optfeature", name: "Agonizing Blast", source: "PHB", label: "Agonizing Blast", hint: "Eldritch Invocation · PHB" },
  ];
  it("lists the class first, then its subclasses", () => {
    const r = quickSearch("wizard", { notes: [], characters: [], rules });
    expect(r.map((x) => (x.type === "rule" ? x.rule.label : x.type))).toEqual(["Wizard", "Bladesinging", "School of Evocation"]);
  });
  it("finds subclasses and class options by name", () => {
    expect(quickSearch("evoc", { notes: [], characters: [], rules }).map((x) => x.type === "rule" && x.rule.label)).toEqual(["School of Evocation"]);
    expect(quickSearch("agoniz", { notes: [], characters: [], rules })[0]).toMatchObject({ type: "rule", rule: { kind: "optfeature" } });
  });
});
