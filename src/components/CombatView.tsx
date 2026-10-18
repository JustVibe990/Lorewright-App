// The combat screen: initiative tracker (rounds, turns, order) and every
// creature in the fight, with HP, conditions and a stat block you can roll
// from and edit. Player characters join with their initiative and AC.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { computeSheet } from "../lib/character/engine.ts";
import type { Rules } from "../lib/character/rules.ts";
import { listCharacters, saveCharacter, type CharacterFile } from "../lib/character/storage.ts";
import { ABILITIES, ABILITY_NAMES, type Ability } from "../lib/character/types.ts";
import {
  abilityMod,
  advanceTurn,
  applyHp,
  blankStats,
  combatantFromStats,
  companionToCombatant,
  emptyEncounter,
  loadEncounter,
  saveBonus,
  rechargeMin,
  saveEncounter,
  startOfTurn,
  statsFromCreature,
  syncEncounterIntoCompanions,
  turnOrder,
  uid,
  uniqueName,
  type Combatant,
  type CombatantKind,
  type CombatAction,
  type Encounter,
  type StatBlock,
  type TurnNote,
} from "../lib/combat.ts";
import { play } from "../lib/sfx.ts";
import type { DataStore } from "../lib/data.ts";
import { rollModeLabel, rollModeOf, withRollMode } from "../lib/dice.ts";
import { CONDITIONS } from "./character/SheetMain.tsx";
import SearchSelect from "./character/SearchSelect.tsx";
import { ConfirmDialog } from "./common.tsx";
import { Avatar } from "./character/Portrait.tsx";

