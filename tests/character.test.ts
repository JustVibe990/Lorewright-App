import { describe, expect, it } from "vitest";
import { cellText, computeSheet, evalFormula, progressionAt, spellRef } from "../src/lib/character/engine.ts";
import { newCharacter } from "../src/lib/character/storage.ts";
import type { Character } from "../src/lib/character/types.ts";
import { testRules } from "./fixtures/rules.ts";

const rules = testRules();

function make(over: Partial<Character> = {}): Character {
  return { ...newCharacter("Test"), baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }, ...over };
}
const inv = (ref: string, extra = {}) => ({ id: ref, ref, name: ref.split("|")[0], qty: 1, equipped: true, attuned: false, ...extra });

describe("rules data", () => {
  it("keeps 2014 content only", () => {
    expect(rules.classes.map((c) => `${c.name}|${c.source}`)).not.toContain("Fighter|XPHB");
    expect(rules.races.some((r) => r.raceSource === "XPHB")).toBe(false);
    expect(rules.feats.filter((f) => f.name === "Tough").map((f) => f.source)).toEqual(["PHB"]);
  });

  it("merges subraces and keeps a nameless one as the base species", () => {
    const names = rules.races.map((r) => r.name);
    expect(names).toContain("Elf (High)");
    expect(names).toContain("Human");
    expect(names).toContain("Human (Variant)");
    const high = rules.findRace("Elf|PHB|High|PHB")!;
    expect(high.raw.ability).toEqual([{ dex: 2, int: 1 }]);
    expect(high.raw.entries.map((e: any) => e.name)).toEqual(["Age", "Fey Ancestry", "Cantrip"]);
  });

  it("expands feature references", () => {
    const champ = rules.findClass("Fighter", "PHB")!.subclasses[0];
    const entries = champ.features[0].feature.entries;
    expect(entries[1]).toMatchObject({ type: "entries", name: "Improved Critical" });
    const fs = rules.findClass("Fighter", "PHB")!.features[0].feature.entries[0].entries[0];
    expect(fs).toMatchObject({ type: "entries", name: "Defense" });
  });

  it("finds class spell lists among imported spells", () => {
    // Xanathar's spells name their classes under classVariant.
    expect(rules.classSpells("Wizard", "PHB").map((s) => s.name)).toEqual(["Fire Bolt", "Absorb Elements", "Magic Missile"]);
  });
});

describe("level 1 fighter", () => {
  const ch = make({
    race: { key: "Elf|PHB|High|PHB", name: "Elf (High)" },
    background: { name: "Acolyte", source: "PHB" },
    classes: [{ name: "Fighter", source: "PHB", level: 1 }],
    choices: {
      "class:Fighter|PHB:skills": ["athletics", "survival"],
      "class:Fighter|PHB:of:Fighting Style": ["Defense|PHB"],
      "race:lang:languages": ["Dwarvish"],
      "bg:lang:languages": ["Giant", "Orc"],
    },
    inventory: [inv("Chain Mail|PHB"), inv("Shield|PHB"), inv("Longsword|PHB")],
  });
  const s = computeSheet(ch, rules);

  it("adds species ability bonuses", () => {
    expect(s.abilities.dex).toMatchObject({ score: 16, mod: 3 });
    expect(s.abilities.int).toMatchObject({ score: 13, mod: 1 });
  });

  it("computes proficiencies, saves and skills", () => {
    expect(s.proficiencyBonus).toBe(2);
    expect(s.saves.str).toEqual({ mod: 4, proficient: true });
    expect(s.saves.dex).toEqual({ mod: 3, proficient: false });
    expect(s.skills.athletics).toMatchObject({ mod: 4, proficient: true });
    expect(s.skills.perception).toMatchObject({ mod: 2, proficient: true }); // Keen Senses
    expect(s.skills.religion).toMatchObject({ mod: 3, proficient: true }); // Acolyte
    expect(s.passive.perception).toBe(12);
    expect(s.proficiencies.languages).toEqual(expect.arrayContaining(["Common", "Elvish", "Dwarvish", "Giant", "Orc"]));
    expect(s.proficiencies.armor).toEqual(expect.arrayContaining(["heavy", "shield"]));
  });

  it("computes AC from armor, shield and Defense", () => {
    expect(s.ac.value).toBe(16 + 2 + 1);
    expect(s.ac.formula).toContain("Chain Mail");
  });

  it("computes HP, speed and senses", () => {
    expect(s.hp.max).toBe(10 + 1);
    expect(s.hitDice).toEqual([{ classRef: "Fighter|PHB", faces: 10, total: 1 }]);
    expect(s.speed.walk).toBe(30);
    expect(s.senses).toEqual(["Darkvision 60 ft."]);
  });

  it("builds weapon attacks", () => {
    const sword = s.attacks.find((a) => a.name === "Longsword")!;
    expect(sword).toMatchObject({ toHit: 4, damage: "1d8+2", versatile: "1d10+2", damageType: "slashing" });
    expect(s.attacks.find((a) => a.name === "Unarmed Strike")).toMatchObject({ toHit: 4, damage: "3" });
  });

  it("lists features and resources", () => {
    const names = s.features.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["Fighting Style", "Second Wind", "Defense", "Fey Ancestry", "Cantrip", "Shelter of the Faithful"]));
    expect(names).not.toContain("Age");
    expect(s.resources.map((r) => r.id)).toEqual(["secondwind"]);
  });

  it("reports the open and answered choices", () => {
    const skills = s.choices.find((c) => c.id === "class:Fighter|PHB:skills")!;
    expect(skills).toMatchObject({ type: "skill", count: 2, answer: ["athletics", "survival"] });
    expect(s.choices.find((c) => c.id === "class:Fighter|PHB:of:Fighting Style")!.options).toEqual(expect.arrayContaining(["Defense|PHB", "Archery|PHB"]));
    expect(s.choices.find((c) => c.id === "class:Fighter|PHB:subclass")).toBeUndefined();
  });
});

