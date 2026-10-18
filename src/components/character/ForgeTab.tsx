// The Item Forge: start from any item (or magic variant), or from scratch, and homebrew it:
// damage, properties, bonuses, AC, resistances, spells and extra features.
// Saves to the inventory; forged items can be reopened and changed.

import { useMemo, useState } from "react";
import { computeSheet } from "../../lib/character/engine.ts";
import { armorKind, isWeapon, itemCatalogue, itemData, properties } from "../../lib/character/items.ts";
import type { Rules } from "../../lib/character/rules.ts";
import { ABILITIES, ABILITY_NAMES, type Ability, type Character, type ForgeData, type InventoryItem, type ScratchBase } from "../../lib/character/types.ts";
import SearchSelect from "./SearchSelect.tsx";

type Update = (fn: (c: Character) => Character) => void;

const DAMAGE: [string, string][] = [
  ["B", "bludgeoning"], ["P", "piercing"], ["S", "slashing"], ["A", "acid"], ["C", "cold"], ["F", "fire"], ["O", "force"],
  ["L", "lightning"], ["N", "necrotic"], ["I", "poison"], ["Y", "psychic"], ["R", "radiant"], ["T", "thunder"],
];
const PROPS: [string, string][] = [
  ["F", "Finesse"], ["L", "Light"], ["H", "Heavy"], ["R", "Reach"], ["T", "Thrown"], ["V", "Versatile"], ["2H", "Two-handed"], ["A", "Ammunition"], ["LD", "Loading"],
];
const RARITIES = ["common", "uncommon", "rare", "very rare", "legendary", "artifact"];
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const num = (v: string) => (v.trim() === "" ? undefined : Number(v) || 0);

const SCRATCH_KINDS: [ScratchBase["kind"], string][] = [
  ["melee", "Melee weapon"], ["ranged", "Ranged weapon"], ["light", "Light armor"], ["medium", "Medium armor"], ["heavy", "Heavy armor"], ["shield", "Shield"], ["potion", "Potion"], ["ring", "Ring"], ["wand", "Wand"], ["staff", "Staff"], ["rod", "Rod"], ["other", "Wondrous item (cloak, boots…)"],
];
const isWeaponKind = (k: ScratchBase["kind"]) => k === "melee" || k === "ranged";

interface Draft {
  id?: string;
  /** Base item ("Longsword|PHB"); empty for an item made from scratch. */
  ref: string;
  variant?: string;
  magicBonus?: number;
  name: string;
  forge: ForgeData;
}

export default function ForgeTab({
  ch,
  rules,
  update,
  editId,
  onDone,
  homebrew,
}: {
  ch: Character;
  rules: Rules;
  update: Update;
  editId: string | null;
  onDone: () => void;
  /** The DM's Item Builder: the list is shown outside, and saving makes a homebrew item. */
  homebrew?: boolean;
}) {
  const catalogue = useMemo(() => itemCatalogue(rules), [rules]);
  const options = useMemo(() => catalogue.map((c, i) => ({ value: String(i), label: c.name, hint: c.hint })), [catalogue]);
  const editing = editId ? ch.inventory.find((i) => i.id === editId) : undefined;
  const [draft, setDraft] = useState<Draft | null>(() =>
    editing && (editing.ref || editing.forge?.scratch) ? { id: editing.id, ref: editing.ref ?? "", variant: editing.variant, magicBonus: editing.magicBonus, name: editing.name, forge: { ...(editing.forge ?? {}) } } : null,
  );
  const forged = ch.inventory.filter((i) => i.forge);

  const start = (key: string) => {
    const c = catalogue[Number(key)];
    if (c) setDraft({ ref: c.ref, variant: c.variant, magicBonus: c.magicBonus, name: c.name, forge: {} });
  };
  const scratch = () => setDraft({ ref: "", name: "", forge: { scratch: { kind: "melee", category: "simple" } } });
  const open = (inv: InventoryItem) => (inv.ref || inv.forge?.scratch) && setDraft({ id: inv.id, ref: inv.ref ?? "", variant: inv.variant, magicBonus: inv.magicBonus, name: inv.name, forge: { ...(inv.forge ?? {}) } });

  return (
    <div className="forge">
      {forged.length > 0 && !homebrew && (
        <section>
          <h3>Your forged items</h3>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {forged.map((i) => (
              <button key={i.id} className={draft?.id === i.id ? "primary" : ""} onClick={() => open(i)}>
                {i.name}
              </button>
            ))}
          </div>
        </section>
      )}
      <section>
        <h3>Start from an item</h3>
        <p className="small muted">Pick any weapon, armor or magic item as the base, then change whatever you like.</p>
        <SearchSelect options={options} placeholder={`Search ${options.length.toLocaleString()} items`} onChange={start} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className={draft && !draft.ref && !draft.id ? "primary" : ""} onClick={scratch}>
            Or create from scratch
          </button>
          <span className="small muted">A weapon, armor, shield or any other item, all your own.</span>
        </div>
      </section>
      {draft && <ForgeForm key={draft.id ?? (draft.ref ? `${draft.ref}|${draft.variant ?? ""}|${draft.magicBonus ?? ""}` : "scratch")} draft={draft} setDraft={setDraft} ch={ch} rules={rules} update={update} onDone={onDone} homebrew={homebrew} />}
    </div>
  );
}

