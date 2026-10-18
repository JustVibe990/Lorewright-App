// The order a character took their levels in (which class at each character
// level). Saved on level up; for older characters it's guessed as "all levels
// of the first class, then the next", and can be fixed on the Features tab.

import type { Character } from "./types.ts";

const refOf = (c: { name: string; source: string }) => `${c.name}|${c.source}`;

/** Class ref for each character level, 1 → now. */
export function levelOrder(ch: Character): string[] {
  const total = ch.classes.reduce((n, c) => n + c.level, 0);
  const saved = ch.levelOrder ?? [];
  if (saved.length === total) {
    const counts = new Map<string, number>();
    for (const r of saved) counts.set(r, (counts.get(r) ?? 0) + 1);
    if (ch.classes.every((c) => counts.get(refOf(c)) === c.level) && saved[0] === refOf(ch.classes[0] ?? { name: "", source: "" })) return saved;
  }
  return ch.classes.flatMap((c) => Array(c.level).fill(refOf(c)));
}

/** Add a level in a class (new or existing), recording the order. */
export function addLevel(ch: Character, cls: { name: string; source: string }, hpRoll: number | null): Character {
  const ref = refOf(cls);
  const order = [...levelOrder(ch), ref];
  const existing = ch.classes.some((c) => refOf(c) === ref);
  const classes = existing ? ch.classes.map((c) => (refOf(c) === ref ? { ...c, level: c.level + 1 } : c)) : [...ch.classes, { name: cls.name, source: cls.source, level: 1 }];
  // The very first character level is always max HP: no roll stored for it.
  const rolls = order.length === 1 ? ch.hpRolls[ref] ?? [] : [...(ch.hpRolls[ref] ?? []), hpRoll];
  return { ...ch, classes, levelOrder: order, hpRolls: { ...ch.hpRolls, [ref]: rolls } };
}

/** Remove the most recently taken level. */
export function removeLastLevel(ch: Character): Character {
  const order = levelOrder(ch);
  const ref = order.pop();
  if (!ref) return ch;
  const classes = ch.classes.map((c) => (refOf(c) === ref ? { ...c, level: c.level - 1 } : c)).filter((c) => c.level > 0);
  const rolls = (ch.hpRolls[ref] ?? []).slice(0, -1);
  return { ...ch, classes, levelOrder: order, hpRolls: { ...ch.hpRolls, [ref]: rolls } };
}

/**
 * Swap character level `index` (0-based) with the next one. Only levels of
 * different classes can swap. If the starting class changes, the class list
 * and HP rolls follow (the starting class's 1st level is always max HP).
 */
export function swapLevels(ch: Character, index: number): Character {
  const order = levelOrder(ch);
  if (index < 0 || index + 1 >= order.length || order[index] === order[index + 1]) return ch;
  [order[index], order[index + 1]] = [order[index + 1], order[index]];
  const firstSeen = [...new Set(order)];
  const classes = firstSeen.map((r) => ch.classes.find((c) => refOf(c) === r)!).filter(Boolean);
  const hpRolls = { ...ch.hpRolls };
  const oldStart = refOf(ch.classes[0]);
  const newStart = firstSeen[0];
  if (oldStart !== newStart) {
    // The old starting class now rolls for its 1st level too; the new one doesn't.
    hpRolls[oldStart] = [null, ...(hpRolls[oldStart] ?? [])];
    hpRolls[newStart] = (hpRolls[newStart] ?? []).slice(1);
  }
  return { ...ch, classes, levelOrder: order, hpRolls };
}
