// Character sheet types. A Character holds the player's choices and play
// state; a Sheet is everything computed from it plus the rules data.

import type { Companion } from "../combat.ts";

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
export const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];
export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};

export const SKILLS: Record<string, Ability> = {
  acrobatics: "dex", "animal handling": "wis", arcana: "int", athletics: "str", deception: "cha",
  history: "int", insight: "wis", intimidation: "cha", investigation: "int", medicine: "wis",
  nature: "int", perception: "wis", performance: "cha", persuasion: "cha", religion: "int",
  "sleight of hand": "dex", stealth: "dex", survival: "wis",
};

/** "Name|SOURCE", the same reference style 5e.tools uses. */
export type Ref = string;

export interface ClassLevel {
  name: string;
  source: string;
  level: number;
}

/** DiceCloud-style manual adjustment for anything the rules data doesn't cover. */
export interface Effect {
  id: string;
  label: string;
  /** e.g. "ac", "hp.max", "speed.walk", "initiative", "ability.str", "save.dex", "skill.stealth",
   *  "save.all", "skill.all", "attack.all", "damage.all", "spell.dc", "spell.attack", "passive.perception" */
  target: string;
  op: "add" | "set" | "proficiency" | "expertise";
  value: number;
  active: boolean;
}

export interface InventoryItem {
  id: string;
  /** Item reference ("Longsword|PHB"); absent for custom items. */
  ref?: Ref;
  /** Magic variant applied to a base item, e.g. "+1 Weapon". */
  variant?: string;
  name: string;
  qty: number;
  equipped: boolean;
  attuned: boolean;
  weight?: number;
  notes?: string;
  /** A homemade magic item: +N to attack/damage (weapons) or AC (armor, shields). */
  magicBonus?: number;
  /** Homemade item that needs attunement. */
  requiresAttunement?: boolean;
  /** Pact of the Blade: a weapon conjured with the feature, or a magic weapon bonded by the ritual. */
  pact?: "created" | "bonded";
  /** Item Forge: homebrew changes on top of the base item. */
  forge?: ForgeData;
  /** Charges spent (wands, staffs…); they come back when the item recharges. */
  chargesUsed?: number;
  /** Times each of the item's once-a-day spells was cast today, by spell name. */
  spellUses?: Record<string, number>;
  /** Spell scrolls: the spell written on it ("Fireball|PHB"). */
  scrollSpell?: Ref;
}

/** What an Item Forge item made from scratch is (it has no 5e.tools base item). */
export interface ScratchBase {
  kind: "melee" | "ranged" | "light" | "medium" | "heavy" | "shield" | "potion" | "ring" | "wand" | "staff" | "rod" | "other";
  /** Weapons: simple or martial (for proficiency). */
  category?: "simple" | "martial";
}

/** Homebrew changes made in the Item Forge. Unset fields keep the base item's value. */
export interface ForgeData {
  /** Made from scratch: the kind of item to start from. */
  scratch?: ScratchBase;
  dmg1?: string;
  dmg2?: string;
  dmgType?: string;
  /** Extra damage on a hit, e.g. { dice: "1d6", type: "fire" }. */
  extraDamage?: { dice: string; type: string }[];
  /** Property codes: F finesse, L light, H heavy, R reach, T thrown, V versatile, 2H two-handed, A ammunition, LD loading. */
  properties?: string[];
  range?: string;
  attackBonus?: number;
  damageBonus?: number;
  /** Armor: base AC (replaces the item's), and a bonus on top. */
  ac?: number;
  acBonus?: number;
  saveBonus?: number;
  /** Sets an ability score to at least this (like a Belt of Giant Strength). */
  abilitySet?: Partial<Record<Ability, number>>;
  resist?: string[];
  weight?: number;
  rarity?: string;
  attunement?: boolean;
  /** Spells the item lets you cast, with how often ("1/day", "3 charges"…). */
  spells?: { ref: Ref; note: string }[];
  /** Extra features with their own rules text. */
  features?: { name: string; text: string }[];
  /** Charges, when it gets them back, and how many ("1d6+1", or blank for all). */
  charges?: number;
  recharge?: "dawn" | "dusk" | "midnight" | "long" | "short";
  regain?: string;
  description?: string;
}

