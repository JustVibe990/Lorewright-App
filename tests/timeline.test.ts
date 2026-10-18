import { describe, expect, it } from "vitest";
import { computeSheet } from "../src/lib/character/engine.ts";
import { addLevel, levelOrder, removeLastLevel, swapLevels } from "../src/lib/character/levels.ts";
import { newCharacter } from "../src/lib/character/storage.ts";
import type { Character } from "../src/lib/character/types.ts";
import { entryUrl } from "../src/lib/render.ts";
import { testRules } from "./fixtures/rules.ts";

const rules = testRules();
const make = (over: Partial<Character> = {}): Character => ({
  ...newCharacter("Test"),
  baseAbilities: { str: 15, dex: 14, con: 13, int: 13, wis: 10, cha: 13 },
  ...over,
});
const F = "Fighter|PHB";
const W = "Wizard|PHB";

describe("features timeline", () => {
  const fighter = (choices: Record<string, string[]> = {}) =>
    computeSheet(make({ race: { key: "Elf|PHB|High|PHB", name: "Elf (High)" }, background: { name: "Acolyte", source: "PHB" }, classes: [{ name: "Fighter", source: "PHB", level: 4 }], choices }), rules);

  it("lists levels 1 to now with the class features of each", () => {
    const t = fighter().timeline;
    expect(t.map((l) => `${l.level}:${l.className} ${l.classLevel}`)).toEqual(["1:Fighter 1", "2:Fighter 2", "3:Fighter 3", "4:Fighter 4"]);
    const second = t[0].items.find((i) => i.name === "Second Wind")!;
    expect(second).toMatchObject({ type: "feature", link: { kind: "classFeature", name: "Second Wind|Fighter|PHB|1|PHB" } });
    expect(t[1].items.map((i) => i.name)).toEqual(["Action Surge"]);
  });

  it("puts species, background and their picks at level 1", () => {
    const l1 = fighter().timeline[0].items;
    expect(l1[0]).toMatchObject({ type: "species", name: "Elf (High)", link: { kind: "race", name: "Elf|PHB|High|PHB" }, detail: "Fey Ancestry, Cantrip" });
    expect(l1[1]).toMatchObject({ type: "background", link: { kind: "background", name: "Acolyte", source: "PHB" } });
    expect(l1.filter((i) => i.type === "choice" && i.pending).map((i) => i.choiceId)).toEqual(
      expect.arrayContaining(["race:lang:languages", "bg:lang:languages", "class:Fighter|PHB:skills"]),
    );
  });

  it("marks a missing subclass and ASI, and shows them once chosen", () => {
    const open = fighter().timeline;
    expect(open[2].items.find((i) => i.type === "subclass")).toMatchObject({ pending: true, choiceId: `class:${F}:subclass` });
    expect(open[3].items.find((i) => i.type === "asi")).toMatchObject({ pending: true, choiceId: `class:${F}:asi:4` });

    const done = fighter({ [`class:${F}:subclass`]: ["Champion|PHB"], [`class:${F}:asi:4`]: ["str", "str"], [`class:${F}:of:Fighting Style`]: ["Defense|PHB"] }).timeline;
    expect(done[2].items.find((i) => i.type === "subclass")).toMatchObject({ name: "Champion", link: { kind: "subclass" } });
    expect(done[2].items.find((i) => i.type === "subclass")?.pending).toBeFalsy();
    // The intro feature nests Improved Critical: the nested feature is listed, as its own link.
    expect(done[2].items.filter((i) => i.type === "subclassFeature").map((i) => i.name)).toEqual(["Improved Critical"]);
    expect(done[2].items.find((i) => i.type === "subclassFeature")).toMatchObject({ link: { kind: "subclassFeature", name: "Improved Critical|Fighter|PHB|Champion|PHB|3|PHB" } });
    expect(done[3].items.find((i) => i.type === "asi")).toMatchObject({ detail: "Strength +2", pending: false });
    expect(done[0].items.find((i) => i.type === "option")).toMatchObject({ name: "Defense", link: { kind: "optfeature", name: "Defense", source: "PHB" } });
  });

  it("shows a feat taken instead of an ASI, and its open sub-choices", () => {
    const t = fighter({ [`class:${F}:asi:4`]: ["feat:Resilient|PHB"] }).timeline;
    expect(t[3].items.find((i) => i.type === "feat")).toMatchObject({ name: "Resilient", link: { kind: "feat", name: "Resilient", source: "PHB" }, pending: true });
  });

  it("splits option picks by the level they were gained at", () => {
    const s = computeSheet(make({ classes: [{ name: "Warlock", source: "PHB", level: 3 }], choices: { "class:Warlock|PHB:of:Eldritch Invocations": ["Agonizing Blast|PHB"] } }), rules);
    const l2 = s.timeline[1].items.filter((i) => i.type === "option");
    expect(l2.map((i) => [i.name, !!i.pending])).toEqual([["Agonizing Blast", false], ["Eldritch Invocations", true]]);
    expect(s.timeline[2].items.find((i) => i.name === "Pact Boon")).toMatchObject({ pending: true });
  });

  it("follows the saved multiclass order", () => {
    const ch = make({ classes: [{ name: "Fighter", source: "PHB", level: 2 }, { name: "Wizard", source: "PHB", level: 1 }], levelOrder: [F, W, F] });
    expect(computeSheet(ch, rules).timeline.map((l) => `${l.className} ${l.classLevel}`)).toEqual(["Fighter 1", "Wizard 1", "Fighter 2"]);
  });
});

