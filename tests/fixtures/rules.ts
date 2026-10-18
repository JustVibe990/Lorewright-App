// A small hand-written rules set in 5e.tools' file shapes, for engine tests.
// Rules text is placeholder; only the structured fields matter.

import { DataStore } from "../../src/lib/data.ts";
import { Rules, type RawRules } from "../../src/lib/character/rules.ts";
import type { Entry } from "../../src/lib/types.ts";

const t = (s: string) => [s];
const full = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
].map((r) => [...r, ...Array(9 - r.length).fill(0)]);

const fighter = {
  class: [
    {
      name: "Fighter", source: "PHB", edition: "classic", hd: { number: 1, faces: 10 }, proficiency: ["str", "con"],
      startingProficiencies: {
        armor: ["light", "medium", "heavy", "shield"], weapons: ["simple", "martial"],
        skills: [{ choose: { from: ["acrobatics", "athletics", "perception", "survival"], count: 2 } }],
      },
      multiclassing: { requirements: { or: [{ str: 13, dex: 13 }] }, proficienciesGained: { armor: ["light", "medium", "shield"], weapons: ["simple", "martial"] } },
      optionalfeatureProgression: [{ name: "Fighting Style", featureType: ["FS:F"], progression: { 1: 1 } }],
      classFeatures: [
        "Fighting Style|Fighter||1", "Second Wind|Fighter||1", "Action Surge|Fighter||2",
        { classFeature: "Martial Archetype|Fighter||3", gainSubclassFeature: true },
        "Ability Score Improvement|Fighter||4", "Martial Versatility|Fighter||4|TCE", "Extra Attack|Fighter||5",
      ],
      subclassTitle: "Martial Archetype",
    },
    { name: "Fighter", source: "XPHB", edition: "one", hd: { number: 1, faces: 10 }, classFeatures: [] },
  ],
  subclass: [
    {
      name: "Champion", shortName: "Champion", source: "PHB", className: "Fighter", classSource: "PHB",
      subclassFeatures: ["Champion|Fighter||Champion||3"],
    },
    {
      name: "Eldritch Knight", shortName: "Eldritch Knight", source: "PHB", className: "Fighter", classSource: "PHB",
      spellcastingAbility: "int", casterProgression: "1/3", cantripProgression: [0, 0, 2, 2, 2], spellsKnownProgression: [0, 0, 3, 4, 4],
      additionalSpells: [{ expanded: { 3: [{ all: "level=0|class=Wizard" }, { all: "level=1|class=Wizard" }] } }],
      subclassTableGroups: [{ title: "Spell Slots per Spell Level", colLabels: ["1st"], rowsSpellProgression: [[0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 0, 0], [3, 0, 0, 0], [3, 0, 0, 0]] }],
      subclassFeatures: [],
    },
  ],
  classFeature: [
    { name: "Fighting Style", source: "PHB", className: "Fighter", classSource: "PHB", level: 1, entries: [{ type: "options", count: 1, entries: [{ type: "refOptionalfeature", optionalfeature: "Defense" }] }] },
    { name: "Second Wind", source: "PHB", className: "Fighter", classSource: "PHB", level: 1, entries: t("Regain {@dice 1d10} + level.") },
    { name: "Action Surge", source: "PHB", className: "Fighter", classSource: "PHB", level: 2, entries: t("One extra action.") },
    { name: "Martial Archetype", source: "PHB", className: "Fighter", classSource: "PHB", level: 3, entries: t("Pick an archetype.") },
    { name: "Ability Score Improvement", source: "PHB", className: "Fighter", classSource: "PHB", level: 4, entries: t("Raise scores.") },
    { name: "Extra Attack", source: "PHB", className: "Fighter", classSource: "PHB", level: 5, entries: t("Attack twice.") },
    { name: "Martial Versatility", source: "TCE", className: "Fighter", classSource: "PHB", level: 4, isClassFeatureVariant: true, entries: t("Swap a style.") },
  ],
  subclassFeature: [
    { name: "Champion", source: "PHB", className: "Fighter", classSource: "PHB", subclassShortName: "Champion", subclassSource: "PHB", level: 3, entries: ["Intro.", { type: "refSubclassFeature", subclassFeature: "Improved Critical|Fighter||Champion||3" }] },
    { name: "Improved Critical", source: "PHB", className: "Fighter", classSource: "PHB", subclassShortName: "Champion", subclassSource: "PHB", level: 3, entries: t("Crit on 19.") },
  ],
};

