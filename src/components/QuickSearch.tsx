// Ctrl+K: jump to a note or character, or pin a 5e.tools card, from one box.

import { useEffect, useMemo, useRef, useState } from "react";
import { quickSearch, type QuickItem, type QuickSources } from "../lib/quicksearch.ts";
import { KIND_LABEL } from "./LinkPicker.tsx";

interface Props {
  sources: QuickSources;
  onPick: (item: QuickItem, opts: { browser: boolean }) => void;
  onClose: () => void;
}

const keyOf = (x: QuickItem) =>
  x.type === "entry" ? `e|${x.entry.kind}|${x.entry.name}|${x.entry.source}` : x.type === "rule" ? `r|${x.rule.kind}|${x.rule.name}|${x.rule.source}` : x.type === "table" ? `t|${x.id}` : `${x.type}|${x.file}`;

export default function QuickSearch({ sources, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const results = useMemo(() => quickSearch(query, sources), [query, sources]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (item: QuickItem | undefined, browser = false) => {
    if (!item) return;
    onPick(item, { browser });
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active], e.ctrlKey || e.metaKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="qs-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qs" role="dialog" aria-label="Quick search">
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Search notes, characters, classes, subclasses, spells, creatures, items…"
          aria-controls="qs-list"
          aria-activedescendant={results[active] ? `qs-${active}` : undefined}
          spellCheck={false}
        />
        <div className="qs-list" id="qs-list" role="listbox" ref={list}>
          {results.map((x, i) => (
            <div
              key={keyOf(x)}
              id={`qs-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === active}
              className={`picker-row ${x.type === "entry" ? `k-${x.entry.kind}` : x.type === "rule" ? `k-${x.rule.kind}` : `qs-${x.type}`} ${i === active ? "active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(x, e.ctrlKey || e.metaKey);
              }}
            >
              <span className="kind-dot" />
              {x.type === "rule" ? (
                <>
                  <span className="picker-name">{x.rule.label}</span>
                  <span className="picker-meta">{x.rule.hint}</span>
                </>
              ) : x.type === "entry" ? (
                <>
                  <span className="picker-name">{x.entry.name}</span>
                  <span className="picker-meta">{KIND_LABEL[x.entry.kind] ?? x.entry.kind} · {x.entry.source}</span>
                </>
              ) : x.type === "table" ? (
                <>
                  <span className="picker-name">🎲 {x.name}</span>
                  <span className="picker-meta">Random table · d{x.size}</span>
                </>
              ) : x.type === "character" ? (
                <>
                  <span className="picker-name">{x.name}</span>
                  <span className="picker-meta">Character{x.detail ? ` · ${x.detail}` : ""}</span>
                </>
              ) : (
                <>
                  <span className="picker-name">
                    {x.title}
                    {x.snippet && (
                      <span className="qs-snippet small muted">
                        {" "}
                        {x.snippet[0]}
                        <mark>{x.snippet[1]}</mark>
                        {x.snippet[2]}
                      </span>
                    )}
                  </span>
                  <span className="picker-meta">Note</span>
                </>
              )}
            </div>
          ))}
          {!results.length && <div className="picker-empty small muted">{query.trim() ? `Nothing found for “${query.trim()}”.` : "No notes or characters yet."}</div>}
        </div>
        <div className="picker-foot small muted">↑↓ choose · Enter open (cards are pinned) · Ctrl+Enter open on 5e.tools · Esc close</div>
      </div>
    </div>
  );
}