function ForgeForm({ draft, setDraft, ch, rules, update, onDone, homebrew }: { draft: Draft; setDraft: (d: Draft | null) => void; ch: Character; rules: Rules; update: Update; onDone: () => void; homebrew?: boolean }) {
  const f = draft.forge;
  const set = (patch: Partial<ForgeData>) => setDraft({ ...draft, forge: { ...f, ...patch } });
  // Keep the item's pact-weapon status, so the preview matches the sheet (Hex Warrior uses Charisma).
  const pact = ch.inventory.find((i) => i.id === draft.id)?.pact;
  // A scratch item's "base" is its plain starting data (scratch kind, no other changes).
  const asItem = (forge: ForgeData | undefined): InventoryItem => ({ id: draft.id ?? "__forge", ref: draft.ref || undefined, variant: draft.variant, magicBonus: draft.magicBonus, name: draft.name, qty: 1, equipped: true, attuned: true, forge, pact });
  const base = itemData(rules, asItem(f.scratch ? { scratch: f.scratch } : undefined));
  const result = itemData(rules, asItem(f));
  const weapon = !!base && isWeapon(base);
  const armor = !!base && !!armorKind(base);
  const props = properties(result);
  const [spellPick, setSpellPick] = useState<string | undefined>();
  const [spellNote, setSpellNote] = useState("1/day");
  const spellOptions = useMemo(
    () => rules.data.index.entries().filter((e) => e.kind === "spell" && e.raw.edition !== "one").map((e) => ({ value: `${e.name}|${e.source}`, label: e.name, hint: `${e.raw.level ? `level ${e.raw.level}` : "cantrip"} · ${e.source}` })),
    [rules],
  );

  // What the sheet would show with this item equipped (and attuned).
  const preview = useMemo(() => {
    const others = ch.inventory.filter((i) => i.id !== draft.id);
    const s = computeSheet({ ...ch, inventory: [...others, asItem(f)] }, rules);
    return { attack: s.attacks.find((a) => a.name === draft.name), ac: s.ac.value };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch, draft, rules]);

  const save = () => {
    const clean: ForgeData = JSON.parse(JSON.stringify(f));
    update((c) => {
      if (draft.id && c.inventory.some((i) => i.id === draft.id)) {
        return { ...c, inventory: c.inventory.map((i) => (i.id === draft.id ? { ...i, name: draft.name, forge: clean } : i)) };
      }
      return {
        ...c,
        inventory: [...c.inventory, { id: uid(), ref: draft.ref || undefined, variant: draft.variant, magicBonus: draft.magicBonus, name: draft.name, qty: 1, equipped: false, attuned: false, forge: clean }],
      };
    });
    setDraft(null);
    onDone();
  };

  const toggleProp = (code: string) => {
    const cur = [...props];
    set({ properties: cur.includes(code) ? cur.filter((p) => p !== code) : [...cur, code] });
  };

  return (
    <section className="forge-form">
      <h3>
        Forging: {draft.name || (f.scratch ? "a new item" : base?.name)}{" "}
        <span className="small muted">{f.scratch ? "from scratch" : `based on ${base?.name}`}</span>
      </h3>

      {f.scratch && (
        <div className="form-grid" style={{ marginBottom: 10 }}>
          <label>
            Type
            <select
              value={f.scratch.kind}
              onChange={(e) => {
                const kind = e.target.value as ScratchBase["kind"];
                // Switching type clears the weapon/armor numbers of the old type.
                set({ scratch: { kind, category: isWeaponKind(kind) ? f.scratch!.category ?? "simple" : undefined }, dmg1: undefined, dmg2: undefined, dmgType: undefined, range: undefined, properties: undefined, ac: undefined });
              }}
            >
              {SCRATCH_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          {isWeaponKind(f.scratch.kind) && (
            <label>
              Weapon category
              <select value={f.scratch.category ?? "simple"} onChange={(e) => set({ scratch: { ...f.scratch!, category: e.target.value as "simple" | "martial" } })}>
                <option value="simple">Simple</option>
                <option value="martial">Martial</option>
              </select>
            </label>
          )}
        </div>
      )}

      <div className="form-grid">
        <label>
          Name
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label>
          Rarity
          <select value={f.rarity ?? result?.rarity ?? ""} onChange={(e) => set({ rarity: e.target.value || undefined })}>
            <option value="">—</option>
            {RARITIES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label>
          Weight (lb.)
          <input type="number" min={0} value={f.weight ?? base?.weight ?? ""} onChange={(e) => set({ weight: num(e.target.value) })} />
        </label>
        <label className="check">
          <span>
            <input type="checkbox" checked={!!result?.reqAttune} onChange={(e) => set({ attunement: e.target.checked })} /> Requires attunement
          </span>
        </label>
      </div>

      {weapon && (
        <>
          <h4 className="sheet-h">Weapon</h4>
          <div className="form-grid">
            <label>
              Damage dice
              <input value={f.dmg1 ?? ""} placeholder={base?.dmg1} onChange={(e) => set({ dmg1: e.target.value.trim() || undefined })} />
            </label>
            <label>
              Damage type
              <select value={f.dmgType ?? base?.dmgType ?? ""} onChange={(e) => set({ dmgType: e.target.value || undefined })}>
                {DAMAGE.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </label>
            <label>
              Two-handed dice (versatile)
              <input value={f.dmg2 ?? ""} placeholder={base?.dmg2 ?? "—"} onChange={(e) => set({ dmg2: e.target.value.trim() || undefined })} />
            </label>
            <label>
              Range (ft.)
              <input value={f.range ?? ""} placeholder={base?.range ?? "melee"} onChange={(e) => set({ range: e.target.value.trim() || undefined })} />
            </label>
            <label>
              Bonus to attack rolls
              <input type="number" value={f.attackBonus ?? ""} placeholder="0" onChange={(e) => set({ attackBonus: num(e.target.value) })} />
            </label>
            <label>
              Bonus to damage rolls
              <input type="number" value={f.damageBonus ?? ""} placeholder="0" onChange={(e) => set({ damageBonus: num(e.target.value) })} />
            </label>
          </div>
          <div className="choice-chips" style={{ marginTop: 8 }}>
            {PROPS.map(([code, label]) => (
              <button key={code} className={`choice-btn ${props.has(code) ? "on-chip" : ""}`} aria-pressed={props.has(code)} onClick={() => toggleProp(code)}>
                {props.has(code) ? "✓ " : ""}
                {label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="small muted">Extra damage on a hit</span>
            {(f.extraDamage ?? []).map((x, i) => (
              <div key={i} className="row small" style={{ marginTop: 4 }}>
                <input className="hp-roll" value={x.dice} placeholder="1d6" onChange={(e) => set({ extraDamage: (f.extraDamage ?? []).map((y, j) => (j === i ? { ...y, dice: e.target.value } : y)) })} />
                <select value={x.type} onChange={(e) => set({ extraDamage: (f.extraDamage ?? []).map((y, j) => (j === i ? { ...y, type: e.target.value } : y)) })}>
                  {DAMAGE.map(([, n]) => <option key={n}>{n}</option>)}
                </select>
                <button className="ghost" aria-label="Remove extra damage" onClick={() => set({ extraDamage: (f.extraDamage ?? []).filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button className="small" style={{ marginLeft: 8 }} onClick={() => set({ extraDamage: [...(f.extraDamage ?? []), { dice: "1d6", type: "fire" }] })}>
              + extra damage
            </button>
          </div>
        </>
      )}

      {armor && (
        <>
          <h4 className="sheet-h">{armorKind(base) === "shield" ? "Shield" : "Armor"}</h4>
          <div className="form-grid">
            <label>
              {armorKind(base) === "shield" ? "Shield AC" : "Base AC"}
              <input type="number" value={f.ac ?? ""} placeholder={String(base?.ac ?? "")} onChange={(e) => set({ ac: num(e.target.value) })} />
            </label>
            <label>
              Bonus to AC
              <input type="number" value={f.acBonus ?? ""} placeholder="0" onChange={(e) => set({ acBonus: num(e.target.value) })} />
            </label>
          </div>
        </>
      )}

      <h4 className="sheet-h">Magic</h4>
      <div className="form-grid">
        {!armor && (
          <label>
            Bonus to AC
            <input type="number" value={f.acBonus ?? ""} placeholder="0" onChange={(e) => set({ acBonus: num(e.target.value) })} />
          </label>
        )}
        <label>
          Bonus to saving throws
          <input type="number" value={f.saveBonus ?? ""} placeholder="0" onChange={(e) => set({ saveBonus: num(e.target.value) })} />
        </label>
        <label>
          Sets an ability score
          <span className="row">
            <select
              value={Object.keys(f.abilitySet ?? {})[0] ?? ""}
              onChange={(e) => set({ abilitySet: e.target.value ? { [e.target.value]: Object.values(f.abilitySet ?? {})[0] ?? 19 } : undefined })}
            >
              <option value="">—</option>
              {ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]}</option>)}
            </select>
            {Object.keys(f.abilitySet ?? {})[0] && (
              <input
                type="number"
                className="hp-roll"
                value={Object.values(f.abilitySet ?? {})[0] ?? 19}
                onChange={(e) => set({ abilitySet: { [Object.keys(f.abilitySet!)[0] as Ability]: Number(e.target.value) || 0 } })}
              />
            )}
          </span>
        </label>
      </div>
      <div className="choice-chips" style={{ marginTop: 8 }}>
        <span className="small muted">Resistance:</span>
        {DAMAGE.map(([, n]) => {
          const on = (f.resist ?? []).includes(n);
          return (
            <button key={n} className={`choice-btn ${on ? "on-chip" : ""}`} aria-pressed={on} onClick={() => set({ resist: on ? (f.resist ?? []).filter((x) => x !== n) : [...(f.resist ?? []), n] })}>
              {on ? "✓ " : ""}
              {n}
            </button>
          );
        })}
      </div>

      <h4 className="sheet-h">Charges</h4>
      <div className="row small" style={{ flexWrap: "wrap" }}>
        <label className="row">
          Charges
          <input
            className="hp-roll"
            type="number"
            min={0}
            value={f.charges ?? ""}
            placeholder={result?.charges != null ? String(result.charges) : "none"}
            onChange={(e) => set({ charges: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        <label className="row">
          Gets them back
          <select value={f.recharge ?? ""} onChange={(e) => set({ recharge: (e.target.value || undefined) as typeof f.recharge })}>
            <option value="">{result?.recharge ? "as the item says" : "never"}</option>
            <option value="dawn">at dawn</option>
            <option value="dusk">at dusk</option>
            <option value="long">on a long rest</option>
            <option value="short">on a short rest</option>
          </select>
        </label>
        <label className="row">
          How many
          <input className="hp-roll" style={{ width: 90 }} value={f.regain ?? ""} placeholder="all, or 1d6+1" onChange={(e) => set({ regain: e.target.value.trim() || undefined })} />
        </label>
      </div>
      <p className="small muted">A spell below with a note like "2 charges" spends charges; "1/day" is cast once a day. Both show in the Inventory.</p>

      <h4 className="sheet-h">Spells</h4>
      {(f.spells ?? []).map((s, i) => (
        <div key={`${s.ref}-${i}`} className="row small spell-row">
          <span className="lk lk-spell grow" data-5e="spell" data-name={s.ref.split("|")[0]} data-source={s.ref.split("|")[1]}>
            {s.ref.split("|")[0]}
          </span>
          <input value={s.note} onChange={(e) => set({ spells: (f.spells ?? []).map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} aria-label="How often" />
          <button className="ghost" aria-label="Remove spell" onClick={() => set({ spells: (f.spells ?? []).filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <div style={{ minWidth: 240 }}>
          <SearchSelect options={spellOptions} value={spellPick} placeholder="Add a spell the item can cast" onChange={setSpellPick} />
        </div>
        <input className="hp-roll" style={{ width: 120 }} value={spellNote} onChange={(e) => setSpellNote(e.target.value)} aria-label="How often" placeholder="1/day" />
        <button
          disabled={!spellPick}
          onClick={() => {
            set({ spells: [...(f.spells ?? []), { ref: spellPick!, note: spellNote.trim() || "1/day" }] });
            setSpellPick(undefined);
          }}
        >
          Add spell
        </button>
      </div>

      <h4 className="sheet-h">Features</h4>
      {(f.features ?? []).map((x, i) => (
        <div key={i} className="forge-feature">
          <div className="row">
            <input className="grow" value={x.name} placeholder="Feature name, e.g. Frost Brand" onChange={(e) => set({ features: (f.features ?? []).map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) })} />
            <button className="ghost" aria-label="Remove feature" onClick={() => set({ features: (f.features ?? []).filter((_, j) => j !== i) })}>✕</button>
          </div>
          <textarea rows={3} value={x.text} placeholder="What it does. You can use 5e.tools tags like {@damage 2d6} or {@condition frightened}." onChange={(e) => set({ features: (f.features ?? []).map((y, j) => (j === i ? { ...y, text: e.target.value } : y)) })} />
        </div>
      ))}
      <button className="small" onClick={() => set({ features: [...(f.features ?? []), { name: "", text: "" }] })}>+ feature</button>

      <h4 className="sheet-h">Description</h4>
      <textarea rows={3} style={{ width: "100%" }} value={f.description ?? ""} placeholder="Looks, history, quirks…" onChange={(e) => set({ description: e.target.value || undefined })} />

      <div className="forge-preview">
        <b>On your sheet</b>{" "}
        {preview.attack ? (
          <span>
            {preview.attack.name}: {preview.attack.toHit != null && <>{preview.attack.toHit >= 0 ? "+" : ""}{preview.attack.toHit} to hit, </>}
            {preview.attack.damage} {preview.attack.damageType}
            {preview.attack.extraDamage?.map((x) => ` + ${x.dice} ${x.type}`).join("")}
            {preview.attack.versatile ? ` (two-handed ${preview.attack.versatile})` : ""}
          </span>
        ) : (
          <span>AC {preview.ac} when equipped</span>
        )}
        <span className="small muted"> (as if equipped and attuned)</span>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={!draft.name.trim()} onClick={save}>
          {draft.id ? "Save changes" : homebrew ? "Save homebrew item" : "Add to inventory"}
        </button>
        <button onClick={() => setDraft({ ...draft, forge: {} })}>Reset changes</button>
        <button onClick={() => setDraft(null)}>Cancel</button>
      </div>
    </section>
  );
}