const wizard = {
  class: [
    {
      name: "Wizard", source: "PHB", edition: "classic", hd: { number: 1, faces: 6 }, proficiency: ["int", "wis"],
      spellcastingAbility: "int", casterProgression: "full", preparedSpells: "<$level$> + <$int_mod$>",
      cantripProgression: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5],
      spellsKnownProgressionFixed: [6, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      startingProficiencies: { weapons: ["{@item dagger|phb|daggers}", "{@item quarterstaff|phb|quarterstaffs}"], skills: [{ choose: { from: ["arcana", "history", "insight"], count: 2 } }] },
      multiclassing: { requirements: { int: 13 }, proficienciesGained: {} },
      classTableGroups: [{ title: "Spell Slots per Spell Level", colLabels: ["1st"], rowsSpellProgression: full }],
      classFeatures: ["Spellcasting|Wizard||1", "Arcane Recovery|Wizard||1", { classFeature: "Arcane Tradition|Wizard||2", gainSubclassFeature: true }],
      subclassTitle: "Arcane Tradition",
    },
  ],
  subclass: [
    {
      // Made-up subclass with two named spell lists, like Circle of the Land.
      name: "School of Sight", shortName: "Seer", source: "PHB", className: "Wizard", classSource: "PHB",
      additionalSpells: [
        { name: "Day", known: { 2: ["magic missile"] }, prepared: { 2: ["hex"] } },
        { name: "Night", known: { 2: { _: [{ choose: "level=0|class=Wizard" }] } } },
      ],
      subclassFeatures: ["Seer|Wizard||Seer||2"],
    },
  ],
  classFeature: [
    { name: "Spellcasting", source: "PHB", className: "Wizard", classSource: "PHB", level: 1, entries: t("You cast spells.") },
    { name: "Arcane Recovery", source: "PHB", className: "Wizard", classSource: "PHB", level: 1, entries: t("Recover slots.") },
    { name: "Arcane Tradition", source: "PHB", className: "Wizard", classSource: "PHB", level: 2, entries: t("Pick a school.") },
  ],
  subclassFeature: [
    { name: "Seer", source: "PHB", className: "Wizard", classSource: "PHB", subclassShortName: "Seer", subclassSource: "PHB", level: 2, entries: t("You see.") },
  ],
};

const warlock = {
  class: [
    {
      name: "Warlock", source: "PHB", edition: "classic", hd: { number: 1, faces: 8 }, proficiency: ["wis", "cha"],
      spellcastingAbility: "cha", casterProgression: "pact",
      cantripProgression: [2, 2, 2, 3, 3], spellsKnownProgression: [2, 3, 4, 5, 6],
      optionalfeatureProgression: [
        { name: "Eldritch Invocations", featureType: ["EI"], progression: [0, 2, 2, 2, 3] },
        { name: "Pact Boon", featureType: ["PB"], progression: { 3: 1 } },
      ],
      startingProficiencies: { armor: ["light"], weapons: ["simple"], skills: [{ choose: { from: ["arcana", "deception"], count: 2 } }] },
      multiclassing: { requirements: { cha: 13 } },
      classTableGroups: [
        {
          colLabels: ["{@filter Cantrips Known|spells|level=0|class=Warlock}", "Spells Known", "Spell Slots", "Slot Level", "Invocations Known"],
          rows: [[2, 2, 1, "{@filter 1st|spells|level=1}", 0], [2, 3, 2, "1st", 2], [2, 4, 2, "2nd", 2], [3, 5, 2, "2nd", 2], [3, 6, 2, "3rd", 3]],
        },
      ],
      classFeatures: [{ classFeature: "Otherworldly Patron|Warlock||1", gainSubclassFeature: true }, "Pact Magic|Warlock||1", "Eldritch Invocations|Warlock||2"],
      subclassTitle: "Otherworldly Patron",
    },
  ],
  subclass: [
    {
      name: "The Fiend", shortName: "Fiend", source: "PHB", className: "Warlock", classSource: "PHB",
      additionalSpells: [{ expanded: { s1: ["magic missile"], s2: ["fire bolt"] } }],
      subclassFeatures: [],
    },
  ],
  classFeature: [
    { name: "Otherworldly Patron", source: "PHB", className: "Warlock", classSource: "PHB", level: 1, entries: t("Pick a patron.") },
    { name: "Pact Magic", source: "PHB", className: "Warlock", classSource: "PHB", level: 1, entries: t("Pact slots.") },
    { name: "Eldritch Invocations", source: "PHB", className: "Warlock", classSource: "PHB", level: 2, entries: t("Pick invocations.") },
  ],
  subclassFeature: [],
};

