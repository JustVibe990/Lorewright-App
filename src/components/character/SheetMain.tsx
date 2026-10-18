// The Sheet tab: the numbers you use at the table. Click anything rollable.

import { useState } from "react";
import { gainTemp, heal, takeDamage } from "../../lib/character/hp.ts";
import { spendAmmo } from "../../lib/character/items.ts";
import { featureActions, timeLabel, useFeature, type FeatureAction } from "../../lib/character/actions.ts";
import { rollModeLabel, rollModeOf, withRollMode } from "../../lib/dice.ts";
import { ABILITIES, ABILITY_NAMES, type Ability, type Character, type Sheet } from "../../lib/character/types.ts";
import { signed } from "./labels.ts";
import { chargeInfo, rechargeItems } from "../../lib/character/charges.ts";
import { itemData } from "../../lib/character/items.ts";
import { longRest as longRestState } from "../../lib/character/rest.ts";
import type { Rules } from "../../lib/character/rules.ts";
import { ShortRestDialog } from "./RestDialog.tsx";
import { CONDITION_REMINDERS, EXHAUSTION_REMINDERS, type RollKind } from "../../lib/character/conditions.ts";

type Update = (fn: (c: Character) => Character) => void;
type Roll = (expr: string, label: string, kind?: RollKind) => unknown;
const totalOf = (r: unknown) => (r && typeof r === "object" && "total" in r ? Number((r as { total: number }).total) : null);

const d20 = (mod: number) => `1d20${mod >= 0 ? "+" : ""}${mod}`;
/** Roll a d20 test: Shift-click = advantage, Ctrl-click = disadvantage. */
const d20Roll = (roll: Roll, e: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }, expr: string, label: string, kind?: RollKind) => {
  const mode = rollModeOf(e);
  roll(withRollMode(expr, mode), label + rollModeLabel(mode), kind);
};
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export const CONDITIONS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"];

