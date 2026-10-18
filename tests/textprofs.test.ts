import { describe, expect, it } from "vitest";
import { textProficiencies } from "../src/lib/character/profs.ts";

describe("proficiencies from rules text", () => {
  it("reads Hex Warrior", () => {
    const hexWarrior = [
      {
        type: "entries",
        name: "Hex Warrior",
        entries: ["At 1st level, you acquire the training necessary to effectively arm yourself for battle. You gain proficiency with medium armor, shields, and martial weapons.", "The influence of your patron…"],
      },
    ];
    expect(textProficiencies(hexWarrior)).toEqual({ armor: ["medium", "shield"], weapons: ["martial"] });
  });

  it("reads other subclasses, and ignores what it can't name", () => {
    expect(textProficiencies(["You gain proficiency with martial weapons and heavy armor."])).toEqual({ armor: ["heavy"], weapons: ["martial"] });
    expect(textProficiencies(["You gain proficiency with medium armor and the {@item scimitar|phb}."])).toEqual({ armor: ["medium"], weapons: ["scimitar"] });
    expect(textProficiencies(["He or she gains proficiency with martial weapons."])).toEqual({ armor: [], weapons: ["martial"] });
    expect(textProficiencies(["You gain proficiency with heavy armor and {@item smith's tools|phb}."])).toEqual({ armor: ["heavy"], weapons: [] });
    expect(textProficiencies(["You gain proficiency with one type of artisan's tools."])).toEqual({ armor: [], weapons: [] });
  });

  it("skips options you didn't pick", () => {
    expect(textProficiencies([{ type: "options", entries: [{ type: "entries", entries: ["You gain proficiency with heavy armor."] }] }])).toEqual({ armor: [], weapons: [] });
  });
});
