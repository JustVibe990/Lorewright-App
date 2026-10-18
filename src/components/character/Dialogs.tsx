// Level up (pick a class, HP, then the new choices) and starting equipment.

import { useMemo, useRef, useState } from "react";
import { classRefOf, computeSheet } from "../../lib/character/engine.ts";
import { addLevel } from "../../lib/character/levels.ts";
import { stripRef } from "../../lib/character/profs.ts";
import type { Rules } from "../../lib/character/rules.ts";
import type { Character, InventoryItem, Sheet } from "../../lib/character/types.ts";
import { Modal } from "../common.tsx";
import ChoicePicker from "./ChoicePicker.tsx";
import SearchSelect from "./SearchSelect.tsx";

type Update = (fn: (c: Character) => Character) => void;
type Roll = (expr: string, label: string) => { total: number } | void;

function meets(req: any, scores: Record<string, number>): boolean {
  if (!req) return true;
  if (req.or) return req.or.some((alt: any) => Object.entries<any>(alt).some(([a, n]) => (scores[a] ?? 0) >= n));
  return Object.entries<any>(req).every(([a, n]) => typeof n !== "number" || (scores[a] ?? 0) >= n);
}
const reqText = (req: any) =>
  req
    ? (req.or ?? [req]).map((o: any) => Object.entries<any>(o).filter(([, n]) => typeof n === "number").map(([a, n]) => `${a.toUpperCase()} ${n}`).join(req.or ? " or " : ", ")).join("; ")
    : "";

