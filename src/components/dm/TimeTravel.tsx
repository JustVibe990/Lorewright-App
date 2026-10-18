// Time and travel: the date and time in the world, moving it on (minutes,
// hours, rests, days, journeys at a pace), timers that end on their own
// ("Potion of Invisibility: 1 hour"), and a log of what took the time.

import { useState } from "react";
import { uid } from "../../lib/combat.ts";
import { advance, clockDate, clockTime, durationText, HARPTOS_MONTHS, harptosMinutes, newClock, PACES, parseDuration, timeOfDay, trip, type Clock, type ClockTimer, type Pace } from "../../lib/clock.ts";
import type { DmChildProps } from "./DmView.tsx";

export default function TimeTravel({ dm, change, characters }: DmChildProps) {
  const clock = dm.clock ?? newClock();
  const [ended, setEnded] = useState<ClockTimer[]>([]);
  const [miles, setMiles] = useState(24);
  const [pace, setPace] = useState<Pace>("normal");
  const [hours, setHours] = useState(8);
  const [where, setWhere] = useState("");
  const [timerName, setTimerName] = useState("");
  const [timerFor, setTimerFor] = useState("1 hour");
  const [setting, setSetting] = useState(false);

  const save = (c: Clock) => change((d) => ({ ...d, clock: c }));
  const move = (minutes: number, text?: string, patch: Partial<Clock> = {}) => {
    const r = advance(clock, minutes, text);
    save({ ...r.clock, ...patch });
    if (r.ended.length) setEnded((l) => [...r.ended, ...l]);
  };
  const t = trip(miles, pace, hours);
  const sinceRest = clock.lastLongRest != null ? clock.minutes - clock.lastLongRest : null;

  /** Timers for what the party has running: potions and features with a duration. */
  const fromParty = () => {
    const add: ClockTimer[] = [];
    for (const cf of characters) {
      for (const a of cf.character.state.active ?? []) {
        const m = a.until ? parseDuration(a.until) : null;
        const name = `${cf.character.name}: ${a.name}`;
        if (m && !clock.timers.some((x) => x.name === name)) add.push({ id: uid(), name, ends: clock.minutes + m });
      }
    }
    save({ ...clock, timers: [...clock.timers, ...add] });
  };

  return (
    <div className="dm-time">
      <section className="dm-card clock-face">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <div className="grow">
            <div className="clock-date">{clockDate(clock, clock.minutes)}</div>
            <div className="clock-time">
              {clockTime(clock.minutes)} <span className="muted small">{timeOfDay(clock.minutes)}</span>
            </div>
          </div>
          <div className="small muted">
            {sinceRest != null ? `Last long rest ${durationText(sinceRest)} ago` : "No long rest logged yet"}
            {sinceRest != null && sinceRest >= 24 * 60 && <div className="error">A day or more without a long rest</div>}
          </div>
          <button className="ghost small" onClick={() => setSetting((x) => !x)}>
            {setting ? "Done" : "Set date"}
          </button>
        </div>
        {setting && <SetDate clock={clock} onSave={save} />}
        <div className="row clock-buttons" style={{ flexWrap: "wrap" }}>
          <button onClick={() => move(1)}>+1 min</button>
          <button onClick={() => move(10)}>+10 min</button>
          <button onClick={() => move(60)}>+1 hour</button>
          <button onClick={() => move(60, "Short rest (1 hour)")}>Short rest</button>
          <button onClick={() => move(8 * 60, "Long rest (8 hours)", { lastLongRest: clock.minutes + 8 * 60 })}>Long rest</button>
          <button onClick={() => move(24 * 60)}>+1 day</button>
          <button
            onClick={() => {
              const now = clock.minutes % 1440;
              move(((6 * 60 - now + 1440) % 1440) || 1440, "Waited until dawn");
            }}
          >
            Until dawn
          </button>
        </div>
      </section>

      {ended.length > 0 && (
        <div className="notice turn-notes" role="status">
          <div className="row">
            <b className="grow">Time's up</b>
            <button className="ghost small" onClick={() => setEnded([])} aria-label="Dismiss">
              ✕
            </button>
          </div>
          <ul className="small">
            {ended.map((x) => (
              <li key={x.id}>{x.name} has ended.</li>
            ))}
          </ul>
        </div>
      )}

      <section className="dm-card">
        <h4 className="sheet-h">Travel</h4>
        <div className="row small" style={{ flexWrap: "wrap" }}>
          <input className="hp-roll" type="number" min={0} value={miles} onChange={(e) => setMiles(Math.max(0, Number(e.target.value) || 0))} aria-label="Miles" /> miles at a
          <select value={pace} onChange={(e) => setPace(e.target.value as Pace)} aria-label="Pace">
            {(Object.keys(PACES) as Pace[]).map((p) => (
              <option key={p} value={p}>
                {p} pace ({PACES[p].mph} mph, {PACES[p].perDay} miles a day)
              </option>
            ))}
          </select>
          <label className="row">
            <input className="hp-roll" type="number" min={1} max={16} value={hours} onChange={(e) => setHours(Math.max(1, Math.min(16, Number(e.target.value) || 8)))} aria-label="Hours a day" /> hours a day
          </label>
          <input placeholder="To where (optional)" value={where} onChange={(e) => setWhere(e.target.value)} />
          <button className="primary" disabled={!miles} onClick={() => move(t.minutes, `Travelled ${miles} miles at a ${pace} pace${where ? ` to ${where}` : ""}`)}>
            Travel
          </button>
        </div>
        <p className="small muted">
          {miles ? (
            <>
              Takes {t.days} day{t.days === 1 ? "" : "s"} ({t.days > 1 ? `${t.days - 1} full, then ` : ""}
              {t.hoursLastDay} hours), arriving {clockDate(clock, clock.minutes + t.minutes)} at {clockTime(clock.minutes + t.minutes)}.{PACES[pace].note && ` ${PACES[pace].note[0].toUpperCase()}${PACES[pace].note.slice(1)}.`}
              {t.forcedHours > 0 && <span className="error"> Forced march: each hour past 8 needs a Constitution save (DC 10 + 1 per extra hour) or a level of exhaustion.</span>}
            </>
          ) : (
            "How far, and how fast."
          )}
        </p>
      </section>

      <section className="dm-card">
        <h4 className="sheet-h">Timers</h4>
        {clock.timers.length === 0 && <p className="small muted">Nothing running. Add a spell or potion's duration, or take them from the party's sheets.</p>}
        <ul className="small clock-timers">
          {[...clock.timers]
            .sort((a, b) => a.ends - b.ends)
            .map((x) => (
              <li key={x.id} className="row">
                <span className="grow">
                  <b>{x.name}</b> <span className="muted">· {durationText(x.ends - clock.minutes)} left (ends {clockTime(x.ends)})</span>
                </span>
                <button className="ghost small" onClick={() => save({ ...clock, timers: clock.timers.filter((y) => y.id !== x.id) })} aria-label={`Remove ${x.name}`}>
                  ✕
                </button>
              </li>
            ))}
        </ul>
        <div className="row small" style={{ flexWrap: "wrap" }}>
          <input placeholder="What: Bless on Kara, torch…" value={timerName} onChange={(e) => setTimerName(e.target.value)} />
          <select value={timerFor} onChange={(e) => setTimerFor(e.target.value)} aria-label="How long">
            {["1 minute", "10 minutes", "1 hour", "8 hours", "24 hours"].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <button
            disabled={!timerName.trim()}
            onClick={() => {
              save({ ...clock, timers: [...clock.timers, { id: uid(), name: timerName.trim(), ends: clock.minutes + (parseDuration(timerFor) ?? 60) }] });
              setTimerName("");
            }}
          >
            Add timer
          </button>
          {characters.length > 0 && (
            <button className="ghost small" onClick={fromParty} title="Potions and features with a duration on the characters' sheets">
              From the party's sheets
            </button>
          )}
        </div>
      </section>

      {clock.log.length > 0 && (
        <section className="dm-card">
          <div className="row">
            <h4 className="sheet-h grow">Log</h4>
            <button className="ghost small" onClick={() => save({ ...clock, log: [] })}>
              Clear
            </button>
          </div>
          <ul className="small clock-log">
            {clock.log.slice(0, 30).map((l, i) => (
              <li key={i}>
                <span className="muted">
                  {clockDate(clock, l.at)} {clockTime(l.at)}:
                </span>{" "}
                {l.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SetDate({ clock, onSave }: { clock: Clock; onSave: (c: Clock) => void }) {
  const day = Math.floor(clock.minutes / 1440);
  const yearNow = clock.year + Math.floor(day / 365);
  const [cal, setCal] = useState(clock.calendar);
  const [year, setYear] = useState(yearNow);
  const [month, setMonth] = useState(0);
  const [dom, setDom] = useState(1);
  const [dayN, setDayN] = useState(day + 1);
  const [time, setTime] = useState(clockTime(clock.minutes));
  const mins = () => {
    const [h, m] = time.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return (
    <div className="row small set-date" style={{ flexWrap: "wrap" }}>
      <select value={cal} onChange={(e) => setCal(e.target.value as Clock["calendar"])} aria-label="Calendar">
        <option value="harptos">Calendar of Harptos (Forgotten Realms)</option>
        <option value="days">Numbered days</option>
      </select>
      {cal === "harptos" ? (
        <>
          <input className="hp-roll" type="number" min={1} max={30} value={dom} onChange={(e) => setDom(Number(e.target.value) || 1)} aria-label="Day" />
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Month">
            {HARPTOS_MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          <input className="hp-roll" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || 1492)} aria-label="Year" /> DR
        </>
      ) : (
        <>
          Day <input className="hp-roll" type="number" min={1} value={dayN} onChange={(e) => setDayN(Math.max(1, Number(e.target.value) || 1))} aria-label="Day" />
        </>
      )}
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
      <button
        className="primary small"
        onClick={() => {
          const base = cal === "harptos" ? { ...clock, calendar: cal, year } : { ...clock, calendar: cal };
          const minutes = cal === "harptos" ? harptosMinutes({ year }, year, month, dom, mins()) : (dayN - 1) * 1440 + mins();
          // Timers keep their time left.
          const shift = minutes - clock.minutes;
          onSave({ ...base, minutes, timers: clock.timers.map((x) => ({ ...x, ends: x.ends + shift })), lastLongRest: clock.lastLongRest != null ? clock.lastLongRest + shift : undefined });
        }}
      >
        Set
      </button>
    </div>
  );
}
