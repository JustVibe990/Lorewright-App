// Item helpers for the sheet: resolve an inventory entry (with an optional
// magic variant like "+1 Weapon") to rules data, and read weapon/armor stats.

import type { Rules } from "./rules.ts";
import type { ForgeData, InventoryItem, ScratchBase } from "./types.ts";

const code = (t: unknown) => String(t ?? "").split("|")[0].toUpperCase();
const low = (s: unknown) => String(s ?? "").toLowerCase();
const num = (s: unknown) => (s == null ? 0 : Number(String(s).replace(/[^\d-]/g, "")) || 0);

/** Apply a magic variant ("+2 Armor") to a base item ("Breastplate"). */
export function applyVariant(base: any, v: any): any {
  const inh = v.inherits ?? {};
  const { namePrefix = "", nameSuffix = "", entries: _e, ...rest } = inh;
  return { ...base, ...rest, name: `${namePrefix}${base.name}${nameSuffix}`, variantOf: base.name };
}

/**
 * The item's 5e.tools data with its magic variant and any homemade bonus
 * applied, or null for custom items with no rules data.
 */
export function itemData(rules: Rules, inv: InventoryItem): any | null {
  if (!inv.ref) return inv.forge?.scratch ? applyForge(scratchBase(inv.forge.scratch, inv.name), inv.forge) : null;
  const base = rules.findItem(inv.ref);
  if (!base) return null;
  const v = inv.variant ? rules.magicVariants.find((m) => m.name === inv.variant) : undefined;
  let raw = v ? applyVariant(base, v) : base;
  if (inv.magicBonus) {
    const b = `+${inv.magicBonus}`;
    raw = isWeapon(raw)
      ? { ...raw, bonusWeapon: b, variantOf: raw.variantOf ?? base.name, rarity: rarityFor(inv.magicBonus) }
      : { ...raw, bonusAc: b, variantOf: raw.variantOf ?? base.name, rarity: rarityFor(inv.magicBonus) };
  }
  if (inv.requiresAttunement) raw = { ...raw, reqAttune: true };
  if (inv.forge) raw = applyForge(raw, inv.forge);
  return raw;
}

/** Plain starting data for an Item Forge item made from scratch. */
export function scratchBase(s: ScratchBase, name: string): any {
  const base = { name: name || "Homebrew item", source: "Homebrew", rarity: "none", weight: 0, entries: [] as any[] };
  switch (s.kind) {
    case "melee":
      return { ...base, type: "M", weapon: true, weaponCategory: s.category ?? "simple", dmg1: "1d6", dmgType: "B", weight: 2 };
    case "ranged":
      return { ...base, type: "R", weapon: true, weaponCategory: s.category ?? "simple", dmg1: "1d6", dmgType: "P", range: "80/320", weight: 2 };
    case "light":
      return { ...base, type: "LA", ac: 11, weight: 10 };
    case "medium":
      return { ...base, type: "MA", ac: 13, weight: 20 };
    case "heavy":
      return { ...base, type: "HA", ac: 16, weight: 50 };
    case "shield":
      return { ...base, type: "S", ac: 2, weight: 6 };
    case "potion":
      return { ...base, type: "P", weight: 0.5 };
    case "ring":
      return { ...base, type: "RG" };
    case "wand":
      return { ...base, type: "WD", weight: 1 };
    case "staff":
      return { ...base, type: "ST", weight: 4 };
    case "rod":
      return { ...base, type: "RD", weight: 2 };
    default:
      return { ...base, wondrous: true };
  }
}

const plus = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const addBonus = (cur: unknown, n?: number) => (n ? plus((Number(String(cur ?? 0).replace(/[^\d-]/g, "")) || 0) + n) : cur);

