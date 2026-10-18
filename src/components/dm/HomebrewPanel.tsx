// Homebrew: the Spell Maker, the Creature Builder and the Item Builder.
// Everything made here is saved for the whole app (every campaign) and shows
// up with the "Homebrew" source: spells in class lists, creatures in the
// bestiary and items in every item search.

import { useMemo, useState } from "react";
import { blankStats, statsFromCreature, uid, type Combatant, type StatBlock } from "../../lib/combat.ts";
import { itemCard } from "../../lib/character/itemcard.ts";
import { itemData } from "../../lib/character/items.ts";
import { newCharacter } from "../../lib/character/storage.ts";
import type { Character, InventoryItem } from "../../lib/character/types.ts";
import { CR_XP, crOf } from "../../lib/dm.ts";
import { creatureEntry, itemDataFor, itemEntry, type HomebrewCreature, type HomebrewItem } from "../../lib/homebrew-more.ts";
import { StatBlockView } from "../CombatView.tsx";
import { EntryCard } from "../EntryCard.tsx";
import { useHomebrew } from "../HomebrewContext.tsx";
import ForgeTab from "../character/ForgeTab.tsx";
import SearchSelect from "../character/SearchSelect.tsx";
import SpellMaker from "../character/SpellMaker.tsx";
import type { DmChildProps } from "./DmView.tsx";

type Tab = "spells" | "creatures" | "items";
const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
const CRS = Object.keys(CR_XP);

