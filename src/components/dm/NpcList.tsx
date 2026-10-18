// Named NPCs: who they are, where to find them, how they feel about the party,
// a stat block (from the bestiary or homemade) and their note.

import { useMemo, useState } from "react";
import { blankStats, combatantFromStats, companionFrom, companionRow, loadEncounter, saveEncounter, statsFromCreature, uid, uniqueName } from "../../lib/combat.ts";
import type { Attitude, Npc } from "../../lib/dm.ts";
import { createNote, writeNote } from "../../lib/store.ts";
import { CombatRow } from "../CombatView.tsx";
import SearchSelect from "../character/SearchSelect.tsx";
import { makeNames, NAME_SPECIES } from "../../lib/names.ts";
import type { DmChildProps } from "./DmView.tsx";

const ATTITUDES: [Attitude, string][] = [
  ["friendly", "Friendly"],
  ["indifferent", "Indifferent"],
  ["hostile", "Hostile"],
];

export default function NpcList({ dm, change, data, notes, campaign, onRoll, onOpenNote, onNotesChanged }: DmChildProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [species, setSpecies] = useState("Human");
  const [ideas, setIdeas] = useState<string[]>([]);
  const creatures = useMemo(
    () =>
      data.index
        .entries()
        .filter((e) => e.kind === "creature")
        .map((e) => ({ value: `${e.name}|${e.source}`, label: e.name, hint: `CR ${typeof e.raw.cr === "string" ? e.raw.cr : e.raw.cr?.cr ?? "?"} · ${e.source}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );

  const setNpcs = (fn: (l: Npc[]) => Npc[]) => change((d) => ({ ...d, npcs: fn(d.npcs) }));
  const setNpc = (id: string, patch: Partial<Npc>) => setNpcs((l) => l.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const names = dm.npcs.map((n) => n.name);
  const add = (n: Npc) => {
    setNpcs((l) => [n, ...l]);
    setOpen(n.id);
  };
  const fromBestiary = (ref: string) => {
    const [name, source] = ref.split("|");
    const e = data.find("creature", name, source);
    if (!e) return;
    const stats = statsFromCreature(e.raw);
    add({ id: uid(), name: uniqueName(names, e.name), kind: "ally", initMod: Math.floor((stats.abilities.dex - 10) / 2), ac: stats.ac, hp: stats.hpMax, hpMax: stats.hpMax, tempHp: 0, conditions: [], stats, attitude: "indifferent" });
  };
  const blank = () => {
    const stats = blankStats();
    add({ id: uid(), name: uniqueName(names, "New NPC"), kind: "ally", initMod: 0, ac: stats.ac, hp: stats.hpMax, hpMax: stats.hpMax, tempHp: 0, conditions: [], stats, attitude: "indifferent" });
  };
  const makeNote = async (n: Npc) => {
    const file = await createNote(campaign, n.name || "NPC");
    await writeNote(campaign, file, [`# ${n.name}`, "", n.description ?? "", "", n.location ? `**Where:** ${n.location}` : ""].join("\n").trim() + "\n");
    setNpc(n.id, { note: file });
    await onNotesChanged();
  };
  const toFight = async (n: Npc) => {
    const fight = await loadEncounter(campaign);
    const c = combatantFromStats(structuredClone(n.stats ?? blankStats()), uniqueName(fight.combatants.map((x) => x.name), n.name), n.attitude === "hostile" ? "npc" : "ally");
    await saveEncounter(campaign, { ...fight, combatants: [...fight.combatants, { ...c, hp: n.hp, hpMax: n.hpMax, ac: n.ac, conditions: [...n.conditions] }] });
    setMsg(`${n.name} joined the combat tracker.`);
  };

  const q = filter.trim().toLowerCase();
  const shown = dm.npcs.filter((n) => !q || [n.name, n.location, n.description].some((x) => x?.toLowerCase().includes(q)));
  const places = [...new Set(dm.npcs.map((n) => n.location?.trim()).filter(Boolean))] as string[];

  return (
    <div className="companions dm-npcs">
      <section className="combat-add">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="small" onClick={blank}>
            + New NPC
          </button>
          <div className="grow" style={{ minWidth: 220 }}>
            <SearchSelect options={creatures} placeholder="Or start from a bestiary creature (Noble, Guard, Mage…)" onChange={fromBestiary} />
          </div>
          <input type="search" placeholder="Find by name or place" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find NPC" />
        </div>
      </section>
      <div className="row small name-ideas" style={{ flexWrap: "wrap" }}>
        <span className="muted">Need a name?</span>
        <select value={species} onChange={(e) => (setSpecies(e.target.value), setIdeas(makeNames(e.target.value)))} aria-label="Species">
          {NAME_SPECIES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className="small" onClick={() => setIdeas(makeNames(species))}>
          🎲 Names
        </button>
        {ideas.map((n) => (
          <button
            key={n}
            className="pill small"
            title="Make an NPC with this name"
            onClick={() => {
              const stats = blankStats();
              add({ id: uid(), name: uniqueName(names, n), kind: "ally", initMod: 0, ac: stats.ac, hp: stats.hpMax, hpMax: stats.hpMax, tempHp: 0, conditions: [], stats, attitude: "indifferent", description: species === "Human" ? undefined : species });
              setIdeas((l) => l.filter((x) => x !== n));
            }}
          >
            + {n}
          </button>
        ))}
      </div>
      {msg && <p className="small ok">{msg}</p>}
      {!dm.npcs.length && <p className="muted pad">No NPCs yet. Add the people your party meets: a description, where they are, how they feel about the party, and stats if it comes to a fight.</p>}
      <datalist id="npc-places">
        {places.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <ol className="combat-list">
        {shown.map((n) => (
          <div key={n.id} className={`npc att-${n.attitude ?? "indifferent"}`}>
            <CombatRow
              c={companionRow(n)}
              isTurn={false}
              hideInit
              open={open === n.id}
              characters={[]}
              onToggle={() => setOpen(open === n.id ? null : n.id)}
              onChange={(fn) => setNpcs((l) => l.map((x) => (x.id === n.id ? { ...x, ...companionFrom(fn(companionRow(x)), x.kind) } : x)))}
              onRollInit={() => {}}
              onRemove={() => setNpcs((l) => l.filter((x) => x.id !== n.id))}
              onDuplicate={() => setNpcs((l) => [...l, { ...structuredClone(n), id: uid(), name: uniqueName(l.map((x) => x.name), n.name.replace(/\s+\d+$/, "")), note: undefined }])}
              onOpenCharacter={() => {}}
              roll={onRoll}
              extra={
                <button className="small" onClick={() => void toFight(n)} title="Add to the combat tracker">
                  ⚔ Combat
                </button>
              }
            />
            <div className="npc-details small">
              <select value={n.attitude ?? "indifferent"} onChange={(e) => setNpc(n.id, { attitude: e.target.value as Attitude })} aria-label="Attitude">
                {ATTITUDES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <input list="npc-places" placeholder="Where they are" value={n.location ?? ""} onChange={(e) => setNpc(n.id, { location: e.target.value || undefined })} aria-label="Location" />
              <select value={n.note ?? ""} onChange={(e) => setNpc(n.id, { note: e.target.value || undefined })} aria-label="Their note">
                <option value="">No note linked</option>
                {notes.map((x) => (
                  <option key={x.file} value={x.file}>
                    {x.title}
                  </option>
                ))}
              </select>
              {n.note ? (
                <button className="small" onClick={() => onOpenNote(n.note!)}>
                  Open note
                </button>
              ) : (
                <button className="small" onClick={() => void makeNote(n)}>
                  Make a note
                </button>
              )}
              <textarea rows={2} placeholder="Who they are: looks, manner, what they want, secrets…" value={n.description ?? ""} onChange={(e) => setNpc(n.id, { description: e.target.value || undefined })} />
            </div>
          </div>
        ))}
      </ol>
    </div>
  );
}
