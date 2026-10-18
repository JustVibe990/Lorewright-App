import { describe, expect, it } from "vitest";
import { computeSheet } from "../src/lib/character/engine.ts";
import { itemCatalogue, itemData } from "../src/lib/character/items.ts";
import { newCharacter } from "../src/lib/character/storage.ts";
import type { Character, InventoryItem } from "../src/lib/character/types.ts";
import { testRules } from "./fixtures/rules.ts";

const rules = testRules();
const make = (over: Partial<Character> = {}): Character => ({
  ...newCharacter("Test"),
  baseAbilities: { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
  ...over,
});
const inv = (ref: string, extra: Partial<InventoryItem> = {}): InventoryItem => ({ id: `${ref}${extra.variant ?? ""}${extra.magicBonus ?? ""}`, ref, name: "", qty: 1, equipped: true, attuned: false, ...extra });

describe("item catalogue", () => {
  const names = itemCatalogue(rules).map((c) => c.name);

  it("lists magic variants applied to every base item they fit", () => {
    expect(names).toEqual(expect.arrayContaining(["+2 Breastplate", "+2 Chain Mail", "+1 Longsword", "+1 Rapier"]));
    expect(names).not.toContain("+2 Longsword"); // armor variant doesn't fit weapons
  });

  it("adds +1 to +3 shields, which the data doesn't list as a variant", () => {
    const shields = itemCatalogue(rules).filter((c) => /^\+\d Shield$/.test(c.name));
    expect(shields.map((s) => [s.name, s.magicBonus])).toEqual([["+1 Shield", 1], ["+2 Shield", 2], ["+3 Shield", 3]]);
  });

  it("doesn't duplicate items that exist for real", () => {
    expect(names.filter((n) => n === "+1 Leather Armor")).toHaveLength(1);
  });
});

describe("magic armor and homemade items", () => {
  it("adds a +2 Breastplate's bonus to AC (medium armor, Dex max 2)", () => {
    const s = computeSheet(make({ classes: [{ name: "Fighter", source: "PHB", level: 1 }], inventory: [inv("Breastplate|PHB", { variant: "+2 Armor" })] }), rules);
    expect(s.ac.value).toBe(14 + 2 + 2);
    expect(itemData(rules, inv("Breastplate|PHB", { variant: "+2 Armor" }))).toMatchObject({ name: "+2 Breastplate", bonusAc: "+2" });
  });

  it("applies a homemade +N to weapons and shields", () => {
    const s = computeSheet(
      make({ classes: [{ name: "Fighter", source: "PHB", level: 1 }], inventory: [inv("Longsword|PHB", { magicBonus: 2, name: "Frostbite" }), inv("Shield|PHB", { magicBonus: 1 })] }),
      rules,
    );
    expect(s.attacks[0]).toMatchObject({ name: "Frostbite", toHit: 2 + 2 + 2, damage: "1d8+4" });
    expect(s.ac.value).toBe(10 + 2 + 3);
  });

  it("only counts homemade attunement items when attuned", () => {
    const ring = inv("Shield|PHB", { magicBonus: 3, requiresAttunement: true });
    const off = computeSheet(make({ classes: [{ name: "Fighter", source: "PHB", level: 1 }], inventory: [ring] }), rules);
    const on = computeSheet(make({ classes: [{ name: "Fighter", source: "PHB", level: 1 }], inventory: [{ ...ring, attuned: true }] }), rules);
    expect(on.ac.value - off.ac.value).toBe(5);
  });
});

describe("item forge", () => {
  const fighter = (inventory: InventoryItem[]) => computeSheet(make({ classes: [{ name: "Fighter", source: "PHB", level: 1 }], inventory }), rules);

  it("changes damage, type and properties, keeping the rest of the base item", () => {
    const blade = inv("Longsword|PHB", { name: "Emberfang", forge: { dmg1: "2d6", dmgType: "F", properties: ["F", "V"] } });
    const raw = itemData(rules, blade);
    expect(raw).toMatchObject({ dmg1: "2d6", dmgType: "F", dmg2: "1d10", weaponCategory: "martial", variantOf: "Longsword" });
    // Finesse now: uses the better of Str and Dex (both +2 here).
    expect(fighter([blade]).attacks[0]).toMatchObject({ name: "Emberfang", damage: "2d6+2", damageType: "fire", versatile: "1d10+2" });
  });

  it("stacks forge bonuses on top of a magic variant, plus extra damage dice", () => {
    const blade = inv("Longsword|PHB", { variant: "+1 Weapon", name: "Flametongue-ish", forge: { attackBonus: 1, damageBonus: 2, extraDamage: [{ dice: "1d6", type: "fire" }] } });
    expect(fighter([blade]).attacks[0]).toMatchObject({ toHit: 2 + 2 + 1 + 1, damage: "1d8+5", extraDamage: [{ dice: "1d6", type: "fire" }] });
  });

  it("changes armor AC and adds saves, resistances and ability scores", () => {
    const plate = inv("Chain Mail|PHB", { name: "Dragonhide", forge: { ac: 17, acBonus: 1, saveBonus: 1, resist: ["fire"], abilitySet: { str: 21 } } });
    const s = fighter([plate]);
    expect(s.ac.value).toBe(18);
    expect(s.abilities.str.score).toBe(21);
    expect(s.saves.dex.mod).toBe(2 + 1);
    expect(s.resistances).toContain("fire");
  });

  it("adds spells and features while the item is in use", () => {
    const forge = { attunement: true, spells: [{ ref: "Magic Missile|PHB", note: "3 charges" }], features: [{ name: "Wardsong", text: "Hums near undead." }], description: "Old elven steel." };
    const off = fighter([inv("Longsword|PHB", { name: "Wardsong Blade", forge })]);
    expect(off.extraSpells).toEqual([]);
    const on = fighter([inv("Longsword|PHB", { name: "Wardsong Blade", attuned: true, forge })]);
    expect(on.extraSpells).toEqual([{ ref: "Magic Missile|PHB", from: "Wardsong Blade", note: "3 charges" }]);
    expect(on.features.filter((f) => f.from === "Item: Wardsong Blade").map((f) => f.name)).toEqual(["Wardsong Blade", "Wardsong"]);
  });
});

describe("pact of the blade", () => {
  const warlock = (choices: Record<string, string[]>, inventory: InventoryItem[]) =>
    computeSheet(make({ classes: [{ name: "Warlock", source: "PHB", level: 3 }], choices, inventory }), rules);
  const blade = { "class:Warlock|PHB:of:Pact Boon": ["Pact of the Blade|PHB"] };

  it("makes a conjured pact weapon proficient and magical", () => {
    const s = warlock(blade, [inv("Longsword|PHB", { pact: "created", name: "Longsword (pact weapon)" })]);
    // Warlocks aren't proficient with longswords, but are with their pact weapon.
    expect(s.attacks[0]).toMatchObject({ toHit: 2 + 2, damage: "1d8+2" });
    expect(s.attacks[0].notes).toContain("pact weapon (magical)");
  });

  it("isn't proficient without the pact boon", () => {
    const s = warlock({}, [inv("Longsword|PHB", { pact: "created" })]);
    expect(s.attacks[0].notes).toContain("not proficient");
  });

  it("adds Improved Pact Weapon's +1 to a conjured weapon, not a magic one", () => {
    const choices = { ...blade, "class:Warlock|PHB:of:Eldritch Invocations": ["Improved Pact Weapon|XGE", "Agonizing Blast|PHB"] };
    const conjured = warlock(choices, [inv("Longsword|PHB", { pact: "created" })]);
    expect(conjured.attacks[0]).toMatchObject({ toHit: 2 + 2 + 1, damage: "1d8+3" });
    const bonded = warlock(choices, [inv("Longsword|PHB", { pact: "bonded", variant: "+1 Weapon" })]);
    expect(bonded.attacks[0]).toMatchObject({ toHit: 2 + 2 + 1, damage: "1d8+3" });
    expect(bonded.attacks[0].notes).toContain("pact weapon (bonded)");
  });
});

describe("Item Forge from scratch", () => {
  it("makes a weapon with no base item that attacks on the sheet", () => {
    const blade: InventoryItem = {
      id: "s1", name: "Starfall Blade", qty: 1, equipped: true, attuned: false,
      forge: { scratch: { kind: "melee", category: "martial" }, dmg1: "1d10", dmgType: "R", properties: ["F"], attackBonus: 1 },
    };
    const raw = itemData(rules, blade);
    expect(raw).toMatchObject({ name: "Starfall Blade", source: "Homebrew", type: "M", weaponCategory: "martial", dmg1: "1d10", dmgType: "R" });
    const ch: Character = { ...newCharacter("Tester"), baseAbilities: { str: 10, dex: 16, con: 10, int: 10, wis: 10, cha: 10 }, inventory: [blade] };
    const atk = computeSheet(ch, rules).attacks.find((a) => a.name === "Starfall Blade");
    // Finesse uses Dex (+3), +1 from the forge, not proficient with no class.
    expect(atk).toMatchObject({ toHit: 4, damage: "1d10+3", damageType: "radiant" });
  });

  it("makes armor and plain items", () => {
    expect(itemData(rules, { id: "a", name: "Hide of Ages", qty: 1, equipped: true, attuned: false, forge: { scratch: { kind: "medium" }, ac: 14 } })).toMatchObject({ type: "MA", ac: 14 });
    expect(itemData(rules, { id: "r", name: "Ring of Echoes", qty: 1, equipped: false, attuned: false, forge: { scratch: { kind: "other" } } })).toMatchObject({ wondrous: true });
  });
});