// One builder choice: pick N of the options. Short lists are chips; long
// lists get a search box. ASIs offer "+2 / +1 +1" or a feat.

import { useMemo, useState } from "react";
import { renderEntries } from "../../lib/render.ts";
import type { Rules } from "../../lib/character/rules.ts";
import { ABILITIES, ABILITY_NAMES, type Choice } from "../../lib/character/types.ts";
import { optionLabel, refName } from "./labels.ts";

interface Props {
  choice: Choice;
  rules: Rules;
  onChange: (answer: string[]) => void;
}

export default function ChoicePicker({ choice, rules, onChange }: Props) {
  if (choice.type === "asi") return <AsiPicker choice={choice} rules={rules} onChange={onChange} />;
  return <ListPicker choice={choice} rules={rules} onChange={onChange} />;
}

function ListPicker({ choice, rules, onChange }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const selected = new Set(choice.answer);
  const full = choice.answer.length >= choice.count;
  const long = choice.options.length > 14;
  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const list = ql ? choice.options.filter((o) => optionLabel(choice, o).toLowerCase().includes(ql)) : choice.options;
    // Selected first, so they're visible in long lists.
    return [...list.filter((o) => selected.has(o)), ...list.filter((o) => !selected.has(o))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, choice.options, choice.answer]);

  const toggle = (o: string) => {
    if (selected.has(o)) onChange(choice.answer.filter((a) => a !== o));
    else if (choice.count === 1) onChange([o]);
    else if (!full) onChange([...choice.answer, o]);
  };

  const describe = (o: string): any[] | null => {
    if (choice.type === "optionalfeature") return rules.findOptionalFeature(o)?.entries ?? null;
    if (choice.type === "feat") return rules.findFeat(o)?.entries ?? null;
    if (choice.type === "subclass") {
      for (const c of rules.classes) {
        const s = c.subclasses.find((x) => `${x.shortName}|${x.source}` === o);
        if (s) return s.features.filter((f) => f.level <= (s.features[0]?.level ?? 1)).flatMap((f) => f.feature.entries ?? []);
      }
    }
    return null;
  };
  const hasDetails = ["optionalfeature", "feat", "subclass"].includes(choice.type);

  return (
    <div className="choice-list">
      {long && (
        <input type="search" placeholder={`Search ${choice.options.length} options`} value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <div className={long ? "choice-scroll" : "choice-chips"}>
        {shown.map((o) => {
          const on = selected.has(o);
          const label = choice.type === "subclass" ? subclassName(rules, o) : optionLabel(choice, o);
          return (
            <div key={o} className={`choice-opt ${on ? "on" : ""} ${!on && full && choice.count > 1 ? "off" : ""}`}>
              <button
                type="button"
                className="choice-btn"
                aria-pressed={on}
                disabled={!on && full && choice.count > 1}
                onClick={() => toggle(o)}
              >
                {on ? "✓ " : ""}
                {label}
              </button>
              {hasDetails && (
                <button type="button" className="link small" onClick={() => setOpen(open === o ? null : o)}>
                  {open === o ? "hide" : "details"}
                </button>
              )}
              {open === o && (
                <div className="choice-details card-content" dangerouslySetInnerHTML={{ __html: renderEntries(describe(o) ?? ["No description."]) }} />
              )}
            </div>
          );
        })}
        {!shown.length && <p className="small muted">No matches.</p>}
      </div>
    </div>
  );
}

function subclassName(rules: Rules, ref: string): string {
  const [short, source] = ref.split("|");
  for (const c of rules.classes) {
    const s = c.subclasses.find((x) => x.shortName === short && x.source === source);
    if (s) return `${s.name} (${s.source})`;
  }
  return refName(ref);
}

function AsiPicker({ choice, rules, onChange }: Props) {
  const isFeat = choice.answer[0]?.startsWith("feat:");
  const [mode, setMode] = useState<"asi" | "feat">(isFeat ? "feat" : "asi");
  const [q, setQ] = useState("");
  const [a, b] = isFeat ? ["", ""] : [choice.answer[0] ?? "", choice.answer[1] ?? ""];
  const feats = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rules.feats.filter((f) => !ql || f.name.toLowerCase().includes(ql)).slice(0, 80);
  }, [q, rules]);
  const featAnswer = isFeat ? choice.answer[0].slice(5) : "";
  const [openFeat, setOpenFeat] = useState<string | null>(null);

  return (
    <div className="choice-list">
      <div className="seg small">
        <button type="button" className={mode === "asi" ? "on" : ""} onClick={() => setMode("asi")}>
          Ability scores
        </button>
        <button type="button" className={mode === "feat" ? "on" : ""} onClick={() => setMode("feat")}>
          Feat
        </button>
      </div>
      {mode === "asi" ? (
        <div className="row small" style={{ marginTop: 6 }}>
          <span className="muted">+1</span>
          <select value={a} onChange={(e) => onChange([e.target.value, b].filter(Boolean))}>
            <option value="">—</option>
            {ABILITIES.map((x) => <option key={x} value={x}>{ABILITY_NAMES[x]}</option>)}
          </select>
          <span className="muted">+1</span>
          <select value={b} onChange={(e) => onChange([a, e.target.value].filter(Boolean))}>
            <option value="">—</option>
            {ABILITIES.map((x) => <option key={x} value={x}>{ABILITY_NAMES[x]}</option>)}
          </select>
          <span className="muted">(pick the same ability twice for +2)</span>
        </div>
      ) : (
        <>
          <input type="search" placeholder={`Search ${rules.feats.length} feats`} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 6 }} />
          <div className="choice-scroll">
            {feats.map((f) => {
              const ref = `${f.name}|${f.source}`;
              const on = featAnswer === ref;
              return (
                <div key={ref} className={`choice-opt ${on ? "on" : ""}`}>
                  <button type="button" className="choice-btn" aria-pressed={on} onClick={() => onChange(on ? [] : [`feat:${ref}`])}>
                    {on ? "✓ " : ""}
                    {f.name} <span className="muted">({f.source})</span>
                  </button>
                  <button type="button" className="link small" onClick={() => setOpenFeat(openFeat === ref ? null : ref)}>
                    {openFeat === ref ? "hide" : "details"}
                  </button>
                  {openFeat === ref && <div className="choice-details card-content" dangerouslySetInnerHTML={{ __html: renderEntries(f.entries ?? []) }} />}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
