// The short rest: spend Hit Dice one at a time (each is rolled with your
// Constitution modifier), add Song of Rest, see what comes back, then finish.

import { useState } from "react";
import { chargeInfo, rechargeItems } from "../../lib/character/charges.ts";
import { itemData } from "../../lib/character/items.ts";
import { hitDieHeal, shortRest, songOfRestDie } from "../../lib/character/rest.ts";
import type { Rules } from "../../lib/character/rules.ts";
import type { Character, Sheet } from "../../lib/character/types.ts";
import { Modal } from "../common.tsx";
import { signed } from "./labels.ts";

type Update = (fn: (c: Character) => Character) => void;
type Roll = (expr: string, label: string) => unknown;
const totalOf = (r: unknown) => (r && typeof r === "object" && "total" in r ? Number((r as { total: number }).total) : 0);

export function ShortRestDialog({ ch, sheet, rules, update, roll, onClose }: { ch: Character; sheet: Sheet; rules: Rules; update: Update; roll: Roll; onClose: () => void }) {
  const [spent, setSpent] = useState<Record<string, number>>({});
  const [rolls, setRolls] = useState<{ label: string; hp: number }[]>([]);
  const [song, setSong] = useState(false);
  const con = sheet.abilities.con.mod;
  const durable = sheet.featureNames.includes("Durable");
  const bard = ch.classes.filter((c) => c.name === "Bard").reduce((n, c) => n + c.level, 0);
  const songDie = sheet.featureNames.includes("Song of Rest") ? songOfRestDie(bard) : null;
  const who = ch.name || "Character";
  const healed = rolls.reduce((n, r) => n + r.hp, 0);
  const hpNow = Math.min(sheet.hp.max, ch.state.hp + healed);
  const anySpent = Object.values(spent).some((n) => n > 0);

  const spend = (classRef: string, faces: number) => {
    const r = totalOf(roll(`1d${faces}`, `${who}: hit die (d${faces}) ${signed(con)} Con`));
    const hp = hitDieHeal(r, con, durable);
    setSpent((s) => ({ ...s, [classRef]: (s[classRef] ?? 0) + 1 }));
    setRolls((l) => [...l, { label: `d${faces}: ${r} ${signed(con)}${durable && hp > Math.max(0, r + con) ? " (Durable)" : ""}`, hp }]);
  };
  const singSong = () => {
    if (!songDie) return;
    const r = totalOf(roll(songDie, `${who}: Song of Rest`));
    setSong(true);
    setRolls((l) => [...l, { label: `Song of Rest ${songDie}: ${r}`, hp: r }]);
  };

  const back = [
    ...sheet.resources.filter((r) => r.recharge === "short" && r.used > 0).map((r) => r.name),
    ...(sheet.pact && ch.state.pactUsed > 0 ? ["Pact Magic slots"] : []),
  ];
  const ending = (ch.state.active ?? []).map((a) => a.name);
  const finish = () => {
    update((c) => {
      const rested = shortRest(c, sheet, healed, spent);
      return rechargeItems(rested, (inv) => chargeInfo(itemData(rules, inv), inv), "short", (e, l) => totalOf(roll(e, l))).ch;
    });
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div className="row">
        <h2 className="grow">Short rest</h2>
        <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <p className="small muted">At least an hour of rest. Spend Hit Dice to heal: each one rolls and adds your Constitution modifier ({signed(con)}).</p>
      <div className="rest-hp">
        HP <b>{hpNow}</b>/{sheet.hp.max}
        {healed > 0 && <span className="ok"> (+{healed})</span>}
      </div>
      <h4 className="sheet-h">Hit Dice</h4>
      {sheet.hitDice.map((h) => {
        const left = h.total - (ch.state.hitDiceUsed[h.classRef] ?? 0) - (spent[h.classRef] ?? 0);
        return (
          <div key={h.classRef} className="row small rest-dice">
            <span className="grow">
              {h.classRef.split("|")[0]} d{h.faces}: <b>{left}</b>/{h.total} left
            </span>
            <button className="primary small" disabled={left <= 0 || hpNow >= sheet.hp.max} onClick={() => spend(h.classRef, h.faces)}>
              Spend and roll d{h.faces}
            </button>
          </div>
        );
      })}
      {songDie && (
        <div className="row small rest-dice">
          <span className="grow">Song of Rest: +{songDie} when you spend at least one Hit Die</span>
          <button className="small" disabled={song || !anySpent} onClick={singSong}>
            Roll {songDie}
          </button>
        </div>
      )}
      {rolls.length > 0 && (
        <ul className="small rest-rolls">
          {rolls.map((r, i) => (
            <li key={i}>
              {r.label} = <b>{r.hp}</b> HP
            </li>
          ))}
        </ul>
      )}
      <h4 className="sheet-h">When you finish</h4>
      <ul className="small">
        {back.length ? <li>Back: {back.join(", ")}</li> : <li className="muted">No short-rest features to get back.</li>}
        {ending.length > 0 && <li>Ends: {ending.join(", ")}</li>}
        {sheet.featureNames.includes("Arcane Recovery") && <li>Arcane Recovery (once a day): get back spent slots worth up to half your wizard level, rounded up, by hand on the sheet.</li>}
        {sheet.featureNames.includes("Natural Recovery") && <li>Natural Recovery (once a day): get back spent slots worth up to half your druid level, rounded up, by hand on the sheet.</li>}
      </ul>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={finish}>
          Finish short rest
        </button>
      </div>
    </Modal>
  );
}
