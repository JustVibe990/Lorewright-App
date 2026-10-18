// Help: replay any tour, and a cheat sheet of tips and shortcuts.

import { TOURS, type TourId } from "../lib/tours.ts";
import { Modal } from "./common.tsx";

const CHEATS: [string, [string, string][]][] = [
  [
    "Anywhere",
    [
      ["Ctrl+K", "Find anything: notes, characters, rules, spells, monsters, items, random tables"],
      ["Click dice", "Rolls them (in cards, sheets and the tracker). Shift: advantage, Ctrl: disadvantage"],
      ["Dice box", "Type 2d6+3, 4d6kh3 or d20 in the roll log and press Enter. ↑ brings back earlier rolls"],
      ["Click a link", "Pins its card on the right. Ctrl+click opens it on your 5e.tools site"],
    ],
  ],
  [
    "Notes",
    [
      ["Select + Ctrl+L", "Links the words to a spell, monster, item, condition or feat. Ctrl+L inside a link unlinks it"],
      ["Hover a link", "Shows the full card; links inside cards can be hovered too"],
      ["Ctrl+Shift+F", "Search inside every note"],
      ["Red wavy line", "A link whose entry isn't in your data: hover it to relink"],
    ],
  ],
  [
    "Characters",
    [
      ["Ctrl+Z / Ctrl+Y", "Undo and redo on the sheet"],
      ["− / + / T", "Damage, heal, temp HP: type the amount first. Concentration saves are asked for"],
      ["Dots", "Spell slots and limited uses: click to use one or get it back"],
      ["Conditions", "Poisoned, Prone, exhaustion and the rest add advantage or disadvantage to the sheet's rolls"],
      ["Drink / Use", "Potions roll their healing and start their effects; wands use charges; scrolls cast"],
      ["Print", "A printable sheet, or save it as a PDF"],
    ],
  ],
  [
    "Combat",
    [
      ["Next turn", "Recharge rolls, legendary actions back, timers counting down and other reminders"],
      ["⏱", "A timer in rounds (1 minute = 10). A condition with the same name ends with it"],
      ["Stats", "Roll a creature's attacks, saves and checks, or Edit anything in its stat block"],
    ],
  ],
  [
    "DM",
    [
      ["Encounters", "Shows easy to deadly for your party, then Send to combat"],
      ["Random tables", "3x makes a line more likely, {2d6} rolls dice, [[Table]] rolls on another table"],
      ["Time & travel", "Rests, journeys, timers; From the party's sheets adds their potion timers"],
      ["Homebrew", "Spells, creatures and items of your own, for every campaign"],
    ],
  ],
];

export default function HelpDialog({ onClose, onTour, onResetTours }: { onClose: () => void; onTour: (id: TourId) => void; onResetTours: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="row">
        <h2 className="grow">Help</h2>
        <button className="ghost" onClick={onClose} aria-label="Close help">
          ✕
        </button>
      </div>
      <h3>Tours</h3>
      <ul className="help-tours">
        {TOURS.map((t) => (
          <li key={t.id} className="row">
            <span className="grow">
              <b>{t.name}</b> <span className="small muted">{t.blurb}</span>
            </span>
            <button
              className="small"
              onClick={() => {
                onClose();
                onTour(t.id);
              }}
            >
              Start
            </button>
          </li>
        ))}
      </ul>
      <p className="small">
        <button className="link small" onClick={onResetTours}>
          Show each area's tour again
        </button>{" "}
        <span className="muted">the next time it's opened.</span>
      </p>
      <h3>Cheat sheet</h3>
      {CHEATS.map(([group, rows]) => (
        <section key={group} className="help-group">
          <h4 className="sheet-h">{group}</h4>
          <table className="help-table">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td className="small">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </Modal>
  );
}
