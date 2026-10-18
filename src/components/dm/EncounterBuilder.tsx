// Plan a fight: pick monsters from the bestiary (homebrew included), choose
// who's in the party, and see the 2014 difficulty (easy to deadly) with the
// XP maths. Then send it to the combat tracker.

import { useMemo, useState } from "react";
import { combatantFromStats, loadEncounter, saveEncounter, statsFromCreature, uid, uniqueName, type Combatant } from "../../lib/combat.ts";
import { computeSheet } from "../../lib/character/engine.ts";
import { crNumber, crOf, crXp, encounterDifficulty, type PlannedEncounter } from "../../lib/dm.ts";
import { addXp, xpEach } from "../../lib/character/xp.ts";
import { listCharacters, saveCharacter } from "../../lib/character/storage.ts";
import SearchSelect from "../character/SearchSelect.tsx";
import type { DmChildProps } from "./DmView.tsx";

const levelOf = (c: { classes: { level: number }[] }) => c.classes.reduce((n, x) => n + x.level, 0);
const RATING_LABEL = { trivial: "Trivial", easy: "Easy", medium: "Medium", hard: "Hard", deadly: "Deadly" };

export default function EncounterBuilder({ dm, change, data, characters, campaign, getRules, onOpenCombat, onCharactersSaved }: DmChildProps) {
  const [openId, setOpenId] = useState<string | null>(dm.encounters[0]?.id ?? null);
  const [sent, setSent] = useState("");
  const enc = dm.encounters.find((e) => e.id === openId) ?? null;
  const creatures = useMemo(
    () =>
      data.index
        .entries()
        .filter((e) => e.kind === "creature")
        .map((e) => {
          const cr = crOf(e.raw);
          return { value: `${e.name}|${e.source}`, label: e.name, hint: `CR ${cr} · ${crXp(cr).toLocaleString()} XP · ${e.source}` };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );

  const setEnc = (fn: (e: PlannedEncounter) => PlannedEncounter) => enc && change((d) => ({ ...d, encounters: d.encounters.map((x) => (x.id === enc.id ? fn(x) : x)) }));
  const create = () => {
    const e: PlannedEncounter = { id: uid(), name: `Encounter ${dm.encounters.length + 1}`, monsters: [] };
    change((d) => ({ ...d, encounters: [...d.encounters, e] }));
    setOpenId(e.id);
    setSent("");
  };

  return (
    <div className="dm-encounters">
      <div className="row" style={{ flexWrap: "wrap" }}>
        {dm.encounters.map((e) => (
          <button key={e.id} className={e.id === openId ? "primary" : ""} onClick={() => (setOpenId(e.id), setSent(""))}>
            {e.name || "Unnamed"}
          </button>
        ))}
        <button onClick={create}>+ New encounter</button>
      </div>
      {!enc && <p className="muted pad">Plan a fight ahead of the session: add monsters, see how hard it is for your party, then send it to the combat tracker.</p>}
      {enc && <Editor key={enc.id} enc={enc} setEnc={setEnc} creatures={creatures} {...{ data, characters, campaign, getRules, onOpenCombat, onCharactersSaved, sent, setSent }} onDelete={() => (change((d) => ({ ...d, encounters: d.encounters.filter((x) => x.id !== enc.id) })), setOpenId(null))} />}
    </div>
  );
}

function Editor({
  enc,
  setEnc,
  creatures,
  data,
  characters,
  campaign,
  getRules,
  onOpenCombat,
  onCharactersSaved,
  onDelete,
  sent,
  setSent,
}: {
  enc: PlannedEncounter;
  setEnc: (fn: (e: PlannedEncounter) => PlannedEncounter) => void;
  creatures: { value: string; label: string; hint: string }[];
  onDelete: () => void;
  sent: string;
  setSent: (s: string) => void;
} & Pick<DmChildProps, "data" | "characters" | "campaign" | "getRules" | "onOpenCombat" | "onCharactersSaved">) {
  const [withParty, setWithParty] = useState(true);
  const [extra, setExtra] = useState((enc.extraLevels ?? []).join(", "));
  const inParty = characters.filter((c) => !enc.party || enc.party.includes(c.file));
  const levels = [...inParty.map((c) => levelOf(c.character)).filter((l) => l > 0), ...(enc.extraLevels ?? [])];
  const report = encounterDifficulty(enc.monsters, levels);

  const addMonster = (ref: string) => {
    const [name, source] = ref.split("|");
    const e = data.find("creature", name, source);
    if (!e) return;
    setEnc((x) => {
      const has = x.monsters.find((m) => m.ref === ref);
      return { ...x, monsters: has ? x.monsters.map((m) => (m.ref === ref ? { ...m, count: m.count + 1 } : m)) : [...x.monsters, { ref, name: e.name, cr: crOf(e.raw), count: 1 }] };
    });
  };
  const setCount = (ref: string, n: number) => setEnc((x) => ({ ...x, monsters: n <= 0 ? x.monsters.filter((m) => m.ref !== ref) : x.monsters.map((m) => (m.ref === ref ? { ...m, count: n } : m)) }));
  const toggleChar = (file: string) =>
    setEnc((x) => {
      const cur = x.party ?? characters.map((c) => c.file);
      const next = cur.includes(file) ? cur.filter((f) => f !== file) : [...cur, file];
      return { ...x, party: next.length === characters.length ? undefined : next };
    });

  const send = async () => {
    const fight = await loadEncounter(campaign);
    const names = fight.combatants.map((c) => c.name);
    const add: Combatant[] = [];
    for (const m of enc.monsters) {
      const [name, source] = m.ref.split("|");
      const e = data.find("creature", name, source);
      if (!e) continue;
      const stats = statsFromCreature(e.raw);
      for (let i = 0; i < m.count; i++) add.push(combatantFromStats(structuredClone(stats), uniqueName([...names, ...add.map((c) => c.name)], e.name), "npc"));
    }
    let pcs = 0;
    if (withParty) {
      const inFight = new Set(fight.combatants.map((c) => c.charFile).filter(Boolean));
      for (const cf of inParty) {
        if (inFight.has(cf.file)) continue;
        let initMod = 0;
        let ac = 10;
        try {
          const s = computeSheet(cf.character, getRules());
          initMod = s.initiative;
          ac = s.ac.value;
        } catch {
          /* plain numbers */
        }
        add.push({ id: uid(), name: cf.character.name || "Character", kind: "pc", init: null, initMod, ac, conditions: [], charFile: cf.file });
        pcs++;
      }
    }
    await saveEncounter(campaign, { ...fight, combatants: [...fight.combatants, ...add] });
    setSent(`Added ${add.length - pcs} creature${add.length - pcs === 1 ? "" : "s"}${pcs ? ` and ${pcs} character${pcs === 1 ? "" : "s"}` : ""} to the combat tracker.`);
  };

  /** The party won: everyone who was there gets an equal share of the XP (milestone characters skip it). */
  const award = async () => {
    const each = xpEach(report.xp, levels.length);
    if (!each) return;
    let given = 0;
    for (const cf of await listCharacters(campaign)) {
      if (!inParty.some((p) => p.file === cf.file) || cf.character.levelling === "milestone") continue;
      const lvl = levelOf(cf.character);
      await saveCharacter(campaign, addXp(cf.character, each, lvl), cf.file);
      given++;
    }
    setEnc((x) => ({ ...x, awarded: { at: new Date().toISOString(), each, to: given } }));
    onCharactersSaved();
  };

  const max = Math.max(report.thresholds[3] * 1.25, report.adjusted, 1);
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;

  return (
    <section className="dm-card">
      <div className="row">
        <input className="grow name-input" value={enc.name} onChange={(e) => setEnc((x) => ({ ...x, name: e.target.value }))} aria-label="Encounter name" />
        <button className="ghost small" onClick={onDelete}>
          Delete
        </button>
      </div>

      <h4 className="sheet-h">Party</h4>
      <div className="row small" style={{ flexWrap: "wrap" }}>
        {characters.map((c) => (
          <label key={c.file} className="row">
            <input type="checkbox" checked={!enc.party || enc.party.includes(c.file)} onChange={() => toggleChar(c.file)} />
            {c.character.name} <span className="muted">(level {levelOf(c.character) || "?"})</span>
          </label>
        ))}
        <label className="row">
          Others by level
          <input
            className="hp-roll"
            style={{ width: 110 }}
            value={extra}
            placeholder="e.g. 5, 5"
            onChange={(e) => {
              setExtra(e.target.value);
              const lv = e.target.value.split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= 20);
              setEnc((x) => ({ ...x, extraLevels: lv.length ? lv : undefined }));
            }}
          />
        </label>
      </div>
      {!levels.length && <p className="small error">Add the party (characters, or levels) to see the difficulty.</p>}

      <h4 className="sheet-h">Monsters</h4>
      <SearchSelect options={creatures} placeholder={creatures.length ? `Add from the bestiary (${creatures.length})` : "No creatures imported (Settings)"} onChange={addMonster} />
      {enc.monsters.length > 0 && (
        <table className="inv-table dm-monsters">
          <tbody>
            {[...enc.monsters]
              .sort((a, b) => crNumber(b.cr) - crNumber(a.cr))
              .map((m) => {
                const [name, source] = m.ref.split("|");
                return (
                  <tr key={m.ref}>
                    <td>
                      <span className="lk lk-creature" data-5e="creature" data-name={name} data-source={source}>
                        {m.name}
                      </span>
                    </td>
                    <td className="small muted">
                      CR {m.cr} · {crXp(m.cr).toLocaleString()} XP
                    </td>
                    <td className="cell-actions">
                      <button className="ghost small" onClick={() => setCount(m.ref, m.count - 1)} aria-label="One fewer">
                        −
                      </button>
                      <input className="hp-roll" type="number" min={0} value={m.count} onChange={(e) => setCount(m.ref, Math.max(0, Number(e.target.value) || 0))} aria-label="How many" />
                      <button className="ghost small" onClick={() => setCount(m.ref, m.count + 1)} aria-label="One more">
                        +
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}

      <div className={`difficulty d-${report.rating}`}>
        <div className="row">
          <b className="grow">{RATING_LABEL[report.rating]}</b>
          <span className="small">
            {report.adjusted.toLocaleString()} adjusted XP ({report.xp.toLocaleString()} × {report.multiplier})
          </span>
        </div>
        <div className="diff-track">
          <div className="diff-fill" style={{ width: pct(report.adjusted) }} />
          {(["Easy", "Medium", "Hard", "Deadly"] as const).map((l, i) => (
            <span key={l} className="diff-mark" style={{ left: pct(report.thresholds[i]) }} title={`${l}: ${report.thresholds[i].toLocaleString()} XP`}>
              <span>{l}</span>
            </span>
          ))}
        </div>
        <div className="small muted">
          Party thresholds: easy {report.thresholds[0].toLocaleString()} · medium {report.thresholds[1].toLocaleString()} · hard {report.thresholds[2].toLocaleString()} · deadly {report.thresholds[3].toLocaleString()}
          {levels.length > 0 && <> · {report.perCharacter.toLocaleString()} XP each when they win</>}
        </div>
      </div>

      <textarea rows={2} placeholder="Notes: tactics, terrain, what the monsters want…" value={enc.notes ?? ""} onChange={(e) => setEnc((x) => ({ ...x, notes: e.target.value || undefined }))} />

      <div className="row" style={{ flexWrap: "wrap", marginTop: 8 }}>
        <button className="primary" disabled={!enc.monsters.length} onClick={() => void send()}>
          ⚔ Send to combat
        </button>
        <label className="row small">
          <input type="checkbox" checked={withParty} onChange={(e) => setWithParty(e.target.checked)} /> add the party too
        </label>
        <button
          disabled={!report.xp || !inParty.length}
          onClick={() => void award()}
          title={enc.awarded ? "Already given once: this gives it again" : "The party won: share the XP between the characters who were there"}
        >
          🏆 Award {xpEach(report.xp, levels.length).toLocaleString()} XP each
        </button>
        {enc.awarded && (
          <span className="small ok">
            Gave {enc.awarded.each.toLocaleString()} XP to {enc.awarded.to} character{enc.awarded.to === 1 ? "" : "s"} ({new Date(enc.awarded.at).toLocaleDateString()})
          </span>
        )}
        {sent && (
          <span className="small ok">
            {sent}{" "}
            <button className="link small" onClick={onOpenCombat}>
              Open combat
            </button>
          </span>
        )}
      </div>
    </section>
  );
}
