import { describe, expect, it } from "vitest";
import { chargeInfo, chargesLeft, itemSpellOptions, optionCost, rechargeItems, spendItem } from "../src/lib/character/charges.ts";
import { applyRollMods, rollMods } from "../src/lib/character/conditions.ts";
import { hitDieHeal, longRest, shortRest, songOfRestDie } from "../src/lib/character/rest.ts";
import { isScroll, scrollLevel } from "../src/lib/character/scrolls.ts";
import { newCharacter } from "../src/lib/character/storage.ts";
import type { Character, InventoryItem, Sheet } from "../src/lib/character/types.ts";

const WAND = {
  name: "Wand of Fireballs",
  type: "WD|DMG",
  charges: 7,
  recharge: "dawn",
  rechargeAmount: "{@dice 1d6 + 1}",
  attachedSpells: { charges: { "1": ["fireball"] } },
  entries: [
    "This wand has 7 charges. While holding it, you can use an action to expend 1 or more of its charges to cast the {@spell fireball} spell (save {@dc 15}) from it. For 1 charge, you cast the 3rd-level version of the spell. You can increase the spell slot level by one for each additional charge you expend.",
    "The wand regains {@dice 1d6 + 1} expended charges daily at dawn. If you expend the wand's last charge, roll a {@dice d20}. On a 1, the wand crumbles into ashes and is destroyed.",
  ],
};
const STAFF = {
  name: "Staff of Healing",
  charges: 10,
  recharge: "dawn",
  rechargeAmount: "{@dice 1d6 + 4}",
  attachedSpells: { charges: { "1": ["cure wounds"], "2": ["lesser restoration"], "5": ["mass cure wounds"] } },
  entries: [
    "This staff has 10 charges. While holding it, you can use an action to expend 1 or more of its charges to cast one of the following spells from it, using your spell save DC and spellcasting ability modifier: {@spell cure wounds} (1 charge per spell level, up to 4th), {@spell lesser restoration} (2 charges). or {@spell mass cure wounds} (5 charges).",
  ],
};
const item = (patch: Partial<InventoryItem> = {}): InventoryItem => ({ id: "w", ref: "Wand of Fireballs|DMG", name: "Wand of Fireballs", qty: 1, equipped: false, attuned: true, ...patch });

describe("item charges", () => {
  it("reads charges, recharge, DC and spells", () => {
    const w = chargeInfo(WAND)!;
    expect(w).toMatchObject({ max: 7, recharge: "dawn", regain: "1d6+1", dc: 15, lastChargeRisk: true });
    expect(w.spells).toEqual([{ name: "fireball", cost: 1, upcast: true }]);
    const s = chargeInfo(STAFF)!;
    expect(s.dc).toBeUndefined();
    expect(s.spells.find((x) => x.name === "cure wounds")).toMatchObject({ perLevel: true, cost: 1, maxLevel: 4 });
    expect(s.spells.find((x) => x.name === "mass cure wounds")).toMatchObject({ cost: 5 });
    expect(chargeInfo({ name: "Longsword" })).toBeNull();
  });
  it("upcasts a wand with more charges, as far as the charges go", () => {
    const opts = itemSpellOptions(chargeInfo(WAND)!.spells[0], 3, 3);
    expect(opts.map((o) => [o.level, optionCost(o)])).toEqual([[3, 1], [4, 2], [5, 3]]);
    const cure = chargeInfo(STAFF)!.spells[0];
    expect(itemSpellOptions(cure, 1, 10).map((o) => o.level)).toEqual([1, 2, 3, 4]);
  });
  it("spends charges and gets them back on a long rest", () => {
    const ch: Character = { ...newCharacter("T"), inventory: [item()] };
    const w = chargeInfo(WAND)!;
    const opt = itemSpellOptions(w.spells[0], 3, 7)[2];
    const spent = spendItem(ch, "w", w.spells[0], opt);
    expect(spent.inventory[0].chargesUsed).toBe(3);
    expect(chargesLeft(spent.inventory[0], w)).toBe(4);
    const r = rechargeItems(spent, () => w, "long", () => 2);
    expect(r.ch.inventory[0].chargesUsed).toBe(1);
    expect(r.notes[0]).toMatch(/regained 2 charges/);
    // A short rest doesn't recharge a dawn item.
    expect(rechargeItems(spent, () => w, "short", () => 2).ch.inventory[0].chargesUsed).toBe(3);
  });
  it("Item Forge charges", () => {
    const info = chargeInfo({ name: "Rod" }, item({ forge: { charges: 3, recharge: "short", spells: [{ ref: "Shield|PHB", note: "1 charge" }] } }))!;
    expect(info).toMatchObject({ max: 3, recharge: "short", regain: "all" });
    expect(info.spells).toEqual([{ name: "Shield", cost: 1 }]);
  });
});