const rogue = {
  class: [
    {
      name: "Rogue", source: "PHB", edition: "classic", hd: { number: 1, faces: 8 }, proficiency: ["dex", "int"],
      startingProficiencies: { armor: ["light"], weapons: ["simple", "{@item rapier|phb|rapiers}"], tools: ["{@item thieves' tools|PHB}"], toolProficiencies: [{ "thieves' tools": true }], skills: [{ choose: { from: ["stealth", "acrobatics", "deception", "perception"], count: 4 } }] },
      multiclassing: { requirements: { dex: 13 }, proficienciesGained: { armor: ["light"], skills: [{ choose: { from: ["stealth", "perception"], count: 1 } }] } },
      classTableGroups: [{ colLabels: ["Sneak Attack"], rows: [[{ type: "dice", toRoll: [{ number: 1, faces: 6 }] }], [{ type: "dice", toRoll: [{ number: 1, faces: 6 }] }], [{ type: "dice", toRoll: [{ number: 2, faces: 6 }] }]] }],
      classFeatures: ["Expertise|Rogue||1", "Sneak Attack|Rogue||1"],
      subclassTitle: "Roguish Archetype",
    },
  ],
  subclass: [],
  classFeature: [
    { name: "Expertise", source: "PHB", className: "Rogue", classSource: "PHB", level: 1, entries: t("Double proficiency.") },
    { name: "Sneak Attack", source: "PHB", className: "Rogue", classSource: "PHB", level: 1, entries: t("Extra damage.") },
  ],
  subclassFeature: [],
};

const barbarian = {
  class: [
    {
      name: "Barbarian", source: "PHB", edition: "classic", hd: { number: 1, faces: 12 }, proficiency: ["str", "con"],
      startingProficiencies: { armor: ["light", "medium", "shield"], weapons: ["simple", "martial"], skills: [{ choose: { from: ["athletics", "survival"], count: 2 } }] },
      classTableGroups: [{ colLabels: ["Rages", "Rage Damage"], rows: [["2", { type: "bonus", value: 2 }]] }],
      classFeatures: ["Rage|Barbarian||1", "Unarmored Defense|Barbarian||1"],
      subclassTitle: "Primal Path",
    },
  ],
  subclass: [],
  classFeature: [
    { name: "Rage", source: "PHB", className: "Barbarian", classSource: "PHB", level: 1, entries: t("Rage.") },
    { name: "Unarmored Defense", source: "PHB", className: "Barbarian", classSource: "PHB", level: 1, entries: t("10 + Dex + Con.") },
  ],
  subclassFeature: [],
};

export const RAW_RULES: RawRules = {
  class: [fighter, wizard, warlock, rogue, barbarian],
  race: [
    {
      race: [
        {
          name: "Elf", source: "PHB", size: ["M"], speed: 30, ability: [{ dex: 2 }], darkvision: 60,
          skillProficiencies: [{ perception: true }], languageProficiencies: [{ common: true, elvish: true }],
          entries: [{ type: "entries", name: "Age", entries: t("Long-lived.") }, { type: "entries", name: "Fey Ancestry", entries: t("Charm resistance.") }],
        },
        { name: "Human", source: "PHB", size: ["M"], speed: 30, languageProficiencies: [{ common: true, anyStandard: 1 }], entries: [] },
        { name: "Half-Elf", source: "PHB", size: ["M"], speed: 30, ability: [{ cha: 2, choose: { from: ["str", "dex", "con", "int", "wis"], count: 2 } }], entries: [] },
        {
          name: "Tiefling", source: "PHB", size: ["M"], speed: 30, ability: [{ cha: 2, int: 1 }], resist: ["fire"],
          additionalSpells: [{ ability: "cha", known: { 1: ["fire bolt#c"] }, innate: { 3: { daily: { 1: ["magic missile#2"] } } } }],
          entries: [],
        },
        { name: "Elf", source: "XPHB", edition: "one", size: ["M"], speed: 30, entries: [] },
      ],
      subrace: [
        { name: "High", source: "PHB", raceName: "Elf", raceSource: "PHB", ability: [{ int: 1 }], weaponProficiencies: [{ "longsword|phb": true, "shortsword|phb": true }], languageProficiencies: [{ anyStandard: 1 }], additionalSpells: [{ ability: "int", known: { 1: { _: [{ choose: "level=0|class=Wizard" }] } } }], entries: [{ type: "entries", name: "Cantrip", entries: t("A wizard cantrip.") }] },
        { source: "PHB", raceName: "Human", raceSource: "PHB", ability: [{ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }] },
        { name: "Variant", source: "PHB", raceName: "Human", raceSource: "PHB", ability: [{ choose: { from: ["str", "dex", "con", "int", "wis", "cha"], count: 2 } }], skillProficiencies: [{ any: 1 }], feats: [{ any: 1 }] },
      ],
    },
  ],
  background: [
    {
      background: [
        { name: "Acolyte", source: "PHB", skillProficiencies: [{ insight: true, religion: true }], languageProficiencies: [{ anyStandard: 2 }], entries: [{ type: "entries", name: "Feature: Shelter of the Faithful", entries: t("Temples help you.") }] },
        { name: "Criminal", source: "PHB", skillProficiencies: [{ deception: true, stealth: true }], toolProficiencies: [{ "thieves' tools": true }], entries: [] },
      ],
    },
  ],
  optionalfeature: [
    {
      optionalfeature: [
        { name: "Defense", source: "PHB", featureType: ["FS:F", "FS:P", "FS:R"], entries: t("+1 AC in armor.") },
        { name: "Archery", source: "PHB", featureType: ["FS:F", "FS:R"], entries: t("+2 ranged attacks.") },
        { name: "Dueling", source: "PHB", featureType: ["FS:F"], entries: t("+2 damage one-handed.") },
        { name: "Agonizing Blast", source: "PHB", featureType: ["EI"], entries: t("Add Cha to eldritch blast.") },
        { name: "Devil's Sight", source: "PHB", featureType: ["EI"], entries: t("See in darkness.") },
        { name: "Improved Pact Weapon", source: "XGE", featureType: ["EI"], entries: t("+1 pact weapon.") },
        { name: "Pact of the Blade", source: "PHB", featureType: ["PB"], entries: t("Conjure a weapon.") },
      ],
    },
  ],
  spellsource: [{ PHB: { "Fire Bolt": { class: [{ name: "Wizard", source: "PHB" }] }, "Magic Missile": { class: [{ name: "Wizard", source: "PHB" }] }, Hex: { class: [{ name: "Warlock", source: "PHB" }] } }, XGE: { "Absorb Elements": { classVariant: [{ name: "Wizard", source: "PHB", definedInSource: "XGE" }] } } }],
  magicvariant: [
    {
      magicvariant: [
        { name: "+1 Weapon", requires: [{ weapon: true }], inherits: { namePrefix: "+1 ", source: "DMG", rarity: "uncommon", bonusWeapon: "+1" } },
        { name: "+2 Armor", requires: [{ armor: true }], inherits: { namePrefix: "+2 ", source: "DMG", rarity: "very rare", bonusAc: "+2" } },
      ],
    },
  ],
};

