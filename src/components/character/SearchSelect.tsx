// A select with a search box, for long option lists (species, backgrounds, items…).

import { useEffect, useMemo, useRef, useState } from "react";

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  options: Option[];
  value?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  /** Max rows rendered at once. */
  limit?: number;
}

export default function SearchSelect({ options, value, placeholder = "Search…", onChange, limit = 60 }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return options.slice(0, limit);
    // Exact name first, then names starting with the text, then anything containing it.
    const rank = (o: Option) => {
      const l = o.label.toLowerCase();
      return l === ql ? 0 : l.startsWith(ql) ? 1 : 2;
    };
    return options
      .filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(ql))
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, limit);
  }, [q, options, limit]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);

  const pick = (o: Option) => {
    onChange(o.value);
    setOpen(false);
    setQ("");
  };

  return (
    <div className="ssel" ref={box}>
      <input
        value={open ? q : current?.label ?? ""}
        placeholder={current ? current.label : placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && shown[active]) {
            e.preventDefault();
            pick(shown[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <div className="ssel-list" role="listbox">
          {shown.map((o, i) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`ssel-row ${i === active ? "active" : ""} ${o.value === value ? "on" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
            >
              <span>{o.label}</span>
              {o.hint && <span className="muted small">{o.hint}</span>}
            </div>
          ))}
          {!shown.length && <div className="ssel-row muted small">No matches</div>}
          {shown.length === limit && <div className="ssel-row muted small">Type to narrow down…</div>}
        </div>
      )}
    </div>
  );
}