describe("spell scrolls", () => {
  it("finds scrolls and their level", () => {
    expect(isScroll({ name: "Spell Scroll (3rd Level)" })).toBe(true);
    expect(isScroll({ name: "Scroll of Protection" })).toBe(false);
    expect(scrollLevel("Spell Scroll (3rd Level)")).toBe(3);
    expect(scrollLevel("Spell Scroll (Cantrip)")).toBe(0);
  });
});

describe("condition rolls", () => {
  const ch = (conditions: string[], exhaustion = 0): Character => ({ ...newCharacter("T"), state: { ...newCharacter("T").state, conditions, exhaustion } });
  it("poisoned: disadvantage on attacks and checks, not saves", () => {
    const c = ch(["Poisoned"]);
    expect(rollMods(c, { kind: "attack" }).dis).toEqual(["Poisoned"]);
    expect(rollMods(c, { kind: "check", ability: "wis" }).dis).toEqual(["Poisoned"]);
    expect(rollMods(c, { kind: "save", ability: "con" }).dis).toEqual([]);
  });
  it("paralyzed fails Str and Dex saves; restrained has disadvantage on Dex saves", () => {
    expect(rollMods(ch(["Paralyzed"]), { kind: "save", ability: "dex" }).autoFail).toEqual(["Paralyzed"]);
    expect(rollMods(ch(["Paralyzed"]), { kind: "save", ability: "wis" }).autoFail).toEqual([]);
    expect(rollMods(ch(["Restrained"]), { kind: "save", ability: "dex" }).dis).toEqual(["Restrained"]);
  });
  it("exhaustion adds up", () => {
    expect(rollMods(ch([], 1), { kind: "check" }).dis).toEqual(["Exhaustion 1"]);
    expect(rollMods(ch([], 3), { kind: "save", ability: "wis" }).dis).toEqual(["Exhaustion 3"]);
  });
  it("turns the roll into disadvantage, and advantage cancels it", () => {
    const m = rollMods(ch(["Poisoned"]), { kind: "attack" });
    expect(applyRollMods("1d20+5", "Hit", m)).toEqual({ expr: "2d20kl1+5", label: "Hit · disadvantage: Poisoned" });
    expect(applyRollMods("2d20kh1+5", "Hit (advantage)", m).expr).toBe("1d20+5");
    expect(applyRollMods("2d20kh1+5", "Hit (advantage)", m).label).toBe("Hit · disadvantage: Poisoned · they cancel out");
    expect(applyRollMods("1d20+5", "Hit", rollMods(ch(["Invisible"]), { kind: "attack" })).expr).toBe("2d20kh1+5");
    expect(applyRollMods("1d20+5", "Hit", { adv: [], dis: [], autoFail: [] }).expr).toBe("1d20+5");
  });
});

describe("rests", () => {
  const sheet = { hp: { max: 30 }, hitDice: [{ classRef: "Fighter|PHB", faces: 10, total: 4 }], resources: [{ id: "secondwind", recharge: "short" }, { id: "indomitable", recharge: "long" }] } as unknown as Sheet;
  const base = newCharacter("T");
  const tired: Character = { ...base, state: { ...base.state, hp: 10, hitDiceUsed: { "Fighter|PHB": 1 }, resourcesUsed: { secondwind: 1, indomitable: 1 }, exhaustion: 2 } };
  it("a short rest heals from Hit Dice and gets short-rest features back", () => {
    const r = shortRest(tired, sheet, 12, { "Fighter|PHB": 2 });
    expect(r.state.hp).toBe(22);
    expect(r.state.hitDiceUsed["Fighter|PHB"]).toBe(3);
    expect(r.state.resourcesUsed).toEqual({ indomitable: 1 });
  });
  it("a long rest: full HP, half the Hit Dice back, one less exhaustion", () => {
    const r = longRest(tired, sheet);
    expect(r.state).toMatchObject({ hp: 30, resourcesUsed: {}, exhaustion: 1 });
    expect(r.state.hitDiceUsed["Fighter|PHB"]).toBe(0);
  });
  it("Hit Die healing and Song of Rest", () => {
    expect(hitDieHeal(1, -2)).toBe(0);
    expect(hitDieHeal(1, 3, true)).toBe(6);
    expect(songOfRestDie(1)).toBeNull();
    expect(songOfRestDie(9)).toBe("1d8");
  });
});
