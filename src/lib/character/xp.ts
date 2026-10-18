// Experience points and levelling (2014 rules): how much XP each level needs,
// what level an XP total reaches, and splitting an encounter's XP. A character
// can use milestone levelling instead, where the DM says when to level.

import type { Character } from "./types.ts";

/** XP needed to reach each level (index 0 = level 1). */
export const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

export const xpForLevel = (level: number) => XP_TABLE[Math.max(1, Math.min(20, level)) - 1];

/** The level an XP total reaches. */
export function levelForXp(xp: number): number {
  let l = 1;
  for (let i = 0; i < XP_TABLE.length; i++) if (xp >= XP_TABLE[i]) l = i + 1;
  return l;
}

export const usesMilestones = (c: Pick<Character, "levelling">) => c.levelling === "milestone";

export interface XpProgress {
  xp: number;
  level: number;
  /** XP for the next level (null at 20). */
  next: number | null;
  /** 0–1 through the current level. */
  fraction: number;
  /** Levels the XP has earned that haven't been taken yet. */
  pending: number;
}

export function xpProgress(c: Pick<Character, "xp" | "levelling">, level: number): XpProgress {
  const lvl = Math.max(1, level);
  // No XP written down yet: the least a character of this level has.
  const xp = Math.max(0, c.xp ?? xpForLevel(lvl));
  const next = lvl >= 20 ? null : xpForLevel(lvl + 1);
  const from = xpForLevel(lvl);
  const fraction = next == null ? 1 : Math.max(0, Math.min(1, (xp - from) / (next - from)));
  return { xp, level: lvl, next, fraction, pending: usesMilestones(c) ? 0 : Math.max(0, levelForXp(xp) - lvl) };
}

/** Give XP (milestone characters keep theirs as it is). `level` is their level now. */
export const addXp = (c: Character, n: number, level: number): Character =>
  usesMilestones(c) ? c : { ...c, xp: Math.max(0, (c.xp ?? xpForLevel(Math.max(1, level))) + Math.round(n)) };

/** An encounter's XP split between the characters who were there. */
export const xpEach = (total: number, people: number) => (people > 0 ? Math.floor(total / people) : 0);
