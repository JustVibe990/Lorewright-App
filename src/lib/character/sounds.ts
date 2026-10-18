// Which sound a change to a character makes: compare before and after, so
// every way of taking damage, healing, casting or resting sounds the same
// wherever it was clicked.

import type { Sound } from "../sfx.ts";
import type { Character } from "./types.ts";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const levels = (c: Character) => sum(c.classes.map((x) => x.level));
const used = (c: Character) => sum(Object.values(c.state.resourcesUsed ?? {}));

/** The sounds for going from `a` to `b`, most important first (at most two). */
export function characterSounds(a: Character, b: Character): Sound[] {
  if (a.id !== b.id) return [];
  const out: Sound[] = [];
  const s = a.state;
  const t = b.state;

  // A long rest puts everything back at once: one calm sound, nothing else.
  const restored = sum(t.slotsUsed) < sum(s.slotsUsed) || t.pactUsed < s.pactUsed || used(b) < used(a);
  if (restored) return ["rest"];

  if (levels(b) > levels(a)) out.push("levelup");

  const lost = s.hp + s.tempHp - (t.hp + t.tempHp);
  if (t.hp === 0 && s.hp > 0) out.push("down");
  else if (lost > 0) out.push(lost >= 10 ? "hurtBig" : "hurt");
  else if (t.hp > s.hp) out.push("heal");
  else if (t.tempHp > s.tempHp) out.push("temp");

  if (t.deathSaves.successes > s.deathSaves.successes) out.push("saveGood");
  if (t.deathSaves.failures > s.deathSaves.failures) out.push("saveBad");

  const cast = sum(t.slotsUsed) > sum(s.slotsUsed) || t.pactUsed > s.pactUsed || (!!t.concentration && t.concentration.ref !== s.concentration?.ref && !t.concentration.ref.startsWith("feature:"));
  if (cast) out.push("spell");
  else if (used(b) > used(a) || (t.active?.length ?? 0) > (s.active?.length ?? 0)) out.push("feature");

  if (t.conditions.length > s.conditions.length || t.exhaustion > s.exhaustion) out.push("condition");
  return out.slice(0, 2);
}
