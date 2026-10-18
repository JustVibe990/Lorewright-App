// One character: loads and autosaves the file, computes the sheet, and shows
// the header (name, species/class/level, HP) and the tabs.

import { useEffect, useMemo, useRef, useState } from "react";
import { exportCharacter } from "../../lib/backup.ts";
import { endEffect } from "../../lib/character/consumables.ts";
import { computeSheet } from "../../lib/character/engine.ts";
import type { Rules } from "../../lib/character/rules.ts";
import { deleteCharacter, listCharacters, saveCharacter } from "../../lib/character/storage.ts";
import type { Character } from "../../lib/character/types.ts";
import type { DataStore } from "../../lib/data.ts";
import Builder from "./Builder.tsx";
import { EquipmentDialog, LevelUpDialog } from "./Dialogs.tsx";
import { FeaturesTab, NotesTab } from "./FeaturesTab.tsx";
import ForgeTab from "./ForgeTab.tsx";
import InventoryTab from "./InventoryTab.tsx";
import SheetMain from "./SheetMain.tsx";
import SpellsTab from "./SpellsTab.tsx";
import { characterSounds } from "../../lib/character/sounds.ts";
import { playAfterLead } from "../../lib/sfx.ts";
import { pushCompanions } from "../../lib/combat.ts";
import CompanionsTab from "./CompanionsTab.tsx";
import ResourceStrip from "./ResourceStrip.tsx";
import Portrait from "./Portrait.tsx";
import XpBar from "./XpBar.tsx";
import { xpProgress } from "../../lib/character/xp.ts";
import { useTour } from "../Tour.tsx";
import PrintSheet from "./PrintSheet.tsx";
import { applyRollMods, rollMods, type RollKind } from "../../lib/character/conditions.ts";

export type Tab = "sheet" | "spells" | "inventory" | "forge" | "features" | "companions" | "build" | "notes";
const TABS: [Tab, string][] = [
  ["sheet", "Sheet"],
  ["spells", "Spells"],
  ["inventory", "Inventory"],
  ["forge", "Item Forge"],
  ["features", "Features"],
  ["companions", "Companions"],
  ["build", "Build"],
  ["notes", "Notes"],
];

interface Props {
  campaign: string;
  file: string;
  isNew?: boolean;
  getRules: () => Rules;
  data: DataStore;
  onRoll: (expr: string, label: string) => { total: number } | void;
  onSaved: () => void;
  onDeleted: () => void;
  openSettings: () => void;
  /** Switch to a tab (from the sidebar); `n` changes each time it's asked. */
  openTab?: { tab: Tab; n: number };
}

const SAVE_MS = 500;
const UNDO_MERGE_MS = 700;
const UNDO_LIMIT = 100;

