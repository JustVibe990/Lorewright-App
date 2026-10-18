import { describe, expect, it } from "vitest";
import { castInfo } from "../src/lib/character/casting.ts";
import { blankSpell, spellData, spellSources, type HomebrewSpell } from "../src/lib/homebrew.ts";

const make = (x: Partial<HomebrewSpell>): HomebrewSpell => ({ ...blankSpell("1"), ...x });

describe("homebrew spells", () => {
  it("casts like a real spell: save, damage and upcasting", () => {
    const s = make({ name: "Thunder Lance", level: 2, save: "constitution", effect: { kind: "damage", dice: "3d8", type: "Thunder" }, upcast: "1d8", description: "A spear of sound." });
    const raw = spellData(s);
    expect(raw).toMatchObject({ name: "Thunder Lance", source: "Homebrew", level: 2, savingThrow: ["constitution"], damageInflict: ["thunder"] });
    expect(castInfo(raw, 2, 5, 3)).toMatchObject({ save: ["con"], damage: "3d8", damageTypes: ["thunder"] });
    expect(castInfo(raw, 4, 7, 3).damage).toBe("5d8");
  });

  it("heals with the spell modifier, and scales cantrips", () => {
    const heal = spellData(make({ name: "Mend Flesh", level: 1, effect: { kind: "healing", dice: "2d4", addMod: true }, upcast: "2d4" }));
    expect(castInfo(heal, 1, 1, 4).heal).toBe("2d4+4");
    expect(castInfo(heal, 2, 3, 4).heal).toBe("4d4+4");
    const bolt = spellData(make({ name: "Spark", level: 0, attack: "ranged", effect: { kind: "damage", dice: "1d8", type: "lightning" }, scales: true }));
    expect(castInfo(bolt, 0, 1, 3)).toMatchObject({ attack: "ranged", damage: "1d8" });
    expect(castInfo(bolt, 0, 11, 3).damage).toBe("3d8");
  });

  it("marks concentration and rituals, and lists its classes", () => {
    const s = make({ name: "Still Mind", duration: { kind: "minute", amount: 10, concentration: true }, ritual: true, classes: ["Wizard", "Cleric"] });
    expect(castInfo(spellData(s), 1, 1, 3)).toMatchObject({ concentration: true, ritual: true });
    expect(spellSources([s])).toEqual({ Homebrew: { "Still Mind": { class: [{ name: "Wizard", source: "PHB" }, { name: "Cleric", source: "PHB" }] } } });
  });
});
