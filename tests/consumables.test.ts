import { describe, expect, it } from "vitest";
import { applyConsumable, consumableEffect, endEffect, isConsumable } from "../src/lib/character/consumables.ts";
import { computeSheet } from "../src/lib/character/engine.ts";
import { newCharacter } from "../src/lib/character/storage.ts";
import type { Character } from "../src/lib/character/types.ts";
import { testRules } from "./fixtures/rules.ts";

const rules = testRules();
const potion = (name: string, entries: string[]) => ({ name, source: "DMG", type: "P", entries });
const healing = potion("Potion of Healing", ["You regain {@dice 2d4 + 2} hit points when you drink this potion. The potion's red liquid glimmers when agitated."]);
const invis = potion("Potion of Invisibility", ["This potion's container looks empty. When you drink it, you become {@condition invisible} for 1 hour. Anything you wear or carry is {@condition invisible} with you."]);
const giant = potion("Potion of Hill Giant Strength", ["When you drink this potion, your Strength score changes to 21 for 1 hour."]);
const fireRes = potion("Potion of Fire Resistance", ["{#itemEntry Potion of Resistance}"]);
const make = (): Character => ({
  ...newCharacter("Tester"),
  baseAbilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  state: { ...newCharacter().state, hp: 5 },
  inventory: [
    { id: "h", ref: "Potion of Healing|DMG", name: "Potion of Healing", qty: 2, equipped: false, attuned: false },
    { id: "i", ref: "Potion of Invisibility|DMG", name: "Potion of Invisibility", qty: 1, equipped: false, attuned: false },
  ],
});

describe("consumables", () => {
  it("knows potions", () => {
    expect(isConsumable(healing)).toBe(true);
    expect(isConsumable({ name: "Longsword", type: "M" })).toBe(false);
  });

  it("a healing potion heals what was rolled and is used up", () => {
    const e = consumableEffect(healing);
    expect(e.heal).toBe("2d4+2");
    const ch = applyConsumable(make(), "h", e, { heal: 7 }, 20);
    expect(ch.state.hp).toBe(12);
    expect(ch.inventory.find((i) => i.id === "h")?.qty).toBe(1);
  });

  it("invisibility makes you invisible until it ends", () => {
    const e = consumableEffect(invis);
    expect(e.active).toMatchObject({ condition: "Invisible", until: "1 hour" });
    let ch = applyConsumable(make(), "i", e, {}, 20);
    expect(ch.state.conditions).toEqual(["Invisible"]);
    expect(ch.inventory.some((i) => i.id === "i")).toBe(false);
    ch = endEffect(ch, "Potion of Invisibility");
    expect(ch.state.conditions).toEqual([]);
  });

  it("giant strength and resistance change the sheet while active", () => {
    let ch = applyConsumable(make(), "x", consumableEffect(giant), {}, 20);
    ch = applyConsumable(ch, "x", consumableEffect(fireRes), {}, 20);
    const s = computeSheet(ch, rules);
    expect(s.abilities.str.score).toBe(21);
    expect(s.resistances).toContain("fire");
  });
});
