import { describe, expect, it } from "vitest";
import { newCharacter } from "../src/lib/character/storage.ts";
import { addXp, levelForXp, xpEach, xpForLevel, xpProgress } from "../src/lib/character/xp.ts";
import { DEFAULT_APPEARANCE, HEADING_FONTS, isDark, paletteVars, TEXT_FONTS, THEMES, themeById } from "../src/lib/theme.ts";

describe("XP and levels", () => {
  it("the 2014 table", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(300);
    expect(xpForLevel(5)).toBe(6500);
    expect(xpForLevel(20)).toBe(355000);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(299)).toBe(1);
    expect(levelForXp(300)).toBe(2);
    expect(levelForXp(1_000_000)).toBe(20);
  });
  it("progress, and levels earned but not taken", () => {
    const c = { ...newCharacter("T"), xp: 2700 };
    expect(xpProgress(c, 3)).toMatchObject({ xp: 2700, next: 2700, fraction: 1, pending: 1 });
    expect(xpProgress(c, 4)).toMatchObject({ next: 6500, fraction: 0, pending: 0 });
    expect(xpProgress({ ...c, xp: 4600 }, 4).fraction).toBeCloseTo(0.5);
    expect(xpProgress({ ...c, levelling: "milestone" }, 3).pending).toBe(0);
    expect(xpProgress(c, 20).next).toBeNull();
  });
  it("no XP written yet counts as the least for the level", () => {
    const c = newCharacter("T");
    expect(xpProgress(c, 9).xp).toBe(48000);
    expect(addXp(c, 500, 9).xp).toBe(48500);
    expect(addXp({ ...c, xp: 100 }, 250, 1).xp).toBe(350);
    expect(addXp({ ...c, levelling: "milestone" }, 250, 1).xp).toBeUndefined();
  });
  it("splits an encounter's XP", () => {
    expect(xpEach(500, 4)).toBe(125);
    expect(xpEach(500, 3)).toBe(166);
    expect(xpEach(500, 0)).toBe(0);
  });
});

describe("themes", () => {
  it("every theme has a full light and dark palette", () => {
    for (const t of THEMES) {
      for (const p of [t.light, t.dark]) {
        const v = paletteVars(p);
        expect(Object.values(v).every((x) => /^#[0-9a-f]{6}$/i.test(x))).toBe(true);
      }
    }
    expect(themeById("nope").id).toBe("parchment");
  });
  it("defaults and modes", () => {
    expect(TEXT_FONTS.some((f) => f.id === DEFAULT_APPEARANCE.textFont)).toBe(true);
    expect(HEADING_FONTS.some((f) => f.id === DEFAULT_APPEARANCE.headingFont)).toBe(true);
    expect(isDark("auto", true)).toBe(true);
    expect(isDark("light", true)).toBe(false);
    expect(isDark("dark", false)).toBe(true);
  });
});