/** An effect switched on by a feature or a potion, shown until it's ended (or a rest). */
export interface ActiveEffect {
  name: string;
  note?: string;
  until?: string;
  /** A condition it gave (Invisible…); ending the effect removes it. */
  condition?: string;
  /** Damage resistances while it lasts ("fire", or "all" for every type). */
  resist?: string[];
  /** Ability scores set while it lasts (Potion of Giant Strength). */
  abilitySet?: Partial<Record<Ability, number>>;
}

export interface ClassSpells {
  cantrips: Ref[];
  /** Spells known (known casters), or the spellbook (wizard). */
  known: Ref[];
  /** Prepared spells (prepared casters). */
  prepared: Ref[];
}

export type AbilityMethod = "pointbuy" | "array" | "roll" | "manual";

export interface Character {
  version: 1;
  id: string;
  name: string;
  player?: string;
  alignment?: string;
  /** Species option key from the rules ("Elf|PHB|High|PHB") and its display name. */
  race?: { key: string; name: string };
  background?: { name: string; source: string };
  abilityMethod: AbilityMethod;
  baseAbilities: Record<Ability, number>;
  /** Levels per class, in the order they were first taken (the first is the starting class). */
  classes: ClassLevel[];
  /** Which class ("Name|SOURCE") was taken at each character level, in order. Missing = guessed. */
  levelOrder?: Ref[];
  /** Answers to the choices the rules ask for, keyed by choice id. */
  choices: Record<string, string[]>;
  /** HP rolled for each level after 1st, per class, in order; null = take the average. */
  hpRolls: Record<string, (number | null)[]>;
  inventory: InventoryItem[];
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  /** Spells per class, keyed "Name|SOURCE" of the class. */
  spells: Record<string, ClassSpells>;
  effects: Effect[];
  /** Summons, familiars, steeds and NPCs this character controls, with their stat blocks. */
  companions?: Companion[];
  state: {
    hp: number;
    tempHp: number;
    /** Expended spell slots per level (index 0 = 1st level). */
    slotsUsed: number[];
    pactUsed: number;
    /** Expended uses per resource id. */
    resourcesUsed: Record<string, number>;
    /** Hit dice spent per class ref. */
    hitDiceUsed: Record<string, number>;
    deathSaves: { successes: number; failures: number };
    conditions: string[];
    inspiration: boolean;
    exhaustion: number;
    /** The concentration spell being kept up, if any. */
    concentration?: { ref: Ref; name: string; level: number } | null;
    /** Effects a feature switched on (Raging, Dodging, Hexblade's Curse…), until you end them or rest. */
    active?: ActiveEffect[];
  };
  /** Experience points (missing = the least for their level). */
  xp?: number;
  /** "milestone": level up when the DM says, without XP. */
  levelling?: "xp" | "milestone";
  /** A picture of the character (a small JPEG, as a data URL). */
  portrait?: string;
  notes: {
    personality?: string;
    ideals?: string;
    bonds?: string;
    flaws?: string;
    appearance?: string;
    backstory?: string;
    other?: string;
  };
}

// ---------- computed sheet ----------

export interface Choice {
  /** Stable id: answers are stored under character.choices[id]. */
  id: string;
  /** What's being picked, for the UI. */
  type:
    | "skill"
    | "ability"
    | "language"
    | "tool"
    | "subclass"
    | "asi"
    | "feat"
    | "optionalfeature"
    | "expertise"
    | "save"
    | "weapon"
    | "racealternative"
    | "cantrip"
    | "spell";
  // (cantrip/spell choices come from species, feats and subclasses; class spells live in the Spells tab)
  label: string;
  /** Where it comes from, e.g. "Fighter 1", "High Elf". */
  from: string;
  count: number;
  /** Allowed answers ("Name|SOURCE" refs, ability codes, skill names…). Empty = free text/any. */
  options: string[];
  /** For "ability" choices: how much each pick adds. */
  amount?: number;
  /** Display names for options that aren't self-describing (e.g. "0" → "Circle of the Land: Arctic"). */
  labels?: Record<string, string>;
  answer: string[];
}

export interface Bonus {
  value: number;
  from: string;
}

export interface Feature {
  name: string;
  /** "Fighter 1", "Champion 3", "Species", "Background", "Feat", "Fighting Style"… */
  from: string;
  level?: number;
  /** 5e.tools entries for the card. */
  entries: any[];
  source?: string;
}

