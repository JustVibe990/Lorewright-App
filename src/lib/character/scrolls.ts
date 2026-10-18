// Spell scrolls (2014 DMG): pick the spell written on it, then read it. A spell
// on your class's list that you can cast is cast from the scroll; a higher-level
// one needs an ability check (DC 10 + the spell's level) first. The scroll uses
// its own save DC and attack bonus, by spell level, and crumbles once cast.

import type { Character, InventoryItem, Sheet } from "./types.ts";

/** A spell scroll (not a Scroll of Protection and the like). */
export const isScroll = (raw: any, name = "") => /^spell scroll\b/i.test(raw?.name || name || "");

/** "Spell Scroll (3rd Level)" → 3, "(Cantrip)" → 0; null when the name doesn't say. */
export function scrollLevel(name: string): number | null {
  if (/\(cantrip\)/i.test(name)) return 0;
  const m = name.match(/\((\d)(?:st|nd|rd|th)[- ]level\)/i);
  return m ? Number(m[1]) : null;
}

/** Save DC and attack bonus by spell level (DMG, Spell Scroll table). */
export const SCROLL_STATS: { dc: number; attack: number }[] = [
  { dc: 13, attack: 5 }, // cantrip
  { dc: 13, attack: 5 },
  { dc: 13, attack: 5 },
  { dc: 15, attack: 7 },
  { dc: 15, attack: 7 },
  { dc: 17, attack: 9 },
  { dc: 17, attack: 9 },
  { dc: 18, attack: 10 },
  { dc: 18, attack: 10 },
  { dc: 19, attack: 11 },
];

export interface ScrollCheck {
  /** On one of your class lists (or a subclass's expanded list). */
  onList: boolean;
  /** Higher than you can cast: an ability check is needed. */
  needsCheck: boolean;
  checkDc: number;
  /** The spellcasting class it's read with (its ability for the check). */
  className?: string;
  ability?: string;
  abilityMod: number;
}

/**
 * Can this character read the scroll? `classesOf` gives the classes whose list
 * has the spell ("Wizard|PHB"-style names and sources).
 */
export function scrollCheck(sheet: Sheet, spellRef: string, spellLevel: number, classesOf: { name: string; source: string }[]): ScrollCheck {
  const low = (s: string) => s.toLowerCase();
  const on = sheet.spellcasting.filter(
    (sc) =>
      classesOf.some((c) => `${low(c.name)}|${low(c.source)}` === low(sc.classRef)) ||
      [...sc.expanded, ...sc.alwaysPrepared, ...sc.bonusKnown].some((r) => low(r) === low(spellRef)),
  );
  // Read with the class that can cast the highest level.
  const best = on.sort((a, b) => b.maxSpellLevel - a.maxSpellLevel)[0];
  const maxLevel = Math.max(sheet.pact?.level ?? 0, ...sheet.slots.map((n, i) => (n > 0 ? i + 1 : 0)));
  return {
    onList: !!best,
    needsCheck: !!best && spellLevel > 0 && spellLevel > maxLevel,
    checkDc: 10 + spellLevel,
    className: best?.className,
    ability: best?.ability,
    abilityMod: best ? sheet.abilities[best.ability].mod : 0,
  };
}

/** The scroll is used up: one less, or gone. */
export function useScroll(ch: Character, itemId: string): Character {
  return {
    ...ch,
    inventory: ch.inventory.flatMap((i: InventoryItem) => (i.id !== itemId ? [i] : i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : [])),
  };
}
