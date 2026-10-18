// A printable character sheet: everything on one clean page (or a few),
// shown as a preview first. Print sends it to a printer or "Save as PDF".

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Rules } from "../../lib/character/rules.ts";
import { ABILITIES, ABILITY_NAMES, type Character, type Sheet } from "../../lib/character/types.ts";
import { signed } from "./labels.ts";

const ORD = ["Cantrips", "1st level", "2nd level", "3rd level", "4th level", "5th level", "6th level", "7th level", "8th level", "9th level"];
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const plain = (x: any): string => {
  if (typeof x === "string") return x.replace(/\{@\w+ ([^|}]+)[^}]*\}/g, "$1").replace(/\{@\w+\}/g, "");
  if (Array.isArray(x)) return x.map(plain).filter(Boolean).join(" ");
  if (x && typeof x === "object") return [x.name ? `${x.name}.` : "", plain(x.entries ?? x.items ?? [])].filter(Boolean).join(" ");
  return "";
};

export default function PrintSheet({ ch, sheet, rules, onClose }: { ch: Character; sheet: Sheet; rules: Rules; onClose: () => void }) {
  const [details, setDetails] = useState(false);
  useEffect(() => {
    document.body.classList.add("printing");
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => {
      document.body.classList.remove("printing");
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const summary = [ch.race?.name, ch.background?.name, ch.classes.map((c) => `${c.name} ${c.level}`).join(" / ")].filter(Boolean).join(" · ");
  const spellLevel = (ref: string) => {
    const [n, s] = ref.split("|");
    return rules.data.find("spell", n, s)?.raw.level ?? 0;
  };
  const spellName = (ref: string) => ref.split("|")[0];

  // Outside the app's own tree, so printing can hide everything else.
  return createPortal(
    <div className="print-overlay" role="dialog" aria-label="Print character sheet">
      <div className="print-toolbar row">
        <b className="grow">Print {ch.name || "character"}</b>
        <label className="row small">
          <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} /> Feature rules text
        </label>
        <button className="primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <button onClick={onClose}>Close</button>
      </div>
      <p className="small muted print-hint">In the print window, pick your printer, or "Save as PDF" / "Microsoft Print to PDF" to make a PDF file.</p>

      <article className="print-sheet">
        <header className="ps-head">
          {ch.portrait && <img className="ps-portrait" src={ch.portrait} alt="" />}
          <div className="ps-title">
            <h1>{ch.name || "Unnamed"}</h1>
            <div>
              {summary} {sheet.totalLevel > 0 && `· Level ${sheet.totalLevel}`}
            </div>
            <div className="ps-muted">{[ch.alignment, ch.player && `Player: ${ch.player}`].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="ps-vitals">
            <div><span>AC</span><b>{sheet.ac.value}</b></div>
            <div><span>HP</span><b>{sheet.hp.max}</b></div>
            <div><span>Init</span><b>{signed(sheet.initiative)}</b></div>
            <div><span>Speed</span><b>{sheet.speed.walk}</b></div>
            <div><span>Prof</span><b>{signed(sheet.proficiencyBonus)}</b></div>
          </div>
        </header>

        <section className="ps-abilities">
          {ABILITIES.map((a) => (
            <div key={a}>
              <span>{ABILITY_NAMES[a]}</span>
              <b>{signed(sheet.abilities[a].mod)}</b>
              <small>{sheet.abilities[a].score}</small>
            </div>
          ))}
        </section>

        <div className="ps-cols">
          <section>
            <h2>Saving throws</h2>
            <ul className="ps-list">
              {ABILITIES.map((a) => (
                <li key={a}>
                  {sheet.saves[a].proficient ? "●" : "○"} {ABILITY_NAMES[a]} <b>{signed(sheet.saves[a].mod)}</b>
                </li>
              ))}
            </ul>
            <h2>Skills</h2>
            <ul className="ps-list">
              {Object.entries(sheet.skills).map(([k, s]) => (
                <li key={k}>
                  {s.expertise ? "◉" : s.proficient ? "●" : "○"} {cap(k)} <b>{signed(s.mod)}</b>
                </li>
              ))}
            </ul>
            <p>
              Passive Perception <b>{sheet.passive.perception}</b> · Investigation <b>{sheet.passive.investigation}</b> · Insight <b>{sheet.passive.insight}</b>
            </p>
          </section>

          <section>
            <h2>Attacks</h2>
            <table className="ps-table">
              <tbody>
                {sheet.attacks.map((a) => (
                  <tr key={a.name}>
                    <td>{a.name}</td>
                    <td>{a.toHit != null ? signed(a.toHit) : "save"}</td>
                    <td>
                      {a.damage} {a.damageType}
                      {a.extraDamage?.map((x) => ` + ${x.dice} ${x.type}`).join("")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sheet.attacksPerAction > 1 && <p>{sheet.attacksPerAction} attacks per Attack action.</p>}
            <p>
              Hit dice: {sheet.hitDice.map((h) => `${h.total}d${h.faces}`).join(", ")}
              {sheet.resistances.length > 0 && <> · Resistant: {sheet.resistances.join(", ")}</>}
              {sheet.senses.length > 0 && <> · {sheet.senses.join(", ")}</>}
            </p>
            {sheet.resources.length > 0 && (
              <>
                <h2>Limited uses</h2>
                <ul className="ps-list">
                  {sheet.resources.map((r) => (
                    <li key={r.id}>
                      {r.name}: {"☐".repeat(Math.min(r.max, 20))} <span className="ps-muted">({r.max}, {r.recharge} rest)</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h2>Proficiencies</h2>
            <p>
              {[
                sheet.proficiencies.armor.length && `Armor: ${sheet.proficiencies.armor.join(", ")}`,
                sheet.proficiencies.weapons.length && `Weapons: ${sheet.proficiencies.weapons.join(", ")}`,
                sheet.proficiencies.tools.length && `Tools: ${sheet.proficiencies.tools.join(", ")}`,
                sheet.proficiencies.languages.length && `Languages: ${sheet.proficiencies.languages.join(", ")}`,
              ]
                .filter(Boolean)
                .join(". ")}
            </p>
          </section>
        </div>

        {sheet.spellcasting.length > 0 && (
          <section className="ps-spells">
            <h2>Spells</h2>
            <p>
              {sheet.spellcasting.map((s) => `${s.className}: save DC ${s.dc}, attack ${signed(s.attack)} (${ABILITY_NAMES[s.ability]})`).join(" · ")}
              {sheet.slots.some(Boolean) && <> · Slots: {sheet.slots.map((n, i) => (n ? `${ORD[i + 1].split(" ")[0]} ${"☐".repeat(n)}` : "")).filter(Boolean).join("  ")}</>}
              {sheet.pact && <> · Pact slots: {"☐".repeat(sheet.pact.slots)} ({ORD[sheet.pact.level].split(" ")[0]} level)</>}
            </p>
            {sheet.spellcasting.map((sc) => {
              const own = ch.spells[sc.classRef] ?? { cantrips: [], known: [], prepared: [] };
              const list = [...new Set([...own.cantrips, ...(sc.mode === "known" ? own.known : own.prepared), ...sc.alwaysPrepared, ...sc.bonusKnown])];
              const byLevel = new Map<number, string[]>();
              for (const r of list) byLevel.set(spellLevel(r), [...(byLevel.get(spellLevel(r)) ?? []), spellName(r)]);
              return (
                <div key={sc.classRef}>
                  <b>{sc.className}</b>
                  <ul className="ps-list ps-inline">
                    {[...byLevel.entries()]
                      .sort((a, b) => a[0] - b[0])
                      .map(([lvl, names]) => (
                        <li key={lvl}>
                          <i>{ORD[lvl]}:</i> {names.sort().join(", ")}
                        </li>
                      ))}
                  </ul>
                </div>
              );
            })}
            {sheet.extraSpells.length > 0 && <p>Other: {sheet.extraSpells.map((s) => `${spellName(s.ref)} (${s.note})`).join(", ")}</p>}
          </section>
        )}

        <section>
          <h2>Features</h2>
          {details ? (
            sheet.features.map((f) => (
              <p key={`${f.from}-${f.name}`} className="ps-feature">
                <b>{f.name}</b> <span className="ps-muted">({f.from})</span> {plain(f.entries).slice(0, 600)}
              </p>
            ))
          ) : (
            <p>{sheet.features.map((f) => `${f.name} (${f.from})`).join(" · ")}</p>
          )}
        </section>

        <div className="ps-cols">
          <section>
            <h2>Equipment</h2>
            <ul className="ps-list">
              {ch.inventory.map((i) => (
                <li key={i.id}>
                  {i.equipped ? "●" : "○"} {i.name}
                  {i.qty > 1 ? ` ×${i.qty}` : ""}
                  {i.attuned ? " (attuned)" : ""}
                </li>
              ))}
            </ul>
            <p>
              Coins: {(["pp", "gp", "ep", "sp", "cp"] as const).map((k) => `${ch.currency[k]} ${k}`).join(", ")}
            </p>
          </section>
          <section>
            <h2>About</h2>
            {(
              [
                ["Personality", ch.notes.personality],
                ["Ideals", ch.notes.ideals],
                ["Bonds", ch.notes.bonds],
                ["Flaws", ch.notes.flaws],
                ["Appearance", ch.notes.appearance],
                ["Backstory", ch.notes.backstory],
                ["Notes", ch.notes.other],
              ] as const
            )
              .filter(([, v]) => v?.trim())
              .map(([k, v]) => (
                <p key={k}>
                  <b>{k}.</b> {v}
                </p>
              ))}
          </section>
        </div>
        <footer className="ps-muted">Made with Lorewright</footer>
      </article>
    </div>,
    document.body,
  );
}
