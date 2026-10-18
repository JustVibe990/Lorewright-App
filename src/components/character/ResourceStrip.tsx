// A small strip under the tabs: spell slots, pact slots and limited-use
// features (Rage, Ki, Channel Divinity…) with what's left. Click a dot to
// use one or get it back, from any tab.

import type { Character, Sheet } from "../../lib/character/types.ts";

type Update = (fn: (c: Character) => Character) => void;
const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

function Pips({ max, used, label, onSet }: { max: number; used: number; label: string; onSet: (used: number) => void }) {
  const left = Math.max(0, max - used);
  if (max > 8) {
    return (
      <span className="strip-count">
        <button className="ghost small" disabled={left <= 0} onClick={() => onSet(used + 1)} aria-label={`Use ${label}`}>
          −
        </button>
        <b>{left}</b>/{max}
        <button className="ghost small" disabled={used <= 0} onClick={() => onSet(used - 1)} aria-label={`Get back ${label}`}>
          +
        </button>
      </span>
    );
  }
  return (
    <span className="pips">
      {Array.from({ length: max }, (_, i) => (
        <button key={i} className={`pip ${i < left ? "on" : ""}`} onClick={() => onSet(i < left ? used + 1 : used - 1)} aria-label={i < left ? `Use ${label}` : `Get back ${label}`} />
      ))}
    </span>
  );
}

export default function ResourceStrip({ ch, sheet, update }: { ch: Character; sheet: Sheet; update: Update }) {
  const slots = sheet.slots.map((max, i) => ({ max, i })).filter((s) => s.max > 0);
  const res = sheet.resources.filter((r) => r.max > 0);
  if (!slots.length && !sheet.pact && !res.length) return null;
  const setSlot = (i: number, n: number) =>
    update((c) => {
      const s = [...c.state.slotsUsed];
      s[i] = Math.max(0, Math.min(sheet.slots[i], n));
      return { ...c, state: { ...c.state, slotsUsed: s } };
    });
  const setRes = (id: string, max: number, n: number) => update((c) => ({ ...c, state: { ...c.state, resourcesUsed: { ...c.state.resourcesUsed, [id]: Math.max(0, Math.min(max, n)) } } }));

  return (
    <div className="resource-strip small" aria-label="Spell slots and limited uses">
      {slots.map(({ max, i }) => (
        <span key={`s${i}`} className="strip-item" title={`${ORD[i]}-level spell slots`}>
          <span className="muted">{ORD[i]}</span>
          <Pips max={max} used={ch.state.slotsUsed[i] ?? 0} label={`a ${ORD[i]}-level slot`} onSet={(n) => setSlot(i, n)} />
        </span>
      ))}
      {sheet.pact && (
        <span className="strip-item" title={`Pact Magic slots (${ORD[sheet.pact.level - 1]} level), back on a short rest`}>
          <span className="muted">Pact {ORD[sheet.pact.level - 1]}</span>
          <Pips
            max={sheet.pact.slots}
            used={ch.state.pactUsed}
            label="a pact slot"
            onSet={(n) => update((c) => ({ ...c, state: { ...c.state, pactUsed: Math.max(0, Math.min(sheet.pact!.slots, n)) } }))}
          />
        </span>
      )}
      {res.map((r) => (
        <span key={r.id} className="strip-item" title={`${r.name} (${r.from}), back on a ${r.recharge} rest`}>
          <span className="muted">{r.name}</span>
          <Pips max={r.max} used={r.used} label={r.name} onSet={(n) => setRes(r.id, r.max, n)} />
        </span>
      ))}
    </div>
  );
}