describe("level order", () => {
  it("guesses first class first when nothing is saved", () => {
    expect(levelOrder(make({ classes: [{ name: "Fighter", source: "PHB", level: 2 }, { name: "Wizard", source: "PHB", level: 1 }] }))).toEqual([F, F, W]);
  });

  it("records levels as they're added and removes the latest", () => {
    let ch = addLevel(make(), { name: "Fighter", source: "PHB" }, null);
    ch = addLevel(ch, { name: "Wizard", source: "PHB" }, 4);
    ch = addLevel(ch, { name: "Fighter", source: "PHB" }, 7);
    expect(ch.levelOrder).toEqual([F, W, F]);
    expect(ch.hpRolls).toEqual({ [F]: [7], [W]: [4] });
    ch = removeLastLevel(ch);
    expect(ch.classes).toEqual([{ name: "Fighter", source: "PHB", level: 1 }, { name: "Wizard", source: "PHB", level: 1 }]);
    expect(ch.hpRolls[F]).toEqual([]);
  });

  it("swaps levels, moving the starting class and its HP rolls when level 1 changes", () => {
    const ch = make({ classes: [{ name: "Fighter", source: "PHB", level: 1 }, { name: "Wizard", source: "PHB", level: 2 }], levelOrder: [F, W, W], hpRolls: { [W]: [3, 5] } });
    const moved = swapLevels(ch, 0);
    expect(moved.levelOrder).toEqual([W, F, W]);
    expect(moved.classes.map((c) => c.name)).toEqual(["Wizard", "Fighter"]);
    expect(moved.hpRolls).toEqual({ [F]: [null], [W]: [5] });
    expect(swapLevels(ch, 1)).toBe(ch); // two wizard levels: nothing to swap
  });
});

describe("rules links", () => {
  it("resolves class features, subclasses, options, species and backgrounds to cards", () => {
    expect(rules.linkEntry({ kind: "classFeature", name: "Second Wind|Fighter|PHB|1|PHB", source: "PHB" })).toMatchObject({ name: "Second Wind", raw: { entries: ["Regain {@dice 1d10} + level."] } });
    expect(rules.linkEntry({ kind: "subclassFeature", name: "Improved Critical|Fighter|PHB|Champion|PHB|3|PHB", source: "PHB" })?.name).toBe("Improved Critical");
    expect(rules.linkEntry({ kind: "subclass", name: "Champion|PHB|Fighter|PHB", source: "PHB" })?.raw.entries[0]).toMatchObject({ name: "Level 3: Champion" });
    expect(rules.linkEntry({ kind: "optfeature", name: "Defense", source: "PHB" })?.name).toBe("Defense");
    expect(rules.linkEntry({ kind: "race", name: "Elf|PHB|High|PHB", source: "PHB" })?.name).toBe("Elf (High)");
    expect(rules.linkEntry({ kind: "background", name: "Acolyte", source: "PHB" })?.name).toBe("Acolyte");
    expect(rules.linkEntry({ kind: "classFeature", name: "Nope|Fighter|PHB|1|PHB", source: "PHB" })).toBeUndefined();
  });

  it("builds 5e.tools page links for them", () => {
    const b = "https://example.org";
    expect(entryUrl(b, "classFeature", "Second Wind|Fighter|PHB|1|PHB", "PHB")).toBe(`${b}/classes.html#fighter_phb`);
    expect(entryUrl(b, "optfeature", "Agonizing Blast", "PHB")).toBe(`${b}/optionalfeatures.html#agonizing%20blast_phb`);
    expect(entryUrl(b, "race", "Elf|PHB|High|PHB", "PHB")).toBe(`${b}/races.html#elf%20(high)_phb`);
    expect(entryUrl(b, "background", "Acolyte", "PHB")).toBe(`${b}/backgrounds.html#acolyte_phb`);
  });
});
