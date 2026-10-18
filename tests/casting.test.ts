import { describe, expect, it } from "vitest";
import { castInfo, slotOptions } from "../src/lib/character/casting.ts";

// Spell shapes copied from 5e.tools' structure (rules text shortened).
const fireball = {
  level: 3, savingThrow: ["dexterity"], damageInflict: ["fire"], duration: [{ type: "instant" }],
  entries: ["Each creature makes a save, taking {@damage 8d6} fire damage."],
  entriesHigherLevel: [{ type: "entries", name: "At Higher Levels", entries: ["The damage increases by {@scaledamage 8d6|3-9|1d6} for each slot level above 3rd."] }],
};
const fireBolt = {
  level: 0, spellAttack: ["R"], damageInflict: ["fire"],
  entries: ["{@damage 1d10} fire damage.", "Increases to {@damage 2d10} at 5th level."],
  scalingLevelDice: { label: "fire damage", scaling: { 1: "1d10", 5: "2d10", 11: "3d10", 17: "4d10" } },
};
const cureWounds = {
  level: 1, miscTags: ["HL"],
  entries: ["Regains hit points equal to {@dice 1d8} + your spellcasting ability modifier."],
  entriesHigherLevel: [{ type: "entries", entries: ["Increases by {@scaledice 1d8|1-9|1d8} for each slot level above 1st."] }],
};
const spiritualWeapon = {
  level: 2, spellAttack: ["M"], damageInflict: ["force"],
  entries: ["Deals force damage equal to {@damage 1d8} + your spellcasting ability modifier."],
  entriesHigherLevel: [{ type: "entries", entries: ["Increases by {@scaledamage 1d8|2,4,6,8|1d8} for every two slot levels above 2nd."] }],
};
const bless = { level: 1, miscTags: ["SCT"], duration: [{ type: "timed", concentration: true }], entries: ["Add a {@dice d4}."] };
const alarm = { level: 1, meta: { ritual: true }, entries: ["A ward."] };

describe("castInfo", () => {
  it("reads saves, damage and upcasting", () => {
    expect(castInfo(fireball, 3, 5, 3)).toMatchObject({ save: ["dex"], attack: null, damage: "8d6", damageTypes: ["fire"], concentration: false });
    expect(castInfo(fireball, 5, 9, 3).damage).toBe("10d6");
  });

  it("scales cantrips with character level", () => {
    expect(castInfo(fireBolt, 0, 4, 3)).toMatchObject({ attack: "ranged", damage: "1d10" });
    expect(castInfo(fireBolt, 0, 5, 3).damage).toBe("2d10");
    expect(castInfo(fireBolt, 0, 17, 3).damage).toBe("4d10");
  });

  it("heals with the spell modifier, and more at higher levels", () => {
    expect(castInfo(cureWounds, 1, 1, 3)).toMatchObject({ heal: "1d8+3", damage: null });
    expect(castInfo(cureWounds, 3, 5, 3).heal).toBe("3d8+3");
  });

  it("adds the spell modifier to damage when the text says so", () => {
    expect(castInfo(spiritualWeapon, 2, 3, 4)).toMatchObject({ attack: "melee", damage: "1d8+4" });
    // Every two slot levels: no extra at 3rd, +1d8 at 4th and 5th, +2d8 at 6th.
    expect([3, 4, 5, 6].map((l) => castInfo(spiritualWeapon, l, 11, 4).damage)).toEqual(["1d8+4", "2d8+4", "2d8+4", "3d8+4"]);
  });

  it("knows concentration and rituals, and isn't fooled by non-damage dice", () => {
    expect(castInfo(bless, 1, 1, 3)).toMatchObject({ concentration: true, damage: null, heal: null });
    expect(castInfo(alarm, 1, 1, 3).ritual).toBe(true);
  });
});

describe("slotOptions", () => {
  it("offers slots of the spell's level or higher that have uses left", () => {
    const opts = slotOptions(2, [4, 3, 2], [0, 3, 1], null, 0);
    expect(opts.map((o) => [o.id, o.level])).toEqual([["slot3", 3]]);
    expect(opts[0].label).toBe("3rd-level slot (1 left)");
  });

  it("offers pact slots, rituals and free casts", () => {
    const opts = slotOptions(1, [], [], { slots: 2, level: 3 }, 1, { ritual: true, free: "Item: 1/day" });
    expect(opts.map((o) => o.kind)).toEqual(["pact", "ritual", "free"]);
    expect(opts[0]).toMatchObject({ level: 3, label: "Pact slot, 3rd level (1 left)" });
  });

  it("needs no slot for cantrips", () => {
    expect(slotOptions(0, [4], [0], null, 0)).toEqual([{ id: "cantrip", label: "Cantrip (no slot)", level: 0, kind: "cantrip" }]);
  });
});
