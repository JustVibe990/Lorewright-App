// Casting a spell from the Spells tab: pick how to pay for it (slot level,
// pact slot, ritual, free), then Cast spends it, rolls the attack and the
// damage or healing, and starts concentration if the spell needs it.

import { useState } from "react";
import { castInfo, slotOptions, type SlotOption } from "../../lib/character/casting.ts";
import { ABILITY_NAMES, type Ability, type Character, type Sheet } from "../../lib/character/types.ts";
import { rollModeLabel, rollModeOf, withRollMode } from "../../lib/dice.ts";
import type { Entry } from "../../lib/types.ts";
import { playLead } from "../../lib/sfx.ts";
import type { RollKind } from "../../lib/character/conditions.ts";

type Update = (fn: (c: Character) => Character) => void;
export type Roll = (expr: string, label: string, kind?: RollKind) => unknown;

const ORD = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const d20 = (mod: number) => `1d20${mod >= 0 ? "+" : ""}${mod}`;

export interface Caster {
  /** Spell attack bonus and save DC to use. */
  attack: number;
  dc: number;
  /** Spellcasting ability modifier (for "+ your spellcasting ability modifier"). */
  mod: number;
  /** For spells from items or species: e.g. "1/long rest", offered as a free cast. */
  free?: string;
}

export default function CastPanel({
  spell,
  caster,
  ritualOnly,
  ch,
  sheet,
  update,
  roll,
  onClose,
  pay,
}: {
  spell: Entry;
  caster: Caster;
  /** Not prepared: only a ritual cast is allowed (wizards). */
  ritualOnly?: boolean;
  ch: Character;
  sheet: Sheet;
  update: Update;
  roll: Roll;
  onClose: () => void;
  /** Paid for by something else (an item's charges, a scroll): its options, and what casting costs. */
  pay?: { options: SlotOption[]; spend: (c: Character, o: SlotOption) => Character; empty: string };
}) {
  const raw = spell.raw;
  const all = pay ? pay.options : slotOptions(
    raw.level ?? 0,
    sheet.slots,
    ch.state.slotsUsed,
    sheet.pact,
    ch.state.pactUsed,
    { ritual: !!raw.meta?.ritual, free: caster.free ? `Free (${caster.free})` : undefined },
  );
  const options = ritualOnly ? all.filter((o) => o.kind === "ritual") : all;
  const [choice, setChoice] = useState(options[0]?.id ?? "");
  const [cast, setCast] = useState<{ level: number; replaced?: string } | null>(null);
  const opt = options.find((o) => o.id === choice);
  const level = cast?.level ?? opt?.level ?? raw.level ?? 0;
  const info = castInfo(raw, level, sheet.totalLevel, caster.mod);
  const who = ch.name || "Character";
  const label = `${spell.name}${level ? ` (${ORD[level]})` : ""}`;

  const rollAttack = (e: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
    const mode = rollModeOf(e);
    roll(withRollMode(d20(caster.attack), mode), `${who}: ${label} attack${rollModeLabel(mode)}`, { kind: "attack", range: info.attack === "melee" ? "melee" : "ranged" });
  };
  const rollEffect = () => {
    if (info.damage) roll(info.damage, `${who}: ${label} ${info.damageTypes.join("/") || ""} damage`.replace(/\s+/g, " "));
    if (info.heal) roll(info.heal, `${who}: ${label} healing`);
  };

  const doCast = (e: React.MouseEvent) => {
    if (!opt) return;
    const previous = ch.state.concentration;
    playLead("spell", ["dice"]);
    update((c) => {
      const paid = pay ? pay.spend(c, opt) : c;
      const state = { ...paid.state };
      if (opt.kind === "slot" && opt.slotIndex != null) {
        const used = [...state.slotsUsed];
        used[opt.slotIndex] = (used[opt.slotIndex] ?? 0) + 1;
        state.slotsUsed = used;
      }
      if (opt.kind === "pact") state.pactUsed = state.pactUsed + 1;
      if (info.concentration) state.concentration = { ref: `${spell.name}|${spell.source}`, name: spell.name, level: opt.level };
      return { ...paid, state };
    });
    setCast({ level: opt.level, replaced: info.concentration && previous ? previous.name : undefined });
    if (info.attack) rollAttack(e);
    rollEffect();
  };

  return (
    <div className="cast-panel">
      <div className="row small" style={{ flexWrap: "wrap" }}>
        {!cast ? (
          <>
            {options.length ? (
              <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Cast using">
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            ) : (
              <span className="error">{pay ? pay.empty : "No spell slots left for this level. A long rest restores them."}</span>
            )}
            <button className="primary small" disabled={!opt} onClick={doCast} title="Shift: attack with advantage · Ctrl: disadvantage">
              Cast
            </button>
          </>
        ) : (
          <span className="ok">
            Cast {spell.name}
            {cast.level ? ` at ${ORD[cast.level]} level` : ""}.
          </span>
        )}
        <span className="muted">
          {info.attack && <>{info.attack} spell attack {caster.attack >= 0 ? "+" : ""}{caster.attack}</>}
          {info.save.length > 0 && <>{info.save.map((s) => ABILITY_NAMES[s as Ability] ?? s).join("/")} save DC {caster.dc}</>}
          {(info.damage || info.heal) && <> · {info.damage ? `${info.damage} ${info.damageTypes.join("/")}` : `heals ${info.heal}`}</>}
          {info.concentration && " · concentration"}
          {info.ritual && " · ritual"}
        </span>
        <span className="grow" />
        <button className="ghost small" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {cast && (
        <div className="row small" style={{ marginTop: 4, flexWrap: "wrap" }}>
          {cast.replaced && <span className="muted">Stopped concentrating on {cast.replaced}.</span>}
          {info.attack && <button className="small" onClick={rollAttack}>Roll attack again</button>}
          {(info.damage || info.heal) && <button className="small" onClick={rollEffect}>Roll {info.heal ? "healing" : "damage"} again</button>}
        </div>
      )}
    </div>
  );
}
