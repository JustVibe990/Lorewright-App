// The Build tab: who the character is (species, background, class), ability
// scores, every choice the rules ask for, HP per level, and custom effects.

import { useMemo } from "react";
import { classRefOf } from "../../lib/character/engine.ts";
import { removeLastLevel } from "../../lib/character/levels.ts";
import type { Rules } from "../../lib/character/rules.ts";
import { ABILITIES, ABILITY_NAMES, type Ability, type Character, type Effect, type Sheet } from "../../lib/character/types.ts";
import ChoicePicker from "./ChoicePicker.tsx";
import { signed } from "./labels.ts";
import SearchSelect from "./SearchSelect.tsx";

const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const ALIGNMENTS = ["Lawful good", "Neutral good", "Chaotic good", "Lawful neutral", "Neutral", "Chaotic neutral", "Lawful evil", "Neutral evil", "Chaotic evil", "Unaligned"];

type Update = (fn: (c: Character) => Character) => void;

interface Props {
  ch: Character;
  sheet: Sheet;
  rules: Rules;
  update: Update;
  onLevelUp: () => void;
}

/** Drop answers under a choice-id prefix (when the thing that asked for them changes). */
const clearChoices = (c: Character, prefix: string): Character => ({
  ...c,
  choices: Object.fromEntries(Object.entries(c.choices).filter(([k]) => !k.startsWith(prefix))),
});

