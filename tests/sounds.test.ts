import { describe, expect, it } from "vitest";
import { characterSounds } from "../src/lib/character/sounds.ts";
import { newCharacter } from "../src/lib/character/storage.ts";
import type { Character } from "../src/lib/character/types.ts";
import { rollSound } from "../src/lib/sfx.ts";

const base = (): Character => {
  const c = newCharacter("Test");
  return { ...c, classes: [{ name: "Wizard", source: "PHB", level: 3 }], state: { ...c.state, hp: 20, tempHp: 0, slotsUsed: [0, 0] } };
};
const withState = (c: Character, s: Partial<Character["state"]>): Character => ({ ...c, state: { ...c.state, ...s } });

describe("character sounds", () => {
  it("damage, big hits and dropping to 0", () => {
    const c = base();
    expect(characterSounds(c, withState(c, { hp: 15 }))).toEqual(["hurt"]);
    expect(characterSounds(c, withState(c, { hp: 8 }))).toEqual(["hurtBig"]);
    expect(characterSounds(c, withState(c, { hp: 0 }))).toEqual(["down"]);
    // Temp HP soaking a hit still sounds like a hit.
    const t = withState(c, { tempHp: 5 });
    expect(characterSounds(t, withState(t, { tempHp: 2 }))).toEqual(["hurt"]);
  });
  it("healing and temp HP", () => {
    const c = withState(base(), { hp: 10 });
    expect(characterSounds(c, withState(c, { hp: 15 }))).toEqual(["heal"]);
    expect(characterSounds(c, withState(c, { tempHp: 5 }))).toEqual(["temp"]);
  });
  it("casting: a slot, a pact slot, or starting concentration", () => {
    const c = base();
    expect(characterSounds(c, withState(c, { slotsUsed: [1, 0] }))).toEqual(["spell"]);
    expect(characterSounds(c, withState(c, { pactUsed: 1 }))).toEqual(["spell"]);
    expect(characterSounds(c, withState(c, { concentration: { ref: "Hex|PHB", name: "Hex", level: 1 } }))).toEqual(["spell"]);
  });
  it("features, conditions, death saves, level up", () => {
    const c = base();
    expect(characterSounds(c, withState(c, { resourcesUsed: { rage: 1 } }))).toEqual(["feature"]);
    expect(characterSounds(c, withState(c, { conditions: ["Poisoned"] }))).toEqual(["condition"]);
    expect(characterSounds(c, withState(c, { deathSaves: { successes: 1, failures: 0 } }))).toEqual(["saveGood"]);
    expect(characterSounds(c, withState(c, { deathSaves: { successes: 0, failures: 1 } }))).toEqual(["saveBad"]);
    expect(characterSounds(c, { ...c, classes: [{ name: "Wizard", source: "PHB", level: 4 }] })).toEqual(["levelup"]);
  });
  it("a long rest is one calm sound", () => {
    const c = withState(base(), { hp: 5, slotsUsed: [2, 1], resourcesUsed: { arcane: 1 } });
    expect(characterSounds(c, withState(c, { hp: 20, slotsUsed: [0, 0], resourcesUsed: {} }))).toEqual(["rest"]);
  });
  it("nothing for other edits", () => {
    const c = base();
    expect(characterSounds(c, { ...c, name: "Other" })).toEqual([]);
  });
});

describe("roll sounds", () => {
  it("natural 20 and 1 on a d20", () => {
    expect(rollSound({ expr: "1d20+5", total: 25, detail: "[20] +5" })).toBe("crit");
    expect(rollSound({ expr: "1d20+5", total: 6, detail: "[1] +5" })).toBe("fumble");
    expect(rollSound({ expr: "2d20kh1+5", total: 25, detail: "[(3), 20] +5" })).toBe("crit");
    expect(rollSound({ expr: "2d20kh1+5", total: 8, detail: "[3, (20)] +5" })).toBe("dice");
    expect(rollSound({ expr: "1d20+5", total: 15, detail: "[10] +5" })).toBe("dice");
  });
  it("other dice just rattle", () => {
    expect(rollSound({ expr: "1d8+3", total: 4, detail: "[1] +3" })).toBe("dice");
    expect(rollSound({ expr: "1d200", total: 20, detail: "[20]" })).toBe("dice");
  });
});
