// Cards for the character's own items: a +1 or Item Forge weapon shows what
// it really is (its features, spells, description and the magic variant's
// text), not the plain 5e.tools base item. Links to them use the kind
// "invItem" and the inventory id; the open character registers its items here.

import type { Entry } from "../types.ts";
import type { InventoryItem } from "./types.ts";

export const INV_ITEM_KIND = "invItem";

const registry = new Map<string, Entry>();

export function registerItemCard(id: string, entry: Entry) {
  registry.set(id, entry);
}

export function findItemCard(id: string): Entry | undefined {
  return registry.get(id);
}

/** True when the item differs from its 5e.tools entry enough to need its own card. */
export const needsOwnCard = (inv: InventoryItem) => !!(inv.variant || inv.magicBonus || inv.forge || inv.pact);

/** Fill 5e.tools variant templates like "{=bonusWeapon}" from the item's data. */
const fillTemplate = (s: string, raw: any) => s.replace(/\{=(\w+)(?:\/\w+)?\}/g, (_, k) => String(raw?.[k] ?? ""));
const fillAll = (x: any, raw: any): any =>
  typeof x === "string" ? fillTemplate(x, raw) : Array.isArray(x) ? x.map((y) => fillAll(y, raw)) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fillAll(v, raw)])) : x;

/**
 * The card for an inventory item. `raw` is its data with variants and Forge
 * changes applied; `variant` is the magic variant's own data, if any.
 */
export function itemCard(inv: InventoryItem, raw: any, variant?: any): Entry {
  const f = inv.forge;
  const entries: any[] = [];
  if (inv.pact === "created") entries.push("{@i Pact weapon: conjured with Pact of the Blade. It counts as magical.}");
  if (inv.pact === "bonded") entries.push("{@i Pact weapon: bonded with the Pact of the Blade ritual.}");
  for (const x of f?.features ?? []) {
    if (x.name.trim() || x.text.trim()) entries.push(x.name.trim() ? { type: "entries", name: x.name.trim(), entries: [x.text] } : x.text);
  }
  if (f?.spells?.length) {
    entries.push({ type: "entries", name: "Spells", entries: [{ type: "list", items: f.spells.map((s) => `{@spell ${s.ref}}${s.note ? ` (${s.note})` : ""}`) }] });
  }
  if (f?.description?.trim()) entries.push(...f.description.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean));
  // Magic variants keep their text in inherits.entries ("You have a {=bonusWeapon} bonus…").
  const variantText = variant?.inherits?.entries ?? variant?.entries;
  if (variantText?.length) entries.push(...fillAll(variantText, raw));
  else if (inv.magicBonus) {
    entries.push(
      raw?.bonusAc
        ? `You have a ${raw.bonusAc} bonus to AC while wearing or wielding this item.`
        : `You have a ${raw?.bonusWeapon ?? `+${inv.magicBonus}`} bonus to attack and damage rolls made with this magic weapon.`,
    );
  }
  if (raw?.entries?.length) entries.push(...raw.entries);
  return {
    kind: "item",
    name: inv.name || raw?.name || "Item",
    source: raw?.source ?? "Homebrew",
    page: raw?.page,
    raw: { ...(raw ?? {}), name: inv.name || raw?.name, entries },
  } as Entry;
}
