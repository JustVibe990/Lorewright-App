// Random tables: make your own (one result per line) and roll on them here or
// from the quick search (Ctrl+K). Results go in the roll log.

import { useState } from "react";
import { uid } from "../../lib/combat.ts";
import { rollOn, starterTables, tableRows, tableSize, type RandomTable } from "../../lib/tables.ts";
import type { DmChildProps } from "./DmView.tsx";

export default function RandomTables({ dm, change, onRoll }: DmChildProps) {
  const tables = dm.tables ?? [];
  const [openId, setOpenId] = useState<string | null>(tables[0]?.id ?? null);
  const [results, setResults] = useState<{ table: string; text: string; n: number; size: number }[]>([]);
  const t = tables.find((x) => x.id === openId) ?? null;
  const setTables = (fn: (l: RandomTable[]) => RandomTable[]) => change((d) => ({ ...d, tables: fn(d.tables ?? []) }));
  const setT = (patch: Partial<RandomTable>) => t && setTables((l) => l.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));

  const rollTable = (table: RandomTable) => {
    const size = tableSize(table);
    if (!size) return;
    let text = "";
    onRoll(`1d${size}`, table.name, (r) => {
      text = rollOn(table, tables, Math.random, 0, r.total).text;
      return `${table.name}: ${text}`;
    });
    // The roll log gets the die; if it couldn't roll (no log), roll here.
    if (!text) text = rollOn(table, tables).text;
    setResults((l) => [{ table: table.name, text, n: 0, size }, ...l].slice(0, 12));
  };

  const create = () => {
    const nt: RandomTable = { id: uid(), name: `Table ${tables.length + 1}`, text: "" };
    setTables((l) => [...l, nt]);
    setOpenId(nt.id);
  };

  return (
    <div className="dm-tables">
      <div className="row" style={{ flexWrap: "wrap" }}>
        {tables.map((x) => (
          <span key={x.id} className="row hb-chip">
            <button className={x.id === openId ? "primary" : ""} onClick={() => setOpenId(x.id)}>
              {x.name || "Unnamed"}
            </button>
            <button className="ghost small" title={`Roll on ${x.name}`} aria-label={`Roll on ${x.name}`} onClick={() => rollTable(x)}>
              🎲
            </button>
          </span>
        ))}
        <button onClick={create}>+ New table</button>
        {!tables.some((x) => x.name === "Rumours") && (
          <button className="ghost small" onClick={() => setTables((l) => [...l, ...starterTables()])} title="Tavern names, rumours, weather and pocket finds">
            Add starter tables
          </button>
        )}
      </div>
      {results.length > 0 && (
        <section className="dm-card table-results">
          <div className="row">
            <b className="grow">Results</b>
            <button className="ghost small" onClick={() => setResults([])}>
              Clear
            </button>
          </div>
          <ul>
            {results.map((r, i) => (
              <li key={i} className={i === 0 ? "latest" : "muted"}>
                <span className="small muted">{r.table}:</span> {r.text}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!tables.length && <p className="muted pad">Make tables for anything you roll for at the table: tavern names, rumours, weather, wild magic, what's in a dead goblin's pockets. Or start with a few of Lorewright's.</p>}
      {t && (
        <section className="dm-card">
          <div className="row">
            <input className="grow name-input" value={t.name} onChange={(e) => setT({ name: e.target.value })} aria-label="Table name" />
            <button className="primary" disabled={!tableSize(t)} onClick={() => rollTable(t)}>
              🎲 Roll d{tableSize(t) || "?"}
            </button>
            <button className="ghost small" onClick={() => (setTables((l) => l.filter((x) => x.id !== t.id)), setOpenId(null))}>
              Delete
            </button>
          </div>
          <textarea rows={12} value={t.text} placeholder={"One result per line, e.g.\nA wandering merchant\n3x Nothing happens\n{1d4} wolves\nThe weather turns: [[Weather]]"} onChange={(e) => setT({ text: e.target.value })} spellCheck />
          <p className="small muted">
            {tableRows(t).length} results, rolled with a d{tableSize(t) || "?"}. Start a line with <b>3x</b> to make it three times as likely, write <b>{"{2d6}"}</b> to roll dice in the result, and <b>[[Table name]]</b> to roll on another table. Also in the quick search (Ctrl+K).
          </p>
        </section>
      )}
    </div>
  );
}
