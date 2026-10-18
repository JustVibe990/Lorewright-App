// The Spell Maker: make your own spells. They join the spell lists of the
// classes you pick, link in notes, and cast like any other spell.

import { useMemo, useState } from "react";
import type { DataStore } from "../../lib/data.ts";
import { blankSpell, spellEntry, type HomebrewSpell } from "../../lib/homebrew.ts";
import { EntryCard } from "../EntryCard.tsx";
import { useHomebrew } from "../HomebrewContext.tsx";

const LEVELS = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const SCHOOLS: [string, string][] = [["A", "Abjuration"], ["C", "Conjuration"], ["D", "Divination"], ["E", "Enchantment"], ["V", "Evocation"], ["I", "Illusion"], ["N", "Necromancy"], ["T", "Transmutation"]];
const CLASSES = ["Artificer", "Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard"];
const SAVES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
const DAMAGE = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function SpellMaker({ data, defaultClasses, onClose }: { data: DataStore; defaultClasses: string[]; onClose?: () => void }) {
  const { spells, saveSpells } = useHomebrew();
  const [draft, setDraft] = useState<HomebrewSpell | null>(null);
  const [error, setError] = useState("");
  const set = (patch: Partial<HomebrewSpell>) => draft && setDraft({ ...draft, ...patch });
  const preview = useMemo(() => (draft ? spellEntry(draft) : null), [draft]);
  const taken = draft && spells.some((s) => s.id !== draft.id && s.name.trim().toLowerCase() === draft.name.trim().toLowerCase());

  const save = async () => {
    if (!draft) return;
    try {
      const list = spells.some((s) => s.id === draft.id) ? spells.map((s) => (s.id === draft.id ? draft : s)) : [...spells, draft];
      await saveSpells(list);
      setDraft(null);
      setError("");
    } catch (e) {
      setError(`Couldn't save: ${(e as Error)?.message ?? e}`);
    }
  };
  const remove = async (id: string) => {
    await saveSpells(spells.filter((s) => s.id !== id));
    if (draft?.id === id) setDraft(null);
  };

  return (
    <section className="spell-maker">
      <div className="row">
        <h3 className="grow">Spell Maker</h3>
        {onClose && (
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <p className="small muted">Your spells join the spell lists of the classes you tick (marked “Homebrew”), link in notes, and cast with slots, rolls and concentration.</p>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {spells.map((s) => (
          <span key={s.id} className="pill">
            <button className="link small" onClick={() => setDraft(structuredClone(s))}>
              {s.name || "Unnamed"}
            </button>{" "}
            <span className="muted small">{LEVELS[s.level]}</span>{" "}
            <button className="ghost small" aria-label={`Delete ${s.name}`} title="Delete this spell" onClick={() => void remove(s.id)}>
              ✕
            </button>
          </span>
        ))}
        <button className={draft && !spells.some((s) => s.id === draft.id) ? "primary small" : "small"} onClick={() => setDraft({ ...blankSpell(uid()), classes: defaultClasses })}>
          + New spell
        </button>
      </div>

      {draft && preview && (
        <div className="spell-maker-body">
          <div className="spell-maker-form">
            <div className="form-grid">
              <label>
                Name
                <input value={draft.name} placeholder="Thunder Lance" onChange={(e) => set({ name: e.target.value })} />
                {taken && <span className="error small">You already have a spell with this name.</span>}
              </label>
              <label>
                Level
                <select value={draft.level} onChange={(e) => set({ level: Number(e.target.value) })}>
                  {LEVELS.map((l, i) => (
                    <option key={l} value={i}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                School
                <select value={draft.school} onChange={(e) => set({ school: e.target.value })}>
                  {SCHOOLS.map(([c, n]) => (
                    <option key={c} value={c}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Casting time
                <span className="row">
                  <input type="number" min={1} className="sb-num" value={draft.time.number} onChange={(e) => set({ time: { ...draft.time, number: Math.max(1, Number(e.target.value) || 1) } })} />
                  <select value={draft.time.unit} onChange={(e) => set({ time: { ...draft.time, unit: e.target.value as HomebrewSpell["time"]["unit"] } })}>
                    <option value="action">action</option>
                    <option value="bonus">bonus action</option>
                    <option value="reaction">reaction</option>
                    <option value="minute">minute</option>
                    <option value="hour">hour</option>
                  </select>
                </span>
              </label>
              <label>
                Range
                <span className="row">
                  <select value={draft.range.kind} onChange={(e) => set({ range: { ...draft.range, kind: e.target.value as HomebrewSpell["range"]["kind"] } })}>
                    <option value="feet">feet</option>
                    <option value="self">Self</option>
                    <option value="touch">Touch</option>
                    <option value="sight">Sight</option>
                    <option value="unlimited">Unlimited</option>
                  </select>
                  {draft.range.kind === "feet" && <input type="number" min={5} step={5} className="sb-num" value={draft.range.feet ?? 30} onChange={(e) => set({ range: { ...draft.range, feet: Number(e.target.value) || 5 } })} />}
                </span>
              </label>
              <label>
                Duration
                <span className="row">
                  <select value={draft.duration.kind} onChange={(e) => set({ duration: { ...draft.duration, kind: e.target.value as HomebrewSpell["duration"]["kind"] } })}>
                    <option value="instant">Instantaneous</option>
                    <option value="round">rounds</option>
                    <option value="minute">minutes</option>
                    <option value="hour">hours</option>
                    <option value="day">days</option>
                    <option value="permanent">Until dispelled</option>
                  </select>
                  {!["instant", "permanent"].includes(draft.duration.kind) && (
                    <input type="number" min={1} className="sb-num" value={draft.duration.amount ?? 1} onChange={(e) => set({ duration: { ...draft.duration, amount: Math.max(1, Number(e.target.value) || 1) } })} />
                  )}
                </span>
              </label>
            </div>

            <div className="row small" style={{ flexWrap: "wrap", marginTop: 8 }}>
              <label className="row">
                <input type="checkbox" checked={draft.components.v} onChange={(e) => set({ components: { ...draft.components, v: e.target.checked } })} /> V
              </label>
              <label className="row">
                <input type="checkbox" checked={draft.components.s} onChange={(e) => set({ components: { ...draft.components, s: e.target.checked } })} /> S
              </label>
              <input className="grow" value={draft.components.m ?? ""} placeholder="Material (leave empty for none)" onChange={(e) => set({ components: { ...draft.components, m: e.target.value } })} />
              <label className="row">
                <input
                  type="checkbox"
                  checked={draft.duration.concentration}
                  disabled={["instant", "permanent"].includes(draft.duration.kind)}
                  onChange={(e) => set({ duration: { ...draft.duration, concentration: e.target.checked } })}
                />{" "}
                Concentration
              </label>
              <label className="row">
                <input type="checkbox" checked={draft.ritual} onChange={(e) => set({ ritual: e.target.checked })} /> Ritual
              </label>
            </div>

            <h4 className="sheet-h">Effect</h4>
            <div className="form-grid">
              <label>
                Attack or save
                <select
                  value={draft.attack ? `atk:${draft.attack}` : draft.save ? `save:${draft.save}` : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    set({ attack: v.startsWith("atk:") ? (v.slice(4) as "melee" | "ranged") : undefined, save: v.startsWith("save:") ? (v.slice(5) as HomebrewSpell["save"]) : undefined });
                  }}
                >
                  <option value="">Neither (it just happens)</option>
                  <option value="atk:ranged">Ranged spell attack</option>
                  <option value="atk:melee">Melee spell attack</option>
                  {SAVES.map((s) => (
                    <option key={s} value={`save:${s}`}>
                      {cap(s)} saving throw
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rolls
                <select
                  value={draft.effect?.kind ?? ""}
                  onChange={(e) =>
                    set({ effect: e.target.value ? { kind: e.target.value as "damage" | "healing", dice: draft.effect?.dice ?? "2d6", type: e.target.value === "damage" ? draft.effect?.type ?? "fire" : undefined, addMod: draft.effect?.addMod } : undefined })
                  }
                >
                  <option value="">Nothing</option>
                  <option value="damage">Damage</option>
                  <option value="healing">Healing</option>
                </select>
              </label>
              {draft.effect && (
                <>
                  <label>
                    Dice
                    <input value={draft.effect.dice} placeholder="2d6" onChange={(e) => set({ effect: { ...draft.effect!, dice: e.target.value.replace(/\s+/g, "") } })} />
                    {!/^\d*d\d+$/.test(draft.effect.dice) && <span className="error small">Dice like 2d6 or 1d10.</span>}
                  </label>
                  {draft.effect.kind === "damage" && (
                    <label>
                      Damage type
                      <select value={draft.effect.type ?? ""} onChange={(e) => set({ effect: { ...draft.effect!, type: e.target.value } })}>
                        {DAMAGE.map((d) => (
                          <option key={d}>{d}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {draft.level > 0 ? (
                    <label>
                      Extra per slot level above {LEVELS[draft.level]}
                      <input value={draft.upcast ?? ""} placeholder="1d6 (empty: none)" onChange={(e) => set({ upcast: e.target.value.replace(/\s+/g, "") || undefined })} />
                    </label>
                  ) : (
                    <label className="check">
                      <span>
                        <input type="checkbox" checked={!!draft.scales} onChange={(e) => set({ scales: e.target.checked })} /> Grows at 5th, 11th and 17th level
                      </span>
                    </label>
                  )}
                  <label className="check">
                    <span>
                      <input type="checkbox" checked={!!draft.effect.addMod} onChange={(e) => set({ effect: { ...draft.effect!, addMod: e.target.checked } })} /> Add your spellcasting modifier
                    </span>
                  </label>
                </>
              )}
            </div>

            <h4 className="sheet-h">On the spell lists of</h4>
            <div className="choice-chips">
              {CLASSES.map((c) => {
                const on = draft.classes.includes(c);
                return (
                  <button key={c} className={`choice-btn ${on ? "on-chip" : ""}`} aria-pressed={on} onClick={() => set({ classes: on ? draft.classes.filter((x) => x !== c) : [...draft.classes, c] })}>
                    {on ? "✓ " : ""}
                    {c}
                  </button>
                );
              })}
            </div>

            <h4 className="sheet-h">Description</h4>
            <textarea
              rows={5}
              style={{ width: "100%" }}
              value={draft.description}
              placeholder="What the spell does. You can use 5e.tools tags like {@condition frightened} or {@dice 1d4}. The damage or healing line is added for you."
              onChange={(e) => set({ description: e.target.value })}
            />
            {error && <p className="error small">{error}</p>}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="primary" disabled={!draft.name.trim() || !!taken || (!!draft.effect && !/^\d*d\d+$/.test(draft.effect.dice))} onClick={() => void save()}>
                {spells.some((s) => s.id === draft.id) ? "Save changes" : "Save spell"}
              </button>
              <button onClick={() => setDraft(null)}>Cancel</button>
              {!draft.classes.length && <span className="small muted">Tick a class so you can pick it in the Spells tab.</span>}
            </div>
          </div>
          <div className="spell-maker-preview card k-spell">
            <EntryCard entry={preview} data={data} />
          </div>
        </div>
      )}
    </section>
  );
}
