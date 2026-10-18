// Tiny dice roller for expressions like "8d6", "1d20+5", "2d8 + 1d6 - 1",
// and keep-highest/lowest like "2d20kh1+5" (advantage) or "2d20kl1+5".

export interface RollResult {
  expr: string;
  total: number;
  detail: string;
}

export function roll(expr: string, rng: () => number = Math.random): RollResult {
  const clean = expr.replace(/\s+/g, "").replace(/×/g, "*");
  const terms = clean.match(/[+-]?[^+-]+/g) ?? [];
  let total = 0;
  const parts: string[] = [];
  for (const term of terms) {
    const sign = term.startsWith("-") ? -1 : 1;
    const t = term.replace(/^[+-]/, "");
    const m = t.match(/^(\d*)d(\d+)(?:k([hl])(\d+))?$/i);
    if (m) {
      const count = Math.min(Number(m[1] || 1), 100);
      const sides = Number(m[2]);
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(rng() * sides));
      // Which dice count: all of them, or the highest/lowest N.
      let kept = rolls.map((_, i) => i);
      if (m[3]) {
        const n = Math.max(1, Math.min(count, Number(m[4])));
        const order = rolls.map((v, i) => ({ v, i })).sort((a, b) => (m[3].toLowerCase() === "h" ? b.v - a.v : a.v - b.v));
        kept = order.slice(0, n).map((x) => x.i);
      }
      const sum = kept.reduce((a, i) => a + rolls[i], 0);
      total += sign * sum;
      const shown = m[3] ? rolls.map((v, i) => (kept.includes(i) ? String(v) : `(${v})`)) : rolls.map(String);
      parts.push(`${sign < 0 ? "−" : ""}[${shown.join(", ")}]`);
    } else if (/^\d+$/.test(t)) {
      total += sign * Number(t);
      parts.push(`${sign < 0 ? "−" : "+"}${t}`);
    }
  }
  return { expr, total, detail: parts.join(" ") };
}

/** True for something `roll` can do: "d20", "2d6+3", "4d6kh3", "1d8 + 2d6 - 1". */
export function isDiceExpr(expr: string): boolean {
  const clean = expr.replace(/\s+/g, "");
  return /^[+-]?(\d*d\d+(k[hl]\d+)?|\d+)([+-](\d*d\d+(k[hl]\d+)?|\d+))*$/i.test(clean) && /d\d/i.test(clean);
}

export type RollMode ="advantage" | "disadvantage" | null;

/** Shift = advantage, Ctrl (or ⌘) = disadvantage. */
export function rollModeOf(e: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): RollMode {
  if (e.shiftKey) return "advantage";
  if (e.ctrlKey || e.metaKey) return "disadvantage";
  return null;
}

/**
 * Turn the d20 in "1d20+5" into "2d20kh1+5" (advantage) or "2d20kl1+5"
 * (disadvantage). Expressions without a single d20 are left alone.
 */
export function withRollMode(expr: string, mode: RollMode): string {
  if (!mode) return expr;
  const re = /(^|[+-]\s*)1?d20(?![\dk])/i;
  if (!re.test(expr)) return expr;
  return expr.replace(re, `$12d20k${mode === "advantage" ? "h" : "l"}1`);
}

/** " (advantage)" / " (disadvantage)" for roll labels. */
export const rollModeLabel = (mode: RollMode) => (mode ? ` (${mode})` : "");
