// The Inventory tab: what's equipped and what's in the backpack, adding items
// (including every magic variant like "+2 Breastplate"), making your own magic
// weapon or armor, Pact of the Blade, coins and carrying weight.

import { Fragment, useMemo, useState } from "react";
import { INV_ITEM_KIND, itemCard, needsOwnCard, registerItemCard } from "../../lib/character/itemcard.ts";
import { applyConsumable, consumableEffect, isConsumable } from "../../lib/character/consumables.ts";
import { armorKind, baseGear, isWeapon, itemCatalogue, itemData, isRanged } from "../../lib/character/items.ts";
import type { Rules } from "../../lib/character/rules.ts";
import type { Character, InventoryItem, Sheet } from "../../lib/character/types.ts";
import SearchSelect from "./SearchSelect.tsx";
import { playLead } from "../../lib/sfx.ts";
import type { DataStore } from "../../lib/data.ts";
import ItemPowers, { hasPowers } from "./ItemPowers.tsx";

type Update = (fn: (c: Character) => Character) => void;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PACT_RANGED = new Set(["shortbow", "longbow", "light crossbow", "heavy crossbow"]);

/** What slot an item takes when equipped, for grouping and swapping. */
function slotOf(raw: any): "armor" | "shield" | "weapon" | "worn" {
  const k = armorKind(raw);
  if (k === "shield") return "shield";
  if (k) return "armor";
  if (raw && isWeapon(raw)) return "weapon";
  return "worn";
}
const SLOT_LABEL = { armor: "Armor", shield: "Shield", weapon: "Weapon", worn: "Worn" };

function equippable(inv: InventoryItem, raw: any): boolean {
  if (!inv.ref && !inv.forge?.scratch) return true;
  if (!raw) return false;
  const t = String(raw.type ?? "").split("|")[0];
  return isWeapon(raw) || !!armorKind(raw) || !!raw.bonusAc || !!raw.bonusSavingThrow || !!raw.reqAttune || !!raw.wondrous || t === "RG" || t === "RD" || t === "WD";
}
const isMagic = (inv: InventoryItem, raw: any) => !!inv.variant || !!inv.magicBonus || (!!raw?.rarity && raw.rarity !== "none");

