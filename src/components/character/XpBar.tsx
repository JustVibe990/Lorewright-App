// Experience under the character's name: XP so far, how far to the next
// level, a box to add XP, and the switch to milestone levelling.

import { useState } from "react";
import { addXp, xpProgress } from "../../lib/character/xp.ts";
import type { Character } from "../../lib/character/types.ts";

type Update = (fn: (c: Character) => Character) => void;

export default function XpBar({ ch, level, update }: { ch: Character; level: number; update: Update }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const p = xpProgress(ch, level);
  if (level <= 0) return null;
  const n = Math.round(Number(amount) || 0);
  const give = () => {
    if (!n) return;
    update((c) => addXp(c, n, level));
    setAmount("");
  };

  if (ch.levelling === "milestone") {
    return (
      <div className="xp-bar small">
        <span className="muted">Milestone levelling: level up when your DM says.</span>{" "}
        <button className="link small" onClick={() => update((c) => ({ ...c, levelling: "xp" }))}>
          use XP
        </button>
      </div>
    );
  }

  return (
    <div className="xp-bar small">
      <button className="ghost small xp-sum" onClick={() => setOpen((x) => !x)} title="Add experience points" aria-expanded={open}>
        <b>{p.xp.toLocaleString()}</b> XP{p.next != null && <span className="muted"> / {p.next.toLocaleString()}</span>}
      </button>
      <span className="xp-track" aria-hidden>
        <span className="xp-fill" style={{ width: `${Math.round(p.fraction * 100)}%` }} />
      </span>
      {p.pending > 0 && (
        <span className="ok xp-ready">
          Enough for level {level + p.pending}!
        </span>
      )}
      {open && (
        <span className="row xp-add">
          <input
            className="hp-roll"
            value={amount}
            placeholder="+XP"
            autoFocus
            aria-label="Experience to add"
            onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && give()}
          />
          <button className="small primary" disabled={!n} onClick={give}>
            {n < 0 ? "Take" : "Add"}
          </button>
          <button className="link small" onClick={() => update((c) => ({ ...c, levelling: "milestone" }))} title="Level up when the DM says, without XP">
            milestone levelling
          </button>
        </span>
      )}
    </div>
  );
}
