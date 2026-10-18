import { describe, expect, it } from "vitest";
import { detectTime, featureActions, needsConcentration, useFeature } from "../src/lib/character/actions.ts";
import { computeSheet } from "../src/lib/character/engine.ts";
import { newCharacter } from "../src/lib/character/storage.ts";
import type { Character } from "../src/lib/character/types.ts";
import { testRules } from "./fixtures/rules.ts";

const rules = testRules();
const make = (over: Partial<Character> = {}): Character => ({ ...newCharacter("Test"), baseAbilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 8 }, ...over });

describe("feature actions", () => {
  it("reads how a feature is used from its text", () => {
    expect(detectTime("As a bonus action, you can make one attack.")).toBe("bonus");
    expect(detectTime("You can use your action to present your holy symbol.")).toBe("action");
    expect(detectTime("you can use your reaction to halve the damage")).toBe("reaction");
    expect(detectTime("You gain proficiency with heavy armor.")).toBeNull();
    expect(needsConcentration("The effect lasts for 1 minute, and you must concentrate on it as if concentrating on a spell.")).toBe(true);
  });

  it("Second Wind spends its use and heals", () => {
    const ch = make({ classes: [{ name: "Fighter", source: "PHB", level: 3 }] });
    const sheet = computeSheet(ch, rules);
    const sw = featureActions(ch, sheet).find((a) => a.name === "Second Wind");
    expect(sw).toMatchObject({ time: "bonus", heal: "1d10+3", cost: { id: "secondwind" } });
    const used = useFeature(ch, sheet, sw!)!;
    expect(used.state.resourcesUsed.secondwind).toBe(1);
    // No uses left: can't use it again.
    expect(useFeature(used, computeSheet(used, rules), sw!)).toBeNull();
  });

  it("Rage switches on Raging, which adds damage and resistance", () => {
    const ch = make({ classes: [{ name: "Barbarian", source: "PHB", level: 1 }], inventory: [{ id: "a", ref: "Greataxe|PHB", name: "Greataxe", qty: 1, equipped: true, attuned: false }] });
    const sheet = computeSheet(ch, rules);
    const rage = featureActions(ch, sheet).find((a) => a.name === "Rage")!;
    expect(rage).toMatchObject({ time: "bonus", status: { name: "Raging" } });
    const raging = useFeature(ch, sheet, rage)!;
    expect(raging.state.active?.map((x) => x.name)).toEqual(["Raging"]);
    const after = computeSheet(raging, rules);
    expect(after.resistances).toEqual(expect.arrayContaining(["bludgeoning", "piercing", "slashing"]));
    const axe = (s: typeof sheet) => s.attacks.find((a) => a.name === "Greataxe");
    if (axe(sheet)) expect(axe(after)!.damage).not.toBe(axe(sheet)!.damage);
    expect(after.resources.find((r) => r.id === "rage")?.used).toBe(1);
  });
});