export function LevelUpDialog({ ch, sheet, rules, update, onClose, roll }: { ch: Character; sheet: Sheet; rules: Rules; update: Update; onClose: () => void; roll: Roll }) {
  const [classRef, setClassRef] = useState(ch.classes[0] ? classRefOf(ch.classes[0]) : "");
  const [hpMode, setHpMode] = useState<"average" | "roll">("average");
  const [rolled, setRolled] = useState<number | null>(null);
  const [step, setStep] = useState<"pick" | "choices">("pick");
  const before = useRef(new Set(sheet.choices.map((c) => c.id)));
  const [name, source] = classRef.split("|");
  const cd = classRef ? rules.findClass(name, source) : undefined;
  const faces = Number(cd?.raw.hd?.faces ?? 8);
  const existing = ch.classes.find((c) => classRefOf(c) === classRef);
  const scores = Object.fromEntries(Object.entries(sheet.abilities).map(([a, v]) => [a, v.score]));
  const newClass = !existing;
  const reqOk = !newClass || (meets(cd?.raw.multiclassing?.requirements, scores) && ch.classes.every((c) => meets(rules.findClass(c.name, c.source)?.raw.multiclassing?.requirements, scores)));
  const nextLevel = (existing?.level ?? 0) + 1;

  const classOptions = useMemo(() => rules.classes.map((c) => ({ value: `${c.name}|${c.source}`, label: c.name, hint: c.source })), [rules]);

  const doRoll = () => {
    const r = roll(`1d${faces}`, `${ch.name}: HP for ${name} ${nextLevel}`);
    setRolled(r && typeof r === "object" ? r.total : 1 + Math.floor(Math.random() * faces));
    setHpMode("roll");
  };

  const apply = () => {
    if (!cd) return;
    update((c) => {
      const oldMax = computeSheet(c, rules).hp.max;
      const next = addLevel(c, cd, hpMode === "roll" && rolled ? rolled : null);
      const gained = computeSheet(next, rules).hp.max - oldMax;
      return { ...next, state: { ...next.state, hp: Math.max(0, Math.min(c.state.hp, oldMax) + gained) } };
    });
    setStep("choices");
  };

  const fresh = sheet.choices.filter((c) => !before.current.has(c.id));

  return (
    <Modal onClose={onClose}>
      <div className="row">
        <h2 className="grow">{step === "pick" ? `Level up to ${sheet.totalLevel + 1}` : `Level ${sheet.totalLevel}: new choices`}</h2>
        <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {step === "pick" ? (
        <>
          <h3>Class</h3>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {ch.classes.map((c) => (
              <button key={classRefOf(c)} className={classRefOf(c) === classRef ? "primary" : ""} onClick={() => setClassRef(classRefOf(c))}>
                {c.name} {c.level} → {c.level + 1}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="small muted">Or multiclass into</span>
            <SearchSelect options={classOptions.filter((o) => !ch.classes.some((c) => classRefOf(c) === o.value))} value={newClass ? classRef : undefined} placeholder="Another class" onChange={setClassRef} />
          </div>
          {newClass && cd && (
            <p className={`small ${reqOk ? "muted" : "error"}`}>
              Multiclassing needs {reqText(cd.raw.multiclassing?.requirements) || "no minimum scores"}
              {ch.classes.map((c) => {
                const r = rules.findClass(c.name, c.source)?.raw.multiclassing?.requirements;
                return r ? ` and ${reqText(r)} for ${c.name}` : "";
              })}
              {reqOk ? "." : ": not met. You can still take it if your DM allows."}
            </p>
          )}

          <h3>Hit points</h3>
          <div className="row">
            <label className="row small">
              <input type="radio" checked={hpMode === "average"} onChange={() => setHpMode("average")} /> Average ({Math.floor(faces / 2) + 1})
            </label>
            <label className="row small">
              <input type="radio" checked={hpMode === "roll"} onChange={() => (rolled ? setHpMode("roll") : doRoll())} /> Roll d{faces}
              {rolled != null && <b>: {rolled}</b>}
            </label>
            <button className="small" onClick={doRoll}>{rolled == null ? "Roll" : "Reroll"}</button>
            <span className="small muted">+ Con modifier ({sheet.abilities.con.mod >= 0 ? "+" : ""}{sheet.abilities.con.mod})</span>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button className="primary" disabled={!cd} onClick={apply}>
              Level up
            </button>
            <button onClick={onClose}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          {!fresh.length && <p className="muted">Nothing new to choose at this level. Check the Features tab for what you gained.</p>}
          {fresh.map((choice) => (
            <div key={choice.id} className={`choice ${choice.answer.length < choice.count ? "todo" : ""}`}>
              <div className="choice-head">
                <b>{choice.label}</b> <span className="small muted">{choice.from}</span>
              </div>
              <ChoicePicker choice={choice} rules={rules} onChange={(answer) => update((c) => ({ ...c, choices: { ...c.choices, [choice.id]: answer } }))} />
            </div>
          ))}
          <p className="small muted">New spells are picked in the Spells tab.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={onClose}>Done</button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------- starting equipment ----------

interface Group {
  label: string;
  always: any[];
  options: [string, any[]][];
}

const EQUIPMENT_TYPES: Record<string, (raw: any) => boolean> = {
  weaponSimple: (r) => r.weaponCategory === "simple",
  weaponSimpleMelee: (r) => r.weaponCategory === "simple" && String(r.type).startsWith("M"),
  weaponSimpleRanged: (r) => r.weaponCategory === "simple" && String(r.type).startsWith("R"),
  weaponMartial: (r) => r.weaponCategory === "martial",
  weaponMartialMelee: (r) => r.weaponCategory === "martial" && String(r.type).startsWith("M"),
  weaponMartialRanged: (r) => r.weaponCategory === "martial" && String(r.type).startsWith("R"),
  instrumentMusical: (r) => String(r.type).startsWith("INS"),
  toolArtisan: (r) => String(r.type).startsWith("AT"),
  setGaming: (r) => String(r.type).startsWith("GS"),
  focusSpellcasting: (r) => String(r.type).startsWith("SCF"),
  focusSpellcastingArcane: (r) => String(r.type).startsWith("SCF") && r.scfType === "arcane",
  focusSpellcastingDruidic: (r) => String(r.type).startsWith("SCF") && r.scfType === "druid",
  focusSpellcastingHoly: (r) => String(r.type).startsWith("SCF") && r.scfType === "holy",
};

const describeItem = (x: any): string => {
  if (typeof x === "string") return stripRef(x);
  if (x.item) return `${x.quantity > 1 ? `${x.quantity} × ` : ""}${x.displayName ?? stripRef(x.item)}`;
  if (x.special) return `${x.quantity > 1 ? `${x.quantity} × ` : ""}${x.special}`;
  if (x.equipmentType) return `${x.quantity > 1 ? `${x.quantity} × ` : ""}any ${x.equipmentType.replace(/([A-Z])/g, " $1").toLowerCase().replace(/^weapon /, "").replace("focus spellcasting", "spellcasting focus")}`;
  if (x.value) return `${x.value / 100} gp`;
  return "";
};

export function EquipmentDialog({ ch, rules, update, onClose }: { ch: Character; rules: Rules; update: Update; onClose: () => void }) {
  const groups: Group[] = [];
  const cl = ch.classes[0];
  const cd = cl ? rules.findClass(cl.name, cl.source) : undefined;
  const bg = ch.background ? rules.findBackground(ch.background.name, ch.background.source) : undefined;
  const addGroups = (label: string, data: any[] | undefined) =>
    (data ?? []).forEach((g: any, i: number) =>
      groups.push({ label: `${label} ${i + 1}`, always: g._ ?? [], options: Object.entries(g).filter(([k]) => k !== "_") as [string, any[]][] }),
    );
  addGroups(cd?.name ?? "Class", cd?.raw.startingEquipment?.defaultData);
  addGroups(bg?.name ?? "Background", bg?.startingEquipment);

  const [picks, setPicks] = useState<Record<number, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const items = useMemo(() => rules.data.index.entries().filter((e) => e.kind === "item" && e.raw.edition !== "one"), [rules]);

  const chosen = (gi: number) => {
    const g = groups[gi];
    const opt = g.options.find(([k]) => k === (picks[gi] ?? g.options[0]?.[0]));
    return [...g.always, ...(opt?.[1] ?? [])];
  };

  const apply = () => {
    const add: InventoryItem[] = [];
    let cp = 0;
    groups.forEach((_, gi) => {
      chosen(gi).forEach((x, xi) => {
        const id = `${Date.now().toString(36)}${gi}${xi}${Math.random().toString(36).slice(2, 5)}`;
        if (typeof x === "string") {
          const raw = rules.findItem(x);
          add.push({ id, ref: raw ? `${raw.name}|${raw.source}` : undefined, name: raw?.name ?? stripRef(x), qty: 1, equipped: false, attuned: false });
        } else if (x.item) {
          const raw = rules.findItem(x.item);
          add.push({ id, ref: raw ? `${raw.name}|${raw.source}` : undefined, name: x.displayName ?? raw?.name ?? stripRef(x.item), qty: x.quantity ?? 1, equipped: false, attuned: false });
          if (x.containsValue) cp += x.containsValue;
        } else if (x.special) {
          add.push({ id, name: x.special, qty: x.quantity ?? 1, equipped: false, attuned: false });
        } else if (x.equipmentType) {
          const ref = typed[`${gi}:${xi}`];
          const e = ref && items.find((i) => `${i.name}|${i.source}` === ref);
          add.push({ id, ref: e ? ref : undefined, name: e ? e.name : describeItem(x), qty: x.quantity ?? 1, equipped: false, attuned: false });
        } else if (x.value) cp += x.value;
      });
    });
    // Equip the first armor, shield and weapon so the sheet is useful straight away.
    let armor = false, shield = false, weapon = false;
    for (const it of add) {
      const raw = it.ref ? rules.findItem(it.ref) : null;
      const t = String(raw?.type ?? "").split("|")[0];
      if (!armor && ["LA", "MA", "HA"].includes(t)) it.equipped = armor = true;
      else if (!shield && t === "S") it.equipped = shield = true;
      else if (!weapon && (t === "M" || t === "R")) it.equipped = weapon = true;
    }
    update((c) => ({
      ...c,
      inventory: [...c.inventory, ...add],
      currency: { ...c.currency, gp: c.currency.gp + Math.floor(cp / 100), sp: c.currency.sp + Math.floor((cp % 100) / 10), cp: c.currency.cp + (cp % 10) },
      choices: { ...c.choices, "equipment:done": ["1"] },
    }));
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div className="row">
        <h2 className="grow">Starting equipment</h2>
        <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {!groups.length && <p className="muted">Choose a class and background first.</p>}
      {groups.map((g, gi) => (
        <div key={gi} className="equip-group">
          <div className="small muted">{g.label}</div>
          {g.always.length > 0 && <div className="small">{g.always.map(describeItem).join(", ")}</div>}
          {g.options.length > 1 &&
            g.options.map(([k, list]) => (
              <label key={k} className="row small">
                <input type="radio" name={`eq${gi}`} checked={(picks[gi] ?? g.options[0][0]) === k} onChange={() => setPicks((p) => ({ ...p, [gi]: k }))} />
                ({k}) {list.map(describeItem).join(", ")}
              </label>
            ))}
          {g.options.length === 1 && <div className="small">{g.options[0][1].map(describeItem).join(", ")}</div>}
          {chosen(gi).map((x, xi) =>
            typeof x === "object" && x.equipmentType && EQUIPMENT_TYPES[x.equipmentType] ? (
              <div key={xi} className="row small">
                <span className="muted">{describeItem(x)}:</span>
                <SearchSelect
                  options={items.filter((i) => EQUIPMENT_TYPES[x.equipmentType](i.raw)).map((i) => ({ value: `${i.name}|${i.source}`, label: i.name, hint: i.source }))}
                  value={typed[`${gi}:${xi}`]}
                  placeholder="Pick one"
                  onChange={(v) => setTyped((t) => ({ ...t, [`${gi}:${xi}`]: v }))}
                />
              </div>
            ) : null,
          )}
        </div>
      ))}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="primary" disabled={!groups.length} onClick={apply}>Add to inventory</button>
        <button
          onClick={() => {
            update((c) => ({ ...c, choices: { ...c.choices, "equipment:done": ["1"] } }));
            onClose();
          }}
        >
          Skip
        </button>
      </div>
    </Modal>
  );
}