export default function SheetMain({ ch, sheet, rules, update, roll }: { ch: Character; sheet: Sheet; rules: Rules; update: Update; roll: Roll }) {
  const name = ch.name || "Character";
  const spend = (ids: string[]) => update((c) => ({ ...c, inventory: spendAmmo(c.inventory, ids) }));
  return (
    <div className="sheet">
      <Vitals ch={ch} sheet={sheet} rules={rules} update={update} roll={roll} />

      <p className="small muted roll-hint">Click to roll · Shift-click: advantage · Ctrl-click: disadvantage</p>
      <div className="sheet-cols">
        <div>
          <div className="abil-row">
            {ABILITIES.map((a) => (
              <div key={a} className="abil-box">
                <div className="abil-name">{a.toUpperCase()}</div>
                <button className="abil-mod roll-btn" onClick={(e) => d20Roll(roll, e, d20(sheet.abilities[a].mod), `${name}: ${ABILITY_NAMES[a]} check`, { kind: "check", ability: a })} title="Roll ability check">
                  {signed(sheet.abilities[a].mod)}
                </button>
                <div className="abil-score">{sheet.abilities[a].score}</div>
              </div>
            ))}
          </div>

          <h4 className="sheet-h">Saving throws</h4>
          <div className="save-grid">
            {ABILITIES.map((a) => (
              <button key={a} className="line-btn" onClick={(e) => d20Roll(roll, e, d20(sheet.saves[a].mod), `${name}: ${ABILITY_NAMES[a]} save`, { kind: "save", ability: a })}>
                <span className={`dot ${sheet.saves[a].proficient ? "on" : ""}`} />
                <span className="grow">{ABILITY_NAMES[a]}</span>
                <b>{signed(sheet.saves[a].mod)}</b>
              </button>
            ))}
          </div>

          <h4 className="sheet-h">Skills</h4>
          <div className="skill-list">
            {Object.entries(sheet.skills).map(([skill, s]) => (
              <button key={skill} className="line-btn" onClick={(e) => d20Roll(roll, e, d20(s.mod), `${name}: ${cap(skill)}`, { kind: "check", ability: s.ability })}>
                <span className={`dot ${s.expertise ? "double" : s.proficient ? "on" : s.half ? "half" : ""}`} title={s.expertise ? "Expertise" : s.proficient ? "Proficient" : s.half ? "Half proficiency" : ""} />
                <span className="grow">
                  {cap(skill)} <span className="muted small">({s.ability})</span>
                </span>
                <b>{signed(s.mod)}</b>
              </button>
            ))}
          </div>
          <p className="small muted">
            Passive Perception {sheet.passive.perception} · Investigation {sheet.passive.investigation} · Insight {sheet.passive.insight}
          </p>
        </div>

        <div>
          <h4 className="sheet-h">
            Attacks <span className="muted small">{sheet.attacksPerAction > 1 ? `${sheet.attacksPerAction} per Attack action` : ""}</span>
          </h4>
          <table className="attack-table">
            <tbody>
              {sheet.attacks.map((a) => (
                <tr key={a.name}>
                  <td>
                    <b>{a.name}</b>
                    <div className="small muted">{[a.range, ...a.notes].filter(Boolean).join(" · ")}</div>
                    {a.ammo && (
                      <div className={`small ammo ${a.ammo.left ? "" : "error"}`}>
                        {a.ammo.left ? `${a.ammo.left} ${a.ammo.name} left` : `Out of ${a.ammo.name}`}
                        {a.ammo.left > 0 && (
                          <button className="link small" title="Use one without rolling" onClick={() => spend(a.ammo!.ids)}>
                            −1
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    {a.toHit != null && (
                      <button
                        className="roll-btn"
                        title={a.ammo ? "Rolls the attack and uses one piece of ammunition" : undefined}
                        onClick={(e) => {
                          d20Roll(roll, e, d20(a.toHit!), `${name}: ${a.name} attack${a.ammo && !a.ammo.left ? " (no ammunition!)" : ""}`, { kind: "attack", range: a.ammo || (a.range?.includes("/") && !/thrown/i.test(a.notes.join(" "))) ? "ranged" : "melee" });
                          if (a.ammo?.left) spend(a.ammo.ids);
                        }}
                      >
                        {signed(a.toHit)}
                      </button>
                    )}
                  </td>
                  <td>
                    <button className="roll-btn" onClick={() => roll(a.damage, `${name}: ${a.name} damage`)}>{a.damage}</button> <span className="small muted">{a.damageType}</span>
                    {a.extraDamage?.map((x, i) => (
                      <span key={i} className="small">
                        {" "}+ <button className="roll-btn" onClick={() => roll(x.dice, `${name}: ${a.name} ${x.type} damage`)}>{x.dice}</button> <span className="muted">{x.type}</span>
                      </span>
                    ))}
                    {a.versatile && (
                      <div className="small">
                        two-handed <button className="roll-btn" onClick={() => roll(a.versatile!, `${name}: ${a.name} damage (two-handed)`)}>{a.versatile}</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {sheet.spellcasting.map((s) => (
                <tr key={s.classRef}>
                  <td>
                    <b>{s.className} spells</b>
                    <div className="small muted">{ABILITY_NAMES[s.ability]}</div>
                  </td>
                  <td><button className="roll-btn" onClick={(e) => d20Roll(roll, e, d20(s.attack), `${name}: spell attack`, { kind: "attack" })}>{signed(s.attack)}</button></td>
                  <td>Save DC <b>{s.dc}</b></td>
                </tr>
              ))}
            </tbody>
          </table>

          <FeatureActions ch={ch} sheet={sheet} update={update} roll={roll} />

          {sheet.resources.length > 0 && (
            <>
              <h4 className="sheet-h">Resources</h4>
              {sheet.resources.map((r) => (
                <Resource key={r.id} id={r.id} name={r.name} max={r.max} used={r.used} recharge={r.recharge} update={update} />
              ))}
            </>
          )}

          {sheet.classTable.length > 0 && (
            <p className="small">
              {sheet.classTable.map((t) => (
                <span key={t.classRef + t.label} className="pill">
                  {t.label}: <b>{t.value}</b>
                </span>
              ))}
            </p>
          )}

          <h4 className="sheet-h">Proficiencies</h4>
          <dl className="prof-list small">
            {sheet.proficiencies.armor.length > 0 && (<><dt>Armor</dt><dd>{sheet.proficiencies.armor.map(cap).join(", ")}</dd></>)}
            {sheet.proficiencies.weapons.length > 0 && (<><dt>Weapons</dt><dd>{sheet.proficiencies.weapons.map(cap).join(", ")}</dd></>)}
            {sheet.proficiencies.tools.length > 0 && (<><dt>Tools</dt><dd>{sheet.proficiencies.tools.map(cap).join(", ")}</dd></>)}
            {sheet.proficiencies.languages.length > 0 && (<><dt>Languages</dt><dd>{sheet.proficiencies.languages.join(", ")}</dd></>)}
            {sheet.senses.length > 0 && (<><dt>Senses</dt><dd>{sheet.senses.join(", ")}</dd></>)}
            {sheet.resistances.length > 0 && (<><dt>Resistances</dt><dd>{sheet.resistances.map(cap).join(", ")}</dd></>)}
            {sheet.immunities.length > 0 && (<><dt>Immunities</dt><dd>{sheet.immunities.map(cap).join(", ")}</dd></>)}
          </dl>
        </div>
      </div>
    </div>
  );
}

/**
 * DiceCloud-style health bar: real HP fills the bar, temp HP sits on top as
 * its own segment, and damage/heal/temp apply the amount typed.
 * Enter = damage, "+5" then Enter = heal.
 */
export function HealthBar({ ch, sheet, update, roll }: { ch: Character; sheet: Sheet; update: Update; roll: Roll }) {
  const [amount, setAmount] = useState("");
  /** Concentration check after taking damage: DC 10 or half the damage. */
  const [conSave, setConSave] = useState<{ dc: number; spell: string } | null>(null);
  const max = sheet.hp.max;
  const { hp: rawHp, tempHp } = ch.state;
  const hp = Math.min(rawHp, max);
  const total = Math.max(1, max + tempHp);
  const pct = (n: number) => `${(n / total) * 100}%`;
  const level = max ? hp / max : 0;
  const tone = level > 0.5 ? "good" : level > 0.25 ? "warn" : "bad";
  const n = Math.abs(Math.floor(Number(amount) || 0));

  const apply = (kind: "damage" | "heal" | "temp") => {
    if (!n) return;
    update((c) => {
      const s = { hp: c.state.hp, tempHp: c.state.tempHp };
      const next = kind === "damage" ? takeDamage(s, max, n) : kind === "heal" ? heal(s, max, n) : gainTemp(s, n);
      const revived = kind === "heal" && next.hp > 0;
      // Dropping to 0 HP ends concentration outright.
      const down = kind === "damage" && next.hp === 0;
      return {
        ...c,
        state: { ...c.state, ...next, deathSaves: revived ? { successes: 0, failures: 0 } : c.state.deathSaves, concentration: down ? null : c.state.concentration },
      };
    });
    const conc = ch.state.concentration;
    if (kind === "damage" && conc) {
      const after = takeDamage({ hp: ch.state.hp, tempHp: ch.state.tempHp }, max, n);
      setConSave(after.hp === 0 ? null : { dc: Math.max(10, Math.floor(n / 2)), spell: conc.name });
    }
    setAmount("");
  };
  const loseConcentration = () => {
    update((c) => ({ ...c, state: { ...c.state, concentration: null } }));
    setConSave(null);
  };
  const conMod = sheet.saves.con.mod;

  return (
    <div className="healthbar">
      <div className="hb-top">
        <span className="vital-label">Hit points</span>
        <span className="hb-nums">
          <b>{hp}</b>
          <span className="muted"> / {max}</span>
          {tempHp > 0 && (
            <span className="hb-temp-label">
              {" "}
              + <b>{tempHp}</b> temp
            </span>
          )}
        </span>
      </div>
      <div
        className={`hb-track hb-${tone}`}
        role="meter"
        aria-label="Hit points"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={hp}
        aria-valuetext={`${hp} of ${max} hit points${tempHp ? `, plus ${tempHp} temporary` : ""}`}
      >
        <div className="hb-fill" style={{ width: pct(hp) }} />
        {tempHp > 0 && <div className="hb-tempfill" style={{ left: pct(hp), width: pct(tempHp) }} />}
      </div>
      <div className="hb-controls">
        <button className="hb-damage" onClick={() => apply("damage")} disabled={!n} title="Take damage (temp HP first)">
          − Damage
        </button>
        <input
          className="hb-amount"
          type="text"
          inputMode="numeric"
          value={amount}
          placeholder="0"
          aria-label="Amount"
          onChange={(e) => setAmount(e.target.value.replace(/[^\d+-]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply(amount.trim().startsWith("+") ? "heal" : "damage");
          }}
        />
        <button className="hb-heal" onClick={() => apply("heal")} disabled={!n} title="Heal">
          + Heal
        </button>
        <button onClick={() => apply("temp")} disabled={!n} title="Gain temp HP (keeps the higher value)">
          Temp HP
        </button>
        {tempHp > 0 && (
          <button className="link small" onClick={() => update((c) => ({ ...c, state: { ...c.state, tempHp: 0 } }))}>
            clear temp
          </button>
        )}
      </div>
      {conSave && ch.state.concentration && (
        <div className="conc-save small" role="alert">
          <span className="grow">
            Concentration on <b>{conSave.spell}</b>: Constitution save DC <b>{conSave.dc}</b>
          </span>
          <button
            className="roll-btn"
            title="Shift: advantage · Ctrl: disadvantage"
            onClick={(e) => d20Roll(roll, e, d20(conMod), `${ch.name || "Character"}: concentration (DC ${conSave.dc})`, { kind: "save", ability: "con" })}
          >
            Roll {signed(conMod)}
          </button>
          <button className="small" onClick={() => setConSave(null)}>Kept it</button>
          <button className="small" onClick={loseConcentration}>Lost it</button>
        </div>
      )}
    </div>
  );
}

function Vitals({ ch, sheet, rules, update, roll }: { ch: Character; sheet: Sheet; rules: Rules; update: Update; roll: Roll }) {
  const st = ch.state;
  const hp = Math.min(st.hp, sheet.hp.max);
  const [resting, setResting] = useState(false);
  const [restMsg, setRestMsg] = useState("");

  const longRest = () => {
    let notes: string[] = [];
    update((c) => {
      const r = rechargeItems(longRestState(c, sheet), (inv) => chargeInfo(itemData(rules, inv), inv), "long", (e, l) => totalOf(roll(e, l)) ?? 0);
      notes = r.notes;
      return r.ch;
    });
    setRestMsg(["Long rest done.", ...notes].join(" · "));
  };
  const spendHitDie = (classRef: string, faces: number) => {
    const r = totalOf(roll(`1d${faces}${sheet.abilities.con.mod >= 0 ? "+" : ""}${sheet.abilities.con.mod}`, `${ch.name}: hit die`));
    update((c) => ({
      ...c,
      state: {
        ...c.state,
        hp: Math.min(sheet.hp.max, c.state.hp + Math.max(0, r ?? 0)),
        hitDiceUsed: { ...c.state.hitDiceUsed, [classRef]: (c.state.hitDiceUsed[classRef] ?? 0) + 1 },
      },
    }));
  };

  return (
    <div className="vitals">
      <div className="vital">
        <span className="vital-label">AC</span>
        <b className="vital-num" title={sheet.ac.formula}>{sheet.ac.value}</b>
      </div>
      <div className="vital">
        <span className="vital-label">Initiative</span>
        <button className="vital-num roll-btn" onClick={(e) => d20Roll(roll, e, d20(sheet.initiative), `${ch.name}: initiative`, { kind: "initiative", ability: "dex" })}>{signed(sheet.initiative)}</button>
      </div>
      <div className="vital">
        <span className="vital-label">Speed</span>
        <b className="vital-num">{sheet.speed.walk}</b>
        <span className="small muted">
          {Object.entries(sheet.speed).filter(([k]) => k !== "walk").map(([k, v]) => `${k} ${v}`).join(", ") || "ft."}
        </span>
      </div>
      <div className="vital">
        <span className="vital-label">Proficiency</span>
        <b className="vital-num">{signed(sheet.proficiencyBonus)}</b>
      </div>
      <HealthBar ch={ch} sheet={sheet} update={update} roll={roll} />
      <div className="vital">
        <span className="vital-label">Hit dice</span>
        {sheet.hitDice.map((h) => {
          const left = h.total - (st.hitDiceUsed[h.classRef] ?? 0);
          return (
            <button key={h.classRef} className="small" disabled={left <= 0} onClick={() => spendHitDie(h.classRef, h.faces)} title="Spend a hit die (rolls it)">
              {left}/{h.total} d{h.faces}
            </button>
          );
        })}
      </div>
      <ConcentrationCalc ch={ch} sheet={sheet} update={update} roll={roll} />
      <div className="vital rests">
        <button onClick={() => setResting(true)}>Short rest</button>
        <button onClick={longRest}>Long rest</button>
        {restMsg && (
          <span className="small ok rest-msg">
            {restMsg}{" "}
            <button className="link small" onClick={() => setRestMsg("")} aria-label="Dismiss">
              ✕
            </button>
          </span>
        )}
      </div>
      {resting && <ShortRestDialog ch={ch} sheet={sheet} rules={rules} update={update} roll={roll} onClose={() => setResting(false)} />}

      {hp === 0 && sheet.hp.max > 0 && (
        <div className="vital death">
          <span className="vital-label">Death saves</span>
          <div className="row small">
            <span>✓</span>
            {[0, 1, 2].map((i) => (
              <input key={i} type="checkbox" checked={st.deathSaves.successes > i} onChange={(e) => update((c) => ({ ...c, state: { ...c.state, deathSaves: { ...c.state.deathSaves, successes: e.target.checked ? i + 1 : i } } }))} />
            ))}
            <span>✗</span>
            {[0, 1, 2].map((i) => (
              <input key={i} type="checkbox" checked={st.deathSaves.failures > i} onChange={(e) => update((c) => ({ ...c, state: { ...c.state, deathSaves: { ...c.state.deathSaves, failures: e.target.checked ? i + 1 : i } } }))} />
            ))}
            <button className="small" onClick={(e) => d20Roll(roll, e, "1d20", `${ch.name}: death save`, { kind: "death" })}>Roll</button>
          </div>
        </div>
      )}

      <div className="vital wide">
        <label className="row small">
          <input type="checkbox" checked={st.inspiration} onChange={(e) => update((c) => ({ ...c, state: { ...c.state, inspiration: e.target.checked } }))} />
          Inspiration
        </label>
        <label className="row small">
          Exhaustion
          <select value={st.exhaustion} onChange={(e) => update((c) => ({ ...c, state: { ...c.state, exhaustion: Number(e.target.value) } }))}>
            {[0, 1, 2, 3, 4, 5, 6].map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <div className="conditions small">
          {st.conditions.map((c) => (
            <span key={c} className="pill">
              <span className="lk lk-condition" data-5e="condition" data-name={c} data-source="PHB">{c}</span>{" "}
              <button className="link" onClick={() => update((x) => ({ ...x, state: { ...x.state, conditions: x.state.conditions.filter((y) => y !== c) } }))} aria-label={`Remove ${c}`}>✕</button>
            </span>
          ))}
          <select value="" onChange={(e) => e.target.value && update((x) => ({ ...x, state: { ...x.state, conditions: [...new Set([...x.state.conditions, e.target.value])] } }))}>
            <option value="">+ condition</option>
            {CONDITIONS.filter((c) => !st.conditions.includes(c)).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <ConditionReminders conditions={st.conditions} exhaustion={st.exhaustion} />
      </div>
    </div>
  );
}

function Resource({ id, name, max, used, recharge, update }: { id: string; name: string; max: number; used: number; recharge: string; update: Update }) {
  const set = (n: number) => update((c) => ({ ...c, state: { ...c.state, resourcesUsed: { ...c.state.resourcesUsed, [id]: Math.max(0, Math.min(max, n)) } } }));
  const left = max - used;
  return (
    <div className="resource row small">
      <span className="grow">
        {name} <span className="muted">({recharge} rest)</span>
      </span>
      {max <= 10 ? (
        <span className="pips">
          {Array.from({ length: max }, (_, i) => (
            <button key={i} className={`pip ${i < left ? "on" : ""}`} onClick={() => set(i < left ? used + 1 : used - 1)} aria-label={i < left ? `Use ${name}` : `Restore ${name}`} />
          ))}
        </span>
      ) : (
        <span className="row">
          <button className="ghost" onClick={() => set(used + 1)} aria-label={`Use ${name}`}>−</button>
          <b>{left}</b>/{max}
          <button className="ghost" onClick={() => set(used - 1)} aria-label={`Restore ${name}`}>+</button>
        </span>
      )}
    </div>
  );
}

export type { Ability };

/**
 * Concentration check calculator, apart from taking damage: type each hit's
 * damage ("12, 30" for two hits) to get the DC for each (10 or half the
 * damage), roll the Constitution saves and see whether you kept it.
 */
function ConcentrationCalc({ ch, sheet, update, roll }: { ch: Character; sheet: Sheet; update: Update; roll: Roll }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<{ dc: number; total: number | null }[]>([]);
  const dcs = text
    .split(/[,\s]+/)
    .map((x) => Math.floor(Number(x)))
    .filter((n) => n > 0)
    .map((n) => Math.max(10, Math.floor(n / 2)));
  const mod = sheet.saves.con.mod;
  const warCaster = sheet.featureNames.includes("War Caster");
  const conc = ch.state.concentration;

  const rollAll = (e: React.MouseEvent) => {
    // War Caster: advantage on these saves (Ctrl still forces disadvantage).
    const mode = warCaster && !e.ctrlKey && !e.metaKey ? "advantage" : rollModeOf(e);
    setResults(
      dcs.map((dc) => ({
        dc,
        total: totalOf(roll(withRollMode(d20(mod), mode), `${ch.name || "Character"}: concentration (DC ${dc})${rollModeLabel(mode)}`)),
      })),
    );
  };
  const lost = results.some((r) => r.total != null && r.total < r.dc);
  const done = results.length > 0 && results.every((r) => r.total != null);

  return (
    <div className="vital conc-calc">
      <span className="vital-label">Concentration check</span>
      <div className="row small" style={{ flexWrap: "wrap" }}>
        <input
          className="hb-amount"
          value={text}
          placeholder="damage"
          aria-label="Damage taken (several hits: 12, 30)"
          title="Damage from each hit. Several hits? Separate them: 12, 30"
          onChange={(e) => {
            setText(e.target.value.replace(/[^\d,\s]/g, ""));
            setResults([]);
          }}
        />
        {dcs.length > 0 && <span>DC {dcs.join(", ")}</span>}
        <button
          className="roll-btn"
          disabled={!dcs.length}
          onClick={rollAll}
          title={`Constitution save ${signed(mod)}${warCaster ? " · War Caster: advantage" : " · Shift: advantage · Ctrl: disadvantage"}`}
        >
          Roll {signed(mod)}
          {dcs.length > 1 ? ` ×${dcs.length}` : ""}
        </button>
      </div>
      {done ? (
        <div className={`small ${lost ? "error" : "ok"}`}>
          {results.map((r) => `${r.total} vs DC ${r.dc}`).join(" · ")}: {lost ? "concentration lost" : "kept it"}{" "}
          {lost && conc && (
            <button className="link small" onClick={() => update((c) => ({ ...c, state: { ...c.state, concentration: null } }))}>
              end {conc.name}
            </button>
          )}
        </div>
      ) : (
        <span className="small muted">{warCaster ? "War Caster: rolls with advantage" : "DC 10 or half the damage, per hit"}</span>
      )}
    </div>
  );
}

/**
 * Features you can use: Use spends the action's resource, rolls its healing
 * (and adds it to your HP), and switches on its effect or concentration.
 */
function FeatureActions({ ch, sheet, update, roll }: { ch: Character; sheet: Sheet; update: Update; roll: Roll }) {
  const actions = featureActions(ch, sheet);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ name: string; text: string } | null>(null);
  if (!actions.length) return null;
  const who = ch.name || "Character";

  const use = (a: FeatureAction) => {
    const pool = a.cost && (sheet.resources.find((r) => r.id === a.cost!.id)?.max ?? 0) > 10;
    const amount = pool ? Math.max(1, amounts[a.name] ?? a.cost!.amount) : a.cost?.amount ?? 1;
    const next = useFeature(ch, sheet, a, amount);
    if (!next) {
      setMsg({ name: a.name, text: `No ${a.cost?.label ?? "uses"} left. A rest gets them back.` });
      return;
    }
    let healed = 0;
    if (a.heal) {
      // Lay on Hands heals the amount spent from the pool; others roll.
      const expr = pool ? String(amount) : a.heal;
      healed = totalOf(roll(expr, `${who}: ${a.name}`)) ?? Number(expr) ?? 0;
    }
    if (a.roll) roll(a.roll.expr, `${who}: ${a.roll.label}`);
    update((c) => {
      const used = useFeature(c, sheet, a, amount) ?? next;
      return healed > 0 ? { ...used, state: { ...used.state, hp: Math.min(sheet.hp.max, used.state.hp + healed) } } : used;
    });
    const parts = [
      a.cost && `used ${pool ? `${amount} from ` : ""}${a.cost.label}`,
      healed > 0 && `healed ${healed} HP`,
      a.status && `${a.status.name}${a.status.until ? ` for ${a.status.until}` : ""}`,
      a.concentration && "concentrating",
    ].filter(Boolean);
    setMsg({ name: a.name, text: parts.length ? `${a.name}: ${parts.join(" · ")}` : `${a.name} used.` });
  };

  return (
    <>
      <h4 className="sheet-h">Actions</h4>
      <div className="feature-actions">
        {actions.map((a) => {
          const r = a.cost && sheet.resources.find((x) => x.id === a.cost!.id);
          const left = r ? r.max - r.used : null;
          const pool = !!r && r.max > 10;
          const on = !!a.status && (ch.state.active ?? []).some((x) => x.name === a.status!.name);
          return (
            <div key={a.name} className={`feature-action ${on ? "on" : ""}`}>
              <div className="row small">
                <span className={`pill small time-${a.time}`}>{timeLabel(a.time)}</span>
                <b className="grow">{a.name}</b>
                {r && (
                  <span className={`small ${left ? "muted" : "error"}`} title={`${r.name}: ${left}/${r.max} left`}>
                    {pool ? `${left} left` : `${left}/${r.max}`}
                  </span>
                )}
                {pool && (
                  <input
                    type="number"
                    min={1}
                    max={left ?? 1}
                    className="sb-num"
                    value={amounts[a.name] ?? a.cost!.amount}
                    onChange={(e) => setAmounts({ ...amounts, [a.name]: Math.max(1, Number(e.target.value) || 1) })}
                    aria-label={`${a.name} amount`}
                  />
                )}
                <button className={`small ${on ? "" : "primary"}`} disabled={left === 0} onClick={() => use(a)}>
                  {on ? "Use again" : "Use"}
                </button>
              </div>
              {a.summary && <div className="small muted">{a.summary}</div>}
              {msg?.name === a.name && <div className="small ok">{msg.text}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** What your conditions and exhaustion do, in short. The sheet's rolls already apply them. */
function ConditionReminders({ conditions, exhaustion }: { conditions: string[]; exhaustion: number }) {
  const list = conditions.filter((c) => CONDITION_REMINDERS[c]);
  if (!list.length && !exhaustion) return null;
  return (
    <div className="cond-reminders small">
      {list.map((c) => (
        <div key={c}>
          <b>{c}:</b> {CONDITION_REMINDERS[c].join("; ")}.
        </div>
      ))}
      {exhaustion > 0 && (
        <div>
          <b>Exhaustion {exhaustion}:</b> {EXHAUSTION_REMINDERS.slice(0, exhaustion).join("; ")}.
        </div>
      )}
      <div className="muted">Rolls from the sheet add the advantage or disadvantage these give.</div>
    </div>
  );
}
