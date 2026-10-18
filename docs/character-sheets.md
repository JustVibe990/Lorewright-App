# Character sheets: design

A DiceCloud-style character builder and sheet for players, using **2014 (classic) rules** and the
5e.tools data the user imports. Everything is computed from the character's choices plus the rules data;
the saved file only holds choices and play state.

## Rules data (from the user's 5e.tools URL, cached like the rest)

| What | File(s) | Used for |
|---|---|---|
| Classes, subclasses, class & subclass features | `data/class/index.json` → `class-*.json` | Hit dice, saves, proficiencies, multiclassing, features per level, spell progression, class table columns (Rages, Ki, Sneak Attack…) |
| Species (races) and subraces | `data/races.json` | Ability bonuses, size, speed, darkvision, proficiencies, resistances, spells, traits |
| Backgrounds | `data/backgrounds.json` | Skills, tools, languages, equipment, feature |
| Optional features | `data/optionalfeatures.json` | Fighting styles, invocations, maneuvers, metamagic, pact boons… (`featureType` codes) |
| Spell class lists | `data/spells/sources.json` | Which classes get which spells |
| Magic variants | `data/magicvariants.json` | "+1 Longsword" style items generated from base items |
| Feats, items, spells | already imported | Feats' ability/proficiency fields, item AC/damage/bonuses, spell cards |

**2014 only:** entries with `edition: "one"` (the 2024 books) are hidden from the builder.

## Character file

`Documents\Lorewright\<Campaign>\Characters\<Name>.json`. It holds choices, not derived numbers:

- identity: name, player, alignment, appearance/personality text
- species (+ subrace), background
- base ability scores and how they were generated (point buy / standard array / rolled / manual)
- class levels in the order taken: `{ class, source, level, subclass? }`
- **choices**, keyed by where they came from, e.g. `class:Fighter:1:skills`, `race:ability`,
  `class:Fighter:4:asi`, `class:Warlock:2:optfeature:EI`. Changing an early choice re-derives everything.
- hit point rolls per level (or "average")
- inventory (item refs, quantity, equipped, attuned), currency
- spells known/prepared per class
- play state: current/temp HP, used slots and resources, hit dice spent, death saves, conditions,
  inspiration, exhaustion
- **custom effects**: DiceCloud-style `{ target, operation, value, active }` for anything the data
  doesn't cover (e.g. `ac +1`, `skill.stealth expertise`, `speed.walk +10`)

## Engine (`src/lib/character/`)

Pure TypeScript, no UI, heavily unit-tested. Given a character + rules data it produces a sheet:

- **Choices still open** (so the UI can ask): skill picks, species ability picks, languages/tools,
  subclass, ASI-or-feat, optional features (fighting style, invocations…), cantrips and spells,
  expertise, starting equipment.
- **Derived numbers:** ability scores and modifiers, proficiency bonus, saves, skills (with expertise,
  Jack of All Trades), passives, initiative, AC (armor/shield/Dex caps/Unarmored Defense/bonuses), HP
  max, speed, senses, resistances, proficiencies and languages.
- **Attacks** from equipped weapons (finesse/ranged/versatile, proficiency, magic bonuses, fighting
  styles) plus spell attacks.
- **Spellcasting:** per-class DC/attack, cantrips/known/prepared counts (including formulas like
  `<$level$> + <$int_mod$>`), spell slots (single-class tables; multiclass caster-level table) and pact
  slots.
- **Resources:** class table columns and built-in features with their recharge (short/long rest).
- **Features:** every class/subclass/species/background/feat/optional feature the character has, as
  rules cards.

Structured data covers most of the numbers. Features that are only described in prose get small
built-in handlers for the common ones (Unarmored Defense, Expertise, Jack of All Trades, Fighting
Styles, Extra Attack, Tough, Alert, Draconic Resilience, Dwarven Toughness, Remarkable Athlete…);
anything else can be covered with custom effects.

## UI

- **Characters** section in the left sidebar, next to notes.
- **Creation wizard:** species → class → background → ability scores → level-1 choices → equipment.
- **Level up:** pick class (multiclass checks prerequisites), HP (roll or average), then the new
  choices for that level.
- **Sheet tabs:** Stats · Actions · Spells · Inventory · Features · Notes. Everything rollable is a
  click; HP, slots and resources are tracked; short and long rests restore the right things.
- **In notes:** `{@pc Name}` links show the character's summary card on hover.