describe("levelling", () => {
  const base = make({ classes: [{ name: "Fighter", source: "PHB", level: 5 }], hpRolls: { "Fighter|PHB": [10, null, 4, 7] } });

  it("asks for a subclass at its level and adds its features", () => {
    const s = computeSheet({ ...base, choices: { "class:Fighter|PHB:subclass": ["Champion|PHB"] } }, rules);
    expect(s.choices.find((c) => c.type === "subclass")).toMatchObject({ options: ["Champion|PHB", "Eldritch Knight|PHB"], answer: ["Champion|PHB"] });
    expect(s.features.map((f) => f.name)).toEqual(expect.arrayContaining(["Champion", "Extra Attack"]));
    // Nested subclass features count as features the character has.
    expect(rules.findClass("Fighter", "PHB")!.subclasses[0].features[0].feature.refNames).toEqual(["Improved Critical"]);
    // Fighting style options are a menu, not features the class has.
    expect(rules.findClass("Fighter", "PHB")!.features[0].feature.refNames).toEqual([]);
    expect(s.attacksPerAction).toBe(2);
    expect(s.proficiencyBonus).toBe(3);
  });

  it("uses rolled or average HP per level", () => {
    // 10 (1st) + 10 + 6 (avg) + 4 + 7, plus Con +1 each level.
    expect(computeSheet(base, rules).hp.max).toBe(10 + 10 + 6 + 4 + 7 + 5);
  });

  it("applies an ASI (+2 or +1/+1) and caps at 20", () => {
    const s = computeSheet({ ...base, choices: { "class:Fighter|PHB:asi:4": ["str", "str"] } }, rules);
    expect(s.abilities.str.score).toBe(17);
    const capped = computeSheet({ ...base, baseAbilities: { ...base.baseAbilities, str: 19 }, choices: { "class:Fighter|PHB:asi:4": ["str", "str"] } }, rules);
    expect(capped.abilities.str.score).toBe(20);
  });

  it("takes a feat instead of an ASI", () => {
    const tough = computeSheet({ ...base, choices: { "class:Fighter|PHB:asi:4": ["feat:Tough|PHB"] } }, rules);
    expect(tough.hp.max).toBe(computeSheet(base, rules).hp.max + 10);
    const res = computeSheet(
      { ...base, choices: { "class:Fighter|PHB:asi:4": ["feat:Resilient|PHB"], "class:Fighter|PHB:asi:4:ability:choose": ["wis"], "class:Fighter|PHB:asi:4:save": ["wis"] } },
      rules,
    );
    expect(res.abilities.wis.score).toBe(11);
    expect(res.saves.wis.proficient).toBe(true);
  });
});

