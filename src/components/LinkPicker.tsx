// The picker shown under a selection when there's more than one possible
// entry: a search box (pre-filled with the selection) and a keyboard-driven list.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DataStore } from "../lib/data.ts";
import type { Match } from "../lib/search.ts";
import type { Entry, Kind } from "../lib/types.ts";

export const KIND_LABEL: Record<Kind, string> = {
  spell: "Spell",
  creature: "Creature",
  item: "Item",
  condition: "Condition",
  feat: "Feat",
};

interface Props {
  data: DataStore;
  query: string;
  /** Results already computed for the initial query (skips one search). */
  initial?: Match[];
  allowedSources: string[];
  /** Viewport position to open at (just under the selection). */
  anchor: { left: number; top: number; bottom: number };
  title?: string;
  onPick: (entry: Entry) => void;
  onClose: () => void;
}

export default function LinkPicker({ data, query: startQuery, initial, allowedSources, anchor, title, onPick, onClose }: Props) {
  const [query, setQuery] = useState(startQuery);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 6 });

  const results = useMemo(
    () => (query === startQuery && initial ? initial : data.index.search(query, { allowedSources, limit: 20 })),
    [query, startQuery, initial, data, allowedSources],
  );

  useEffect(() => setActive(0), [results]);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  // Keep the picker on screen: flip above the selection if there's no room below.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - r.width - 8));
    const below = anchor.bottom + 6;
    const top = below + r.height > window.innerHeight - 8 ? Math.max(8, anchor.top - r.height - 6) : below;
    setPos({ left, top });
  }, [anchor, results.length]);

  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Click outside closes.
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", down, true);
    return () => document.removeEventListener("mousedown", down, true);
  }, [onClose]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) onPick(results[active].entry);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  };

  return (
    <div className="picker" ref={box} style={{ left: pos.left, top: pos.top }} role="dialog" aria-label="Link to 5e.tools">
      {title && <div className="picker-title small">{title}</div>}
      <input
        ref={input}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
        placeholder="Search spells, creatures, items…"
        aria-controls="picker-list"
        aria-activedescendant={results[active] ? `pick-${active}` : undefined}
        spellCheck={false}
      />
      <div className="picker-list" id="picker-list" role="listbox" ref={list}>
        {results.map((m, i) => (
          <div
            key={`${m.entry.kind}|${m.entry.name}|${m.entry.source}`}
            id={`pick-${i}`}
            data-i={i}
            role="option"
            aria-selected={i === active}
            className={`picker-row k-${m.entry.kind} ${i === active ? "active" : ""}`}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(m.entry);
            }}
          >
            <span className="kind-dot" />
            <span className="picker-name">{m.entry.name}</span>
            <span className="picker-meta">
              {KIND_LABEL[m.entry.kind]} · {m.entry.source}
            </span>
          </div>
        ))}
        {!results.length && <div className="picker-empty small muted">No matches{query.trim() ? ` for “${query.trim()}”` : ""}.</div>}
      </div>
      <div className="picker-foot small muted">↑↓ choose · Enter link · Esc cancel</div>
    </div>
  );
}
