// A rules card: statblock or rules text rendered from 5e.tools JSON.
// Links inside it are hoverable and clickable like note links (handled by the
// workspace's delegated listeners); dice are clickable.

import { useLayoutEffect, useMemo, useRef } from "react";
import type { DataStore } from "../lib/data.ts";
import type { Entry } from "../lib/types.ts";

export function EntryCard({ entry, data }: { entry: Entry; data: DataStore }) {
  const html = useMemo(() => data.card(entry), [entry, data]);
  const ref = useRef<HTMLDivElement>(null);

  // Flag links inside the card whose entry isn't loaded.
  useLayoutEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>("[data-5e]").forEach((el) => {
      const missing = !data.find(el.dataset["5e"] ?? "", el.dataset.name ?? "", el.dataset.source ?? "");
      el.classList.toggle("lk-missing", missing);
    });
  }, [html, data]);

  return <div ref={ref} className="card-content" data-card-name={entry.name} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function MissingCard({ attrs, onRelink }: { attrs: { kind: string; name: string; source: string }; onRelink?: () => void }) {
  return (
    <div className="card-content">
      <div className="card-head">
        <span className="card-name error">Not found</span>
        <span className="card-src">{attrs.source}</span>
      </div>
      <p className="small">
        <b>{attrs.name}</b> ({attrs.kind}, {attrs.source}) isn't in the loaded data. It may be from a source you haven't
        imported.
      </p>
      {onRelink && (
        <button className="primary small" onClick={onRelink}>
          Relink…
        </button>
      )}
    </div>
  );
}