/** Apply Item Forge changes to an item's data. */
export function applyForge(raw: any, f: ForgeData): any {
  const out: any = { ...raw, _forge: f, variantOf: raw.variantOf ?? raw.name };
  if (f.dmg1) out.dmg1 = f.dmg1;
  if (f.dmg2 !== undefined) out.dmg2 = f.dmg2 || undefined;
  if (f.dmgType) out.dmgType = f.dmgType;
  if (f.properties) out.property = f.properties;
  if (f.range !== undefined) out.range = f.range || undefined;
  if (f.attackBonus) out.bonusWeaponAttack = addBonus(raw.bonusWeaponAttack, f.attackBonus);
  if (f.damageBonus) out.bonusWeaponDamage = addBonus(raw.bonusWeaponDamage, f.damageBonus);
  if (f.ac != null) out.ac = f.ac;
  if (f.acBonus) out.bonusAc = addBonus(raw.bonusAc, f.acBonus);
  if (f.saveBonus) out.bonusSavingThrow = addBonus(raw.bonusSavingThrow, f.saveBonus);
  if (f.abilitySet && Object.keys(f.abilitySet).length) out.ability = { ...(raw.ability ?? {}), static: { ...(raw.ability?.static ?? {}), ...f.abilitySet } };
  if (f.resist?.length) out.resist = [...new Set([...(raw.resist ?? []).filter((x: any) => typeof x === "string"), ...f.resist])];
  if (f.weight != null) out.weight = f.weight;
  if (f.rarity) out.rarity = f.rarity;
  if (f.attunement != null) out.reqAttune = f.attunement || undefined;
  return out;
}

const rarityFor = (bonus: number) => (bonus >= 3 ? "very rare" : bonus === 2 ? "rare" : "uncommon");

/** Base weapons, armor and shields (mundane items that variants can apply to). */
export function baseGear(rules: Rules): any[] {
  return rules.data.index
    .entries()
    .filter((e) => e.kind === "item" && e.raw.edition !== "one" && (!e.raw.rarity || e.raw.rarity === "none") && (isWeapon(e.raw) || !!armorKind(e.raw)))
    .map((e) => e.raw);
}

export interface CatalogueEntry {
  ref: string;
  variant?: string;
  /** For magic shields, which 5e.tools doesn't list as a variant. */
  magicBonus?: number;
  name: string;
  hint: string;
}

/**
 * Every item you can add: the imported items, plus magic variants applied to
 * every base item they fit ("+2 Breastplate", "Adamantine Chain Mail"…),
 * which 5e.tools generates instead of listing.
 */