export interface Attack {
  name: string;
  /** Attack bonus, or null for save-based. */
  toHit: number | null;
  /** Dice expression including the modifier, e.g. "1d8+3". */
  damage: string;
  damageType: string;
  /** Two-handed damage for versatile weapons. */
  versatile?: string;
  /** Extra damage dice from the item (Item Forge), rolled separately: "1d6 fire". */
  extraDamage?: { dice: string; type: string }[];
  range?: string;
  notes: string[];
  /** Weapons with the ammunition property: what's left to shoot, and the inventory items it comes from. */
  ammo?: { name: string; left: number; ids: string[] };
}

export interface Resource {
  id: string;
  name: string;
  max: number;
  used: number;
  recharge: "short" | "long";
  from: string;
}

export interface SpellcastingInfo {
  classRef: Ref;
  className: string;
  ability: Ability;
  dc: number;
  attack: number;
  /** "known" casters pick spells known; "prepared" casters prepare from a list; wizards do both. */
  mode: "known" | "prepared" | "spellbook";
  cantripsMax: number;
  knownMax: number;
  preparedMax: number;
  /** Highest spell level this class can learn. */
  maxSpellLevel: number;
  /** Spells always prepared from the subclass (don't count against prepared spells). */
  alwaysPrepared: Ref[];
  /** Spells the subclass teaches for free (don't count against spells known). */
  bonusKnown: Ref[];
  /** Extra spells the subclass adds to the class's list to choose from (patron lists, EK wizard spells…). */
  expanded: Ref[];
}

/** A rules link on the sheet, using the same data-5e attributes as note links. */
export interface RulesLink {
  /** "classFeature" | "subclassFeature" | "subclass" | "optfeature" | "race" | "background" | "feat" … */
  kind: string;
  /** For class/subclass features: the 5e.tools uid ("Second Wind|Fighter|PHB|1|PHB"). */
  name: string;
  source: string;
}

export interface TimelineItem {
  type: "feature" | "subclass" | "subclassFeature" | "asi" | "feat" | "option" | "species" | "background" | "choice";
  /** Display text. */
  name: string;
  link?: RulesLink;
  /** Extra detail: "Strength +1, Dexterity +1", "skills: athletics, survival"… */
  detail?: string;
  /** The choice this item belongs to, so it can be made right here. */
  choiceId?: string;
  /** The choice isn't made (or is only partly made). */
  pending?: boolean;
}

export interface TimelineLevel {
  /** Character level (1–20). */
  level: number;
  classRef: Ref;
  className: string;
  /** Level in that class. */
  classLevel: number;
  items: TimelineItem[];
}

export interface Sheet {
  totalLevel: number;
  /** What was gained at each character level, from 1 to now. */
  timeline: TimelineLevel[];
  proficiencyBonus: number;
  abilities: Record<Ability, { score: number; mod: number; parts: Bonus[] }>;
  saves: Record<Ability, { mod: number; proficient: boolean }>;
  skills: Record<string, { mod: number; ability: Ability; proficient: boolean; expertise: boolean; half: boolean }>;
  passive: { perception: number; investigation: number; insight: number };
  initiative: number;
  ac: { value: number; formula: string };
  hp: { max: number };
  hitDice: { classRef: Ref; faces: number; total: number }[];
  speed: Record<string, number>;
  size: string;
  senses: string[];
  resistances: string[];
  immunities: string[];
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[] };
  attacks: Attack[];
  attacksPerAction: number;
  spellcasting: SpellcastingInfo[];
  /** Spells from species, feats and subclasses, outside a class list ("1/long rest", "at will"…). */
  extraSpells: { ref: Ref; from: string; note: string; ability?: string }[];
  /** Spell slots per level (index 0 = 1st). */
  slots: number[];
  pact: { slots: number; level: number } | null;
  resources: Resource[];
  features: Feature[];
  /** Every feature name the character has, including ones nested inside others (Hexblade → Hex Warrior). */
  featureNames: string[];
  /** Class table columns that aren't spell slots: Sneak Attack, Rage Damage, Martial Arts… */
  classTable: { classRef: Ref; label: string; value: string }[];
  choices: Choice[];
  /** Things that don't add up (e.g. a multiclass prerequisite not met). */
  warnings: string[];
}
