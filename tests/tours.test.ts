import { describe, expect, it } from "vitest";
import { cardPosition, TOURS } from "../src/lib/tours.ts";

describe("tours", () => {
  it("every tour has steps with a title and text", () => {
    expect(TOURS.map((t) => t.id)).toEqual(["main", "character", "combat", "dm"]);
    for (const t of TOURS) for (const s of t.steps) expect(s.title && s.text).toBeTruthy();
  });
  it("puts the card below, beside, or in the middle, and on screen", () => {
    const view = { width: 1000, height: 800 };
    const card = { width: 300, height: 150 };
    expect(cardPosition(null, card, view)).toEqual({ top: 325, left: 350 });
    expect(cardPosition({ top: 10, left: 10, width: 100, height: 40 }, card, view)).toEqual({ top: 62, left: 10 });
    // Near the bottom: beside it instead.
    expect(cardPosition({ top: 700, left: 10, width: 100, height: 80 }, card, view)).toEqual({ top: 642, left: 122 });
    // Never off the right edge.
    expect(cardPosition({ top: 10, left: 950, width: 40, height: 20 }, card, view).left).toBe(692);
  });
});
