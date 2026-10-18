import { describe, expect, it } from "vitest";
import { isDiceExpr, roll, rollModeOf, withRollMode } from "../src/lib/dice.ts";

describe("advantage and disadvantage", () => {
  it("turns a d20 roll into two dice keeping one", () => {
    expect(withRollMode("1d20+5", "advantage")).toBe("2d20kh1+5");
    expect(withRollMode("1d20-1", "disadvantage")).toBe("2d20kl1-1");
    expect(withRollMode("d20", "advantage")).toBe("2d20kh1");
    expect(withRollMode("1d20+5", null)).toBe("1d20+5");
  });
  it("leaves other rolls alone", () => {
    expect(withRollMode("2d6+3", "advantage")).toBe("2d6+3");
    expect(withRollMode("1d200", "advantage")).toBe("1d200");
  });
  it("reads the mode from the keys held", () => {
    expect(rollModeOf({ shiftKey: true })).toBe("advantage");
    expect(rollModeOf({ ctrlKey: true })).toBe("disadvantage");
    expect(rollModeOf({})).toBeNull();
  });
});

/** An rng that returns the given values in turn (each in [0, 1)). */
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe("dice roller", () => {
  it("rolls NdM and adds modifiers", () => {
    // 0.99 -> 6 on a d6, 0 -> 1
    const r = roll("2d6+3", seq(0.99, 0));
    expect(r.total).toBe(10);
    expect(r.detail).toBe("[6, 1] +3");
  });

  it("handles subtraction and spaces", () => {
    expect(roll("1d20 - 1", seq(0.5)).total).toBe(10);
    expect(roll("2d8 + 1d6 - 1", seq(0, 0, 0)).total).toBe(2);
  });

  it("treats a bare d20 as 1d20", () => {
    expect(roll("d20", seq(0.999)).total).toBe(20);
  });

  it("stays within bounds", () => {
    for (let i = 0; i < 200; i++) {
      const t = roll("3d6").total;
      expect(t).toBeGreaterThanOrEqual(3);
      expect(t).toBeLessThanOrEqual(18);
    }
  });

  it("keeps the highest or lowest dice", () => {
    // 0.95 -> 20, 0.2 -> 5 on a d20
    const adv = roll("2d20kh1+3", seq(0.95, 0.2));
    expect(adv).toMatchObject({ total: 23, detail: "[20, (5)] +3" });
    const dis = roll("2d20kl1+3", seq(0.95, 0.2));
    expect(dis).toMatchObject({ total: 8, detail: "[(20), 5] +3" });
  });

  it("caps huge dice counts", () => {
    expect(roll("1000d1").total).toBe(100);
  });
});

describe("isDiceExpr", () => {
  it("accepts dice and rejects junk", () => {
    expect(["d20", "2d6+3", "4d6kh3", "1d8 + 2d6 - 1", "1d100"].every(isDiceExpr)).toBe(true);
    expect(["", "5", "hello", "2d", "d20++1", "2d6*3"].some(isDiceExpr)).toBe(false);
  });
});