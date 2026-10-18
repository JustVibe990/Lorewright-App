// Hit point maths (2014 rules). Temporary HP soak damage first and don't
// stack: gaining temp HP keeps whichever is higher.

export interface HpState {
  hp: number;
  tempHp: number;
}

const whole = (n: number) => Math.max(0, Math.floor(Number(n) || 0));

/** Damage comes off temp HP first, then real HP (never below 0). */
export function takeDamage(s: HpState, max: number, amount: number): HpState {
  const dmg = whole(amount);
  const fromTemp = Math.min(s.tempHp, dmg);
  const hp = Math.max(0, Math.min(s.hp, max) - (dmg - fromTemp));
  return { hp, tempHp: s.tempHp - fromTemp };
}

/** Healing restores real HP up to the maximum; it never adds temp HP. */
export function heal(s: HpState, max: number, amount: number): HpState {
  return { hp: Math.min(max, Math.min(s.hp, max) + whole(amount)), tempHp: s.tempHp };
}

/** New temp HP replace the old only if higher (they don't add up). */
export function gainTemp(s: HpState, amount: number): HpState {
  return { hp: s.hp, tempHp: Math.max(s.tempHp, whole(amount)) };
}
