// Under an item in the inventory: its charges (spend, restore, what it gets
// back and when), the spells it casts with them or once a day, and for a
// spell scroll, the spell on it and reading it.

import { useMemo, useState } from "react";
import { chargeInfo, chargesLeft, itemSpellOptions, RECHARGE_LABEL, spendItem, usesLeft, type ItemSpell } from "../../lib/character/charges.ts";
import { isScroll, SCROLL_STATS, scrollCheck, scrollLevel, useScroll } from "../../lib/character/scrolls.ts";
import type { Rules } from "../../lib/character/rules.ts";
import { ABILITY_NAMES, type Character, type InventoryItem, type Sheet } from "../../lib/character/types.ts";
import type { DataStore } from "../../lib/data.ts";
import CastPanel, { type Caster, type Roll } from "./CastPanel.tsx";
import SearchSelect from "./SearchSelect.tsx";
import { signed } from "./labels.ts";

type Update = (fn: (c: Character) => Character) => void;
const ORD = ["cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export const hasPowers = (inv: InventoryItem, raw: any) => isScroll(raw, inv.name) || !!chargeInfo(raw, inv);

export default function ItemPowers({
  inv,
  raw,
  ch,
  sheet,
  rules,
  data,
  update,
  roll,
}: {
  inv: InventoryItem;
  raw: any;
  ch: Character;
  sheet: Sheet;
  rules: Rules;
  data: DataStore;
  update: Update;
  roll: Roll;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const info = chargeInfo(raw, inv);
  const who = ch.name || "Character";
  // Your best spellcasting, for items that use your DC and modifier.
  const sc = [...sheet.spellcasting].sort((a, b) => b.dc - a.dc)[0];
  const yourMod = sc ? sheet.abilities[sc.ability].mod : 0;
  const setItem = (patch: Partial<InventoryItem>) => update((c) => ({ ...c, inventory: c.inventory.map((i) => (i.id === inv.id ? { ...i, ...patch } : i)) }));

  if (isScroll(raw, inv.name)) return <Scroll inv={inv} raw={raw} ch={ch} sheet={sheet} rules={rules} data={data} update={update} roll={roll} setItem={setItem} yourMod={yourMod} />;
  if (!info) return null;

  const left = chargesLeft(inv, info);
  const caster: Caster = { attack: info.attack ?? sc?.attack ?? 0, dc: info.dc ?? sc?.dc ?? 10, mod: yourMod };
  const spellRow = (s: ItemSpell, i: number) => {
    const entry = data.findName("spell", s.name);
    const key = `${s.name}#${i}`;
    const lvl = s.level ?? entry?.raw.level ?? 1;
    const opts = itemSpellOptions(s, entry?.raw.level ?? lvl, left, usesLeft(inv, s));
    const charges = (n: number) => `${n} charge${n === 1 ? "" : "s"}`;
    const cost = s.atWill ? "at will" : s.daily ? `${usesLeft(inv, s)}/${s.daily} today` : s.perLevel ? `${charges(s.cost)} per level` : s.upcast ? `${charges(s.cost)} or more` : charges(s.cost);
    return (
      <span key={key} className="item-spell">
        <button
          className={`small ${open === key ? "primary" : ""}`}
          disabled={!entry}
          title={entry ? `Cast ${cap(s.name)} from ${inv.name}` : "This spell isn't in your imported spells"}
          onClick={() => setOpen(open === key ? null : key)}
        >
          {entry ? (
            <span className="lk lk-spell" data-5e="spell" data-name={entry.name} data-source={entry.source}>
              {entry.name}
            </span>
          ) : (
            cap(s.name)
          )}
          {s.level ? ` (${ORD[s.level]})` : ""} <span className="muted">· {cost}</span>
        </button>
        {open === key && entry && (
          <div className="item-cast">
            <CastPanel
              spell={entry}
              caster={caster}
              ch={ch}
              sheet={sheet}
              update={update}
              roll={roll}
              onClose={() => setOpen(null)}
              pay={{ options: opts, spend: (c, o) => spendItem(c, inv.id, s, o), empty: s.daily ? "Used up for today. It comes back at dawn (a long rest)." : "Not enough charges left." }}
            />
          </div>
        )}
      </span>
    );
  };

  return (
    <div className="item-powers small">
      {info.max > 0 && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <span>Charges</span>
          <button className="ghost small" disabled={left <= 0} onClick={() => setItem({ chargesUsed: (inv.chargesUsed ?? 0) + 1 })} aria-label="Use a charge">
            −
          </button>
          <b className={left ? "" : "error"}>
            {left}/{info.max}
          </b>
          <button className="ghost small" disabled={left >= info.max} onClick={() => setItem({ chargesUsed: Math.max(0, (inv.chargesUsed ?? 0) - 1) || undefined })} aria-label="Get a charge back">
            +
          </button>
          <span className="muted">
            {info.recharge ? `· regains ${info.regain === "all" ? "all" : info.regain} ${RECHARGE_LABEL[info.recharge]}` : "· doesn't recharge"}
            {info.recharge && info.recharge !== "short" && info.recharge !== "special" ? " (on a long rest)" : ""}
            {info.dc ? ` · save DC ${info.dc}` : ""}
            {info.attack ? ` · ${signed(info.attack)} to hit` : ""}
          </span>
        </div>
      )}
      {left === 0 && info.max > 0 && info.lastChargeRisk && (
        <div className="row warn-line">
          <span>Last charge used: roll a d20. On a 1 the item is destroyed.</span>
          <button className="small" onClick={() => roll("1d20", `${who}: ${inv.name} (last charge, destroyed on a 1)`)}>
            Roll d20
          </button>
        </div>
      )}
      {info.spells.length > 0 && <div className="row item-spells">{info.spells.map(spellRow)}</div>}
    </div>
  );
}

/** A spell scroll: choose the spell on it, then read it. */
function Scroll({
  inv,
  raw,
  ch,
  sheet,
  rules,
  data,
  update,
  roll,
  setItem,
  yourMod,
}: {
  inv: InventoryItem;
  raw: any;
  ch: Character;
  sheet: Sheet;
  rules: Rules;
  data: DataStore;
  update: Update;
  roll: Roll;
  setItem: (p: Partial<InventoryItem>) => void;
  yourMod: number;
}) {
  const [reading, setReading] = useState(false);
  const level = scrollLevel(raw?.name ?? inv.name);
  const options = useMemo(
    () =>
      data.index
        .entries()
        .filter((e) => e.kind === "spell" && (level == null || (e.raw.level ?? 0) === level))
        .map((e) => ({ value: `${e.name}|${e.source}`, label: e.name, hint: `${ORD[e.raw.level ?? 0]} · ${e.source}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data, level],
  );
  if (!inv.scrollSpell) {
    return (
      <div className="item-powers small row">
        <span>Spell on it:</span>
        <div style={{ minWidth: 240 }}>
          <SearchSelect options={options} placeholder={level != null ? `Pick a ${ORD[level]}-level spell` : "Pick the spell"} onChange={(v) => setItem({ scrollSpell: v, name: `Spell Scroll (${v.split("|")[0]})` })} />
        </div>
      </div>
    );
  }
  const [name, source] = inv.scrollSpell.split("|");
  const entry = data.find("spell", name, source);
  const lvl = entry?.raw.level ?? level ?? 1;
  const stats = SCROLL_STATS[lvl] ?? SCROLL_STATS[1];
  const check = scrollCheck(sheet, inv.scrollSpell, lvl, rules.spellClassesOf(name, source));
  const who = ch.name || "Character";
  const caster: Caster = { attack: stats.attack, dc: stats.dc, mod: check.onList ? check.abilityMod : yourMod };
  return (
    <div className="item-powers small">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span>
          {entry ? (
            <span className="lk lk-spell" data-5e="spell" data-name={entry.name} data-source={entry.source}>
              {entry.name}
            </span>
          ) : (
            name
          )}{" "}
          <span className="muted">
            ({ORD[lvl]}) · save DC {stats.dc} · {signed(stats.attack)} to hit
          </span>
        </span>
        <button className={`small ${reading ? "" : "primary"}`} disabled={!entry} onClick={() => setReading(!reading)}>
          {reading ? "Close" : "Read"}
        </button>
        <button className="link small" onClick={() => setItem({ scrollSpell: undefined, name: raw?.name ?? inv.name })}>
          change spell
        </button>
      </div>
      {reading && entry && (
        <>
          {!check.onList && <p className="error">Not on your class's spell list: the scroll is unintelligible to you.</p>}
          {check.needsCheck && (
            <div className="row warn-line" style={{ flexWrap: "wrap" }}>
              <span>
                Higher than you can cast: make a {ABILITY_NAMES[check.ability as keyof typeof ABILITY_NAMES]} check, DC {check.checkDc}. On a failure the spell is lost and the scroll crumbles.
              </span>
              <button className="small" onClick={() => roll(`1d20${check.abilityMod >= 0 ? "+" : ""}${check.abilityMod}`, `${who}: reading ${entry.name} (DC ${check.checkDc})`)}>
                Roll {signed(check.abilityMod)}
              </button>
              <button className="small" onClick={() => update((c) => useScroll(c, inv.id))}>
                Failed: lose it
              </button>
            </div>
          )}
          {check.onList && (
            <div className="item-cast">
              <CastPanel
                spell={entry}
                caster={caster}
                ch={ch}
                sheet={sheet}
                update={update}
                roll={roll}
                onClose={() => setReading(false)}
                pay={{ options: [{ id: "scroll", label: `From the scroll (${ORD[lvl]} level)`, level: lvl, kind: "item" }], spend: (c) => useScroll(c, inv.id), empty: "" }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
