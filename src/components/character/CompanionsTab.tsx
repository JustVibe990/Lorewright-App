// Companions: the summons, familiars, steeds, hirelings and NPCs a character
// controls, each with HP, conditions and a stat block to roll from and edit.
// They're kept on the character's sheet; one in the combat tracker stays in
// step with the sheet both ways.

import { useEffect, useMemo, useState } from "react";
import {
  addCompanionsToFight,
  blankStats,
  companionFrom,
  companionRow,
  loadEncounter,
  statsFromCreature,
  uid,
  uniqueName,
  type Combatant,
  type CombatantKind,
  type Companion,
} from "../../lib/combat.ts";
import type { DataStore } from "../../lib/data.ts";
import type { Character } from "../../lib/character/types.ts";
import { CombatRow } from "../CombatView.tsx";
import SearchSelect from "./SearchSelect.tsx";

type Update = (fn: (c: Character) => Character) => void;

const KINDS: [CombatantKind, string][] = [
  ["summon", "Summon / companion"],
  ["ally", "NPC / hireling"],
];

export default function CompanionsTab({
  ch,
  update,
  data,
  campaign,
  file,
  roll,
}: {
  ch: Character;
  update: Update;
  data: DataStore;
  campaign: string;
  file: string;
  roll: (expr: string, label: string) => unknown;
}) {
  const list = ch.companions ?? [];
  const [kind, setKind] = useState<CombatantKind>("summon");
  const [open, setOpen] = useState<string | null>(null);
  /** Companion ids already in the combat tracker. */
  const [inFight, setInFight] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    loadEncounter(campaign).then((e) => {
      if (live) setInFight(new Set(e.combatants.filter((c) => c.companionOf?.file === file).map((c) => c.companionOf!.id)));
    });
    return () => {
      live = false;
    };
  }, [campaign, file]);

  const creatures = useMemo(
    () =>
      data.index
        .entries()
        .filter((e) => e.kind === "creature")
        .map((e) => ({ value: `${e.name}|${e.source}`, label: e.name, hint: `CR ${typeof e.raw.cr === "string" ? e.raw.cr : e.raw.cr?.cr ?? "?"} · ${e.source}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );

  const setList = (fn: (l: Companion[]) => Companion[]) => update((c) => ({ ...c, companions: fn(c.companions ?? []) }));
  const names = list.map((c) => c.name);
  const add = (comp: Companion) => {
    setList((l) => [...l, comp]);
    setOpen(comp.id);
  };
  const addCreature = (ref: string) => {
    const [name, source] = ref.split("|");
    const e = data.find("creature", name, source);
    if (!e) return;
    const stats = statsFromCreature(e.raw);
    add({ id: uid(), name: uniqueName(names, e.name), kind, initMod: Math.floor((stats.abilities.dex - 10) / 2), ac: stats.ac, hp: stats.hpMax, hpMax: stats.hpMax, tempHp: 0, conditions: [], stats });
  };
  const addCustom = () => {
    const stats = blankStats();
    add({ id: uid(), name: uniqueName(names, kind === "summon" ? "Summon" : "NPC"), kind, initMod: 0, ac: stats.ac, hp: stats.hpMax, hpMax: stats.hpMax, tempHp: 0, conditions: [], stats });
  };
  const toFight = async (comps: Companion[]) => {
    setError("");
    try {
      const e = await addCompanionsToFight(campaign, file, ch.name || "Character", comps);
      setInFight(new Set(e.combatants.filter((c) => c.companionOf?.file === file).map((c) => c.companionOf!.id)));
    } catch (err) {
      setError(`Couldn't add to the fight: ${(err as Error)?.message ?? err}`);
    }
  };
  const notInFight = list.filter((c) => !inFight.has(c.id));

  return (
    <div className="companions">
      <section className="combat-add">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <span className="small muted">Add</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as CombatantKind)} aria-label="Kind">
            {KINDS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <div className="grow" style={{ minWidth: 220 }}>
            <SearchSelect options={creatures} placeholder={creatures.length ? `From the bestiary (${creatures.length})` : "No creatures imported (Settings)"} onChange={addCreature} />
          </div>
          <button className="small" onClick={addCustom} title="A blank stat block you fill in">
            + Custom
          </button>
          {list.length > 0 && (
            <button className="small" disabled={!notInFight.length} onClick={() => void toFight(notInFight)} title="Add every companion to the combat tracker">
              ⚔ All to combat
            </button>
          )}
        </div>
      </section>
      {error && <p className="error small">{error}</p>}
      {!list.length && (
        <p className="muted pad">
          No companions yet. Add a familiar, a steed, a summoned beast or an NPC who follows {ch.name || "this character"} from the bestiary, or make your own. Every stat can be edited, and
          they can join the combat tracker.
        </p>
      )}
      <ol className="combat-list">
        {list.map((comp) => {
          const row: Combatant = companionRow(comp);
          return (
            <CombatRow
              key={comp.id}
              c={row}
              isTurn={false}
              hideInit
              open={open === comp.id}
              characters={[]}
              onToggle={() => setOpen(open === comp.id ? null : comp.id)}
              onChange={(fn) => setList((l) => l.map((x) => (x.id === comp.id ? companionFrom(fn(companionRow(x)), x.kind) : x)))}
              onRollInit={() => {}}
              onRemove={() => setList((l) => l.filter((x) => x.id !== comp.id))}
              onDuplicate={() => setList((l) => [...l, { ...structuredClone(comp), id: uid(), name: uniqueName(l.map((x) => x.name), comp.name.replace(/\s+\d+$/, "")) }])}
              onOpenCharacter={() => {}}
              roll={roll}
              extra={
                <button className="small" disabled={inFight.has(comp.id)} onClick={() => void toFight([comp])} title={inFight.has(comp.id) ? "Already in the combat tracker" : "Add to the combat tracker"}>
                  {inFight.has(comp.id) ? "In combat" : "⚔ Combat"}
                </button>
              }
            />
          );
        })}
      </ol>
      {list.length > 0 && <p className="small muted">In the combat tracker they stay in step with this sheet: damage, healing, conditions and stat changes show up in both.</p>}
    </div>
  );
}
