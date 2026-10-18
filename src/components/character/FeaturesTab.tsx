// The Features tab: what the character gained at each level, 1 → now, like
// DiceCloud. Features fill in from the rules; only choices need entering, and
// a missing choice can be made right on its level. Every feature is a link
// with the same hover / click-to-pin / Ctrl+click behaviour as note links.

import { useState } from "react";
import { swapLevels } from "../../lib/character/levels.ts";
import { renderEntries } from "../../lib/render.ts";
import type { Rules } from "../../lib/character/rules.ts";
import type { Character, Sheet, TimelineItem } from "../../lib/character/types.ts";
import ChoicePicker from "./ChoicePicker.tsx";

type Update = (fn: (c: Character) => Character) => void;

const TYPE_LABEL: Record<TimelineItem["type"], string> = {
  feature: "Feature",
  subclass: "Subclass",
  subclassFeature: "Subclass",
  asi: "ASI",
  feat: "Feat",
  option: "Option",
  species: "Species",
  background: "Background",
  choice: "Choice",
};

export function FeaturesTab({ ch, sheet, rules, update }: { ch: Character; sheet: Sheet; rules: Rules; update: Update }) {
  const [open, setOpen] = useState<string | null>(null);
  const [onlyTodo, setOnlyTodo] = useState(false);
  const todo = sheet.timeline.reduce((n, l) => n + l.items.filter((i) => i.pending).length, 0);
  const multiclass = ch.classes.length > 1;
  const itemFeatures = sheet.features.filter((f) => f.from.startsWith("Item:"));

  if (!sheet.timeline.length) return <p className="muted pad">Pick a class on the Build tab to see features by level.</p>;

  return (
    <div className="timeline">
      <div className="row">
        <span className="grow small">
          {todo ? <span className="error">{todo} choice{todo === 1 ? "" : "s"} to make</span> : <span className="muted">All choices made.</span>}
          <span className="muted"> · hover a feature to read it, click to pin, Ctrl+click for 5e.tools</span>
        </span>
        {todo > 0 && (
          <label className="row small">
            <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} /> only levels with choices to make
          </label>
        )}
      </div>

      {sheet.timeline.map((lvl, idx) => {
        const levelTodo = lvl.items.some((i) => i.pending);
        if (onlyTodo && !levelTodo) return null;
        const next = sheet.timeline[idx + 1];
        const prev = sheet.timeline[idx - 1];
        return (
          <section key={lvl.level} className={`tl-level ${levelTodo ? "todo" : ""}`}>
            <header className="tl-head">
              <span className="tl-num">{lvl.level}</span>
              <span className="grow">
                <b>Level {lvl.level}</b>{" "}
                <span className="muted">
                  {lvl.className} {lvl.classLevel}
                </span>
              </span>
              {multiclass && (
                <span className="tl-move">
                  <button className="ghost small" disabled={!prev || prev.classRef === lvl.classRef} title="Took this level earlier" onClick={() => update((c) => swapLevels(c, idx - 1))}>
                    ↑
                  </button>
                  <button className="ghost small" disabled={!next || next.classRef === lvl.classRef} title="Took this level later" onClick={() => update((c) => swapLevels(c, idx))}>
                    ↓
                  </button>
                </span>
              )}
            </header>
            {!lvl.items.length && <p className="small muted tl-empty">No new features at this level.</p>}
            {lvl.items.map((item, i) => {
              const key = `${lvl.level}:${i}`;
              const choice = item.choiceId ? sheet.choices.find((c) => c.id === item.choiceId) : undefined;
              const isOpen = open === key;
              return (
                <div key={key} className={`tl-item ${item.pending ? "pending" : ""}`}>
                  <span className={`tl-type t-${item.type}`}>{TYPE_LABEL[item.type]}</span>
                  <span className="tl-name">
                    {item.link ? (
                      <span className={`lk lk-${item.link.kind}`} data-5e={item.link.kind} data-name={item.link.name} data-source={item.link.source}>
                        {item.name}
                      </span>
                    ) : (
                      <b>{item.name}</b>
                    )}
                    {item.detail && <span className="small muted"> · {item.detail}</span>}
                  </span>
                  {choice && (
                    <button className={item.pending ? "tl-choose" : "link small"} onClick={() => setOpen(isOpen ? null : key)}>
                      {isOpen ? "Done" : item.pending ? "Choose" : "change"}
                    </button>
                  )}
                  {isOpen && choice && (
                    <div className="tl-picker">
                      <ChoicePicker choice={choice} rules={rules} onChange={(answer) => update((c) => ({ ...c, choices: { ...c.choices, [choice.id]: answer } }))} />
                      {/* A feat picked here may ask its own questions (e.g. Resilient's ability). */}
                      {sheet.choices
                        .filter((x) => x.id.startsWith(`${choice.id}:`))
                        .map((sub) => (
                          <div key={sub.id} className={`choice ${sub.answer.length < sub.count ? "todo" : ""}`} style={{ marginTop: 6 }}>
                            <div className="choice-head">
                              <b>{sub.label}</b> <span className="small muted">{sub.answer.length} / {sub.count}</span>
                            </div>
                            <ChoicePicker choice={sub} rules={rules} onChange={(answer) => update((c) => ({ ...c, choices: { ...c.choices, [sub.id]: answer } }))} />
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}

      {itemFeatures.length > 0 && !onlyTodo && (
        <section className="tl-level">
          <header className="tl-head">
            <span className="grow">
              <b>From items</b>
            </span>
          </header>
          {itemFeatures.map((f, i) => (
            <details key={`${f.name}-${i}`} className="feature">
              <summary>
                <b>{f.name}</b> <span className="small muted">{f.from.replace(/^Item: /, "")}</span>
              </summary>
              <div className="card-content" dangerouslySetInnerHTML={{ __html: renderEntries(f.entries) || "<p><i>No text.</i></p>" }} />
            </details>
          ))}
        </section>
      )}
      {multiclass && !ch.levelOrder && <p className="small muted">Level order is a guess for this character. Use ↑ ↓ to match the order you took your levels.</p>}
    </div>
  );
}

const NOTE_FIELDS: [keyof Character["notes"], string][] = [
  ["personality", "Personality traits"],
  ["ideals", "Ideals"],
  ["bonds", "Bonds"],
  ["flaws", "Flaws"],
  ["appearance", "Appearance"],
  ["backstory", "Backstory"],
  ["other", "Other notes"],
];

export function NotesTab({ ch, update }: { ch: Character; update: Update }) {
  return (
    <div className="char-notes">
      {NOTE_FIELDS.map(([k, label]) => (
        <label key={k}>
          {label}
          <textarea
            rows={k === "backstory" || k === "other" ? 6 : 2}
            value={ch.notes[k] ?? ""}
            onChange={(e) => update((c) => ({ ...c, notes: { ...c.notes, [k]: e.target.value } }))}
          />
        </label>
      ))}
    </div>
  );
}
