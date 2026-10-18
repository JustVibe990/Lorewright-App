// Short and long rests: what comes back and what ends.

import type { Character, Sheet } from "./types.ts";

/** Effects a feature or potion switched on end with a rest, with the conditions they gave. */
function endEffects(c: Character): Character["state"] {
  return {
    ...c.state,
    active: [],
    conditions: c.state.conditions.filter((k) => !(c.state.active ?? []).some((x) => x.condition === k)),
  };
}

/** After a short rest: pact slots, short-rest features, and `healed` HP from Hit Dice spent (`spent` per class). */
export function shortRest(c: Character, sheet: Sheet, healed = 0, spent: Record<string, number> = {}): Character {
  const hitDiceUsed = { ...c.state.hitDiceUsed };
  for (const [ref, n] of Object.entries(spent)) hitDiceUsed[ref] = (hitDiceUsed[ref] ?? 0) + n;
  const st = endEffects(c);
  const hp = Math.min(sheet.hp.max, c.state.hp + Math.max(0, healed));
  return {
    ...c,
    state: {
      ...st,
      hp,
      hitDiceUsed,
      pactUsed: 0,
      resourcesUsed: Object.fromEntries(Object.entries(c.state.resourcesUsed).filter(([id]) => sheet.resources.find((r) => r.id === id)?.recharge !== "short")),
      // Back above 0 HP: no more death saves.
      deathSaves: hp > 0 ? { successes: 0, failures: 0 } : c.state.deathSaves,
    },
  };
}

/** After a long rest: full HP, slots, features; half your Hit Dice; one less exhaustion. */
export function longRest(c: Character, sheet: Sheet): Character {
  const hitDiceUsed: Record<string, number> = {};
  for (const h of sheet.hitDice) {
    const regain = Math.max(1, Math.floor(h.total / 2));
    hitDiceUsed[h.classRef] = Math.max(0, (c.state.hitDiceUsed[h.classRef] ?? 0) - regain);
  }
  return {
    ...c,
    state: {
      ...endEffects(c),
      hp: sheet.hp.max,
      tempHp: 0,
      slotsUsed: [],
      pactUsed: 0,
      resourcesUsed: {},
      hitDiceUsed,
      deathSaves: { successes: 0, failures: 0 },
      exhaustion: Math.max(0, c.state.exhaustion - 1),
      concentration: null,
    },
  };
}

/** Hit Die healing: the roll plus Constitution, never below 0 (Durable: at least twice your Constitution modifier, min 2). */
export function hitDieHeal(rolled: number, conMod: number, durable = false): number {
  const total = Math.max(0, rolled + conMod);
  return durable ? Math.max(total, Math.max(2, conMod * 2)) : total;
}

/** Song of Rest die for a bard of this level, or null. */
export function songOfRestDie(bardLevel: number): string | null {
  if (bardLevel < 2) return null;
  return bardLevel >= 17 ? "1d12" : bardLevel >= 13 ? "1d10" : bardLevel >= 9 ? "1d8" : "1d6";
}
