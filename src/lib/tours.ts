// The guided tours: a welcome tour on first launch, and one for each area the
// first time it's opened. Each step points at part of the screen (a CSS
// selector); a step whose target isn't on screen is shown in the middle.

export type TourId = "main" | "character" | "combat" | "dm";

export interface TourStep {
  /** What to point at; none = a card in the middle of the screen. */
  target?: string;
  title: string;
  text: string;
}

export interface Tour {
  id: TourId;
  name: string;
  /** For the Help menu. */
  blurb: string;
  steps: TourStep[];
}

export const TOURS: Tour[] = [
  {
    id: "main",
    name: "Welcome tour",
    blurb: "The basics: campaigns, notes, links, cards, dice and search.",
    steps: [
      {
        title: "Welcome to Lorewright",
        text: "Campaign notes linked to the D&D rules, character sheets that do the maths, a combat tracker and tools for the DM. This tour takes a minute. Use the arrow keys, or Esc to skip.",
      },
      {
        target: ".left > :first-child",
        title: "Campaigns",
        text: "Each campaign has its own notes, characters, fights and DM notes, kept as ordinary files in Documents\\Lorewright. Switch campaigns or start a new one here.",
      },
      {
        target: ".left .seg",
        title: "Four parts",
        text: "Notes for your sessions and world. Characters for full 5e sheets. Combat for initiative and every creature in the fight. DM for encounters, NPCs, treasure, tables, time and homebrew.",
      },
      {
        target: ".left .note-list, .left .new-note",
        title: "Your notes",
        text: "Make a note, then find it here. Search inside every note with Ctrl+Shift+F.",
      },
      {
        target: "main.centre",
        title: "Link to the rules",
        text: "Select a word in a note (a spell, monster, item, condition or feat) and press Ctrl+L. It becomes a link: hover it to see the full rules, click it to pin the card.",
      },
      {
        target: ".right-pins",
        title: "Pinned cards",
        text: "Cards you click stay here while you play, so the dragon's stats or the spell's wording are always one glance away.",
      },
      {
        target: ".right-rolls",
        title: "Dice",
        text: "Click dice anywhere (in cards, on sheets, in the tracker) to roll them, or type 2d6+3 here. Shift-click rolls with advantage, Ctrl-click with disadvantage. Every roll is listed here.",
      },
      {
        target: "[data-tour=search]",
        title: "Find anything: Ctrl+K",
        text: "Notes, characters, classes and subclasses, spells, monsters, items and your random tables, all from one box.",
      },
      {
        target: "[data-tour=help]",
        title: "Help is here",
        text: "Replay any tour and see the cheat sheet of tips and shortcuts. Settings has your 5e.tools data, sounds and backups. Each part gets its own short tour the first time you open it.",
      },
    ],
  },
  {
    id: "character",
    name: "Character sheet tour",
    blurb: "Tabs, HP, rolling, slots, rests and the buttons up top.",
    steps: [
      {
        target: ".char-tabs",
        title: "The tabs",
        text: "Sheet for play, Spells to prepare and cast, Inventory and the Item Forge for gear, Features, Companions for summons and familiars, Build to make or change the character, and Notes for their story.",
      },
      {
        target: ".healthbar",
        title: "Hit points",
        text: "Type an amount, then − for damage (temp HP goes first) or + to heal. Damage while concentrating asks for the Constitution save.",
      },
      {
        target: ".resource-strip",
        title: "Slots and uses",
        text: "Spell slots, pact slots and features like Rage or Ki. Click a dot to use one, or to get it back. It's on every tab.",
      },
      {
        target: ".sheet-cols",
        title: "Click to roll",
        text: "Click any bonus to roll it: checks, saves, skills, attacks, damage. Shift for advantage, Ctrl for disadvantage. Conditions like Poisoned or Prone add disadvantage by themselves.",
      },
      {
        target: ".rests",
        title: "Rests",
        text: "A short rest lets you spend Hit Dice one at a time. A long rest brings back HP, slots and features, and recharges wands and staffs at dawn.",
      },
      {
        target: ".char-head",
        title: "Up top",
        text: "Level up, Undo and Redo (Ctrl+Z, Ctrl+Y), Print or save as PDF, and Export to share the character as a file.",
      },
      {
        title: "More to find",
        text: "In Inventory, drink potions (they roll and heal), use wand charges and read scrolls. In Spells, cast with your slots. Features that take an action can be used from the Sheet and start their effects.",
      },
    ],
  },
  {
    id: "combat",
    name: "Combat tracker tour",
    blurb: "Adding creatures, initiative, turns and reminders.",
    steps: [
      {
        target: ".combat-add",
        title: "Who's fighting",
        text: "Add the characters, monsters from the bestiary (as many as you like), companions, or your own NPCs and summons with a blank stat block.",
      },
      {
        target: ".combat-head",
        title: "Initiative and turns",
        text: "Roll initiative for every creature at once, then Start combat and Next turn. At the start of each turn you get reminders: recharge rolls, legendary actions back, timers running out, Regeneration.",
      },
      {
        target: ".combat-list",
        title: "Each creature",
        text: "Initiative (the die rolls it), conditions, AC, and HP: type an amount, then − damage, + heal, T temp HP. Stats shows the stat block to roll from and edit. ⏱ adds a timer that counts down rounds.",
      },
      {
        title: "Plan ahead",
        text: "In DM → Encounters, build a fight, see how hard it is, and send it here with one click.",
      },
    ],
  },
  {
    id: "dm",
    name: "DM tools tour",
    blurb: "Encounters, NPCs, treasure, sessions, tables, time and homebrew.",
    steps: [
      { target: ".dm-nav", title: "The DM's desk", text: "Everything here is for the DM, saved with the campaign. Players never need to open it." },
      { target: ".dm-nav .note-item:nth-child(1)", title: "Encounters", text: "Pick monsters and the party, see if the fight is easy or deadly (with the XP maths), then send it to the combat tracker." },
      { target: ".dm-nav .note-item:nth-child(2)", title: "NPCs", text: "The people your party meets: description, where they are, how they feel about the party, a stat block and their note. Need a name? Roll some." },
      { target: ".dm-nav .note-item:nth-child(3)", title: "Treasure", text: "Roll a creature's pockets or a hoard by challenge rating, then hand coins and items straight to the characters." },
      { target: ".dm-nav .note-item:nth-child(4)", title: "Sessions", text: "A note for each session that starts from a template and carries over last time's \"Next time\". The list shows which NPCs and places each session mentions." },
      { target: ".dm-nav .note-item:nth-child(5)", title: "Random tables", text: "Your own tables for rumours, weather, names, anything. Roll them here or from Ctrl+K." },
      { target: ".dm-nav .note-item:nth-child(6)", title: "Time & travel", text: "The date and time in your world, journeys at a pace, rests, and timers that tell you when a potion or spell runs out." },
      { target: ".dm-nav .note-item:nth-child(7)", title: "Homebrew", text: "Make your own spells, creatures and items. They show up everywhere the real ones do, in every campaign." },
    ],
  },
];

export const tourById = (id: TourId) => TOURS.find((t) => t.id === id)!;

/** Where to put the tour card next to a highlighted box, kept on screen. */
export function cardPosition(
  target: { top: number; left: number; width: number; height: number } | null,
  card: { width: number; height: number },
  view: { width: number; height: number },
  gap = 12,
): { top: number; left: number } {
  const clampX = (x: number) => Math.max(8, Math.min(view.width - card.width - 8, x));
  const clampY = (y: number) => Math.max(8, Math.min(view.height - card.height - 8, y));
  if (!target) return { top: clampY((view.height - card.height) / 2), left: clampX((view.width - card.width) / 2) };
  const below = target.top + target.height + gap;
  const above = target.top - card.height - gap;
  const right = target.left + target.width + gap;
  const left = target.left - card.width - gap;
  if (below + card.height <= view.height) return { top: below, left: clampX(target.left) };
  if (right + card.width <= view.width) return { top: clampY(target.top), left: right };
  if (left >= 0) return { top: clampY(target.top), left };
  if (above >= 0) return { top: above, left: clampX(target.left) };
  // Big targets (a whole pane): inside it, near the top.
  return { top: clampY(target.top + gap), left: clampX(target.left + gap) };
}