export function itemCatalogue(rules: Rules): CatalogueEntry[] {
  const out: CatalogueEntry[] = [];
  const names = new Set<string>();
  for (const e of rules.data.index.entries()) {
    if (e.kind !== "item" || e.raw.edition === "one") continue;
    out.push({ ref: `${e.name}|${e.source}`, name: e.name, hint: e.source });
    names.add(e.name.toLowerCase());
  }
  for (const base of baseGear(rules)) {
    for (const v of variantsFor(rules, base)) {
      const item = applyVariant(base, v);
      if (names.has(item.name.toLowerCase())) continue; // a real item of that name exists
      names.add(item.name.toLowerCase());
      out.push({ ref: `${base.name}|${base.source}`, variant: v.name, name: item.name, hint: `${item.rarity ?? "magic"} · ${v.inherits?.source ?? base.source}` });
    }
    // Shield, +1/+2/+3 (DMG) isn't a variant in the data.
    if (armorKind(base) === "shield") {
      for (const n of [1, 2, 3]) {
        const name = `+${n} ${base.name}`;
        if (names.has(name.toLowerCase())) continue;
        names.add(name.toLowerCase());
        out.push({ ref: `${base.name}|${base.source}`, magicBonus: n, name, hint: `${rarityFor(n)} · DMG` });
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Variants that can apply to this base item ("+1 Weapon" for a longsword…). */
export function variantsFor(rules: Rules, base: any): any[] {
  return rules.magicVariants.filter((v) => {
    const req = v.requires ?? [];
    const ok = req.some((r: any) => Object.entries(r).every(([k, want]) => (k === "type" ? code(base.type) === code(want) : base[k] === want)));
    const ex = v.excludes ?? {};
    const excluded = Object.entries(ex).some(([k, bad]) =>
      Array.isArray(bad) ? bad.includes(base[k]) : k === "name" ? base.name === bad : base[k] === bad,
    );
    return ok && !excluded;
  });
}

export const isActive = (inv: InventoryItem, raw: any) => inv.equipped && (!raw?.reqAttune || inv.attuned);

export function armorKind(raw: any): "light" | "medium" | "heavy" | "shield" | null {
  const t = code(raw?.type);
  if (t === "LA") return "light";
  if (t === "MA") return "medium";
  if (t === "HA") return "heavy";
  if (t === "S") return "shield";
  return null;
}

export function isWeapon(raw: any): boolean {
  const t = code(raw?.type);
  return !!raw?.weapon || t === "M" || t === "R" || !!raw?.weaponCategory;
}

export function properties(raw: any): Set<string> {
  return new Set<string>((raw?.property ?? []).map((p: any) => code(typeof p === "string" ? p : p?.uid ?? p?.property)));
}

export type AmmoFamily = "arrow" | "bolt" | "needle" | "sling" | "firearm" | "cell";
const AMMO_NAMES: Record<AmmoFamily, [string, string]> = {
  arrow: ["arrow", "arrows"],
  bolt: ["bolt", "bolts"],
  needle: ["needle", "needles"],
  sling: ["sling bullet", "sling bullets"],
  firearm: ["bullet", "bullets"],
  cell: ["energy cell", "energy cells"],
};
export const ammoName = (f: AmmoFamily, n: number) => AMMO_NAMES[f][n === 1 ? 0 : 1];

/** What a weapon with the ammunition property shoots, or null. */
export function weaponAmmo(raw: any): AmmoFamily | null {
  if (!properties(raw).has("A")) return null;
  const t = low(String(raw?.ammoType ?? "").split("|")[0]);
  const n = low(raw?.name);
  if (/arrow/.test(t) || (!t && /bow/.test(n) && !/crossbow/.test(n))) return "arrow";
  if (/bolt/.test(t) || (!t && /crossbow/.test(n))) return "bolt";
  if (/needle/.test(t) || (!t && /blowgun/.test(n))) return "needle";
  if (/sling/.test(t) || (!t && /sling/.test(n))) return "sling";
  if (/cell/.test(t)) return "cell";
  if (/bullet/.test(t) || /pistol|musket|rifle|revolver|shotgun/.test(n)) return "firearm";
  return null;
}

/** What kind of ammunition an item is (by its data flags, or its name for custom items), or null. */
export function ammoFamily(raw: any, name = ""): AmmoFamily | null {
  if (raw?.arrow) return "arrow";
  if (raw?.bolt) return "bolt";
  if (raw?.needleBlowgun) return "needle";
  if (raw?.bulletSling) return "sling";
  if (raw?.bulletFirearm) return "firearm";
  if (raw?.cellEnergy) return "cell";
  if (raw && code(raw.type) !== "A" && code(raw.type) !== "AF") return null;
  const n = low(name || raw?.name);
  if (/\barrows?\b/.test(n)) return "arrow";
  if (/\bbolts?\b/.test(n)) return "bolt";
  if (/\bneedles?\b/.test(n)) return "needle";
  if (/sling bullets?/.test(n)) return "sling";
  if (/\bbullets?\b/.test(n)) return "firearm";
  if (/energy cells?/.test(n)) return "cell";
  return null;
}

/** "Arrows (20)" holds 20 pieces; "Arrow" holds 1. */
export const packSize = (name: string) => Number(name.match(/\((\d+)\)\s*$/)?.[1] ?? 1);

/**
 * Use one piece of ammunition from the first of `ids` that has any. A pack
 * ("Arrows (20)") is opened into loose pieces ("Arrow" × 19) so it can count down.
 */
export function spendAmmo(inventory: InventoryItem[], ids: string[]): InventoryItem[] {
  const id = ids.find((x) => (inventory.find((i) => i.id === x)?.qty ?? 0) > 0);
  if (!id) return inventory;
  return inventory.map((it) => {
    if (it.id !== id) return it;
    const size = packSize(it.name);
    if (size <= 1) return { ...it, qty: it.qty - 1 };
    const single = (s: string) => s.replace(/\s*\(\d+\)\s*$/, "").replace(/s$/, "");
    const [refName, refSource] = (it.ref ?? "").split("|");
    return {
      ...it,
      name: single(it.name),
      ref: it.ref ? `${single(refName)}|${refSource}` : undefined,
      qty: it.qty * size - 1,
      weight: it.weight != null ? it.weight / size : undefined,
    };
  });
}

export const bonus = (raw: any, key: string) => num(raw?.[key]);
export const isRanged = (raw: any) => code(raw?.type) === "R";
