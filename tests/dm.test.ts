import { describe, expect, it } from "vitest";
import { blankStats, parseAction, statsFromCreature } from "../src/lib/combat.ts";
import { chargeInfo } from "../src/lib/character/charges.ts";
import { encounterDifficulty, magicItemPool, mentions, nextTimeOf, rollLoot, sessionNumber, sessionTemplate, splitCoins, xpMultiplier } from "../src/lib/dm.ts";
import { creatureData, itemDataFor, parseSpeed } from "../src/lib/homebrew-more.ts";

// A fixed sequence of "random" numbers.
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe("encounter difficulty (2014)", () => {
  it("multiplier by number of monsters, shifted for party size", () => {
    expect(xpMultiplier(1, 4)).toBe(1);
    expect(xpMultiplier(2, 4)).toBe(1.5);
    expect(xpMultiplier(4, 4)).toBe(2);
    expect(xpMultiplier(8, 4)).toBe(2.5);
    expect(xpMultiplier(15, 4)).toBe(4);
    expect(xpMultiplier(1, 2)).toBe(1.5);
    expect(xpMultiplier(4, 6)).toBe(1.5);
    expect(xpMultiplier(1, 6)).toBe(0.5);
  });
  it("four 3rd-level characters against six goblins (CR 1/4) and a bugbear (CR 1)", () => {
    const r = encounterDifficulty([{ cr: "1/4", count: 6 }, { cr: "1", count: 1 }], [3, 3, 3, 3]);
    expect(r.xp).toBe(500);
    expect(r.multiplier).toBe(2.5);
    expect(r.adjusted).toBe(1250);
    expect(r.thresholds).toEqual([300, 600, 900, 1600]);
    expect(r.rating).toBe("hard");
    expect(r.perCharacter).toBe(125);
  });
  it("easy and deadly", () => {
    expect(encounterDifficulty([{ cr: "1/4", count: 2 }], [1, 1, 1, 1]).rating).toBe("easy");
    expect(encounterDifficulty([{ cr: "1/8", count: 2 }], [1, 1, 1, 1]).rating).toBe("trivial");
    expect(encounterDifficulty([{ cr: "5", count: 1 }], [1, 1, 1, 1]).rating).toBe("deadly");
    expect(encounterDifficulty([], [5]).rating).toBe("trivial");
  });
});

describe("treasure", () => {
  const items = [
    { name: "Potion of Healing", source: "DMG", rarity: "common" },
    { name: "Bag of Holding", source: "DMG", rarity: "uncommon" },
  ];
  it("individual treasure is only coins", () => {
    const r = rollLoot(2, "individual", items, seq(0.5));
    expect(r.items).toEqual([]);
    expect(r.coins.cp + r.coins.sp + r.coins.gp).toBeGreaterThan(0);
    expect(r.label).toMatch(/CR 0–4/);
  });
  it("a hoard has valuables and magic items of the band's rarity", () => {
    const r = rollLoot(3, "hoard", items, seq(0.1));
    expect(r.items.some((i) => i.value)).toBe(true);
    const magic = r.items.filter((i) => i.ref);
    expect(magic.length).toBeGreaterThan(0);
    expect(magic.every((i) => i.rarity === "common" || i.rarity === "uncommon")).toBe(true);
  });
  it("splits coins evenly, the rest to the first", () => {
    expect(splitCoins({ cp: 0, sp: 0, ep: 0, gp: 10, pp: 1 }, 3)).toEqual([
      { cp: 0, sp: 0, ep: 0, gp: 4, pp: 1 },
      { cp: 0, sp: 0, ep: 0, gp: 3, pp: 0 },
      { cp: 0, sp: 0, ep: 0, gp: 3, pp: 0 },
    ]);
  });
  it("only magic items with a rarity go in the pool", () => {
    const pool = magicItemPool([
      { name: "Longsword", source: "PHB", raw: { rarity: "none", type: "M" } },
      { name: "Wand of Web", source: "DMG", raw: { rarity: "Uncommon", type: "WD" } },
      { name: "Axe of the Dwarvish Lords", source: "DMG", raw: { rarity: "artifact" } },
    ]);
    expect(pool).toEqual([{ name: "Wand of Web", source: "DMG", rarity: "uncommon" }]);
  });
});