export default function CharacterView({ campaign, file, isNew, getRules, data, onRoll, onSaved, onDeleted, openSettings, openTab }: Props) {
  const rules = useMemo(() => getRules(), [getRules]);
  const [ch, setCh] = useState<Character | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(openTab?.tab ?? (isNew ? "build" : "sheet"));
  useEffect(() => {
    if (openTab) setTab(openTab.tab);
  }, [openTab?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const [saved, setSaved] = useState(true);
  const [dialog, setDialog] = useState<"levelup" | "equipment" | "delete" | null>(null);
  /** Inventory item opened in the Item Forge. */
  const [forgeId, setForgeId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Character | null>(null);
  /** The companions last copied to the combat tracker. */
  const pushed = useRef("");
  const chRef = useRef<Character | null>(null);
  // Undo history. Typing in a box undoes as one step; every click is its own step.
  const past = useRef<Character[]>([]);
  const future = useRef<Character[]>([]);
  const lastChange = useRef(0);
  const [, setHistoryVersion] = useState(0);

  useEffect(() => {
    listCharacters(campaign)
      .then((list) => {
        const found = list.find((c) => c.file === file);
        if (found) {
          chRef.current = found.character;
          pushed.current = JSON.stringify(found.character.companions ?? []);
          setCh(found.character);
        }
        else setError("This character's file couldn't be read.");
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [campaign, file]);

  const flush = async () => {
    window.clearTimeout(timer.current);
    if (!latest.current) return;
    const c = latest.current;
    latest.current = null;
    try {
      await saveCharacter(campaign, c, file);
      // Companions in the combat tracker follow the sheet.
      const comps = JSON.stringify(c.companions ?? []);
      if (comps !== pushed.current) {
        pushed.current = comps;
        if (c.companions?.length) await pushCompanions(campaign, file, c.companions).catch(() => {});
      }
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(`Couldn't save: ${(e as Error)?.message ?? e}`);
    }
  };
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: Character) => {
    chRef.current = next;
    latest.current = next;
    setCh(next);
    setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_MS);
  };

  const update = (fn: (c: Character) => Character, opts?: { quiet?: boolean }) => {
    const prev = chRef.current;
    if (!prev) return;
    const next = fn(prev);
    if (next === prev) return;
    if (!opts?.quiet) playAfterLead(characterSounds(prev, next));
    const now = Date.now();
    const typing = !!document.activeElement?.matches("input[type=text], input:not([type]), input[type=number], textarea");
    if (!typing || now - lastChange.current > UNDO_MERGE_MS) past.current = [...past.current, prev].slice(-UNDO_LIMIT);
    lastChange.current = now;
    future.current = [];
    setHistoryVersion((v) => v + 1);
    commit(next);
  };

  const undo = () => {
    const prev = past.current[past.current.length - 1];
    if (!prev || !chRef.current) return;
    past.current = past.current.slice(0, -1);
    future.current = [chRef.current, ...future.current];
    lastChange.current = 0;
    setHistoryVersion((v) => v + 1);
    commit(prev);
  };
  const redo = () => {
    const next = future.current[0];
    if (!next || !chRef.current) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, chRef.current];
    lastChange.current = 0;
    setHistoryVersion((v) => v + 1);
    commit(next);
  };

  // Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z). Text boxes keep their own undo.
  const undoRef = useRef({ undo, redo });
  undoRef.current = { undo, redo };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable=true]") || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undoRef.current.undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        undoRef.current.redo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const sheet = useMemo(() => (ch ? computeSheet(ch, rules) : null), [ch, rules]);

  /** The character's own d20 rolls: conditions and effects add advantage or disadvantage. */
  const charRoll = (expr: string, label: string, kind?: RollKind) => {
    const c = chRef.current;
    if (!kind || !c) return onRoll(expr, label);
    const r = applyRollMods(expr, label, rollMods(c, kind));
    return onRoll(r.expr, r.label);
  };

  // New characters start at full HP, and a character at full HP stays full when
  // the maximum changes from building (Constitution, Tough…), not from damage.
  const prevMax = useRef<number | null>(null);
  useEffect(() => {
    if (!ch || !sheet) return;
    const max = sheet.hp.max;
    const before = prevMax.current;
    prevMax.current = max;
    if (max <= 0 || before === max) return;
    const wasFull = before != null && ch.state.hp >= before;
    const fresh = ch.state.hp === 0 && !ch.choices["hp:init"];
    if (wasFull || fresh) update((c) => ({ ...c, state: { ...c.state, hp: max }, choices: { ...c.choices, "hp:init": ["1"] } }), { quiet: true });
  }, [sheet?.hp.max]); // eslint-disable-line react-hooks/exhaustive-deps

  // The character tour, the first time a built character's sheet is open.
  const tours = useTour();
  const built = (sheet?.totalLevel ?? 0) > 0;
  useEffect(() => {
    if (tab === "sheet" && built) tours.auto("character");
  }, [tab, built]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="note-msg error" style={{ padding: 24 }}>{error}</div>;
  if (!ch || !sheet) return <div className="empty-centre muted">Loading…</div>;

  if (!rules.hasData) {
    return (
      <div className="screen-inner">
        <h1>{ch.name}</h1>
        <p>Character sheets need the class, species and background data from your 5e.tools site.</p>
        <p className="muted small">Settings → Change sources → tick "Character sheets", then Import.</p>
        <button className="primary" onClick={openSettings}>Open Settings</button>
      </div>
    );
  }

  const open = sheet.choices.filter((c) => c.answer.length < c.count).length;
  const summary = [ch.race?.name, ch.background?.name, ch.classes.map((c) => `${c.name} ${c.level}`).join(" / ")].filter(Boolean).join(" · ");
  const needsEquipment = ch.classes.length > 0 && ch.background && !ch.choices["equipment:done"] && ch.inventory.length === 0;
  void data;

  return (
    <div className="character">
      <header className="char-head">
        <Portrait src={ch.portrait} name={ch.name || "Character"} onChange={(portrait) => update((c) => ({ ...c, portrait }))} />
        <div className="grow">
          <h1 className="char-name">{ch.name || "Unnamed"}</h1>
          <div className="small muted">
            {summary || "Not built yet: start in the Build tab"} {sheet.totalLevel > 0 && `· Level ${sheet.totalLevel}`}
          </div>
          <XpBar ch={ch} level={sheet.totalLevel} update={update} />
        </div>
        <div className="char-hp">
          <b>{Math.min(ch.state.hp, sheet.hp.max)}</b>
          <span className="muted">/{sheet.hp.max} HP</span>
          {ch.state.tempHp > 0 && <span className="hb-temp-label"> +{ch.state.tempHp} temp</span>}
        </div>
        <button
          className={`primary ${xpProgress(ch, sheet.totalLevel).pending > 0 ? "level-ready" : ""}`}
          disabled={!ch.classes.length || sheet.totalLevel >= 20}
          onClick={() => setDialog("levelup")}
          title={xpProgress(ch, sheet.totalLevel).pending > 0 ? "You have enough XP for the next level" : undefined}
        >
          Level up
        </button>
        <button className="ghost small" disabled={!past.current.length} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">
          ↶ Undo
        </button>
        <button className="ghost small" disabled={!future.current.length} onClick={redo} title="Redo (Ctrl+Y)" aria-label="Redo">
          ↷
        </button>
        <span className="save-state">{saved ? "Saved" : "Saving…"}</span>
        <button className="ghost small" title="Print the sheet, or save it as a PDF" onClick={() => setPrinting(true)}>
          Print
        </button>
        <button
          className="ghost small"
          title="Save a copy of this character as a .json file (to share or move it)"
          onClick={() => exportCharacter(ch).catch((e) => setError(`Couldn't export: ${e?.message ?? e}`))}
        >
          Export
        </button>
        <button className="ghost small" title="Delete this character" onClick={() => setDialog("delete")}>
          Delete
        </button>
      </header>

      <nav className="char-tabs" role="tablist">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {label}
            {t === "build" && open > 0 && <span className="badge">{open}</span>}
          </button>
        ))}
      </nav>

      {tab !== "build" && tab !== "notes" && <ResourceStrip ch={ch} sheet={sheet} update={update} />}

      {ch.state.concentration && (
        <div className="notice conc-bar" role="status">
          <span className="conc-icon" aria-hidden>◎</span>
          <span className="grow">
            Concentrating on{" "}
            {ch.state.concentration.ref.startsWith("feature:") ? (
              <b>{ch.state.concentration.name}</b>
            ) : (
              <span className="lk lk-spell" data-5e="spell" data-name={ch.state.concentration.name} data-source={ch.state.concentration.ref.split("|")[1]}>
                {ch.state.concentration.name}
              </span>
            )}
            {ch.state.concentration.level > 0 && <span className="muted small"> ({ch.state.concentration.level}{["", "st", "nd", "rd"][ch.state.concentration.level] ?? "th"} level)</span>}
          </span>
          <button className="small" onClick={() => update((c) => ({ ...c, state: { ...c.state, concentration: null } }))}>
            End
          </button>
        </div>
      )}

      {(ch.state.active ?? []).length > 0 && (
        <div className="notice active-bar" role="status">
          <span className="conc-icon" aria-hidden>✦</span>
          <span className="grow row small" style={{ flexWrap: "wrap" }}>
            {(ch.state.active ?? []).map((x) => (
              <span key={x.name} className="pill" title={x.note}>
                <b>{x.name}</b>
                {x.until && <span className="muted"> · {x.until}</span>}{" "}
                <button
                  className="ghost small"
                  aria-label={`End ${x.name}`}
                  title="End it"
                  onClick={() => update((c) => endEffect(c, x.name))}
                >
                  ✕
                </button>
              </span>
            ))}
          </span>
          {(ch.state.active ?? []).some((x) => x.note) && <span className="small muted">hover for details</span>}
        </div>
      )}

      {needsEquipment && (
        <div className="notice k-item" role="status">
          <span className="kind-dot" />
          <span className="grow">Choose your starting equipment from your class and background.</span>
          <button className="primary small" onClick={() => setDialog("equipment")}>Choose equipment</button>
        </div>
      )}

      <div className="char-body">
        {tab === "sheet" && <SheetMain ch={ch} sheet={sheet} rules={rules} update={update} roll={charRoll} />}
        {tab === "spells" && <SpellsTab ch={ch} sheet={sheet} rules={rules} update={update} roll={charRoll} />}
        {tab === "inventory" && (
          <InventoryTab
            ch={ch}
            sheet={sheet}
            rules={rules}
            data={data}
            update={update}
            roll={charRoll}
            onForge={(id) => {
              setForgeId(id);
              setTab("forge");
            }}
          />
        )}
        {tab === "forge" && (
          <ForgeTab
            key={forgeId ?? "new"}
            ch={ch}
            rules={rules}
            update={update}
            editId={forgeId}
            onDone={() => {
              setForgeId(null);
              setTab("inventory");
            }}
          />
        )}
        {tab === "features" && <FeaturesTab ch={ch} sheet={sheet} rules={rules} update={update} />}
        {tab === "companions" && <CompanionsTab ch={ch} update={update} data={data} campaign={campaign} file={file} roll={onRoll} />}
        {tab === "build" && <Builder ch={ch} sheet={sheet} rules={rules} update={update} onLevelUp={() => setDialog("levelup")} />}
        {tab === "notes" && (
          <>
            <NotesTab ch={ch} update={update} />
            <div className="row" style={{ marginTop: 24 }}>
              <button className="small" onClick={() => setDialog("delete")}>Delete character…</button>
            </div>
          </>
        )}
      </div>

      {printing && <PrintSheet ch={ch} sheet={sheet} rules={rules} onClose={() => setPrinting(false)} />}
      {dialog === "levelup" && <LevelUpDialog ch={ch} sheet={sheet} rules={rules} update={update} roll={onRoll} onClose={() => setDialog(null)} />}
      {dialog === "equipment" && <EquipmentDialog ch={ch} rules={rules} update={update} onClose={() => setDialog(null)} />}
      {dialog === "delete" && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setDialog(null)}>
          <div className="modal" role="alertdialog" aria-modal="true">
            <h2>Delete {ch.name}?</h2>
            <p>
              It moves to <b>Documents\Lorewright\{campaign}\.trash</b>. To get it back, move the file from there into the
              Characters folder.
            </p>
            <div className="row">
              <button
                className="primary"
                onClick={async () => {
                  window.clearTimeout(timer.current);
                  latest.current = null;
                  await deleteCharacter(campaign, file);
                  onDeleted();
                }}
              >
                Delete
              </button>
              <button onClick={() => setDialog(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
