// The campaign's clock: date and time (the Forgotten Realms' Calendar of
// Harptos, or plain numbered days), travel at a pace, rests, and timers for
// things that last a while ("Potion of Invisibility: 1 hour").

export interface ClockTimer {
  id: string;
  name: string;
  /** When it ends, in clock minutes. */
  ends: number;
}

export interface ClockLog {
  at: number;
  text: string;
}

export interface Clock {
  calendar: "harptos" | "days";
  /** Minutes since the start of the first day (day 1 of the start year, midnight). */
  minutes: number;
  /** Harptos: the year at minute 0 (1492 DR by default). */
  year: number;
  lastLongRest?: number;
  timers: ClockTimer[];
  log: ClockLog[];
}

export const newClock = (): Clock => ({ calendar: "harptos", minutes: 8 * 60, year: 1492, timers: [], log: [] });

const DAY = 1440;

/** The Calendar of Harptos: twelve months of 30 days, with five festival days between some of them. */
const HARPTOS: { name: string; days: number; festival?: boolean }[] = [
  { name: "Hammer", days: 30 },
  { name: "Midwinter", days: 1, festival: true },
  { name: "Alturiak", days: 30 },
  { name: "Ches", days: 30 },
  { name: "Tarsakh", days: 30 },
  { name: "Greengrass", days: 1, festival: true },
  { name: "Mirtul", days: 30 },
  { name: "Kythorn", days: 30 },
  { name: "Flamerule", days: 30 },
  { name: "Midsummer", days: 1, festival: true },
  { name: "Eleasis", days: 30 },
  { name: "Eleint", days: 30 },
  { name: "Highharvestide", days: 1, festival: true },
  { name: "Marpenoth", days: 30 },
  { name: "Uktar", days: 30 },
  { name: "Feast of the Moon", days: 1, festival: true },
  { name: "Nightal", days: 30 },
];
export const HARPTOS_MONTHS = HARPTOS.filter((m) => !m.festival).map((m) => m.name);
const YEAR = HARPTOS.reduce((n, m) => n + m.days, 0); // 365

const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

export function timeOfDay(minutes: number): string {
  const h = Math.floor((((minutes % DAY) + DAY) % DAY) / 60);
  return h < 5 ? "night" : h < 7 ? "dawn" : h < 12 ? "morning" : h < 14 ? "midday" : h < 18 ? "afternoon" : h < 21 ? "evening" : "night";
}

export const clockTime = (minutes: number) => {
  const m = ((minutes % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** "12th of Ches, 1492 DR" or "Day 13". */
export function clockDate(c: Pick<Clock, "calendar" | "year">, minutes: number): string {
  const day = Math.floor(minutes / DAY);
  if (c.calendar === "days") return `Day ${day + 1}`;
  const year = c.year + Math.floor(day / YEAR);
  let left = ((day % YEAR) + YEAR) % YEAR;
  for (const m of HARPTOS) {
    if (left < m.days) return m.festival ? `${m.name}, ${year} DR` : `${ord(left + 1)} of ${m.name}, ${year} DR`;
    left -= m.days;
  }
  return `${year} DR`;
}

/** Minutes for a Harptos date: month (0–11 of the twelve), day 1–30. */
export function harptosMinutes(c: Pick<Clock, "year">, year: number, month: number, day: number, time = 8 * 60): number {
  let d = (year - c.year) * YEAR;
  let i = 0;
  for (const m of HARPTOS) {
    if (!m.festival) {
      if (i === month) break;
      i++;
    }
    d += m.days;
  }
  return (d + Math.max(0, Math.min(29, day - 1))) * DAY + time;
}

export function durationText(min: number): string {
  if (min <= 0) return "now";
  const d = Math.floor(min / DAY);
  const h = Math.floor((min % DAY) / 60);
  const m = min % 60;
  return [d && `${d} day${d === 1 ? "" : "s"}`, h && `${h} hour${h === 1 ? "" : "s"}`, m && `${m} min`].filter(Boolean).join(" ") || "now";
}

/** "1 hour", "10 minutes", "8 hours", "1 minute", "24 hours", "1 day" → minutes, or null. */
export function parseDuration(s: string): number | null {
  const m = s.match(/(\d+)\s*(minute|min|hour|hr|day|round)s?/i);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  return u.startsWith("min") ? n : u.startsWith("h") ? n * 60 : u.startsWith("d") ? n * DAY : Math.max(1, Math.ceil(n / 10));
}

export const PACES = {
  fast: { mph: 4, perDay: 30, note: "−5 to passive Perception" },
  normal: { mph: 3, perDay: 24, note: "" },
  slow: { mph: 2, perDay: 18, note: "can move stealthily" },
} as const;
export type Pace = keyof typeof PACES;

export interface Trip {
  /** Clock minutes the journey takes (nights of rest included). */
  minutes: number;
  days: number;
  hoursLastDay: number;
  /** Forced march: hours past 8 a day, each needing a Constitution save. */
  forcedHours: number;
}

/** A journey of `miles` at a pace, travelling `hoursPerDay` hours a day and resting the rest of each day. */
export function trip(miles: number, pace: Pace, hoursPerDay = 8): Trip {
  const hours = miles / PACES[pace].mph;
  const per = Math.max(1, hoursPerDay);
  const days = Math.floor(hours / per);
  const rest = hours - days * per;
  // Whole days of travel, then a night's rest before each next day; the last day ends when they arrive.
  const minutes = rest > 0 ? days * DAY + Math.round(rest * 60) : Math.max(0, (days - 1) * DAY + Math.round(per * 60));
  return { minutes, days: rest > 0 ? days + 1 : days, hoursLastDay: rest > 0 ? Math.round(rest * 10) / 10 : per, forcedHours: Math.max(0, per - 8) };
}

/** Move the clock on; returns the timers that ran out. */
export function advance(c: Clock, minutes: number, text?: string): { clock: Clock; ended: ClockTimer[] } {
  const now = c.minutes + Math.max(0, Math.round(minutes));
  const ended = c.timers.filter((t) => t.ends <= now);
  const log = text ? [{ at: now, text }, ...c.log].slice(0, 200) : c.log;
  return { clock: { ...c, minutes: now, timers: c.timers.filter((t) => t.ends > now), log }, ended };
}