export default function Builder({ ch, sheet, rules, update, onLevelUp }: Props) {
  const raceOptions = useMemo(() => rules.races.map((r) => ({ value: r.key, label: r.name, hint: r.subraceSource ?? r.raceSource })), [rules]);
  const bgOptions = useMemo(() => rules.backgrounds.map((b) => ({ value: `${b.name}|${b.source}`, label: b.name, hint: b.source })), [rules]);
  const classOptions = useMemo(() => rules.classes.map((c) => ({ value: `${c.name}|${c.source}`, label: c.name, hint: c.source })), [rules]);
  const open = sheet.choices.filter((c) => c.answer.length < c.count).length;

  return (
    <div className="builder">
      <section>
        <h3>Basics</h3>
        <div className="form-grid">
          <label>
            Name
            <input value={ch.name} onChange={(e) => update((c) => ({ ...c, name: e.target.value }))} />
          </label>
          <label>
            Player
            <input value={ch.player ?? ""} onChange={(e) => update((c) => ({ ...c, player: e.target.value }))} />
          </label>
          <label>
            Alignment
            <select value={ch.alignment ?? ""} onChange={(e) => update((c) => ({ ...c, alignment: e.target.value }))}>
              <option value="">—</option>
              {ALIGNMENTS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label>
            Species
            <SearchSelect
              options={raceOptions}
              value={ch.race?.key}
              placeholder="Choose a species"
              onChange={(key) => {
                const r = rules.findRace(key);
                update((c) => ({ ...clearChoices(c, "race:"), race: r ? { key, name: r.name } : undefined }));
              }}
            />
          </label>
          <label>
            Background
            <SearchSelect
              options={bgOptions}
              value={ch.background ? `${ch.background.name}|${ch.background.source}` : undefined}
              placeholder="Choose a background"
              onChange={(v) => {
                const [name, source] = v.split("|");
                update((c) => ({ ...clearChoices(c, "bg:"), background: { name, source } }));
              }}
            />
          </label>
          <label>
            Class
            {ch.classes.length === 0 || (ch.classes.length === 1 && ch.classes[0].level === 1) ? (
              <SearchSelect
                options={classOptions}
                value={ch.classes[0] ? classRefOf(ch.classes[0]) : undefined}
                placeholder="Choose a class"
                onChange={(v) => {
                  const [name, source] = v.split("|");
                  update((c) => ({ ...clearChoices(c, "class:"), classes: [{ name, source, level: 1 }], hpRolls: {}, levelOrder: [`${name}|${source}`] }));
                }}
              />
            ) : (
              <div className="row">
                <span className="grow">{ch.classes.map((x) => `${x.name} ${x.level}`).join(" / ")}</span>
              </div>
            )}
          </label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={onLevelUp} disabled={!ch.classes.length || sheet.totalLevel >= 20}>
            Level up
          </button>
          {sheet.totalLevel > 1 && (
            <button onClick={() => update(removeLastLevel)}>
              Remove last level
            </button>
          )}
          <span className="muted small">Level {sheet.totalLevel}</span>
        </div>
        <label className="row small" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={(ch.choices["options:variantFeatures"] ?? [])[0] === "1"}
            onChange={(e) => update((c) => ({ ...c, choices: { ...c.choices, "options:variantFeatures": e.target.checked ? ["1"] : [] } }))}
          />
          Use optional class features (Tasha's Cauldron of Everything), if your DM allows them
        </label>
      </section>

      <section>
        <h3>Ability scores</h3>
        <AbilityScores ch={ch} sheet={sheet} update={update} />
      </section>

      <section>
        <h3>
          Choices {open > 0 && <span className="badge">{open} to make</span>}
        </h3>
        {!sheet.choices.length && <p className="small muted">Pick a species, background and class to see their choices.</p>}
        {groupBy(sheet.choices, (c) => c.from).map(([from, list]) => (
          <div key={from} className="choice-group">
            <h4>{from}</h4>
            {list.map((choice) => (
              <div key={choice.id} className={`choice ${choice.answer.length < choice.count ? "todo" : ""}`}>
                <div className="choice-head">
                  <b>{choice.label}</b>
                  <span className="small muted">
                    {choice.type === "asi" ? (choice.answer.length ? "chosen" : "choose") : `${choice.answer.length} / ${choice.count}`}
                  </span>
                </div>
                <ChoicePicker choice={choice} rules={rules} onChange={(answer) => update((c) => ({ ...c, choices: { ...c.choices, [choice.id]: answer } }))} />
              </div>
            ))}
          </div>
        ))}
      </section>

      {sheet.totalLevel > 1 && (
        <section>
          <h3>Hit points per level</h3>
          <HpRolls ch={ch} sheet={sheet} update={update} />
        </section>
      )}

      <section>
        <h3>Custom effects</h3>
        <p className="small muted">For anything the rules data doesn't cover: magic items, boons, homebrew.</p>
        <Effects ch={ch} update={update} />
      </section>

      {sheet.warnings.length > 0 && (
        <section>
          {sheet.warnings.map((w) => (
            <p key={w} className="small error">
              {w}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

function groupBy<T>(list: T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return [...m];
}

function AbilityScores({ ch, sheet, update }: { ch: Character; sheet: Sheet; update: Update }) {
  const method = ch.abilityMethod;
  const base = ch.baseAbilities;
  const setBase = (a: Ability, v: number) => update((c) => ({ ...c, baseAbilities: { ...c.baseAbilities, [a]: v } }));
  const spent = ABILITIES.reduce((n, a) => n + (POINT_COST[base[a]] ?? 99), 0);
  const pool = method === "array" ? STANDARD_ARRAY : (ch.choices["abilities:rolled"] ?? []).map(Number);

  const setMethod = (m: Character["abilityMethod"]) =>
    update((c) => ({
      ...c,
      abilityMethod: m,
      baseAbilities: m === "pointbuy" ? { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } : m === "manual" ? c.baseAbilities : { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    }));

  const roll = () => {
    const one = () => {
      const d = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)).sort((x, y) => y - x);
      return d[0] + d[1] + d[2];
    };
    const rolled = Array.from({ length: 6 }, one).sort((x, y) => y - x);
    update((c) => ({ ...c, choices: { ...c.choices, "abilities:rolled": rolled.map(String) }, baseAbilities: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } }));
  };

  // Values from the pool not yet assigned (for array and rolled methods).
  const remaining = (a: Ability) => {
    const used = [...pool];
    for (const x of ABILITIES) {
      if (x === a || !base[x]) continue;
      const i = used.indexOf(base[x]);
      if (i >= 0) used.splice(i, 1);
    }
    return used;
  };

  return (
    <>
      <div className="seg small">
        {(["pointbuy", "array", "roll", "manual"] as const).map((m) => (
          <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>
            {{ pointbuy: "Point buy", array: "Standard array", roll: "Roll 4d6", manual: "Manual" }[m]}
          </button>
        ))}
      </div>
      {method === "pointbuy" && <p className={`small ${spent > 27 ? "error" : "muted"}`}>{27 - spent} of 27 points left</p>}
      {method === "roll" && (
        <p className="small">
          <button onClick={roll}>{pool.length ? "Reroll" : "Roll"} 4d6 drop lowest ×6</button>{" "}
          {pool.length > 0 && <span className="muted">Rolled: {pool.join(", ")}</span>}
        </p>
      )}
      <div className="abil-grid">
        {ABILITIES.map((a) => {
          const final = sheet.abilities[a];
          const bonus = final.score - (base[a] || 0);
          return (
            <div key={a} className="abil-edit">
              <div className="small muted">{ABILITY_NAMES[a]}</div>
              {method === "pointbuy" ? (
                <div className="row">
                  <button className="ghost" disabled={base[a] <= 8} onClick={() => setBase(a, base[a] - 1)} aria-label={`Lower ${a}`}>−</button>
                  <b>{base[a]}</b>
                  <button className="ghost" disabled={base[a] >= 15 || spent + (POINT_COST[base[a] + 1] - POINT_COST[base[a]]) > 27} onClick={() => setBase(a, base[a] + 1)} aria-label={`Raise ${a}`}>+</button>
                </div>
              ) : method === "manual" ? (
                <input type="number" min={1} max={30} value={base[a]} onChange={(e) => setBase(a, Number(e.target.value) || 0)} />
              ) : (
                <select value={base[a] || ""} onChange={(e) => setBase(a, Number(e.target.value) || 0)}>
                  <option value="">—</option>
                  {[...new Set([...remaining(a), ...(base[a] ? [base[a]] : [])])].sort((x, y) => y - x).map((v, i) => (
                    <option key={`${v}-${i}`} value={v}>{v}</option>
                  ))}
                </select>
              )}
              <div className="small">
                = <b>{final.score}</b> <span className="muted">({signed(final.mod)})</span>
                {bonus !== 0 && base[a] > 0 && <span className="muted"> {signed(bonus)} bonuses</span>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function HpRolls({ ch, sheet, update }: { ch: Character; sheet: Sheet; update: Update }) {
  return (
    <div className="hp-rolls">
      {ch.classes.map((cl, i) => {
        const ref = classRefOf(cl);
        const faces = sheet.hitDice.find((h) => h.classRef === ref)?.faces ?? 8;
        const levels = i === 0 ? cl.level - 1 : cl.level;
        const rolls = ch.hpRolls[ref] ?? [];
        return (
          <div key={ref} className="row small" style={{ flexWrap: "wrap" }}>
            <b>{cl.name}</b> <span className="muted">d{faces}{i === 0 ? ` (1st level: ${faces})` : ""}</span>
            {Array.from({ length: levels }, (_, j) => (
              <input
                key={j}
                className="hp-roll"
                type="number"
                min={1}
                max={faces}
                placeholder={String(Math.floor(faces / 2) + 1)}
                title={`Level ${(i === 0 ? 2 : 1) + j}: blank = average`}
                value={rolls[j] ?? ""}
                onChange={(e) => {
                  const v = e.target.value === "" ? null : Math.max(1, Math.min(faces, Number(e.target.value)));
                  update((c) => {
                    const list = [...(c.hpRolls[ref] ?? [])];
                    list[j] = v;
                    return { ...c, hpRolls: { ...c.hpRolls, [ref]: list } };
                  });
                }}
              />
            ))}
          </div>
        );
      })}
      <p className="small muted">Blank uses the average. Maximum HP: {sheet.hp.max}.</p>
    </div>
  );
}

const TARGETS: [string, string][] = [
  ["ac", "Armor Class"], ["hp.max", "Max HP"], ["initiative", "Initiative"], ["speed.walk", "Walking speed"], ["speed.fly", "Flying speed"],
  ["attack.all", "Attack rolls"], ["damage.all", "Damage"], ["spell.dc", "Spell save DC"], ["spell.attack", "Spell attack"],
  ["save.all", "All saves"], ["skill.all", "All skills"], ["passive.perception", "Passive Perception"],
  ...ABILITIES.map((a): [string, string] => [`ability.${a}`, `${ABILITY_NAMES[a]} score`]),
  ...ABILITIES.map((a): [string, string] => [`save.${a}`, `${ABILITY_NAMES[a]} save`]),
  ...["acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight of hand", "stealth", "survival"].map(
    (s): [string, string] => [`skill.${s}`, s.replace(/\b\w/g, (x) => x.toUpperCase())],
  ),
];

function Effects({ ch, update }: { ch: Character; update: Update }) {
  const set = (id: string, patch: Partial<Effect>) => update((c) => ({ ...c, effects: c.effects.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  return (
    <div className="effects">
      {ch.effects.map((e) => (
        <div key={e.id} className="row small effect-row">
          <input type="checkbox" checked={e.active} onChange={(x) => set(e.id, { active: x.target.checked })} aria-label="Active" />
          <input className="grow" value={e.label} placeholder="Name (e.g. Bracers of Defense)" onChange={(x) => set(e.id, { label: x.target.value })} />
          <select value={e.op} onChange={(x) => set(e.id, { op: x.target.value as Effect["op"] })}>
            <option value="add">add</option>
            <option value="set">set to</option>
            <option value="proficiency">proficiency in</option>
            <option value="expertise">expertise in</option>
          </select>
          {(e.op === "add" || e.op === "set") && (
            <input type="number" className="hp-roll" value={e.value} onChange={(x) => set(e.id, { value: Number(x.target.value) || 0 })} />
          )}
          <select value={e.target} onChange={(x) => set(e.id, { target: x.target.value })}>
            {TARGETS.filter(([t]) => (e.op === "proficiency" || e.op === "expertise" ? t.startsWith("skill.") || t.startsWith("save.") : true)).map(([t, l]) => (
              <option key={t} value={t}>{l}</option>
            ))}
          </select>
          <button className="ghost" aria-label="Remove effect" onClick={() => update((c) => ({ ...c, effects: c.effects.filter((x) => x.id !== e.id) }))}>✕</button>
        </div>
      ))}
      <button
        className="small"
        onClick={() =>
          update((c) => ({ ...c, effects: [...c.effects, { id: Date.now().toString(36), label: "", target: "ac", op: "add", value: 1, active: true }] }))
        }
      >
        Add effect
      </button>
    </div>
  );
}
