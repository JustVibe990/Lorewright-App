import { describe, expect, it } from "vitest";
import { advanceTurn, applyHp, combatantFromStats, emptyEncounter, parseAction, statsFromCreature, turnOrder, uniqueName, type Combatant } from "../src/lib/combat.ts";

const goblin = {
  name: "Goblin", source: "MM", size: ["S"], type: { type: "humanoid" }, ac: [{ ac: 15, from: ["{@item leather armor|phb}", "{@item shield|phb}"] }],
  hp: { average: 7, formula: "2d6" }, speed: { walk: 30 }, str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8, skill: { stealth: "+6" },
  senses: ["darkvision 60 ft."], passive: 9, languages: ["Common", "Goblin"], cr: "1/4",
  trait: [{ name: "Nimble Escape", entries: ["The goblin can take the {@action Disengage} action as a bonus action."] }],
  action: [
    { name: "Scimitar", entries: ["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}5 ({@damage 1d6 + 2}) slashing damage."] },
    { name: "Shortbow", entries: ["{@atk rw} {@hit 4} to hit, range 80/320 ft., one target. {@h}5 ({@damage 1d6 + 2}) piercing damage."] },
  ],
};

describe("stat blocks from the bestiary", () => {
  it("reads AC, HP, abilities, skills and attacks", () => {
    const s = statsFromCreature(goblin);
    expect(s).toMatchObject({ ref: "Goblin|MM", size: "Small", type: "humanoid", ac: 15, acNote: "leather armor, shield", hpMax: 7, hpFormula: "2d6", speed: "30 ft.", cr: "1/4" });
    expect(s.abilities.dex).toBe(14);
    expect(s.skills.stealth).toBe(6);
    expect(s.actions[0]).toMatchObject({ name: "Scimitar", toHit: 4, damage: [{ dice: "1d6+2", type: "slashing" }] });
    expect(s.traits[0].name).toBe("Nimble Escape");
  });

  it("reads saving throws and extra damage", () => {
    const breath = parseAction("Fire Breath", ["The dragon exhales fire. Each creature must make a {@dc 15} Dexterity saving throw, taking 42 ({@damage 12d6}) fire damage on a failed save."]);
    expect(breath).toMatchObject({ toHit: null, save: { ability: "dex", dc: 15 }, damage: [{ dice: "12d6", type: "fire" }] });
    const bite = parseAction("Bite", ["{@hit 6} to hit. {@h}7 ({@damage 1d10 + 2}) piercing damage plus 3 ({@damage 1d6}) poison damage."]);
    expect(bite.damage).toEqual([{ dice: "1d10+2", type: "piercing" }, { dice: "1d6", type: "poison" }]);
  });
});

describe("initiative", () => {
  const c = (name: string, init: number | null, initMod = 0): Combatant => ({ id: name, name, kind: "npc", init, initMod, ac: 10, conditions: [] });

  it("orders by initiative, then modifier", () => {
    expect(turnOrder([c("A", 10, 1), c("B", 15), c("C", 10, 3), c("D", null)]).map((x) => x.name)).toEqual(["B", "C", "A", "D"]);
  });

  it("goes round the order and counts rounds", () => {
    let e = { ...emptyEncounter(), combatants: [c("A", 20), c("B", 10)] };
    e = advanceTurn(e);
    expect([e.round, e.current]).toEqual([1, "A"]);
    e = advanceTurn(e);
    expect([e.round, e.current]).toEqual([1, "B"]);
    e = advanceTurn(e);
    expect([e.round, e.current]).toEqual([2, "A"]);
    e = advanceTurn(e, -1);
    expect([e.round, e.current]).toEqual([1, "B"]);
  });

  it("names copies apart", () => {
    expect(uniqueName(["Goblin", "Goblin 2"], "Goblin")).toBe("Goblin 3");
    expect(uniqueName([], "Goblin")).toBe("Goblin");
  });
});

describe("creature HP", () => {
  it("takes damage from temp HP first and heals up to the max", () => {
    const g = combatantFromStats(statsFromCreature(goblin), "Goblin");
    expect(g).toMatchObject({ hp: 7, hpMax: 7, initMod: 2, ac: 15 });
    const hit = applyHp(applyHp(g, "temp", 3), "damage", 5);
    expect([hit.hp, hit.tempHp]).toEqual([5, 0]);
    expect(applyHp(hit, "heal", 10).hp).toBe(7);
  });
});
