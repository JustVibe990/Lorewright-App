import { describe, expect, it } from "vitest";
import {
  applyHp,
  blankStats,
  companionFrom,
  companionRow,
  companionToCombatant,
  emptyEncounter,
  syncCompanionsIntoEncounter,
  syncEncounterIntoCompanions,
  type Companion,
} from "../src/lib/combat.ts";

const wolf = (): Companion => ({ id: "w1", name: "Wolf", kind: "summon", initMod: 2, ac: 13, hp: 11, hpMax: 11, tempHp: 0, conditions: [], stats: blankStats() });

describe("companions", () => {
  it("join the fight linked to the sheet, with their owner", () => {
    const c = companionToCombatant(wolf(), "Kara.json", "Kara");
    expect(c.companionOf).toEqual({ file: "Kara.json", id: "w1" });
    expect(c.owner).toBe("Kara");
    expect(c.init).toBeNull();
    expect(c.id).not.toBe("w1");
  });
  it("damage in the fight goes back to the sheet", () => {
    const row = applyHp(companionToCombatant(wolf(), "Kara.json", "Kara"), "damage", 4);
    const next = syncEncounterIntoCompanions([wolf()], "Kara.json", [{ ...row, conditions: ["Prone"] }]);
    expect(next?.[0].hp).toBe(7);
    expect(next?.[0].conditions).toEqual(["Prone"]);
    // Another character's file isn't touched.
    expect(syncEncounterIntoCompanions([wolf()], "Other.json", [row])).toBeNull();
  });
  it("changes on the sheet go into the fight, keeping initiative", () => {
    const row = { ...companionToCombatant(wolf(), "Kara.json", "Kara"), init: 15 };
    const enc = { ...emptyEncounter(), combatants: [row] };
    expect(syncCompanionsIntoEncounter(enc, "Kara.json", [wolf()])).toBeNull();
    const next = syncCompanionsIntoEncounter(enc, "Kara.json", [{ ...wolf(), hp: 3, name: "Fang" }]);
    expect(next?.combatants[0]).toMatchObject({ hp: 3, name: "Fang", init: 15, id: row.id });
  });
  it("a sheet row converts back without losing its kind", () => {
    const back = companionFrom(applyHp(companionRow(wolf()), "heal", 5), "summon");
    expect(back).toMatchObject({ id: "w1", kind: "summon", hp: 11 });
    expect("init" in back).toBe(false);
  });
});