export default function HomebrewPanel(props: DmChildProps) {
  const [tab, setTab] = useState<Tab>("creatures");
  const { spells, creatures, items } = useHomebrew();
  return (
    <div className="dm-homebrew">
      <div className="seg dm-seg" role="tablist" aria-label="Homebrew">
        {(
          [
            ["spells", `Spells (${spells.length})`],
            ["creatures", `Creatures (${creatures.length})`],
            ["items", `Items (${items.length})`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      <p className="small muted">Saved for every campaign, marked "Homebrew". They show up wherever the real ones do: spell lists, the bestiary, item searches, cards and note links.</p>
      {tab === "spells" && <SpellMaker data={props.data} defaultClasses={[]} />}
      {tab === "creatures" && <CreatureBuilder {...props} />}
      {tab === "items" && <ItemBuilder {...props} />}
    </div>
  );
}

// ---------- creatures ----------

const skillsText = (s: Record<string, number>) => Object.entries(s).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`).join(", ");
function parseSkills(t: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of t.split(",")) {
    const m = part.trim().match(/^([a-z ]+?)\s*([+-]?\d+)$/i);
    if (m) out[m[1].trim().toLowerCase()] = Number(m[2]);
  }
  return out;
}

function CreatureBuilder({ data, onRoll }: DmChildProps) {
  const { creatures, saveCreatures } = useHomebrew();
  const [draft, setDraft] = useState<HomebrewCreature | null>(null);
  const [skills, setSkills] = useState("");
  const [error, setError] = useState("");
  const bestiary = useMemo(
    () =>
      data.index
        .entries()
        .filter((e) => e.kind === "creature" && e.source !== "Homebrew")
        .map((e) => ({ value: `${e.name}|${e.source}`, label: e.name, hint: `CR ${crOf(e.raw)} · ${e.source}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );
  const open = (c: HomebrewCreature) => {
    setDraft(structuredClone(c));
    setSkills(skillsText(c.stats.skills));
    setError("");
  };
  const fresh = () => open({ id: uid(), name: "", stats: { ...blankStats(), size: "Medium", type: "humanoid", cr: "1" } });
  const fromBestiary = (ref: string) => {
    const [name, source] = ref.split("|");
    const e = data.find("creature", name, source);
    if (e) open({ id: uid(), name: `${e.name} (homebrew)`, stats: { ...statsFromCreature(e.raw), ref: undefined } });
  };
  const setStats = (patch: Partial<StatBlock>) => draft && setDraft({ ...draft, stats: { ...draft.stats, ...patch } });
  const preview = useMemo(() => (draft ? creatureEntry(draft) : null), [draft]);
  const taken = draft && creatures.some((c) => c.id !== draft.id && c.name.trim().toLowerCase() === draft.name.trim().toLowerCase());

  const save = async () => {
    if (!draft) return;
    try {
      const clean = { ...draft, name: draft.name.trim() || "Unnamed creature", stats: { ...draft.stats, skills: parseSkills(skills) } };
      await saveCreatures(creatures.some((c) => c.id === clean.id) ? creatures.map((c) => (c.id === clean.id ? clean : c)) : [...creatures, clean]);
      setDraft(null);
    } catch (e) {
      setError(`Couldn't save: ${(e as Error)?.message ?? e}`);
    }
  };

  // The stat block editor works on a fight row; this one only holds the stats.
  const s = draft?.stats;
  const row: Combatant | null = draft && s ? { id: draft.id, name: draft.name || "Creature", kind: "npc", init: null, initMod: 0, ac: s.ac, hp: s.hpMax, hpMax: s.hpMax, conditions: [], stats: s } : null;

  return (
    <section>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {creatures.map((c) => (
          <span key={c.id} className="row hb-chip">
            <button className={draft?.id === c.id ? "primary" : ""} onClick={() => open(c)}>
              {c.name}
            </button>
            <button className="ghost small" aria-label={`Delete ${c.name}`} onClick={() => void saveCreatures(creatures.filter((x) => x.id !== c.id)).then(() => draft?.id === c.id && setDraft(null))}>
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="row" style={{ flexWrap: "wrap", marginTop: 8 }}>
        <button className="primary" onClick={fresh}>
          + New creature
        </button>
        <div className="grow" style={{ minWidth: 240 }}>
          <SearchSelect options={bestiary} placeholder="Or start from a bestiary creature" onChange={fromBestiary} />
        </div>
      </div>
      {draft && s && row && (
        <div className="spell-maker-body">
          <div className="spell-maker-form">
            <div className="form-grid">
              <label>
                Name
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Ashen Wolf" />
              </label>
              <label>
                Size
                <select value={s.size ?? "Medium"} onChange={(e) => setStats({ size: e.target.value })}>
                  {SIZES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <input value={s.type ?? ""} onChange={(e) => setStats({ type: e.target.value })} placeholder="beast, undead, humanoid…" />
              </label>
              <label>
                Alignment
                <input value={draft.alignment ?? ""} onChange={(e) => setDraft({ ...draft, alignment: e.target.value || undefined })} placeholder="neutral evil" />
              </label>
              <label>
                Challenge
                <select value={s.cr ?? "1"} onChange={(e) => setStats({ cr: e.target.value })}>
                  {CRS.map((c) => (
                    <option key={c} value={c}>
                      CR {c} ({CR_XP[c].toLocaleString()} XP)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                AC
                <input type="number" value={s.ac} onChange={(e) => setStats({ ac: Number(e.target.value) || 0 })} />
              </label>
              <label>
                AC from
                <input value={s.acNote ?? ""} onChange={(e) => setStats({ acNote: e.target.value || undefined })} placeholder="natural armor" />
              </label>
              <label>
                Hit points
                <input type="number" value={s.hpMax} onChange={(e) => setStats({ hpMax: Math.max(1, Number(e.target.value) || 1) })} />
              </label>
              <label>
                HP dice
                <input value={s.hpFormula ?? ""} onChange={(e) => setStats({ hpFormula: e.target.value.replace(/\s+/g, "") || undefined })} placeholder="4d8+4" />
              </label>
              <label>
                Speed
                <input value={s.speed} onChange={(e) => setStats({ speed: e.target.value })} placeholder="30 ft., fly 60 ft." />
              </label>
              <label>
                Senses
                <input value={s.senses ?? ""} onChange={(e) => setStats({ senses: e.target.value || undefined })} placeholder="darkvision 60 ft." />
              </label>
              <label>
                Languages
                <input value={s.languages ?? ""} onChange={(e) => setStats({ languages: e.target.value || undefined })} placeholder="Common, Draconic" />
              </label>
              <label>
                Skills
                <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="perception +4, stealth +6" />
              </label>
            </div>
            <StatBlockView builder c={row} stats={s} onChange={(stats) => setStats(stats)} onChangeC={(fn) => setStats(fn(row).stats ?? s)} roll={onRoll} />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="primary" disabled={!!taken} onClick={() => void save()}>
                {creatures.some((c) => c.id === draft.id) ? "Save changes" : "Save creature"}
              </button>
              <button onClick={() => setDraft(null)}>Cancel</button>
              {taken && <span className="small error">You already have a homebrew creature with that name.</span>}
              {error && <span className="small error">{error}</span>}
            </div>
          </div>
          {preview && (
            <div className="spell-maker-preview card k-creature">
              <EntryCard entry={preview} data={data} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- items ----------

/** The Item Forge, on a stand-in character whose "inventory" is the homebrew items. */
function ItemBuilder({ data, getRules }: DmChildProps) {
  const { items, saveItems } = useHomebrew();
  const rules = useMemo(() => getRules(), [getRules]);
  const [editId, setEditId] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const [error, setError] = useState("");
  const stand = useMemo<Character>(() => ({ ...newCharacter("Item Builder"), inventory: items.map((h) => h.inv) }), [items]);
  const toHomebrew = (inv: InventoryItem): HomebrewItem => {
    const raw = itemData(rules, inv) ?? { name: inv.name, source: "Homebrew", entries: [] };
    const variant = inv.variant ? rules.magicVariants.find((m) => m.name === inv.variant) : undefined;
    const entries = itemCard(inv, raw, variant).raw.entries;
    return { id: inv.id, inv, raw: itemDataFor(inv, raw, entries) };
  };
  const update = (fn: (c: Character) => Character) => {
    const next = fn(stand);
    saveItems(next.inventory.map(toHomebrew)).catch((e) => setError(`Couldn't save: ${(e as Error)?.message ?? e}`));
  };
  const [preview, setPreview] = useState<string | null>(null);
  const shown = items.find((h) => h.id === preview);

  return (
    <section>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {items.map((h) => (
          <span key={h.id} className="row hb-chip">
            <button className={editId === h.id ? "primary" : ""} onClick={() => (setEditId(h.id), setN((x) => x + 1), setPreview(h.id))}>
              {h.raw.name}
            </button>
            <button className="ghost small" aria-label={`Delete ${h.raw.name}`} onClick={() => void saveItems(items.filter((x) => x.id !== h.id)).then(() => editId === h.id && setEditId(null))}>
              ✕
            </button>
          </span>
        ))}
        {editId && (
          <button className="small" onClick={() => (setEditId(null), setN((x) => x + 1), setPreview(null))}>
            + New item
          </button>
        )}
      </div>
      {error && <p className="error small">{error}</p>}
      {shown && (
        <div className="card k-item hb-item-card">
          <EntryCard entry={itemEntry(shown)} data={data} />
        </div>
      )}
      <ForgeTab
        key={`${editId ?? "new"}-${n}`}
        ch={stand}
        rules={rules}
        update={update}
        editId={editId}
        homebrew
        onDone={() => {
          setEditId(null);
          setN((x) => x + 1);
        }}
      />
    </section>
  );
}
