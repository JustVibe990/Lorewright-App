import { describe, expect, it } from "vitest";
import { ammoFamily, packSize, spendAmmo, weaponAmmo } from "../src/lib/character/items.ts";
import type { InventoryItem } from "../src/lib/character/types.ts";

const item = (id: string, name: string, qty: number, ref?: string): InventoryItem => ({ id, name, qty, ref, equipped: false, attuned: false });

describe("ammunition", () => {
  it("knows what a weapon shoots", () => {
    expect(weaponAmmo({ name: "Longbow", property: ["A", "H", "2H"], ammoType: "arrow|phb" })).toBe("arrow");
    expect(weaponAmmo({ name: "Crossbow, Light", property: ["A", "LD", "2H"], ammoType: "crossbow bolt|phb" })).toBe("bolt");
    expect(weaponAmmo({ name: "Sling", property: ["A"] })).toBe("sling");
    expect(weaponAmmo({ name: "Dagger", property: ["F", "L", "T"] })).toBeNull();
  });

  it("knows what ammunition an item is", () => {
    expect(ammoFamily({ name: "Arrows (20)", type: "A", arrow: true })).toBe("arrow");
    expect(ammoFamily(undefined, "+1 Arrows")).toBe("arrow");
    expect(ammoFamily({ name: "Longbow", type: "R" })).toBeNull();
    expect(packSize("Blowgun Needles (50)")).toBe(50);
  });

  it("opens a pack into loose pieces, then counts down", () => {
    let inv = [item("a", "Arrows (20)", 1, "Arrows (20)|PHB")];
    inv = spendAmmo(inv, ["a"]);
    expect(inv[0]).toMatchObject({ name: "Arrow", ref: "Arrow|PHB", qty: 19 });
    inv = spendAmmo(inv, ["a"]);
    expect(inv[0].qty).toBe(18);
  });

  it("moves on to the next stack when one runs out", () => {
    const inv = spendAmmo([item("a", "+1 Arrow", 0), item("b", "Arrow", 5)], ["a", "b"]);
    expect(inv.map((i) => i.qty)).toEqual([0, 4]);
  });
});
