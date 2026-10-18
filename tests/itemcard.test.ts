import { describe, expect, it } from "vitest";
import { itemCard, needsOwnCard } from "../src/lib/character/itemcard.ts";
import type { InventoryItem } from "../src/lib/character/types.ts";

const inv = (x: Partial<InventoryItem>): InventoryItem => ({ id: "1", ref: "Greatsword|PHB", name: "Greatsword", qty: 1, equipped: true, attuned: false, ...x });

describe("item cards", () => {
  it("only makes cards for items that differ from 5e.tools", () => {
    expect(needsOwnCard(inv({}))).toBe(false);
    expect(needsOwnCard(inv({ variant: "+1 Weapon" }))).toBe(true);
    expect(needsOwnCard(inv({ forge: { description: "Hums." } }))).toBe(true);
  });

  it("shows Forge features, spells, description and the variant's text", () => {
    const item = inv({
      name: "Greatsword of Resonance",
      variant: "+1 Weapon",
      pact: "bonded",
      forge: { features: [{ name: "Resonance", text: "Doubles ring." }], spells: [{ ref: "Thunder Step|XGE", note: "3 charges" }], description: "Old steel.\n\nIt hums." },
    });
    const raw = { name: "+1 Greatsword", source: "PHB", bonusWeapon: "+1", entries: [] };
    const variant = { entries: ["You have a {=bonusWeapon} bonus to attack and damage rolls made with this magic weapon."] };
    const card = itemCard(item, raw, variant);
    expect(card).toMatchObject({ kind: "item", name: "Greatsword of Resonance" });
    const text = JSON.stringify(card.raw.entries);
    expect(text).toContain("Pact weapon");
    expect(text).toContain('"name":"Resonance"');
    expect(text).toContain("{@spell Thunder Step|XGE} (3 charges)");
    expect(card.raw.entries).toContain("Old steel.");
    expect(card.raw.entries).toContain("It hums.");
    expect(card.raw.entries).toContain("You have a +1 bonus to attack and damage rolls made with this magic weapon.");
  });
});
