// Session-only panels: pinned cards and the roll log on the right, with a
// sizer between them. Pins and rolls aren't saved; they reset on restart.

import { useRef, useState } from "react";
import type { DataStore } from "../lib/data.ts";
import { isDiceExpr, rollModeLabel, rollModeOf, withRollMode, type RollResult } from "../lib/dice.ts";
import type { Entry } from "../lib/types.ts";
import { EntryCard, MissingCard } from "./EntryCard.tsx";
import type { LinkAttrs } from "./HoverCards.tsx";

export interface Pin {
  key: string;
  attrs: LinkAttrs;
}
export interface LoggedRoll extends RollResult {
  id: number;
  label: string;
  at: number;
}

// Height of the roll log under the pinned cards; remembered on this computer.
const ROLLS_KEY = "lorewright.rollsHeight";
const DEFAULT_ROLLS = 280;
const MIN_PANE = 90;
function loadRollsHeight(): number {
  try {
    const n = Number(localStorage.getItem(ROLLS_KEY));
    return n >= MIN_PANE ? n : DEFAULT_ROLLS;
  } catch {
    return DEFAULT_ROLLS;
  }
}
function saveRollsHeight(n: number) {
  try {
    localStorage.setItem(ROLLS_KEY, String(n));
  } catch {
    /* not saved: fine */
  }
}

export const pinKey =(a: LinkAttrs) => `${a.kind}|${a.name}|${a.source}`.toLowerCase();

export function RightPanel({
  pins,
  rolls,
  data,
  onUnpin,
  onClearRolls,
  resolve,
  onRoll,
}: {
  pins: Pin[];
  rolls: LoggedRoll[];
  data: DataStore;
  onUnpin: (key: string) => void;
  onClearRolls: () => void;
  resolve?: (attrs: LinkAttrs) => Entry | undefined;
  onRoll?: (expr: string, label: string) => unknown;
}) {
  const aside = useRef<HTMLElement>(null);
  const [rollsHeight, setRollsHeight] = useState(loadRollsHeight);
  const [dragging, setDragging] = useState(false);
  const resize = (h: number) => {
    const total = aside.current?.clientHeight ?? 800;
    const next = Math.round(Math.max(MIN_PANE, Math.min(total - MIN_PANE, h)));
    setRollsHeight(next);
    return next;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setDragging(true);
    const bottom = aside.current?.getBoundingClientRect().bottom ?? 0;
    let last = rollsHeight;
    const move = (ev: PointerEvent) => {
      last = resize(bottom - ev.clientY);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setDragging(false);
      saveRollsHeight(last);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  return (
    <aside className="right" ref={aside}>
      <div className="right-pins">
        <h3 className="panel-title">Pinned</h3>
        {!pins.length && <p className="small muted pad">Click a link in a note to pin its card here.</p>}
        {pins.map((p) => {
          const entry = data.find(p.attrs.kind, p.attrs.name, p.attrs.source) ?? resolve?.(p.attrs);
          return (
            <div key={p.key} className={`pinned card k-${p.attrs.kind}`}>
              <button className="ghost pin-close" onClick={() => onUnpin(p.key)} aria-label={`Close ${p.attrs.name}`} title="Close">
                ✕
              </button>
              {entry ? <EntryCard entry={entry} data={data} /> : <MissingCard attrs={p.attrs} />}
            </div>
          );
        })}
      </div>
      <div
        className={`right-sizer ${dragging ? "dragging" : ""}`}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize pinned cards and roll log"
        aria-valuenow={rollsHeight}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onDoubleClick={() => saveRollsHeight(resize(DEFAULT_ROLLS))}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            saveRollsHeight(resize(rollsHeight + (e.key === "ArrowUp" ? 24 : -24)));
          }
        }}
      />
      <div className="right-rolls" style={{ height: rollsHeight }}>
        <div className="row">
          <h3 className="panel-title grow">Roll log</h3>
          {rolls.length > 0 && (
            <button className="link small" onClick={onClearRolls}>
              Clear
            </button>
          )}
        </div>
        {onRoll && <DiceBox onRoll={onRoll} />}
        {!rolls.length && <p className="small muted pad">Click dice in a card to roll, or type dice above.</p>}
        <ol className="roll-log">
          {rolls.map((r) => (
            <li key={r.id}>
              <span className="roll-total">{r.total}</span>
              <span className="roll-what">
                <span className="roll-label">{r.label}</span>
                <span className="small muted">
                  {r.expr} · {r.detail}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];

/**
 * Type any dice ("2d6+3", "4d6kh3") and press Enter; Shift+Enter rolls a d20
 * with advantage, Ctrl+Enter with disadvantage. ↑ brings back earlier rolls.
 */
function DiceBox({ onRoll }: { onRoll: (expr: string, label: string) => unknown }) {
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const history = useRef<string[]>([]);
  const back = useRef(-1);

  const go = (expr: string, e?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
    const x = expr.trim();
    if (!isDiceExpr(x)) {
      setBad(true);
      return;
    }
    const mode = e ? rollModeOf(e) : null;
    onRoll(withRollMode(x, mode), `Roll ${x}${rollModeLabel(mode)}`);
    history.current = [x, ...history.current.filter((h) => h !== x)].slice(0, 20);
    back.current = -1;
    setText("");
    setBad(false);
  };

  return (
    <div className="dice-box">
      <input
        type="text"
        value={text}
        placeholder="2d6+3"
        aria-label="Dice to roll (Enter rolls)"
        aria-invalid={bad}
        className={bad ? "bad" : ""}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          setBad(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            go(text, e);
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            const h = history.current;
            if (!h.length) return;
            e.preventDefault();
            back.current = Math.max(-1, Math.min(h.length - 1, back.current + (e.key === "ArrowUp" ? 1 : -1)));
            setText(back.current < 0 ? "" : h[back.current]);
          }
        }}
      />
      <button className="small" onClick={(e) => go(text, e)} title="Shift: advantage · Ctrl: disadvantage">
        Roll
      </button>
      <div className="dice-quick">
        {QUICK_DICE.map((d) => (
          <button key={d} className="ghost small" onClick={(e) => go(`1d${d}`, e)}>
            d{d}
          </button>
        ))}
      </div>
      {bad && <div className="small error">Try dice like 2d6+3 or 4d6kh3.</div>}
    </div>
  );
}

export function RollToast({ roll }: { roll: LoggedRoll | null }) {
  if (!roll) return null;
  return (
    <div className="roll-toast" role="status" key={roll.id}>
      <span className="roll-total">{roll.total}</span>
      <span>
        <b>{roll.label}</b> <span className="muted">{roll.expr}</span>
        <div className="small muted">{roll.detail}</div>
      </span>
    </div>
  );
}