describe("spellcasting", () => {
  it("gives a wizard slots, DC and prepared spells from formulas", () => {
    const s = computeSheet(make({ baseAbilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 }, classes: [{ name: "Wizard", source: "PHB", level: 5 }] }), rules);
    expect(s.slots).toEqual([4, 3, 2]);
    const sc = s.spellcasting[0];
    expect(sc).toMatchObject({ ability: "int", dc: 8 + 3 + 3, attack: 6, mode: "spellbook", cantripsMax: 4, knownMax: 6 + 2 * 4, preparedMax: 5 + 3, maxSpellLevel: 3 });
    expect(s.resources.map((r) => r.id)).toContain("arcanerecovery");
  });

  it("gives a warlock pact slots and invocations", () => {
    const s = computeSheet(make({ classes: [{ name: "Warlock", source: "PHB", level: 3 }], choices: { "class:Warlock|PHB:of:Eldritch Invocations": ["Agonizing Blast|PHB", "Devil's Sight|PHB"] } }), rules);
    expect(s.pact).toEqual({ slots: 2, level: 2 });
    expect(s.slots).toEqual([]);
    expect(s.spellcasting[0]).toMatchObject({ mode: "known", knownMax: 4, cantripsMax: 2, maxSpellLevel: 2 });
    expect(s.choices.find((c) => c.label === "Eldritch Invocations")).toMatchObject({ count: 2 });
    expect(s.features.map((f) => f.name)).toEqual(expect.arrayContaining(["Agonizing Blast", "Devil's Sight"]));
  });

  it("uses the multiclass table for several casters", () => {
    const s = computeSheet(make({ classes: [{ name: "Fighter", source: "PHB", level: 2 }, { name: "Wizard", source: "PHB", level: 3 }] }), rules);
    expect(s.slots).toEqual([4, 2]);
  });
});

describe("multiclassing", () => {
  it("grants only the multiclass proficiencies and checks prerequisites", () => {
    const s = computeSheet(make({ classes: [{ name: "Fighter", source: "PHB", level: 1 }, { name: "Wizard", source: "PHB", level: 1 }] }), rules);
    expect(s.saves.int.proficient).toBe(false);
    expect(s.warnings).toEqual(["Wizard multiclass requirement not met (INT 13)."]);
    expect(s.hp.max).toBe(10 + 1 + 4 + 1);
    expect(s.hitDice.map((h) => h.faces)).toEqual([10, 6]);
  });
});

describe("built-in features", () => {
  it("doubles proficiency with expertise", () => {
    const s = computeSheet(
      make({
        classes: [{ name: "Rogue", source: "PHB", level: 1 }],
        choices: { "class:Rogue|PHB:skills": ["stealth", "acrobatics", "deception", "perception"], "class:Rogue|PHB:expertise:1": ["stealth", "thieves' tools"] },
      }),
      rules,
    );
    expect(s.skills.stealth).toMatchObject({ mod: 2 + 4, expertise: true });
    expect(s.classTable).toEqual([{ classRef: "Rogue|PHB", label: "Sneak Attack", value: "1d6" }]);
    expect(s.proficiencies.tools).toContain("thieves' tools");
  });

  it("uses Unarmored Defense without armor", () => {
    const s = computeSheet(make({ classes: [{ name: "Barbarian", source: "PHB", level: 1 }] }), rules);
    expect(s.ac).toMatchObject({ value: 10 + 2 + 1 });
    expect(s.resources.find((r) => r.id === "rage")).toMatchObject({ max: 2, recharge: "long" });
    expect(s.classTable.find((t) => t.label === "Rage Damage")?.value).toBe("+2");
  });

  it("slows heavy armor wearers without the Strength", () => {
    const s = computeSheet(make({ baseAbilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, classes: [{ name: "Fighter", source: "PHB", level: 1 }], inventory: [inv("Chain Mail|PHB")] }), rules);
    expect(s.speed.walk).toBe(20);
  });
});