type Roll = (expr: string, label: string) => unknown;
type Mods = { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const d20 = (mod: number) => `1d20${mod >= 0 ? "+" : ""}${mod}`;
const totalOf = (r: unknown) => (r && typeof r === "object" && "total" in r ? Number((r as { total: number }).total) : null);
const KIND_LABEL: Record<CombatantKind, string> = { pc: "Player", npc: "Enemy", summon: "Summon", ally: "Ally" };
const SAVE_MS = 400;

interface Props {
  campaign: string;
  data: DataStore;
  characters: CharacterFile[];
  getRules: () => Rules;
  onRoll: Roll;
  onOpenCharacter: (file: string) => void;
  /** A companion's changes were saved to its character's sheet. */
  onCharactersSaved?: () => void;
}

export default function CombatView({ campaign, data, characters, getRules, onRoll, onOpenCharacter, onCharactersSaved }: Props) {
  const [enc, setEnc] = useState<Encounter | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [turnNotes, setTurnNotes] = useState<{ id: string; name: string; round: number; notes: TurnNote[] } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Encounter | null>(null);

  useEffect(() => {
    let live = true;
    setEnc(null);
    loadEncounter(campaign).then((e) => live && setEnc(e));
    return () => {
      live = false;
    };
  }, [campaign]);

  // Save shortly after each change, and when leaving the screen.
  const flush = () => {
    window.clearTimeout(timer.current);
    if (latest.current) {
      const e = latest.current;
      void saveEncounter(campaign, e).catch(() => {});
      void saveCompanions(e);
    }
    latest.current = null;
  };
  // Companions from a character's sheet: HP, conditions and stats go back to the sheet.
  const saveCompanions = async (e: Encounter) => {
    const rows = e.combatants.filter((c) => c.companionOf);
    if (!rows.length) return;
    try {
      let saved = false;
      for (const cf of await listCharacters(campaign)) {
        const next = syncEncounterIntoCompanions(cf.character.companions ?? [], cf.file, rows);
        if (!next) continue;
        await saveCharacter(campaign, { ...cf.character, companions: next }, cf.file);
        saved = true;
      }
      if (saved) onCharactersSaved?.();
    } catch {
      /* the fight is still saved */
    }
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (fn: (e: Encounter) => Encounter) =>
    setEnc((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      latest.current = next;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_MS);
      return next;
    });
  const setC = (id: string, fn: (c: Combatant) => Combatant) => change((e) => ({ ...e, combatants: e.combatants.map((c) => (c.id === id ? fn(c) : c)) }));
  const add = (list: Combatant[]) => change((e) => ({ ...e, combatants: [...e.combatants, ...list] }));

  const rollInit = (c: Combatant, e?: Mods) => {
    const mode = e ? rollModeOf(e) : null;
    const t = totalOf(onRoll(withRollMode(d20(c.initMod), mode), `${c.name}: initiative${rollModeLabel(mode)}`));
    if (t != null) setC(c.id, (x) => ({ ...x, init: t }));
  };
  const rollAllInit = (all: boolean) => {
    for (const c of enc?.combatants ?? []) if (all ? c.kind !== "pc" : c.init == null && c.kind !== "pc") rollInit(c);
  };

  /** Next turn: the start of that creature's turn rolls recharges, counts timers down, and lists reminders. */
  const nextTurn = () => {
    if (!enc) return;
    const moved = advanceTurn(enc, 1);
    const c = moved.combatants.find((x) => x.id === moved.current);
    if (!c) return change(() => moved);
    const { c: started, notes } = startOfTurn(c, (label) => totalOf(onRoll("1d6", `${c.name}: ${label} recharge`)) ?? 0);
    // Characters: what they're keeping up, from their sheet.
    const st = c.charFile ? characters.find((x) => x.file === c.charFile)?.character.state : undefined;
    if (st?.concentration) notes.unshift({ text: `Concentrating on ${st.concentration.name}` });
    for (const a of st?.active ?? []) notes.push({ text: `${a.name}${a.until ? ` (${a.until})` : ""}${a.note ? `: ${a.note}` : ""}` });
    if (st && st.hp <= 0) notes.unshift({ text: "At 0 HP: roll a death saving throw" });
    change(() => ({ ...moved, combatants: moved.combatants.map((x) => (x.id === c.id ? started : x)) }));
    setTurnNotes({ id: c.id, name: c.name, round: moved.round, notes });
  };

  if (!enc) return <div className="empty-centre muted">Loading…</div>;
  const order = turnOrder(enc.combatants);
  const current = enc.combatants.find((c) => c.id === enc.current);

  return (
    <div className="combat">
      <header className="combat-head">
        <div className="grow">
          <h1 className="char-name">Combat</h1>
          <div className="small muted">
            {enc.round ? `Round ${enc.round}${current ? ` · ${current.name}'s turn` : ""}` : enc.combatants.length ? "Roll initiative, then start" : "Add characters and creatures below"}
          </div>
        </div>
        <button className="small" disabled={!enc.combatants.some((c) => c.kind !== "pc")} onClick={() => rollAllInit(false)} title="Roll initiative for creatures that haven't rolled (Shift+click a d20 to roll one with advantage)">
          Roll initiative
        </button>
        <button className="small" disabled={!enc.round} onClick={() => change((e) => advanceTurn(e, -1))}>
          ◀ Back
        </button>
        <button className="primary" disabled={!enc.combatants.length} onClick={nextTurn}>
          {enc.round ? "Next turn ▶" : "Start combat"}
        </button>
        <button className="ghost small" disabled={!enc.round} onClick={() => change((e) => ({ ...e, round: 0, current: null }))} title="Stop the round counter (keeps everyone)">
          End
        </button>
        <button className="ghost small" disabled={!enc.combatants.length} onClick={() => setConfirmClear(true)}>
          Clear
        </button>
      </header>

      {turnNotes && turnNotes.id === enc.current && turnNotes.notes.length > 0 && (
        <div className="notice turn-notes" role="status">
          <div className="row">
            <b className="grow">
              Start of {turnNotes.name}'s turn <span className="muted small">· round {turnNotes.round}</span>
            </b>
            <button className="ghost small" aria-label="Dismiss" onClick={() => setTurnNotes(null)}>
              ✕
            </button>
          </div>
          <ul className="small">
            {turnNotes.notes.map((n, i) => (
              <li key={i}>
                {n.text}{" "}
                {n.heal && (
                  <button
                    className="small"
                    onClick={() => {
                      setC(turnNotes.id, (x) => applyHp(x, "heal", n.heal!));
                      setTurnNotes((t) => t && { ...t, notes: t.notes.filter((_, j) => j !== i) });
                    }}
                  >
                    +{n.heal} HP
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <AddBar
        data={data}
        characters={characters}
        enc={enc}
        getRules={getRules}
        onAdd={(list) => {
          add(list);
          if (list.length === 1 && list[0].stats && list[0].kind !== "npc") setOpen(list[0].id);
        }}
        onCustom={(kind, owner) => {
          const stats = blankStats();
          const c = combatantFromStats(stats, uniqueName(enc.combatants.map((x) => x.name), kind === "summon" ? "Summon" : kind === "ally" ? "Ally" : "Creature"), kind, owner);
          add([c]);
          setOpen(c.id);
        }}
      />

      {!order.length && <p className="muted pad">Nobody in the fight yet. Add your characters, then monsters from your bestiary, or make your own NPCs and summons.</p>}
      <ol className="combat-list">
        {order.map((c) => (
          <CombatRow
            key={c.id}
            c={c}
            isTurn={c.id === enc.current}
            open={open === c.id}
            characters={characters}
            onToggle={() => setOpen(open === c.id ? null : c.id)}
            onChange={(fn) => setC(c.id, fn)}
            onRollInit={(e) => rollInit(c, e)}
            onRemove={() => change((e) => ({ ...e, combatants: e.combatants.filter((x) => x.id !== c.id), current: e.current === c.id ? advanceTurn(e).current : e.current }))}
            onDuplicate={() => add([{ ...structuredClone(c), id: uid(), name: uniqueName(enc.combatants.map((x) => x.name), c.name.replace(/\s+\d+$/, "")), init: null }])}
            onOpenCharacter={onOpenCharacter}
            roll={onRoll}
          />
        ))}
      </ol>

      {confirmClear && (
        <ConfirmDialog
          title="Clear the fight?"
          confirmLabel="Clear"
          onConfirm={() => {
            change(() => emptyEncounter());
            setConfirmClear(false);
          }}
          onCancel={() => setConfirmClear(false)}
        >
          <p>Removes everyone from the tracker. Characters and notes aren't touched.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function AddBar({
  data,
  characters,
  enc,
  getRules,
  onAdd,
  onCustom,
}: {
  data: DataStore;
  characters: CharacterFile[];
  enc: Encounter;
  getRules: () => Rules;
  onAdd: (list: Combatant[]) => void;
  onCustom: (kind: CombatantKind, owner?: string) => void;
}) {
  const [count, setCount] = useState(1);
  const [kind, setKind] = useState<CombatantKind>("npc");
  const [owner, setOwner] = useState("");
  const creatures = useMemo(
    () =>
      data.index
        .entries()
        .filter((e) => e.kind === "creature")
        .map((e) => ({ value: `${e.name}|${e.source}`, label: e.name, hint: `CR ${typeof e.raw.cr === "string" ? e.raw.cr : e.raw.cr?.cr ?? "?"} · ${e.source}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );
  const inFight = new Set(enc.combatants.map((c) => c.charFile).filter(Boolean));
  const companions = characters.flatMap((cf) => (cf.character.companions ?? []).map((comp) => ({ cf, comp })));
  const inFightComp = new Set(enc.combatants.filter((c) => c.companionOf).map((c) => `${c.companionOf!.file}/${c.companionOf!.id}`));

  const addCharacter = (cf: CharacterFile) => {
    let initMod = 0;
    let ac = 10;
    try {
      const s = computeSheet(cf.character, getRules());
      initMod = s.initiative;
      ac = s.ac.value;
    } catch {
      /* rules not loaded: plain numbers */
    }
    onAdd([{ id: uid(), name: cf.character.name || "Character", kind: "pc", init: null, initMod, ac, conditions: [], charFile: cf.file }]);
  };

  const addCreature = (ref: string) => {
    const [name, source] = ref.split("|");
    const e = data.find("creature", name, source);
    if (!e) return;
    const stats = statsFromCreature(e.raw);
    const names = enc.combatants.map((c) => c.name);
    const list: Combatant[] = [];
    for (let i = 0; i < Math.max(1, count); i++) {
      const n = uniqueName([...names, ...list.map((c) => c.name)], e.name);
      list.push(combatantFromStats(structuredClone(stats), n, kind, kind !== "npc" && owner ? owner : undefined));
    }
    onAdd(list);
  };

  return (
    <section className="combat-add">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span className="small muted">Characters:</span>
        {characters.map((cf) => (
          <button key={cf.file} className="small" disabled={inFight.has(cf.file)} onClick={() => addCharacter(cf)}>
            + {cf.character.name}
          </button>
        ))}
        {!characters.length && <span className="small muted">none in this campaign</span>}
      </div>
      {companions.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", marginTop: 6 }}>
          <span className="small muted">Companions:</span>
          {companions.map(({ cf, comp }) => (
            <button key={`${cf.file}/${comp.id}`} className="small" disabled={inFightComp.has(`${cf.file}/${comp.id}`)} onClick={() => onAdd([companionToCombatant(comp, cf.file, cf.character.name)])} title={`${cf.character.name}'s ${KIND_LABEL[comp.kind].toLowerCase()}`}>
              + {comp.name} <span className="muted">({cf.character.name})</span>
            </button>
          ))}
        </div>
      )}
      <div className="row" style={{ flexWrap: "wrap", marginTop: 6 }}>
        <span className="small muted">Add</span>
        <input type="number" min={1} max={20} className="hb-amount" value={count} onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} aria-label="How many" />
        <select value={kind} onChange={(e) => setKind(e.target.value as CombatantKind)} aria-label="Side">
          <option value="npc">Enemy</option>
          <option value="ally">Ally / NPC</option>
          <option value="summon">Summon / companion</option>
        </select>
        {kind !== "npc" && characters.length > 0 && (
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Controlled by">
            <option value="">controlled by…</option>
            {characters.map((cf) => (
              <option key={cf.file} value={cf.character.name}>
                {cf.character.name}
              </option>
            ))}
          </select>
        )}
        <div className="grow" style={{ minWidth: 220 }}>
          <SearchSelect options={creatures} placeholder={creatures.length ? `From the bestiary (${creatures.length})` : "No creatures imported (Settings)"} onChange={addCreature} />
        </div>
        <button className="small" onClick={() => onCustom(kind, kind !== "npc" && owner ? owner : undefined)} title="A blank stat block you fill in">
          + Custom
        </button>
      </div>
    </section>
  );
}

export function CombatRow({
  c,
  isTurn,
  hideInit,
  extra,
  open,
  characters,
  onToggle,
  onChange,
  onRollInit,
  onRemove,
  onDuplicate,
  onOpenCharacter,
  roll,
}: {
  c: Combatant;
  isTurn: boolean;
  open: boolean;
  characters: CharacterFile[];
  onToggle: () => void;
  onChange: (fn: (c: Combatant) => Combatant) => void;
  onRollInit: (e: Mods) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onOpenCharacter: (file: string) => void;
  roll: Roll;
  /** On a character's sheet there's no initiative to roll. */
  hideInit?: boolean;
  /** More buttons, before Remove. */
  extra?: ReactNode;
}) {
  const [amount, setAmount] = useState("");
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerName, setTimerName] = useState("");
  const [timerRounds, setTimerRounds] = useState(10);
  const n = Math.abs(Math.floor(Number(amount) || 0));
  const hpTrack = c.kind !== "pc" && c.hpMax != null;
  const hp = c.hp ?? 0;
  const max = c.hpMax ?? 0;
  const down = hpTrack && hp <= 0;
  const apply = (kind: "damage" | "heal" | "temp") => {
    if (!n) return;
    onChange((x) => applyHp(x, kind, n));
    play(kind === "heal" ? "heal" : kind === "temp" ? "temp" : hpTrack && hp - n <= 0 && hp > 0 ? "down" : n >= 10 ? "hurtBig" : "hurt");
    setAmount("");
  };
  const pct = max ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;

  return (
    <li className={`combat-row k-${c.kind} ${isTurn ? "turn" : ""} ${down ? "down" : ""}`}>
      <div className="combat-line">
        {!hideInit && <div className="init-box">
          <input
            type="number"
            value={c.init ?? ""}
            placeholder="–"
            aria-label={`${c.name} initiative`}
            onChange={(e) => onChange((x) => ({ ...x, init: e.target.value === "" ? null : Number(e.target.value) }))}
          />
          <button className="ghost small" onClick={(e) => onRollInit(e)} title={`Roll initiative (${signed(c.initMod)}) · Shift: advantage`}>
            🎲
          </button>
        </div>}
        <div className="grow combat-name">
          {c.charFile && <Avatar src={characters.find((x) => x.file === c.charFile)?.character.portrait} name={c.name} size={30} />}
          <input className="name-input" value={c.name} onChange={(e) => onChange((x) => ({ ...x, name: e.target.value }))} aria-label="Name" />
          <span className="pill small">{KIND_LABEL[c.kind]}</span>
          {c.owner && <span className="small muted">· {c.owner}</span>}
          {c.stats?.legendary && <LegendaryPips c={c} onChangeC={onChange} />}
          {(c.spent ?? []).map((n) => (
            <span key={n} className="pill small spent-pill" title="Used: rolls to recharge at the start of its turn">
              {n.replace(/\s*\(Recharge[^)]*\)/i, "")} used
            </span>
          ))}
          {(c.timers ?? []).map((t) => (
            <button key={t.id} className="pill small timer-pill" title="Remove timer" onClick={() => onChange((x) => ({ ...x, timers: (x.timers ?? []).filter((y) => y.id !== t.id) }))}>
              ⏱ {t.name} {t.rounds} ✕
            </button>
          ))}
          {c.companionOf && <span className="small muted" title="Kept on the character's sheet: changes are saved there too"> ⇄ sheet</span>}
          {c.conditions.map((k) => (
            <button key={k} className="pill small cond-pill" title="Remove condition" onClick={() => onChange((x) => ({ ...x, conditions: x.conditions.filter((y) => y !== k) }))}>
              <span className="lk lk-condition" data-5e="condition" data-name={k} data-source="PHB">
                {k}
              </span>{" "}
              ✕
            </button>
          ))}
        </div>
        <div className="combat-ac" title="Armor Class">
          <span className="vital-label">AC</span>
          <input type="number" value={c.ac} onChange={(e) => onChange((x) => ({ ...x, ac: Number(e.target.value) || 0 }))} aria-label="AC" />
        </div>
        {hpTrack ? (
          <div className="combat-hp">
            <div className="small">
              <b>{hp}</b>/{max}
              {c.tempHp ? <span className="hb-temp-label"> +{c.tempHp}</span> : null}
              {down && <span className="error"> down</span>}
            </div>
            <div className="mini-track">
              <div className="mini-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="row small">
              <input
                className="hb-amount"
                value={amount}
                placeholder="0"
                aria-label="Amount"
                onChange={(e) => setAmount(e.target.value.replace(/[^\d+]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && apply(amount.startsWith("+") ? "heal" : "damage")}
              />
              <button className="small hb-damage" disabled={!n} onClick={() => apply("damage")} title="Damage (Enter)">
                −
              </button>
              <button className="small hb-heal" disabled={!n} onClick={() => apply("heal")} title="Heal (+5 then Enter)">
                +
              </button>
              <button className="small" disabled={!n} onClick={() => apply("temp")} title="Temp HP">
                T
              </button>
            </div>
          </div>
        ) : (
          <div className="combat-hp small muted">
            {c.charFile && characters.some((x) => x.file === c.charFile) ? (
              <button className="link small" onClick={() => onOpenCharacter(c.charFile!)}>
                HP on sheet
              </button>
            ) : (
              "HP on sheet"
            )}
          </div>
        )}
        <div className="combat-actions">
          <select
            value=""
            aria-label="Add condition"
            onChange={(e) => e.target.value && onChange((x) => ({ ...x, conditions: [...x.conditions, e.target.value] }))}
          >
            <option value="">+ condition</option>
            {[...CONDITIONS, "Concentrating"].filter((k) => !c.conditions.includes(k)).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          {c.stats && (
            <button className={`small ${open ? "primary" : ""}`} onClick={onToggle}>
              {open ? "Hide" : "Stats"}
            </button>
          )}
          {c.kind !== "pc" && (
            <button className="ghost small" onClick={onDuplicate} title="Add another one">
              ⧉
            </button>
          )}
          {!hideInit && (
            <button className={`ghost small ${timerOpen ? "on" : ""}`} onClick={() => setTimerOpen((x) => !x)} title="Add a timer (counts down at the start of its turn)">
              ⏱
            </button>
          )}
          {extra}
          <button className="ghost small" onClick={onRemove} aria-label={`Remove ${c.name}`} title={hideInit ? "Remove" : "Remove from the fight"}>
            ✕
          </button>
        </div>
      </div>
      {timerOpen && (
        <div className="row small timer-form">
          <input list={`timer-names-${c.id}`} placeholder="What: Hold Person, Bless…" value={timerName} onChange={(e) => setTimerName(e.target.value)} />
          <datalist id={`timer-names-${c.id}`}>
            {c.conditions.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <input className="hp-roll" type="number" min={1} value={timerRounds} onChange={(e) => setTimerRounds(Math.max(1, Number(e.target.value) || 1))} aria-label="Rounds" />
          rounds (1 minute = 10)
          <button
            className="small primary"
            disabled={!timerName.trim()}
            onClick={() => {
              onChange((x) => ({ ...x, timers: [...(x.timers ?? []), { id: uid(), name: timerName.trim(), rounds: timerRounds }] }));
              setTimerName("");
              setTimerOpen(false);
            }}
          >
            Add timer
          </button>
          <span className="muted">A condition with the same name ends with it.</span>
        </div>
      )}
      {open && c.stats && <StatBlockView c={c} stats={c.stats} onChange={(s) => onChange((x) => ({ ...x, stats: s }))} onChangeC={onChange} roll={roll} />}
    </li>
  );
}

/** The stat block: click to roll checks, saves and attacks; Edit to change anything. */
export function StatBlockView({
  c,
  stats,
  onChange,
  onChangeC,
  roll,
  builder,
}: {
  c: Combatant;
  stats: StatBlock;
  onChange: (s: StatBlock) => void;
  onChangeC: (fn: (c: Combatant) => Combatant) => void;
  roll: Roll;
  /** The Creature Builder: always editing, and HP, speed and senses are set above it. */
  builder?: boolean;
}) {
  const [editing, setEdit] = useState(false);
  const edit = builder || editing;
  const r20 = (e: Mods, mod: number, what: string) => {
    const mode = rollModeOf(e);
    roll(withRollMode(d20(mod), mode), `${c.name}: ${what}${rollModeLabel(mode)}`);
  };
  const setAbility = (a: Ability, v: number) => {
    const next = { ...stats, abilities: { ...stats.abilities, [a]: v } };
    onChange(next);
    if (a === "dex") onChangeC((x) => ({ ...x, initMod: abilityMod(v), stats: next }));
  };
  const setAction = (i: number, patch: Partial<CombatAction>) => onChange({ ...stats, actions: stats.actions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <div className="statblock">
      <div className="row small">
        <span className="muted grow">
          {[stats.size, stats.type, stats.cr ? `CR ${stats.cr}` : ""].filter(Boolean).join(" · ")}
          {stats.ref ? ` · from ${stats.ref.replace("|", ", ")}` : " · homemade"}
        </span>
        <span className="small muted">Click to roll · Shift: advantage · Ctrl: disadvantage</span>
        {!builder && (
          <button className={`small ${edit ? "primary" : ""}`} onClick={() => setEdit((x) => !x)}>
            {edit ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {builder ? null : edit ? (
        <div className="form-grid" style={{ marginTop: 6 }}>
          <label>
            Max HP
            <input
              type="number"
              value={c.hpMax ?? stats.hpMax}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value) || 1);
                // At full HP, a new max fills up too (a fresh summon); otherwise HP stays, capped at the max.
                onChangeC((x) => ({ ...x, hpMax: v, hp: x.hp == null || x.hp >= (x.hpMax ?? 0) ? v : Math.min(x.hp, v), stats: { ...stats, hpMax: v } }));
              }}
            />
          </label>
          <label>
            Current HP
            <input type="number" value={c.hp ?? 0} onChange={(e) => onChangeC((x) => ({ ...x, hp: Math.max(0, Number(e.target.value) || 0) }))} />
          </label>
          <label>
            Speed
            <input value={stats.speed} onChange={(e) => onChange({ ...stats, speed: e.target.value })} />
          </label>
          <label>
            Senses
            <input value={stats.senses ?? ""} onChange={(e) => onChange({ ...stats, senses: e.target.value || undefined })} />
          </label>
        </div>
      ) : (
        <p className="small" style={{ margin: "6px 0" }}>
          <b>Speed</b> {stats.speed}
          {stats.hpFormula && (
            <>
              {" "}· <b>HP</b> {stats.hpMax} ({stats.hpFormula}){" "}
              <button className="link small" title="Roll new hit points" onClick={() => {
                const t = totalOf(roll(stats.hpFormula!, `${c.name}: hit points`));
                if (t != null) onChangeC((x) => ({ ...x, hp: Math.max(1, t), hpMax: Math.max(1, t) }));
              }}>
                roll
              </button>
            </>
          )}
          {stats.senses && <> · {stats.senses}</>}
          {stats.languages && <> · {stats.languages}</>}
        </p>
      )}

      <table className="sb-abilities">
        <thead>
          <tr>
            <th />
            {ABILITIES.map((a) => (
              <th key={a}>{a.toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="small muted">Score</td>
            {ABILITIES.map((a) => (
              <td key={a}>
                {edit ? (
                  <input type="number" className="sb-num" value={stats.abilities[a]} onChange={(e) => setAbility(a, Number(e.target.value) || 0)} aria-label={`${ABILITY_NAMES[a]} score`} />
                ) : (
                  <button className="roll-btn" onClick={(e) => r20(e, abilityMod(stats.abilities[a]), `${ABILITY_NAMES[a]} check`)} title="Ability check">
                    {stats.abilities[a]} ({signed(abilityMod(stats.abilities[a]))})
                  </button>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <td className="small muted">Save</td>
            {ABILITIES.map((a) => (
              <td key={a}>
                {edit ? (
                  <input
                    type="number"
                    className="sb-num"
                    value={stats.saves[a] ?? ""}
                    placeholder={signed(abilityMod(stats.abilities[a]))}
                    onChange={(e) => {
                      const saves = { ...stats.saves };
                      if (e.target.value === "") delete saves[a];
                      else saves[a] = Number(e.target.value);
                      onChange({ ...stats, saves });
                    }}
                    aria-label={`${ABILITY_NAMES[a]} save bonus`}
                  />
                ) : (
                  <button className="roll-btn" onClick={(e) => r20(e, saveBonus(stats, a), `${ABILITY_NAMES[a]} save`)}>
                    {signed(saveBonus(stats, a))}
                  </button>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {Object.keys(stats.skills).length > 0 && !edit && (
        <p className="small">
          <b>Skills</b>{" "}
          {Object.entries(stats.skills).map(([k, v]) => (
            <button key={k} className="link small" onClick={(e) => r20(e, v, k)}>
              {k} {signed(v)}{" "}
            </button>
          ))}
        </p>
      )}

      {(stats.traits.length > 0 || edit) && <h4 className="sheet-h">Traits</h4>}
      {stats.traits.map((t, i) =>
        edit ? (
          <div key={i} className="forge-feature">
            <div className="row">
              <input className="grow" value={t.name} placeholder="Trait name" onChange={(e) => onChange({ ...stats, traits: stats.traits.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <button className="ghost" aria-label="Remove trait" onClick={() => onChange({ ...stats, traits: stats.traits.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
            <textarea rows={2} value={t.text} onChange={(e) => onChange({ ...stats, traits: stats.traits.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
          </div>
        ) : (
          <p key={i} className="small sb-text">
            <b>{t.name}.</b> <Tagged text={t.text} />
          </p>
        ),
      )}
      {edit && (
        <button className="small" onClick={() => onChange({ ...stats, traits: [...stats.traits, { name: "", text: "" }] })}>
          + trait
        </button>
      )}

      <h4 className="sheet-h">Actions</h4>
      {stats.actions.map((a, i) =>
        edit ? (
          <div key={i} className="forge-feature">
            <div className="row small" style={{ flexWrap: "wrap" }}>
              <input className="grow" value={a.name} placeholder="Action name" onChange={(e) => setAction(i, { name: e.target.value })} />
              <label className="row small">
                to hit
                <input type="number" className="sb-num" value={a.toHit ?? ""} placeholder="–" onChange={(e) => setAction(i, { toHit: e.target.value === "" ? null : Number(e.target.value) })} />
              </label>
              <button className="ghost" aria-label="Remove action" onClick={() => onChange({ ...stats, actions: stats.actions.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
            {a.damage.map((d, k) => (
              <div key={k} className="row small" style={{ marginTop: 4 }}>
                <input className="hp-roll" value={d.dice} placeholder="1d6+2" onChange={(e) => setAction(i, { damage: a.damage.map((x, j) => (j === k ? { ...x, dice: e.target.value.replace(/\s+/g, "") } : x)) })} />
                <input value={d.type} placeholder="slashing" onChange={(e) => setAction(i, { damage: a.damage.map((x, j) => (j === k ? { ...x, type: e.target.value } : x)) })} />
                <button className="ghost" aria-label="Remove damage" onClick={() => setAction(i, { damage: a.damage.filter((_, j) => j !== k) })}>
                  ✕
                </button>
              </div>
            ))}
            <div className="row small" style={{ marginTop: 4 }}>
              <button className="small" onClick={() => setAction(i, { damage: [...a.damage, { dice: "1d6", type: "" }] })}>
                + damage
              </button>
              <span className="muted">Save:</span>
              <select
                value={a.save?.ability ?? ""}
                onChange={(e) => setAction(i, { save: e.target.value ? { ability: e.target.value as Ability, dc: a.save?.dc ?? 12 } : undefined })}
                aria-label="Saving throw"
              >
                <option value="">none</option>
                {ABILITIES.map((x) => (
                  <option key={x} value={x}>
                    {ABILITY_NAMES[x]}
                  </option>
                ))}
              </select>
              {a.save && <input type="number" className="sb-num" value={a.save.dc} onChange={(e) => setAction(i, { save: { ...a.save!, dc: Number(e.target.value) || 10 } })} aria-label="Save DC" />}
            </div>
            <textarea rows={2} value={a.text} placeholder="What it does" onChange={(e) => setAction(i, { text: e.target.value })} />
          </div>
        ) : (
          <ActionLine key={i} a={a} c={c} roll={roll} r20={r20} onChangeC={onChangeC} />
        ),
      )}
      {edit && (
        <button className="small" onClick={() => onChange({ ...stats, actions: [...stats.actions, { name: "", toHit: null, damage: [], text: "" }] })}>
          + action
        </button>
      )}
      {stats.legendary && !edit && (
        <>
          <h4 className="sheet-h">
            Legendary actions <LegendaryPips c={c} onChangeC={onChangeC} />
          </h4>
          {stats.legendary.actions.map((a, i) => (
            <ActionLine key={i} a={a} c={c} roll={roll} r20={r20} onChangeC={onChangeC} legendary />
          ))}
        </>
      )}
    </div>
  );
}

/** Legendary actions left this round; click to use one (they come back at the start of its turn). */
function LegendaryPips({ c, onChangeC }: { c: Combatant; onChangeC: (fn: (c: Combatant) => Combatant) => void }) {
  const max = c.stats?.legendary?.count ?? 0;
  if (!max) return null;
  const used = Math.min(max, c.legendaryUsed ?? 0);
  return (
    <span className="pips" title="Legendary actions left this round">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          className={`pip ${i < max - used ? "on" : ""}`}
          onClick={() => onChangeC((x) => ({ ...x, legendaryUsed: Math.max(0, Math.min(max, (x.legendaryUsed ?? 0) + (i < max - used ? 1 : -1))) }))}
          aria-label={i < max - used ? "Use a legendary action" : "Get a legendary action back"}
        />
      ))}
    </span>
  );
}

/** One action: roll the attack and damage. A recharge ability is marked used when its damage is rolled. */
function ActionLine({
  a,
  c,
  roll,
  r20,
  onChangeC,
  legendary,
}: {
  a: CombatAction;
  c: Combatant;
  roll: Roll;
  r20: (e: Mods, mod: number, what: string) => void;
  onChangeC: (fn: (c: Combatant) => Combatant) => void;
  legendary?: boolean;
}) {
  const min = rechargeMin(a.name);
  const spent = !!min && (c.spent ?? []).includes(a.name);
  const markSpent = (on: boolean) => onChangeC((x) => ({ ...x, spent: on ? [...new Set([...(x.spent ?? []), a.name])] : (x.spent ?? []).filter((n) => n !== a.name) }));
  const cost = legendary ? Number(a.name.match(/\(Costs (\d) Actions\)/i)?.[1] ?? 1) : 0;
  return (
    <div className={`sb-action small ${spent ? "spent" : ""}`}>
      <b>{a.name}.</b>{" "}
      {min && (
        <button className={`small ${spent ? "" : "ghost"}`} onClick={() => markSpent(!spent)} title={spent ? "Used: rolls to recharge at the start of its turn (click if it's back)" : "Ready (click when used)"}>
          {spent ? "used" : "ready"}
        </button>
      )}{" "}
      {legendary && (
        <button
          className="ghost small"
          disabled={(c.legendaryUsed ?? 0) + cost > (c.stats?.legendary?.count ?? 0)}
          onClick={() => onChangeC((x) => ({ ...x, legendaryUsed: (x.legendaryUsed ?? 0) + cost }))}
          title={`Use it (${cost} legendary action${cost === 1 ? "" : "s"})`}
        >
          use
        </button>
      )}{" "}
      {a.toHit != null && (
        <button className="roll-btn" onClick={(e) => r20(e, a.toHit!, `${a.name} attack`)}>
          {signed(a.toHit)} to hit
        </button>
      )}{" "}
      {a.save && (
        <span className="pill small">
          DC {a.save.dc} {ABILITY_NAMES[a.save.ability]}
        </span>
      )}{" "}
      {a.damage.map((d, k) => (
        <span key={k}>
          {k > 0 && " + "}
          <button
            className="roll-btn"
            onClick={() => {
              roll(d.dice, `${c.name}: ${a.name} ${d.type} damage`.replace(/\s+/g, " "));
              if (min && k === 0) markSpent(true);
            }}
          >
            {d.dice}
          </button>{" "}
          <span className="muted">{d.type}</span>
        </span>
      ))}
      {a.text && (
        <div className="muted sb-text">
          <Tagged text={a.text} />
        </div>
      )}
    </div>
  );
}

/** Rules text with 5e.tools tags shown as their plain words (dice stay readable). */
function Tagged({ text }: { text: string }) {
  return <>{text.replace(/\{@(?:atk|h)[^}]*\}/g, "").replace(/\{@\w+ ([^|}]+)[^}]*\}/g, "$1").replace(/\{@\w+\}/g, "").trim()}</>;
}
