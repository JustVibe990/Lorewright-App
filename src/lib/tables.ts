// Random tables: one result per line, rolled with a die the size of the table.
// A line can start with a weight ("3x Rain") to come up more often, roll dice
// inside it ("{2d6} goblins"), or roll on another table ("[[Weather]]").

import { roll } from "./dice.ts";

export interface RandomTable {
  id: string;
  name: string;
  /** One result per line. */
  text: string;
}

export interface TableRow {
  text: string;
  weight: number;
}

export function tableRows(t: RandomTable): TableRow[] {
  return t.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\d+)\s*[x×]\s+(.*)$/i);
      return m ? { text: m[2], weight: Math.max(1, Number(m[1])) } : { text: l, weight: 1 };
    });
}

/** The die rolled on this table: the total of the weights. */
export const tableSize = (t: RandomTable) => tableRows(t).reduce((n, r) => n + r.weight, 0);

/** The row a roll of `n` (1 to the size) lands on. */
export function rowFor(rows: TableRow[], n: number): TableRow | undefined {
  let left = n;
  for (const r of rows) {
    left -= r.weight;
    if (left <= 0) return r;
  }
  return rows[rows.length - 1];
}

/** Fill in a result: "{2d6}" is rolled and "[[Other table]]" is rolled on. */
export function expand(text: string, tables: RandomTable[], rng: () => number = Math.random, depth = 0): string {
  return text
    .replace(/\{([^{}]+)\}/g, (all, expr) => (/\d*d\d+/i.test(expr) ? String(roll(expr, rng).total) : all))
    .replace(/\[\[([^\]]+)\]\]/g, (all, name) => {
      const t = tables.find((x) => x.name.trim().toLowerCase() === String(name).trim().toLowerCase());
      if (!t || depth > 4) return all;
      return rollOn(t, tables, rng, depth + 1).text;
    });
}

export interface TableResult {
  n: number;
  size: number;
  text: string;
}

/** Roll on a table: `n` is the die result (rolled here unless given). */
export function rollOn(t: RandomTable, tables: RandomTable[], rng: () => number = Math.random, depth = 0, n?: number): TableResult {
  const rows = tableRows(t);
  const size = rows.reduce((s, r) => s + r.weight, 0);
  if (!size) return { n: 0, size: 0, text: "(empty table)" };
  const at = n ?? 1 + Math.floor(rng() * size);
  return { n: at, size, text: expand(rowFor(rows, at)?.text ?? "", tables, rng, depth) };
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** A few tables to start with (Lorewright's own). */
export function starterTables(): RandomTable[] {
  return [
    {
      id: uid(),
      name: "Tavern names",
      text: [
        "The [[Tavern adjective]] [[Tavern noun]]",
        "The [[Tavern noun]] and [[Tavern noun]]",
        "2x The [[Tavern adjective]] [[Tavern noun]]",
        "[[Tavern noun]]'s Rest",
      ].join("\n"),
    },
    { id: uid(), name: "Tavern adjective", text: ["Drunken", "Gilded", "Rusty", "Sleeping", "Laughing", "Crooked", "Silver", "Wandering", "Howling", "Copper", "Lonely", "Merry"].join("\n") },
    { id: uid(), name: "Tavern noun", text: ["Griffon", "Tankard", "Badger", "Lantern", "Dragon", "Anchor", "Boar", "Kettle", "Raven", "Stag", "Barrel", "Mermaid"].join("\n") },
    {
      id: uid(),
      name: "Rumours",
      text: [
        "The miller's daughter has been seen talking to wolves at dusk.",
        "A merchant caravan went missing on the north road {1d4} days ago.",
        "Someone is paying good gold for old maps of the sewers.",
        "The old shrine on the hill glows on moonless nights.",
        "The captain of the guard takes bribes, but only in gems.",
        "A dragon was seen flying west, carrying something large.",
        "Two noble houses are about to announce a marriage nobody wants.",
        "The well in the square tastes of salt since the earthquake.",
        "A travelling priest is healing the sick for free. Nobody asks his name.",
        "Bandits on the river are wearing the duke's colours.",
      ].join("\n"),
    },
    {
      id: uid(),
      name: "Weather",
      text: ["4x Clear and mild", "3x Overcast, a cool wind", "2x Light rain", "Heavy rain: disadvantage on Perception checks that rely on sight", "Thick fog: heavily obscured beyond 30 ft.", "Strong wind: ranged attacks at disadvantage beyond normal range", "Thunderstorm"].join("\n"),
    },
    {
      id: uid(),
      name: "Pocket finds",
      text: [
        "{2d6} copper pieces and a button",
        "A folded letter, unsigned, that says only \"Tonight\"",
        "A tooth on a string",
        "A wooden dice with a 6 on every face",
        "A pressed flower from somewhere far away",
        "A key with no lock nearby",
        "A small iron token stamped with a crow",
        "A half-eaten honey cake",
        "A tiny painting of a stranger",
        "{1d4} silver pieces wrapped in a handkerchief",
      ].join("\n"),
    },
  ];
}
