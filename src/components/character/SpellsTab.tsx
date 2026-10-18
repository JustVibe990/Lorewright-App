// The Spells tab: slots, and per class the cantrips, spells known or
// spellbook, and prepared spells, picked from that class's list.

import { useMemo, useState } from "react";
import type { Rules } from "../../lib/character/rules.ts";
import { ABILITY_NAMES, type Character, type ClassSpells, type Sheet, type SpellcastingInfo } from "../../lib/character/types.ts";
import type { Entry } from "../../lib/types.ts";
import { signed } from "./labels.ts";
import SearchSelect from "./SearchSelect.tsx";
import CastPanel, { type Caster, type Roll } from "./CastPanel.tsx";
import SpellMaker from "./SpellMaker.tsx";

type Update = (fn: (c: Character) => Character) => void;

const ORD = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const refOf = (e: Entry) => `${e.name}|${e.source}`;
const empty = (): ClassSpells => ({ cantrips: [], known: [], prepared: [] });

/** What a spell row needs to offer "Cast". One panel is open at a time. */
interface CastProps {
  scope: string;
  caster: Caster;
  canCast?: (ref: string) => boolean;
  ch: Character;
  sheet: Sheet;
  update: Update;
  roll: Roll;
  open: string | null;
  setOpen: (key: string | null) => void;
}