describe("items and effects", () => {
  it("applies magic variants and attunement", () => {
    const ch = make({
      classes: [{ name: "Fighter", source: "PHB", level: 1 }],
      inventory: [inv("Longsword|PHB", { variant: "+1 Weapon", name: "" }), inv("Ring of Protection|DMG", { attuned: false })],
    });
    const s = computeSheet(ch, rules);
    expect(s.attacks[0]).toMatchObject({ name: "+1 Longsword", toHit: 2 + 2 + 1, damage: "1d8+3" });
    expect(s.ac.value).toBe(12);
    const attuned = computeSheet({ ...ch, inventory: [ch.inventory[0], { ...ch.inventory[1], attuned: true }] }, rules);
    expect(attuned.ac.value).toBe(13);
    expect(attuned.saves.dex.mod).toBe(3);
  });

  it("applies custom effects", () => {
    const s = computeSheet(
      make({
        classes: [{ name: "Fighter", source: "PHB", level: 1 }],
        effects: [
          { id: "1", label: "Bracers", target: "ac", op: "add", value: 2, active: true },
          { id: "2", label: "Boots", target: "speed.walk", op: "add", value: 10, active: true },
          { id: "3", label: "Off", target: "ac", op: "add", value: 5, active: false },
          { id: "4", label: "Sneaky", target: "skill.stealth", op: "expertise", value: 0, active: true },
          { id: "5", label: "Belt", target: "ability.str", op: "set", value: 21, active: true },
        ],
      }),
      rules,
    );
    expect(s.ac.value).toBe(12 + 2);
    expect(s.speed.walk).toBe(40);
    expect(s.skills.stealth).toMatchObject({ expertise: true, mod: 2 + 4 });
    expect(s.abilities.str.score).toBe(21);
  });

  it("handles species ability choices", () => {
    const s = computeSheet(make({ race: { key: "Half-Elf|PHB", name: "Half-Elf" }, choices: { "race:ability:choose": ["str", "con"] } }), rules);
    expect([s.abilities.cha.score, s.abilities.str.score, s.abilities.con.score]).toEqual([10, 16, 14]);
    const human = computeSheet(make({ race: { key: "Human|PHB||PHB", name: "Human" } }), rules);
    expect(human.abilities.str.score).toBe(16);
  });

  it("offers a feat to variant humans", () => {
    const s = computeSheet(make({ race: { key: "Human|PHB|Variant|PHB", name: "Human (Variant)" }, classes: [{ name: "Fighter", source: "PHB", level: 1 }], choices: { "race:feat": ["Alert|PHB"] } }), rules);
    expect(s.initiative).toBe(2 + 5);
    expect(s.choices.map((c) => c.id)).toEqual(expect.arrayContaining(["race:ability:choose", "race:skills:skills", "race:feat"]));
  });
});

describe("bonus spells and optional features", () => {
  it("asks High Elves for a wizard cantrip", () => {
    const s = computeSheet(make({ race: { key: "Elf|PHB|High|PHB", name: "Elf (High)" }, choices: { "race:spells:0": ["Fire Bolt|PHB"] } }), rules);
    const c = s.choices.find((x) => x.id === "race:spells:0")!;
    expect(c).toMatchObject({ type: "cantrip", options: ["Fire Bolt|PHB"], answer: ["Fire Bolt|PHB"] });
    expect(s.extraSpells).toEqual([{ ref: "Fire Bolt|PHB", from: "Elf (High)", note: "known", ability: "int" }]);
  });

  it("grants innate spells by character level", () => {
    const l1 = computeSheet(make({ race: { key: "Tiefling|PHB", name: "Tiefling" }, classes: [{ name: "Fighter", source: "PHB", level: 1 }] }), rules);
    expect(l1.extraSpells.map((x) => `${x.ref} ${x.note}`)).toEqual(["Fire Bolt|PHB known"]);
    const l3 = computeSheet(make({ race: { key: "Tiefling|PHB", name: "Tiefling" }, classes: [{ name: "Fighter", source: "PHB", level: 3 }] }), rules);
    expect(l3.extraSpells.map((x) => `${x.ref} ${x.note}`)).toEqual(["Fire Bolt|PHB known", "Magic Missile|PHB 1/long rest"]);
    expect(l3.resistances).toEqual(["fire"]);
  });

  it("labels proficiency choices by what they are", () => {
    const s = computeSheet(make({ race: { key: "Elf|PHB|High|PHB", name: "Elf (High)" } }), rules);
    expect(s.choices.find((c) => c.id === "race:lang:languages")).toMatchObject({ label: "Languages", from: "Elf (High)" });
  });

  it("only includes optional class features when opted in", () => {
    const base = make({ classes: [{ name: "Fighter", source: "PHB", level: 4 }] });
    expect(computeSheet(base, rules).features.map((f) => f.name)).not.toContain("Martial Versatility");
    expect(computeSheet({ ...base, choices: { "options:variantFeatures": ["1"] } }, rules).features.map((f) => f.name)).toContain("Martial Versatility");
  });
});

