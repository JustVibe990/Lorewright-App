import { describe, expect, it } from "vitest";
import { gainTemp, heal, takeDamage } from "../src/lib/character/hp.ts";

describe("hit points", () => {
  it("takes damage from temp HP first (75 + 13 temp, 14 damage -> 74)", () => {
    const withTemp = gainTemp({ hp: 75, tempHp: 0 }, 13);
    expect(withTemp).toEqual({ hp: 75, tempHp: 13 });
    expect(takeDamage(withTemp, 75, 14)).toEqual({ hp: 74, tempHp: 0 });
  });

  it("leaves real HP alone when temp HP covers the hit", () => {
    expect(takeDamage({ hp: 75, tempHp: 13 }, 75, 10)).toEqual({ hp: 75, tempHp: 3 });
  });

  it("never goes below 0", () => {
    expect(takeDamage({ hp: 5, tempHp: 2 }, 75, 40)).toEqual({ hp: 0, tempHp: 0 });
  });

  it("heals real HP only, up to the maximum", () => {
    expect(heal({ hp: 60, tempHp: 4 }, 75, 30)).toEqual({ hp: 75, tempHp: 4 });
  });

  it("keeps the higher temp HP instead of adding", () => {
    expect(gainTemp({ hp: 75, tempHp: 8 }, 5)).toEqual({ hp: 75, tempHp: 8 });
    expect(gainTemp({ hp: 75, tempHp: 8 }, 13)).toEqual({ hp: 75, tempHp: 13 });
  });

  it("ignores junk amounts", () => {
    expect(takeDamage({ hp: 10, tempHp: 0 }, 10, -5)).toEqual({ hp: 10, tempHp: 0 });
    expect(heal({ hp: 3, tempHp: 0 }, 10, Number.NaN)).toEqual({ hp: 3, tempHp: 0 });
  });
});