const entry = (kind: Entry["kind"], raw: any): Entry => ({ kind, name: raw.name, source: raw.source, raw });

export const DATA_ENTRIES: Entry[] = [
  entry("feat", { name: "Tough", source: "PHB", entries: t("+2 HP per level.") }),
  entry("feat", { name: "Alert", source: "PHB", entries: t("+5 initiative.") }),
  entry("feat", { name: "Resilient", source: "PHB", ability: [{ choose: { from: ["str", "dex", "con", "int", "wis", "cha"], amount: 1 } }], savingThrowProficiencies: [{ choose: { from: ["str", "dex", "con", "int", "wis", "cha"] } }], entries: t("Save proficiency.") }),
  entry("feat", { name: "Tough", source: "XPHB", edition: "one", entries: t("2024 version.") }),
  entry("item", { name: "Longsword", source: "PHB", type: "M", weaponCategory: "martial", property: ["V"], dmg1: "1d8", dmgType: "S", dmg2: "1d10", weapon: true, weight: 3 }),
  entry("item", { name: "Shortbow", source: "PHB", type: "R", weaponCategory: "simple", property: ["A", "2H"], range: "80/320", dmg1: "1d6", dmgType: "P", weapon: true }),
  entry("item", { name: "Rapier", source: "PHB", type: "M", weaponCategory: "martial", property: ["F"], dmg1: "1d8", dmgType: "P", weapon: true }),
  entry("item", { name: "Chain Mail", source: "PHB", type: "HA", ac: 16, strength: "13", armor: true, weight: 55 }),
  entry("item", { name: "Leather Armor", source: "PHB", type: "LA", ac: 11, armor: true }),
  entry("item", { name: "Breastplate", source: "PHB", type: "MA", ac: 14, armor: true, weight: 20 }),
  entry("item", { name: "+1 Leather Armor", source: "DMG", type: "LA", ac: 11, armor: true, rarity: "rare", bonusAc: "+1" }),
  entry("item", { name: "Shield", source: "PHB", type: "S", ac: 2 }),
  entry("item", { name: "Ring of Protection", source: "DMG", reqAttune: true, bonusAc: "+1", bonusSavingThrow: "+1" }),
  entry("spell", { name: "Fire Bolt", source: "PHB", level: 0, school: "V", entries: t("Fire.") }),
  entry("spell", { name: "Magic Missile", source: "PHB", level: 1, school: "V", entries: t("Darts.") }),
  entry("spell", { name: "Absorb Elements", source: "XGE", level: 1, school: "A", entries: t("Resist.") }),
  entry("spell", { name: "Hex", source: "PHB", level: 1, school: "E", entries: t("Curse.") }),
];

export function testRules(): Rules {
  return new Rules(RAW_RULES, new DataStore(DATA_ENTRIES, false));
}