describe("subclass spells", () => {
  it("gives an Eldritch Knight the wizard list to choose from", () => {
    const s = computeSheet(make({ classes: [{ name: "Fighter", source: "PHB", level: 3 }], choices: { "class:Fighter|PHB:subclass": ["Eldritch Knight|PHB"] } }), rules);
    expect(s.spellcasting).toHaveLength(1);
    expect(s.spellcasting[0]).toMatchObject({ className: "Fighter", ability: "int", mode: "known", cantripsMax: 2, knownMax: 3, maxSpellLevel: 1 });
    expect(s.spellcasting[0].expanded.sort()).toEqual(["Absorb Elements|XGE", "Fire Bolt|PHB", "Magic Missile|PHB"]);
    expect(s.slots).toEqual([2]);
  });

  it("adds patron spells as the warlock can cast their level", () => {
    const at = (level: number) =>
      computeSheet(make({ classes: [{ name: "Warlock", source: "PHB", level }], choices: { "class:Warlock|PHB:subclass": ["Fiend|PHB"] } }), rules).spellcasting[0].expanded;
    expect(at(1)).toEqual(["Magic Missile|PHB"]);
    expect(at(3)).toEqual(["Magic Missile|PHB", "Fire Bolt|PHB"]);
  });

  it("asks which list when a subclass has several, then grants it", () => {
    const base = make({ classes: [{ name: "Wizard", source: "PHB", level: 2 }], choices: { "class:Wizard|PHB:subclass": ["Seer|PHB"] } });
    const none = computeSheet(base, rules);
    expect(none.choices.find((c) => c.id === "class:Wizard|PHB:subspells:alt")).toMatchObject({ labels: { 0: "Day", 1: "Night" }, answer: [] });
    expect(none.spellcasting[0]).toMatchObject({ bonusKnown: [], alwaysPrepared: [] });

    const day = computeSheet({ ...base, choices: { ...base.choices, "class:Wizard|PHB:subspells:alt": ["0"] } }, rules);
    expect(day.spellcasting[0]).toMatchObject({ bonusKnown: ["Magic Missile|PHB"], alwaysPrepared: ["Hex|PHB"] });

    const night = computeSheet({ ...base, choices: { ...base.choices, "class:Wizard|PHB:subspells:alt": ["1"], "class:Wizard|PHB:subspells:known:0": ["Fire Bolt|PHB"] } }, rules);
    expect(night.choices.find((c) => c.id === "class:Wizard|PHB:subspells:known:0")).toMatchObject({ type: "cantrip", options: ["Fire Bolt|PHB"] });
    expect(night.spellcasting[0].bonusKnown).toEqual(["Fire Bolt|PHB"]);
  });
});

describe("helpers", () => {
  it("reads progressions in both shapes", () => {
    expect(progressionAt([0, 2, 2, 3], 2)).toBe(2);
    expect(progressionAt({ 3: 3, 7: 5 }, 8)).toBe(5);
    expect(progressionAt({ 3: 3 }, 2)).toBe(0);
  });
  it("evaluates prepared-spell formulas", () => {
    const mods = { str: 0, dex: 0, con: 0, int: 3, wis: 2, cha: 1 } as const;
    expect(evalFormula("<$level$> + <$int_mod$>", 5, mods)).toBe(8);
    expect(evalFormula("<$level$> / 2 + <$cha_mod$>", 5, mods)).toBe(3);
    expect(evalFormula("process.exit()", 5, mods)).toBe(0);
  });
  it("reads class table cells", () => {
    expect(cellText({ type: "dice", toRoll: [{ number: 2, faces: 6 }] })).toBe("2d6");
    expect(cellText({ type: "bonusSpeed", value: 10 })).toBe("+10 ft.");
    expect(cellText("{@filter 2nd|spells|level=2}")).toBe("2nd");
  });
  it("turns 5e.tools spell refs into refs", () => {
    expect(spellRef("cure wounds")).toBe("Cure Wounds|PHB");
    expect(spellRef("hex#c")).toBe("Hex|PHB");
    expect(spellRef("wall of fire|xge")).toBe("Wall of Fire|XGE");
  });
});

describe("compendium", () => {
  it("lists classes and subclasses and opens a class page", () => {
    const list = rules.compendium();
    expect(list.some((x) => x.kind === "class" && x.name === "Fighter")).toBe(true);
    expect(list.some((x) => x.kind === "subclass" && x.hint.startsWith("Fighter subclass"))).toBe(true);
    const page = rules.linkEntry({ kind: "class", name: "Fighter", source: "PHB" });
    expect(page?.name).toBe("Fighter");
    expect(JSON.stringify(page?.raw.entries)).toContain("Level 1:");
  });
});
