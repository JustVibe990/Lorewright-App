// Magic items with charges (wands, staffs, rings…): how many, what they get
// back and when, and the spells they cast with them, read from the 5e.tools
// item data ("charges", "recharge", "rechargeAmount", "attachedSpells").
// Spells an item casts once a day are tracked too.

import type { SlotOption } from "./casting.ts";
import type { Character, InventoryItem } from "./types.ts";

export type Recharge = "dawn" | "dusk" | "midnight" | "long" | "short" | "special";

export interface ItemSpell {
  /** The spell's name as the item gives it ("fireball"). */
  name: string;
  /** Charges for its lowest cast, or uses per day (when `daily`). */
  cost: number;
  /** Cast at this level ("fireball#5" in the data). */
  level?: number;
  /** Each extra charge raises the spell's level by one (wands). */
  upcast?: boolean;
  /** Costs this many charges per spell level, up to `maxLevel` (Staff of Healing's cure wounds). */
  perLevel?: boolean;
  maxLevel?: number;
  /** Cast without charges, this many times a day. */
  daily?: number;
  /** At will. */
  atWill?: boolean;
}

export interface ChargeInfo {
  /** Charges when full; 0 for items that only cast spells a day. */
  max: number;
  recharge?: Recharge;
  /** What it gets back: dice ("1d6+1"), a number, or "all". */
  regain: string;
  spells: ItemSpell[];
  /** The item's own save DC and attack bonus, when it has them; otherwise yours. */
  dc?: number;
  attack?: number;
  /** "If you expend the last charge, roll a d20. On a 1…". */
  lastChargeRisk: boolean;
}

const RECHARGE: Record<string, Recharge> = { dawn: "dawn", dusk: "dusk", midnight: "midnight", restLong: "long", restShort: "short", special: "special" };
export const RECHARGE_LABEL: Record<Recharge, string> = {
  dawn: "at dawn",
  dusk: "at dusk",
  midnight: "at midnight",
  long: "on a long rest",
  short: "on a short rest",
  special: "(see the item)",
};

function flat(x: any): string {
  if (typeof x === "string") return x;
  if (Array.isArray(x)) return x.map(flat).join(" ");
  if (x && typeof x === "object") return flat(x.entries ?? x.items ?? []);
  return "";
}

const dice = (s: string) => s.replace(/\{@dice ([^}|]+)[^}]*\}/g, "$1").replace(/\s+/g, "");