export default function SpellsTab({ ch, sheet, rules, update, roll }: { ch: Character; sheet: Sheet; rules: Rules; update: Update; roll: Roll }) {
  const [open, setOpen] = useState<string | null>(null);
  const [maker, setMaker] = useState(false);
  const makerButton = (
    <button className={`small ${maker ? "primary" : ""}`} onClick={() => setMaker((x) => !x)} title="Make your own spells">
      Spell Maker
    </button>
  );
  const makerPanel = maker && <SpellMaker data={rules.data} defaultClasses={ch.classes.map((c) => c.name)} onClose={() => setMaker(false)} />;
  if (!sheet.spellcasting.length && !sheet.extraSpells.length)
    return (
      <div className="spells">
        <p className="muted pad">This character doesn't cast spells (yet). {makerButton}</p>
        {makerPanel}
      </div>
    );
  const pb = sheet.proficiencyBonus;
  return (
    <div className="spells">
      <div className="row">
        <div className="grow">
          <Slots ch={ch} sheet={sheet} update={update} />
        </div>
        {makerButton}
      </div>
      {makerPanel}
      {sheet.spellcasting.map((sc) => (
        <ClassSpellList
          key={sc.classRef}
          sc={sc}
          ch={ch}
          rules={rules}
          update={update}
          cast={{ scope: sc.classRef, caster: { attack: sc.attack, dc: sc.dc, mod: sheet.abilities[sc.ability].mod }, ch, sheet, update, roll, open, setOpen }}
        />
      ))}
      {sheet.extraSpells.length > 0 && (
        <section className="class-spells">
          <h3>Other spells</h3>
          <div className="spell-rows">
            {sheet.extraSpells.map((s, i) => {
              const e = rules.findSpell(s.ref);
              const [name, source] = s.ref.split("|");
              const ab = (s.ability ?? "cha") as keyof typeof ABILITY_NAMES;
              const mod = sheet.abilities[ab]?.mod ?? 0;
              const key = `extra:${i}:${s.ref}`;
              // Innate and item spells ("1/long rest", "3 charges") can be cast without a slot.
              const free = s.note && !/^known$/i.test(s.note) ? s.note : undefined;
              return (
                <div key={key}>
                  <div className="spell-row">
                    <span className="lk lk-spell" data-5e="spell" data-name={e?.name ?? name} data-source={e?.source ?? source}>
                      {e?.name ?? name}
                    </span>
                    <span className="small muted grow">
                      {ORD[e?.raw.level ?? 0]} · {s.note} · {s.from}
                      {s.ability ? ` · ${ABILITY_NAMES[ab] ?? s.ability}` : ""}
                    </span>
                    {e && <CastButton open={open} setOpen={setOpen} k={key} />}
                  </div>
                  {e && open === key && (
                    <CastPanel spell={e} caster={{ attack: pb + mod, dc: 8 + pb + mod, mod, free }} ch={ch} sheet={sheet} update={update} roll={roll} onClose={() => setOpen(null)} />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function CastButton({ open, setOpen, k }: { open: string | null; setOpen: (k: string | null) => void; k: string }) {
  return (
    <button className={`small ${open === k ? "primary" : ""}`} onClick={() => setOpen(open === k ? null : k)}>
      Cast
    </button>
  );
}

function Slots({ ch, sheet, update }: { ch: Character; sheet: Sheet; update: Update }) {
  const used = ch.state.slotsUsed;
  const setUsed = (i: number, n: number) =>
    update((c) => {
      const s = [...c.state.slotsUsed];
      s[i] = Math.max(0, Math.min(sheet.slots[i], n));
      return { ...c, state: { ...c.state, slotsUsed: s } };
    });
  if (!sheet.slots.length && !sheet.pact) return null;
  return (
    <div className="slot-bar">
      {sheet.slots.map((max, i) => {
        const left = max - (used[i] ?? 0);
        return (
          <div key={i} className="slot">
            <span className="small muted">{ORD[i + 1]}</span>
            <span className="pips">
              {Array.from({ length: max }, (_, j) => (
                <button key={j} className={`pip ${j < left ? "on" : ""}`} onClick={() => setUsed(i, (used[i] ?? 0) + (j < left ? 1 : -1))} aria-label={j < left ? `Use a ${ORD[i + 1]}-level slot` : `Restore a ${ORD[i + 1]}-level slot`} />
              ))}
            </span>
          </div>
        );
      })}
      {sheet.pact && (
        <div className="slot">
          <span className="small muted">Pact ({ORD[sheet.pact.level]})</span>
          <span className="pips">
            {Array.from({ length: sheet.pact.slots }, (_, j) => {
              const left = sheet.pact!.slots - ch.state.pactUsed;
              return (
                <button
                  key={j}
                  className={`pip ${j < left ? "on" : ""}`}
                  onClick={() => update((c) => ({ ...c, state: { ...c.state, pactUsed: Math.max(0, Math.min(sheet.pact!.slots, c.state.pactUsed + (j < left ? 1 : -1))) } }))}
                  aria-label="Pact slot"
                />
              );
            })}
          </span>
        </div>
      )}
    </div>
  );
}

function ClassSpellList({ sc, ch, rules, update, cast }: { sc: SpellcastingInfo; ch: Character; rules: Rules; update: Update; cast: CastProps }) {
  const [className, classSource] = sc.classRef.split("|");
  // The class list plus anything the subclass adds (patron spells, the wizard list for Eldritch Knights…).
  const list = useMemo(() => {
    const own = rules.classSpells(className, classSource);
    const seen = new Set(own.map(refOf));
    const extra = sc.expanded.map((r) => rules.findSpell(r)).filter((e): e is Entry => !!e && !seen.has(refOf(e)));
    return [...own, ...extra].sort((a, b) => (a.raw.level ?? 0) - (b.raw.level ?? 0) || a.name.localeCompare(b.name));
  }, [rules, className, classSource, sc.expanded]);
  const fromSubclass = new Set(sc.expanded);
  const mine = ch.spells[sc.classRef] ?? empty();
  const setMine = (fn: (s: ClassSpells) => ClassSpells) => update((c) => ({ ...c, spells: { ...c.spells, [sc.classRef]: fn(c.spells[sc.classRef] ?? empty()) } }));
  const lvl = (ref: string) => rules.findSpell(ref)?.raw.level ?? 0;
  const [showAll, setShowAll] = useState(false);

  const cantripOptions = list.filter((e) => e.raw.level === 0 && !mine.cantrips.includes(refOf(e)));
  const leveled = list.filter((e) => e.raw.level >= 1 && e.raw.level <= sc.maxSpellLevel);
  const knownOptions = leveled.filter((e) => !mine.known.includes(refOf(e)));
  // What can be prepared: the spellbook for wizards, the whole class list for clerics/druids/paladins.
  const preparable = sc.mode === "spellbook" ? mine.known : sc.mode === "prepared" ? leveled.map(refOf) : [];
  const preparedCount = mine.prepared.filter((r) => preparable.includes(r)).length;

  const togglePrepared = (ref: string) =>
    setMine((s) => ({ ...s, prepared: s.prepared.includes(ref) ? s.prepared.filter((x) => x !== ref) : [...s.prepared, ref] }));

  return (
    <section className="class-spells">
      <h3>
        {sc.className} <span className="muted small">{ABILITY_NAMES[sc.ability]} · save DC {sc.dc} · attack {signed(sc.attack)}</span>
      </h3>
      {!list.length && (
        <p className="small error">
          No {sc.className} spells found
          {sc.mode === "known" && !rules.classSpells(className, classSource).length && !sc.expanded.length ? " yet (pick your subclass on the Build tab)" : ". Import more spell sources in Settings"}.
        </p>
      )}

      {sc.cantripsMax > 0 && (
        <>
          <h4 className="sheet-h">
            Cantrips <Count n={mine.cantrips.length} max={sc.cantripsMax} />
          </h4>
          <SpellRows refs={mine.cantrips} rules={rules} cast={cast} onRemove={(r) => setMine((s) => ({ ...s, cantrips: s.cantrips.filter((x) => x !== r) }))} />
          {mine.cantrips.length < sc.cantripsMax && (
            <SearchSelect
              placeholder="Add a cantrip"
              options={cantripOptions.map((e) => ({ value: refOf(e), label: e.name, hint: `${fromSubclass.has(refOf(e)) ? "subclass · " : ""}${e.source}` }))}
              onChange={(r) => setMine((s) => ({ ...s, cantrips: [...s.cantrips, r] }))}
            />
          )}
        </>
      )}

      {(sc.mode === "known" || sc.mode === "spellbook") && (
        <>
          <h4 className="sheet-h">
            {sc.mode === "spellbook" ? "Spellbook" : "Spells known"} <Count n={mine.known.length} max={sc.knownMax} />
            {sc.mode === "spellbook" && <span className="small muted"> · prepared {preparedCount}/{sc.preparedMax}</span>}
          </h4>
          <SpellRows
            refs={[...mine.known].sort((a, b) => lvl(a) - lvl(b))}
            rules={rules}
            prepared={sc.mode === "spellbook" ? mine.prepared : undefined}
            cast={{ ...cast, canCast: sc.mode === "spellbook" ? (r) => mine.prepared.includes(r) : undefined }}
            onTogglePrepared={sc.mode === "spellbook" ? togglePrepared : undefined}
            onRemove={(r) => setMine((s) => ({ ...s, known: s.known.filter((x) => x !== r), prepared: s.prepared.filter((x) => x !== r) }))}
          />
          {(mine.known.length < sc.knownMax || sc.mode === "spellbook") && (
            <SearchSelect
              placeholder={sc.mode === "spellbook" ? "Add a spell to the spellbook" : "Learn a spell"}
              options={knownOptions.map((e) => ({ value: refOf(e), label: e.name, hint: `${ORD[e.raw.level]} · ${fromSubclass.has(refOf(e)) ? "subclass · " : ""}${e.source}` }))}
              onChange={(r) => setMine((s) => ({ ...s, known: [...s.known, r] }))}
            />
          )}
        </>
      )}

      {sc.mode === "prepared" && (
        <>
          <h4 className="sheet-h">
            Prepared <Count n={preparedCount} max={sc.preparedMax} />{" "}
            <button className="link small" onClick={() => setShowAll((x) => !x)}>
              {showAll ? "show prepared only" : "show whole list"}
            </button>
          </h4>
          <SpellRows
            refs={showAll ? leveled.map(refOf) : mine.prepared.filter((r) => preparable.includes(r))}
            rules={rules}
            prepared={mine.prepared}
            onTogglePrepared={togglePrepared}
            cast={{ ...cast, canCast: (r) => mine.prepared.includes(r) }}
          />
          {!showAll && !preparedCount && <p className="small muted">Show the whole list to prepare spells.</p>}
        </>
      )}

      {sc.alwaysPrepared.length > 0 && (
        <>
          <h4 className="sheet-h">
            Always prepared <span className="small muted">from your subclass · don't count against prepared spells</span>
          </h4>
          <SpellRows refs={sc.alwaysPrepared} rules={rules} cast={cast} />
        </>
      )}

      {sc.bonusKnown.length > 0 && (
        <>
          <h4 className="sheet-h">
            Always known <span className="small muted">from your subclass · don't count against spells known</span>
          </h4>
          <SpellRows refs={sc.bonusKnown} rules={rules} cast={cast} />
        </>
      )}

      {sc.expanded.length > 0 && sc.expanded.length <= 40 && (
        <p className="small muted">
          Your subclass adds {sc.expanded.length} spell{sc.expanded.length === 1 ? "" : "s"} to the list you can choose from (marked “subclass” when picking).
        </p>
      )}
    </section>
  );
}

function Count({ n, max }: { n: number; max: number }) {
  return <span className={`small ${n > max ? "error" : "muted"}`}>{n}/{max}</span>;
}

function SpellRows({
  refs,
  rules,
  prepared,
  onTogglePrepared,
  onRemove,
  cast,
}: {
  refs: string[];
  rules: Rules;
  prepared?: string[];
  onTogglePrepared?: (ref: string) => void;
  onRemove?: (ref: string) => void;
  cast?: CastProps;
}) {
  if (!refs.length) return <p className="small muted">None yet.</p>;
  return (
    <div className="spell-rows">
      {refs.map((ref) => {
        const e = rules.findSpell(ref);
        const [name, source] = ref.split("|");
        const r = e?.raw ?? {};
        const key = cast ? `${cast.scope}:${ref}` : "";
        // Unprepared spells can't be cast, except wizard rituals straight from the spellbook.
        const castable = !!(cast && e && (!cast.canCast || cast.canCast(ref) || r.meta?.ritual));
        return (
          <div key={ref}>
          <div className="spell-row">
            {onTogglePrepared && (
              <input type="checkbox" checked={!!prepared?.includes(ref)} onChange={() => onTogglePrepared(ref)} aria-label={`Prepare ${name}`} />
            )}
            <span className="lk lk-spell" data-5e="spell" data-name={e?.name ?? name} data-source={e?.source ?? source}>
              {e?.name ?? name}
            </span>
            <span className="small muted grow">
              {ORD[r.level ?? 0]}
              {r.meta?.ritual ? " · ritual" : ""}
              {(r.duration ?? []).some((d: any) => d.concentration) ? " · concentration" : ""}
            </span>
            {castable && <CastButton open={cast!.open} setOpen={cast!.setOpen} k={key} />}
            {onRemove && (
              <button className="ghost small" onClick={() => onRemove(ref)} aria-label={`Remove ${name}`}>
                ✕
              </button>
            )}
          </div>
          {castable && cast!.open === key && (
            <CastPanel
              spell={e!}
              caster={cast!.caster}
              ritualOnly={!!cast!.canCast && !cast!.canCast(ref)}
              ch={cast!.ch}
              sheet={cast!.sheet}
              update={cast!.update}
              roll={cast!.roll}
              onClose={() => cast!.setOpen(null)}
            />
          )}
          </div>
        );
      })}
    </div>
  );
}
