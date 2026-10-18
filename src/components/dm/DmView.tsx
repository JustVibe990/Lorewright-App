// The DM tab: planned encounters, NPCs, treasure, session notes and homebrew.
// Encounters, NPCs and treasure are saved in the campaign's dm.json.

import { useEffect, useRef, useState } from "react";
import type { Rules } from "../../lib/character/rules.ts";
import type { CharacterFile } from "../../lib/character/storage.ts";
import type { DataStore } from "../../lib/data.ts";
import { emptyDm, loadDm, saveDm, type DmData } from "../../lib/dm.ts";
import type { NoteMeta } from "../../lib/types.ts";
import type { RollResult } from "../../lib/dice.ts";
import EncounterBuilder from "./EncounterBuilder.tsx";
import HomebrewPanel from "./HomebrewPanel.tsx";
import NpcList from "./NpcList.tsx";
import Sessions from "./Sessions.tsx";
import Treasure from "./Treasure.tsx";
import RandomTables from "./RandomTables.tsx";
import TimeTravel from "./TimeTravel.tsx";

export type DmSection = "encounters" | "npcs" | "treasure" | "sessions" | "tables" | "time" | "homebrew";
export const DM_SECTIONS: [DmSection, string, string][] = [
  ["encounters", "Encounters", "Plan fights and see how hard they are"],
  ["npcs", "NPCs", "Who's who, where they are, their stats"],
  ["treasure", "Treasure", "Roll loot and hand it out"],
  ["sessions", "Sessions", "A note for each session"],
  ["tables", "Random tables", "Roll for rumours, weather, names…"],
  ["time", "Time & travel", "The date, journeys, rests and timers"],
  ["homebrew", "Homebrew", "Your own spells, creatures and items"],
];

export type Roll = (expr: string, label: string, describe?: (r: RollResult) => string) => unknown;

export interface DmProps {
  campaign: string;
  data: DataStore;
  characters: CharacterFile[];
  notes: NoteMeta[];
  getRules: () => Rules;
  onRoll: Roll;
  onOpenNote: (file: string) => void;
  onOpenCombat: () => void;
  onNotesChanged: () => Promise<unknown>;
  onCharactersSaved: () => void;
}

export interface DmChildProps extends DmProps {
  dm: DmData;
  change: (fn: (d: DmData) => DmData) => void;
}

const SAVE_MS = 400;

export default function DmView(props: DmProps & { section: DmSection }) {
  const { campaign, section } = props;
  const [dm, setDm] = useState<DmData | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<DmData | null>(null);

  useEffect(() => {
    let live = true;
    setDm(null);
    loadDm(campaign).then((d) => live && setDm(d));
    return () => {
      live = false;
    };
  }, [campaign]);

  const flush = () => {
    window.clearTimeout(timer.current);
    const d = latest.current;
    latest.current = null;
    if (d) saveDm(campaign, d).catch((e) => setError(`Couldn't save: ${(e as Error)?.message ?? e}`));
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (fn: (d: DmData) => DmData) =>
    setDm((prev) => {
      const next = fn(prev ?? emptyDm());
      latest.current = next;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_MS);
      return next;
    });

  if (!dm) return <div className="empty-centre muted">Loading…</div>;
  const child: DmChildProps = { ...props, dm, change };
  const title = DM_SECTIONS.find(([s]) => s === section);
  return (
    <div className="dm">
      <header className="combat-head">
        <div className="grow">
          <h1 className="char-name">{title?.[1]}</h1>
          <div className="small muted">{title?.[2]}</div>
        </div>
      </header>
      {error && <p className="error small">{error}</p>}
      {section === "encounters" && <EncounterBuilder {...child} />}
      {section === "npcs" && <NpcList {...child} />}
      {section === "treasure" && <Treasure {...child} />}
      {section === "sessions" && <Sessions {...child} />}
      {section === "tables" && <RandomTables {...child} />}
      {section === "time" && <TimeTravel {...child} />}
      {section === "homebrew" && <HomebrewPanel {...child} />}
    </div>
  );
}