export default function InventoryTab({
  ch,
  sheet,
  rules,
  update,
  onForge,
  roll,
  data,
}: {
  ch: Character;
  sheet: Sheet;
  rules: Rules;
  data: DataStore;
  update: Update;
  onForge?: (id: string) => void;
  roll: (expr: string, label: string) => unknown;
}) {
  const [used, setUsed] = useState<{ id: string; text: string } | null>(null);
  /** Drink a potion (or use another consumable): roll it, apply it, one less in the pack. */
  const useItem = (inv: InventoryItem, raw: any) => {
    const e = consumableEffect(raw, inv.name || raw?.name);
    playLead("potion", ["dice", "feature", "condition"], 0.75);
    const who = ch.name || "Character";
    const total = (expr: string, label: string) => {
      const r = roll?.(expr, `${who}: ${label}`);
      return r && typeof r === "object" && "total" in r ? Number((r as { total: number }).total) : 0;
    };
    const rolled = {
      heal: e.heal ? total(e.heal, `${inv.name} (healing)`) : undefined,
      damage: e.damage ? total(e.damage.dice, `${inv.name} (${e.damage.type} damage)`) : undefined,
      duration: e.durationDice ? total(e.durationDice.dice, `${inv.name} (${e.durationDice.unit})`) : undefined,
    };
    update((c) => applyConsumable(c, inv.id, e, rolled, sheet.hp.max));
    const bits = [
      rolled.heal ? `healed ${rolled.heal} HP` : "",
      e.temp ? `${e.temp} temp HP` : "",
      rolled.damage ? `took ${rolled.damage} ${e.damage!.type} damage` : "",
      e.active ? [e.active.condition ?? e.active.name, rolled.duration ? `for ${rolled.duration} ${e.durationDice!.unit}` : e.active.until ? `for ${e.active.until}` : ""].filter(Boolean).join(" ") : "",
      e.removes?.length ? `removed ${e.removes.join(", ").toLowerCase()}` : "",
      e.clearsExhaustion ? "exhaustion gone" : "",
    ].filter(Boolean);
    setUsed({ id: inv.id, text: `${inv.name}: ${bits.join(" · ") || "used"}${inv.qty > 1 ? ` (${inv.qty - 1} left)` : ""}` });
  };
  const useBtn = (inv: InventoryItem, raw: any) =>
    isConsumable(raw, inv.name) && inv.qty > 0 ? (
      <button className="small primary" onClick={() => useItem(inv, raw)} title={`Use it: ${consumableEffect(raw, inv.name).summary}`}>
        {/potion|elixir|philter|draught|tonic/i.test(inv.name || raw?.name || "") ? "Drink" : "Use"}
      </button>
    ) : null;
  const powersRow = (inv: InventoryItem, raw: any, cols: number) => (
    <tr className="powers-row">
      <td colSpan={cols}>
        <ItemPowers inv={inv} raw={raw} ch={ch} sheet={sheet} rules={rules} data={data} update={update} roll={roll} />
      </td>
    </tr>
  );
  const forgeBtn = (inv: InventoryItem) =>
    (inv.ref || inv.forge?.scratch) && onForge ? (
      <button className="ghost small" onClick={() => onForge(inv.id)} title="Change this item's stats in the Item Forge">
        {inv.forge ? "Edit forge" : "Forge"}
      </button>
    ) : null;
  const [pending, setPending] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const catalogue = useMemo(() => itemCatalogue(rules), [rules]);
  const options = useMemo(() => catalogue.map((c, i) => ({ value: String(i), label: c.name, hint: c.hint })), [catalogue]);

  const rows = ch.inventory.map((inv) => ({ inv, raw: itemData(rules, inv) }));
  // Magic, Forge and pact items get their own hover card (see itemName).
  for (const { inv, raw } of rows) {
    if (raw && needsOwnCard(inv)) registerItemCard(inv.id, itemCard(inv, raw, inv.variant ? rules.magicVariants.find((m) => m.name === inv.variant) : undefined));
  }
  const equipped = rows.filter((r) => r.inv.equipped);
  const backpack = rows.filter((r) => !r.inv.equipped);

  const setItem = (id: string, patch: Partial<InventoryItem>) =>
    update((c) => ({ ...c, inventory: c.inventory.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const remove = (id: string) => update((c) => ({ ...c, inventory: c.inventory.filter((i) => i.id !== id) }));

  /** Equip, taking off any other body armor or shield (weapons and worn items stack). */
  const equip = (id: string) =>
    update((c) => {
      const target = c.inventory.find((i) => i.id === id);
      const slot = slotOf(target ? itemData(rules, target) : null);
      return {
        ...c,
        inventory: c.inventory.map((i) => {
          if (i.id === id) return { ...i, equipped: true };
          if ((slot === "armor" || slot === "shield") && i.equipped && slotOf(itemData(rules, i)) === slot) return { ...i, equipped: false };
          return i;
        }),
      };
    });

  const addFromCatalogue = (key: string) => {
    const c = catalogue[Number(key)];
    if (!c) return;
    const raw = itemData(rules, { id: "", ref: c.ref, variant: c.variant, magicBonus: c.magicBonus, name: "", qty: 1, equipped: false, attuned: false });
    update((ch) => ({
      ...ch,
      inventory: [...ch.inventory, { id: uid(), ref: c.ref, variant: c.variant, magicBonus: c.magicBonus, name: c.name, qty: 1, equipped: false, attuned: false, weight: raw?.weight }],
    }));
    setPending(null);
  };

  const totalWeight = rows.reduce((n, { inv, raw }) => n + (raw?.weight ?? inv.weight ?? 0) * inv.qty, 0);
  const coinWeight = Object.values(ch.currency).reduce((n, x) => n + x, 0) / 50;
  const capacity = sheet.abilities.str.score * 15;
  const attuned = ch.inventory.filter((i) => i.attuned).length;
  const hasPact = sheet.featureNames.includes("Pact of the Blade");

  const itemName = (inv: InventoryItem, raw: any) => {
    const [name, source] = (inv.ref ?? "").split("|");
    if (raw && needsOwnCard(inv)) {
      return (
        <span className="lk lk-item" data-5e={INV_ITEM_KIND} data-name={inv.id} data-source={ch.id}>
          {inv.name || raw.name || name}
        </span>
      );
    }
    if (!inv.ref) return <input value={inv.name} onChange={(e) => setItem(inv.id, { name: e.target.value })} aria-label="Item name" />;
    return (
      <span className="lk lk-item" data-5e="item" data-name={raw?.variantOf ? name : raw?.name ?? name} data-source={source}>
        {inv.name || raw?.name || name}
      </span>
    );
  };

  return (
    <div className="inventory">
      {used && (
        <div className="notice used-notice" role="status">
          <span className="grow">{used.text}</span>
          <button className="ghost small" aria-label="Dismiss" onClick={() => setUsed(null)}>
            ✕
          </button>
        </div>
      )}
      <h4 className="sheet-h">Equipped</h4>
      {!equipped.length && <p className="small muted">Nothing equipped. Equip armor and weapons from your backpack to use them on the sheet.</p>}
      {equipped.length > 0 && (
        <table className="inv-table">
          <tbody>
            {equipped.map(({ inv, raw }) => (
              <Fragment key={inv.id}>
              <tr className={hasPowers(inv, raw) ? "has-powers" : ""}>
                <td className="slot-cell small muted">{SLOT_LABEL[slotOf(raw)]}</td>
                <td>
                  {itemName(inv, raw)}
                  {inv.pact && <span className="pill small">pact weapon</span>}
                </td>
                <td>
                  {raw?.reqAttune && (
                    <label className="row small">
                      <input type="checkbox" checked={inv.attuned} onChange={(e) => setItem(inv.id, { attuned: e.target.checked })} /> attuned
                    </label>
                  )}
                </td>
                <td className="cell-actions">
                  {forgeBtn(inv)} <button className="small" onClick={() => setItem(inv.id, { equipped: false })}>Unequip</button>
                </td>
              </tr>
              {hasPowers(inv, raw) && powersRow(inv, raw, 4)}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      <h4 className="sheet-h">Backpack</h4>
      <table className="inv-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>lb.</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {backpack.map(({ inv, raw }) => (
            <Fragment key={inv.id}>
            <tr className={hasPowers(inv, raw) ? "has-powers" : ""}>
              <td>
                {itemName(inv, raw)}
                {raw?.reqAttune && <span className="small muted"> · attunement</span>}
              </td>
              <td><input className="hp-roll" type="number" min={0} value={inv.qty} onChange={(e) => setItem(inv.id, { qty: Math.max(0, Number(e.target.value) || 0) })} aria-label="Quantity" /></td>
              <td className="small muted">{raw?.weight ?? inv.weight ?? ""}</td>
              <td className="cell-actions">
                {useBtn(inv, raw)} {forgeBtn(inv)} {equippable(inv, raw) && !isConsumable(raw, inv.name) && <button className="small" onClick={() => equip(inv.id)}>Equip</button>}{" "}
                <button className="ghost small" onClick={() => remove(inv.id)} aria-label={`Remove ${inv.name}`}>✕</button>
              </td>
            </tr>
            {hasPowers(inv, raw) && powersRow(inv, raw, 4)}
            </Fragment>
          ))}
          {!backpack.length && (
            <tr>
              <td colSpan={4} className="small muted">Backpack empty.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className={`small ${totalWeight + coinWeight > capacity ? "error" : "muted"}`}>
        Carrying {Math.round((totalWeight + coinWeight) * 10) / 10} / {capacity} lb. · Attuned {attuned}/3
        {attuned > 3 && <span className="error"> (too many)</span>}
      </p>

      {hasPact && <PactOfTheBlade ch={ch} sheet={sheet} rules={rules} update={update} />}

      <h4 className="sheet-h">Add an item</h4>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <div className="grow">
          <SearchSelect options={options} value={pending ?? undefined} placeholder={`Search ${options.length.toLocaleString()} items, e.g. +2 Breastplate`} onChange={setPending} />
        </div>
        <button className="primary" disabled={pending == null} onClick={() => pending != null && addFromCatalogue(pending)}>Add</button>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <input className="grow" placeholder="Or a custom item (e.g. Letter from Elyse)" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button
          disabled={!custom.trim()}
          onClick={() => {
            update((c) => ({ ...c, inventory: [...c.inventory, { id: uid(), name: custom.trim(), qty: 1, equipped: false, attuned: false }] }));
            setCustom("");
          }}
        >
          Add custom
        </button>
      </div>

      <MakeMagicItem rules={rules} update={update} />

      <h4 className="sheet-h">Coins</h4>
      <div className="row coins">
        {(["pp", "gp", "ep", "sp", "cp"] as const).map((k) => (
          <label key={k} className="small">
            {k}
            <input type="number" min={0} value={ch.currency[k]} onChange={(e) => update((c) => ({ ...c, currency: { ...c.currency, [k]: Math.max(0, Number(e.target.value) || 0) } }))} />
          </label>
        ))}
      </div>
    </div>
  );
}

/** Make your own magic weapon or armor: a base item plus +1/+2/+3, optional attunement. */
function MakeMagicItem({ rules, update }: { rules: Rules; update: Update }) {
  const [base, setBase] = useState<string | undefined>();
  const [bonus, setBonus] = useState(1);
  const [name, setName] = useState("");
  const [attune, setAttune] = useState(false);
  const gear = useMemo(() => baseGear(rules).map((g) => ({ value: `${g.name}|${g.source}`, label: g.name, hint: armorKind(g) ? armorKind(g)! : "weapon" })).sort((a, b) => a.label.localeCompare(b.label)), [rules]);
  const baseName = base?.split("|")[0] ?? "";
  const autoName = baseName ? `+${bonus} ${baseName}` : "";
  const add = () => {
    if (!base) return;
    update((c) => ({
      ...c,
      inventory: [...c.inventory, { id: uid(), ref: base, magicBonus: bonus, requiresAttunement: attune || undefined, name: name.trim() || autoName, qty: 1, equipped: false, attuned: false }],
    }));
    setBase(undefined);
    setName("");
    setAttune(false);
  };
  return (
    <>
      <h4 className="sheet-h">Make a magic weapon or armor</h4>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 220 }}>
          <SearchSelect options={gear} value={base} placeholder="Base weapon, armor or shield" onChange={setBase} />
        </div>
        <select value={bonus} onChange={(e) => setBonus(Number(e.target.value))} aria-label="Bonus">
          <option value={1}>+1</option>
          <option value={2}>+2</option>
          <option value={3}>+3</option>
        </select>
        <input className="grow" placeholder={autoName || "Name (optional), e.g. Frostbite"} value={name} onChange={(e) => setName(e.target.value)} />
        <label className="row small">
          <input type="checkbox" checked={attune} onChange={(e) => setAttune(e.target.checked)} /> needs attunement
        </label>
        <button className="primary" disabled={!base} onClick={add}>Create</button>
      </div>
      <p className="small muted">Weapons get the bonus to attack and damage rolls; armor and shields get it to AC.</p>
    </>
  );
}

/** Pact of the Blade: conjure a pact weapon, or bond a magic weapon with the 1-hour ritual. */
function PactOfTheBlade({ ch, sheet, rules, update }: { ch: Character; sheet: Sheet; rules: Rules; update: Update }) {
  const improved = sheet.featureNames.includes("Improved Pact Weapon");
  const current = ch.inventory.find((i) => i.pact);
  const [bondId, setBondId] = useState("");
  // Any melee weapon; Improved Pact Weapon adds bows and crossbows.
  const forms = useMemo(
    () =>
      baseGear(rules)
        .filter((g) => isWeapon(g) && (!isRanged(g) || (improved && PACT_RANGED.has(g.name.toLowerCase()))))
        .map((g) => ({ value: `${g.name}|${g.source}`, label: g.name, hint: g.weaponCategory ?? "" }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [rules, improved],
  );
  const magicWeapons = ch.inventory.filter((i) => {
    const raw = itemData(rules, i);
    return i.pact !== "created" && raw && isWeapon(raw) && isMagic(i, raw);
  });

  /** Clear any previous pact weapon: a conjured one vanishes, a bonded one goes back to normal. */
  const clearPact = (list: InventoryItem[]) => list.filter((i) => i.pact !== "created").map((i) => (i.pact ? { ...i, pact: undefined } : i));

  const create = (ref: string) => {
    const name = ref.split("|")[0];
    update((c) => ({
      ...c,
      inventory: [...clearPact(c.inventory), { id: uid(), ref, name: `${name} (pact weapon)`, qty: 1, equipped: true, attuned: false, pact: "created" }],
    }));
  };
  const bond = () => {
    if (!bondId) return;
    update((c) => ({ ...c, inventory: clearPact(c.inventory).map((i) => (i.id === bondId ? { ...i, pact: "bonded", equipped: true } : i)) }));
    setBondId("");
  };

  return (
    <section className="pact">
      <h4 className="sheet-h">Pact of the Blade</h4>
      <p className="small">
        {current ? (
          <>
            Pact weapon: <b>{current.name}</b> <span className="muted">({current.pact === "created" ? "conjured" : "bonded by ritual"})</span>{" "}
            <button className="link small" onClick={() => update((c) => ({ ...c, inventory: clearPact(c.inventory) }))}>
              dismiss
            </button>
          </>
        ) : (
          <span className="muted">No pact weapon right now.</span>
        )}
      </p>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span className="small">Create a pact weapon:</span>
        <div style={{ minWidth: 220 }}>
          <SearchSelect options={forms} placeholder={improved ? "Any melee weapon, bow or crossbow" : "Any melee weapon"} onChange={create} />
        </div>
      </div>
      <div className="row" style={{ flexWrap: "wrap", marginTop: 6 }}>
        <span className="small">Bond a magic weapon (1-hour ritual):</span>
        <select value={bondId} onChange={(e) => setBondId(e.target.value)} aria-label="Magic weapon to bond">
          <option value="">{magicWeapons.length ? "Choose a magic weapon" : "No magic weapons carried"}</option>
          {magicWeapons.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <button disabled={!bondId} onClick={bond}>Perform ritual</button>
      </div>
      <p className="small muted">
        You're proficient with your pact weapon and it counts as magical.
        {improved ? " Improved Pact Weapon: +1 to attack and damage if it isn't already magic." : ""}
        {sheet.featureNames.includes("Hex Warrior") ? " Hex Warrior: you can use Charisma for its attack and damage rolls." : ""}
        {" "}Creating a new one, or bonding another, ends the old pact weapon.
      </p>
    </section>
  );
}
