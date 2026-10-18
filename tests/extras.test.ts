import { describe, expect, it } from "vitest";
import { advance, clockDate, clockTime, harptosMinutes, newClock, parseDuration, trip } from "../src/lib/clock.ts";
import { blankStats, combatantFromStats, rechargeMin, regeneration, startOfTurn, statsFromCreature } from "../src/lib/combat.ts";
import { backupDate, backupDue, backupsToPrune } from "../src/lib/backup.ts";
import { makeName, makeNames, NAME_SPECIES } from "../src/lib/names.ts";
import { expand, rollOn, rowFor, starterTables, tableRows, tableSize, type RandomTable } from "../src/lib/tables.ts";
import { makeZip, readZip } from "../src/lib/zip.ts";

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe("turn start", () => {
  const dragon = () => {
    const stats = statsFromCreature({
      name: "Dragon",
      source: "MM",
      hp: { average: 100 },
      dex: 10,
      action: [{ name: "Fire Breath {@recharge 5}", entries: ["{@dc 15} Dexterity, {@damage 12d6} fire"] }],
      legendary: [{ name: "Tail Attack", entries: ["{@hit 9} to hit"] }, { name: "Wing Attack (Costs 2 Actions)", entries: [""] }],
      trait: [{ name: "Regeneration", entries: ["The dragon regains 10 hit points at the start of its turn."] }],
    });
    return combatantFromStats(stats, "Dragon");
  };
  it("reads recharge, legendary actions and regeneration", () => {
    const d = dragon();
    expect(d.stats!.actions[0].name).toBe("Fire Breath (Recharge 5–6)");
    expect(rechargeMin(d.stats!.actions[0].name)).toBe(5);
    expect(d.stats!.legendary).toMatchObject({ count: 3 });
    expect(regeneration(d.stats)).toBe(10);
  });
  it("rolls recharges, resets legendary actions, counts timers down", () => {
    const d = { ...dragon(), hp: 50, spent: ["Fire Breath (Recharge 5–6)"], legendaryUsed: 2, conditions: ["Restrained"], timers: [{ id: "a", name: "Restrained", rounds: 1 }, { id: "b", name: "Bless", rounds: 3 }] };
    const back = startOfTurn(d, () => 6);
    expect(back.c.spent).toBeUndefined();
    expect(back.c.legendaryUsed).toBe(0);
    expect(back.c.timers).toEqual([{ id: "b", name: "Bless", rounds: 2 }]);
    expect(back.c.conditions).toEqual([]);
    expect(back.notes.map((n) => n.text)).toEqual(expect.arrayContaining(["Fire Breath recharged (rolled 6)", "Restrained ends", "Bless: 2 rounds left"]));
    expect(back.notes.find((n) => n.heal)?.heal).toBe(10);
    expect(startOfTurn(d, () => 2).c.spent).toEqual(["Fire Breath (Recharge 5–6)"]);
  });
  it("a plain creature has nothing to say", () => {
    expect(startOfTurn(combatantFromStats(blankStats(), "Rat"), () => 1).notes).toEqual([]);
  });
});

describe("random tables", () => {
  const t: RandomTable = { id: "1", name: "Weather", text: "3x Rain\nSun\n\n{2d1} birds" };
  it("weights and the die size", () => {
    expect(tableRows(t)).toEqual([{ text: "Rain", weight: 3 }, { text: "Sun", weight: 1 }, { text: "{2d1} birds", weight: 1 }]);
    expect(tableSize(t)).toBe(5);
    expect(rowFor(tableRows(t), 3)?.text).toBe("Rain");
    expect(rowFor(tableRows(t), 4)?.text).toBe("Sun");
    expect(rollOn(t, [t], Math.random, 0, 5).text).toBe("2 birds");
  });
  it("rolls on other tables", () => {
    const other: RandomTable = { id: "2", name: "Sky", text: "The sky: [[Weather]]" };
    expect(expand("[[sky]]", [t, other], seq(0))).toBe("The sky: Rain");
  });
  it("starter tables roll", () => {
    const st = starterTables();
    const tav = st.find((x) => x.name === "Tavern names")!;
    expect(rollOn(tav, st).text).toMatch(/^The |'s Rest$/);
  });
});

describe("names", () => {
  it("makes names for every species", () => {
    for (const s of NAME_SPECIES) expect(makeName(s).length).toBeGreaterThan(1);
    expect(new Set(makeNames("Elf", 6)).size).toBe(6);
  });
});

describe("clock", () => {
  it("Harptos dates and festivals", () => {
    const c = newClock();
    expect(clockDate(c, 0)).toBe("1st of Hammer, 1492 DR");
    expect(clockDate(c, 30 * 1440)).toBe("Midwinter, 1492 DR");
    expect(clockDate(c, 31 * 1440)).toBe("1st of Alturiak, 1492 DR");
    expect(clockDate(c, 365 * 1440)).toBe("1st of Hammer, 1493 DR");
    expect(clockDate(c, harptosMinutes(c, 1492, 2, 12))).toBe("12th of Ches, 1492 DR");
    expect(clockDate({ calendar: "days", year: 0 }, 2 * 1440)).toBe("Day 3");
    expect(clockTime(14 * 60 + 5)).toBe("14:05");
  });
  it("travel", () => {
    expect(trip(24, "normal").minutes).toBe(8 * 60);
    expect(trip(48, "normal")).toMatchObject({ minutes: 1440 + 480, days: 2 });
    expect(trip(30, "normal")).toMatchObject({ minutes: 1440 + 120, days: 2 });
    expect(trip(40, "normal", 10).forcedHours).toBe(2);
  });
  it("timers run out", () => {
    const c = { ...newClock(), timers: [{ id: "a", name: "Invisibility", ends: newClock().minutes + 60 }] };
    expect(advance(c, 30).ended).toEqual([]);
    const r = advance(c, 60, "Waited");
    expect(r.ended.map((x) => x.name)).toEqual(["Invisibility"]);
    expect(r.clock.timers).toEqual([]);
    expect(r.clock.log[0].text).toBe("Waited");
  });
  it("durations", () => {
    expect(parseDuration("1 hour")).toBe(60);
    expect(parseDuration("10 minutes")).toBe(10);
    expect(parseDuration("1 minute")).toBe(1);
    expect(parseDuration("until your next turn")).toBeNull();
  });
});

describe("backups", () => {
  it("dates, due, prune", () => {
    expect(backupDate("Camp 2026-10-17 1830.zip")?.getHours()).toBe(18);
    const list = [1, 2, 3, 4].map((d) => ({ name: `x${d}`, at: new Date(2026, 9, d) }));
    expect(backupsToPrune(list, 2).map((b) => b.name)).toEqual(["x2", "x1"]);
    expect(backupDue(list, 3, new Date(2026, 9, 6))).toBe(false);
    expect(backupDue(list, 3, new Date(2026, 9, 8))).toBe(true);
    expect(backupDue([], 3)).toBe(true);
  });
  it("a zip reads back", () => {
    const enc = new TextEncoder();
    const files = [{ path: "Camp/a.md", data: enc.encode("hello") }, { path: "Camp/Characters/é.json", data: enc.encode("{}") }];
    const back = readZip(makeZip(files));
    expect(back.map((f) => f.path)).toEqual(["Camp/a.md", "Camp/Characters/é.json"]);
    expect(new TextDecoder().decode(back[0].data)).toBe("hello");
  });
});