/** The item's charges and spells, or null if it has neither. */
export function chargeInfo(raw: any, inv?: InventoryItem): ChargeInfo | null {
  const text = flat(raw?.entries ?? []);
  const forge = inv?.forge;
  const max = forge?.charges ?? (typeof raw?.charges === "number" ? raw.charges : Number(raw?.charges) || 0);
  const spells: ItemSpell[] = [];
  const att = raw?.attachedSpells;
  const upcast = /increase the spell(?:'s)?(?: slot)? level by one for each additional charge/i.test(text);
  if (att && typeof att === "object" && !Array.isArray(att)) {
    for (const [cost, names] of Object.entries<any>(att.charges ?? {})) {
      for (const n of names as string[]) {
        const [name, lvl] = String(n).split("#");
        const s: ItemSpell = { name, cost: Number(cost) || 1 };
        if (lvl) s.level = Number(lvl);
        // "cure wounds (1 charge per spell level, up to 4th)"
        const per = text.match(new RegExp(`\\{@spell ${name}[^}]*\\}\\s*\\((\\d+) charges? per spell level(?:, up to (\\d))?`, "i"));
        if (per) {
          s.perLevel = true;
          s.cost = Number(per[1]);
          if (per[2]) s.maxLevel = Number(per[2]);
        } else if (upcast && !lvl) s.upcast = true;
        spells.push(s);
      }
    }
    for (const [key, names] of Object.entries<any>(att.daily ?? {})) {
      const n = Number(String(key).replace(/e$/, "")) || 1;
      for (const x of names as string[]) {
        const [name, lvl] = String(x).split("#");
        spells.push({ name, cost: 1, daily: n, level: lvl ? Number(lvl) : undefined });
      }
    }
    for (const x of att.will ?? []) {
      const [name, lvl] = String(x).split("#");
      spells.push({ name, cost: 0, atWill: true, level: lvl ? Number(lvl) : undefined });
    }
  }
  // Item Forge spells with a "N charges" note use the charges too.
  for (const fs of forge?.spells ?? []) {
    const m = fs.note.match(/(\d+)\s*charges?/i);
    const day = fs.note.match(/(\d+)\s*\/\s*day/i);
    const name = fs.ref.split("|")[0];
    if (spells.some((s) => s.name.toLowerCase() === name.toLowerCase())) continue;
    if (m && max) spells.push({ name, cost: Number(m[1]) });
    else if (day) spells.push({ name, cost: 1, daily: Number(day[1]) });
  }
  if (!max && !spells.some((s) => s.daily)) return null;

  const rawAmount = forge?.regain ?? (raw?.rechargeAmount != null ? String(raw.rechargeAmount) : "");
  const regain = rawAmount ? dice(rawAmount) : "all";
  const dc = text.match(/\{@dc (\d+)\}/);
  const hit = text.match(/\{@hit (\d+)\}/);
  return {
    max,
    recharge: (forge?.recharge as Recharge | undefined) ?? RECHARGE[raw?.recharge] ?? (max ? undefined : "dawn"),
    regain,
    spells,
    dc: /your spell save DC/i.test(text) ? undefined : dc ? Number(dc[1]) : undefined,
    attack: hit ? Number(hit[1]) : undefined,
    lastChargeRisk: /expend the (?:\w+'s |its )?last charge/i.test(text),
  };
}

const ORD = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

/** Ways to cast an item's spell with the charges left: one per level it can be cast at. */
export function itemSpellOptions(s: ItemSpell, spellLevel: number, chargesLeft: number, usesLeft = 0): SlotOption[] {
  if (s.atWill) return [{ id: "will", label: "At will", level: s.level ?? spellLevel, kind: "item" }];
  if (s.daily) return usesLeft > 0 ? [{ id: "daily", label: `${s.daily}/day (${usesLeft} left)`, level: s.level ?? spellLevel, kind: "item" }] : [];
  const out: SlotOption[] = [];
  const base = s.level ?? spellLevel;
  const add = (level: number, cost: number) => {
    if (cost <= chargesLeft) out.push({ id: `c${cost}`, label: `${level ? `${ORD[level]} level, ` : ""}${cost} charge${cost === 1 ? "" : "s"}`, level, kind: "item" });
  };
  if (s.perLevel) for (let l = Math.max(1, spellLevel); l <= Math.min(9, s.maxLevel ?? 9); l++) add(l, l * s.cost);
  else if (s.upcast) for (let l = base; l <= 9; l++) add(l, s.cost + (l - base));
  else add(base, s.cost);
  return out;
}

/** Charges an option costs ("c3" → 3). */
export const optionCost = (o: SlotOption) => Number(o.id.match(/^c(\d+)$/)?.[1] ?? 0);

export const chargesLeft = (inv: InventoryItem, info: ChargeInfo) => Math.max(0, info.max - (inv.chargesUsed ?? 0));
export const usesLeft = (inv: InventoryItem, s: ItemSpell) => Math.max(0, (s.daily ?? 0) - (inv.spellUses?.[s.name.toLowerCase()] ?? 0));

/** Spend an item's charges (or a daily use) on casting one of its spells. */
export function spendItem(ch: Character, itemId: string, s: ItemSpell, o: SlotOption): Character {
  return {
    ...ch,
    inventory: ch.inventory.map((i) => {
      if (i.id !== itemId) return i;
      if (o.id === "daily") {
        const k = s.name.toLowerCase();
        return { ...i, spellUses: { ...(i.spellUses ?? {}), [k]: (i.spellUses?.[k] ?? 0) + 1 } };
      }
      const cost = optionCost(o);
      return cost ? { ...i, chargesUsed: (i.chargesUsed ?? 0) + cost } : i;
    }),
  };
}

/**
 * What a rest gives back to items: a long rest counts as the next dawn (and dusk
 * and midnight). `rollDice` rolls an amount like "1d6+1".
 */
export function rechargeItems(
  ch: Character,
  infoOf: (inv: InventoryItem) => ChargeInfo | null,
  rest: "long" | "short",
  rollDice: (expr: string, label: string) => number,
): { ch: Character; notes: string[] } {
  const notes: string[] = [];
  const inventory = ch.inventory.map((inv) => {
    const info = (inv.chargesUsed || inv.spellUses) && infoOf(inv);
    if (!info) return inv;
    const due = rest === "long" ? info.recharge !== "special" && info.recharge !== undefined : info.recharge === "short";
    if (!due) return inv;
    let next: InventoryItem = { ...inv };
    if (rest === "long" && inv.spellUses) next.spellUses = undefined;
    const used = inv.chargesUsed ?? 0;
    if (used > 0) {
      const back = info.regain === "all" ? used : /d/i.test(info.regain) ? rollDice(info.regain, `${inv.name}: charges regained`) : Number(info.regain) || used;
      next = { ...next, chargesUsed: Math.max(0, used - back) || undefined };
      notes.push(`${inv.name} regained ${Math.min(back, used)} charge${Math.min(back, used) === 1 ? "" : "s"}`);
    }
    return next;
  });
  return { ch: { ...ch, inventory }, notes };
}