describe("sessions", () => {
  it("numbers, templates and next time", () => {
    expect(sessionNumber("Session 12")).toBe(12);
    expect(sessionNumber("Neverwinter")).toBeNull();
    const t = sessionTemplate(3, "Friday", "Meet Elyse at the docs.");
    expect(t).toContain("# Session 3");
    expect(t).toContain("Meet Elyse at the docs.");
    expect(nextTimeOf("## What happened\n\n- fight\n\n## Next time\n\n- go to the tower\n")).toBe("- go to the tower");
    expect(nextTimeOf(sessionTemplate(1, "x"))).toBe("");
  });
  it("finds NPCs and places mentioned", () => {
    expect(mentions("We met Lady Elyse in Neverwinter.", ["Lady Elyse", "Neverwinter", "Waterdeep", "Al"])).toEqual(["Lady Elyse", "Neverwinter"]);
  });
});

describe("homebrew creatures", () => {
  it("round-trips through the bestiary shape", () => {
    const stats = { ...blankStats(), size: "Large", type: "beast", cr: "2", ac: 13, acNote: "natural armor", hpMax: 37, hpFormula: "5d10+10", speed: "40 ft., swim 30 ft.", skills: { perception: 4 }, senses: "darkvision 60 ft.", languages: "", traits: [{ name: "Keen Smell", text: "Advantage on smell checks." }] };
    stats.actions = [
      { name: "Bite", toHit: 5, damage: [{ dice: "2d6+3", type: "piercing" }], text: "" },
      { name: "Howl (bonus action)", toHit: null, damage: [], text: "Allies gain 5 temp HP.", save: undefined },
    ];
    const raw = creatureData({ id: "x", name: "Dire Otter", stats });
    expect(raw).toMatchObject({ name: "Dire Otter", source: "Homebrew", size: ["L"], cr: "2", speed: { walk: 40, swim: 30 }, passive: 14 });
    const back = statsFromCreature(raw);
    expect(back).toMatchObject({ ac: 13, hpMax: 37, hpFormula: "5d10+10", cr: "2" });
    const bite = back.actions.find((a) => a.name === "Bite")!;
    expect(bite.toHit).toBe(5);
    expect(bite.damage).toEqual([{ dice: "2d6+3", type: "piercing" }]);
    expect(back.actions.some((a) => a.name === "Howl (bonus action)")).toBe(true);
    expect(parseAction("x", "{@hit 3} to hit").toHit).toBe(3);
  });
  it("speed text", () => {
    expect(parseSpeed("30 ft., fly 60 ft. (hover)")).toEqual({ walk: 30, fly: 60 });
    expect(parseSpeed("")).toEqual({ walk: 30 });
  });
});

describe("homebrew items", () => {
  it("carries Forge charges and spells in the item data", () => {
    const inv = { id: "i", name: "Rod of Sparks", qty: 1, equipped: false, attuned: false, forge: { scratch: { kind: "rod" as const }, charges: 5, recharge: "dawn" as const, regain: "1d4+1", spells: [{ ref: "Shocking Grasp|PHB", note: "at will" }, { ref: "Lightning Bolt|PHB", note: "3 charges" }] } };
    const raw = itemDataFor(inv, { name: "x", source: "Homebrew", type: "RD" }, ["Crackles."]);
    expect(raw).toMatchObject({ name: "Rod of Sparks", source: "Homebrew", charges: 5, recharge: "dawn", rechargeAmount: "{@dice 1d4+1}", entries: ["Crackles."] });
    const info = chargeInfo(raw)!;
    expect(info).toMatchObject({ max: 5, regain: "1d4+1" });
    expect(info.spells.map((s) => [s.name, s.cost, !!s.atWill])).toEqual([["lightning bolt", 3, false], ["shocking grasp", 0, true]]);
  });
});
