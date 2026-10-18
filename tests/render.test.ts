import { describe, expect, it } from "vitest";
import { entryUrl, renderCard, renderEntries, renderText, resolveCopy, speedText } from "../src/lib/render.ts";
import type { Entry } from "../src/lib/types.ts";

describe("inline tags", () => {
  it("renders dice as clickable rolls", () => {
    expect(renderText("Takes {@damage 2d6} fire")).toBe('Takes <span class="roll" data-roll="2d6">2d6</span> fire');
    expect(renderText("{@hit 5}")).toContain('data-roll="1d20+5">+5<');
    expect(renderText("{@hit -1}")).toContain('data-roll="1d20-1">-1<');
    expect(renderText("{@dice 1d4}")).toContain('data-roll="1d4"');
  });

  it("renders attack wording", () => {
    expect(renderText("{@atk mw} {@hit 4} to hit. {@h}5 damage")).toMatch(/^<i>Melee Weapon Attack:<\/i>.*<i>Hit:<\/i> 5 damage$/);
    expect(renderText("{@dc 15}")).toBe("DC 15");
    expect(renderText("Bite {@recharge 5}")).toBe("Bite (Recharge 5–6)");
    expect(renderText("{@recharge}")).toBe("(Recharge 6)");
    expect(renderText("{@actSave dex}")).toBe("<i>Dexterity Saving Throw:</i>");
  });

  it("renders link tags with default sources", () => {
    const html = renderText("{@spell fireball}");
    expect(html).toContain('data-5e="spell"');
    expect(html).toContain('data-source="PHB"');
    expect(renderText("{@creature goblin}")).toContain('data-source="MM"');
    expect(renderText("{@item rope|phb|a rope}")).toContain(">a rope</span>");
  });

  it("handles nested tags", () => {
    expect(renderText("{@b Bold {@i and italic}} text")).toBe("<b>Bold <i>and italic</i></b> text");
    expect(renderText("{@i see {@spell shield|XPHB}}")).toContain('<i>see <span class="lk lk-spell"');
  });

  it("shows the display text of unknown tags", () => {
    expect(renderText("{@skill Perception} and {@sense darkvision}")).toBe("Perception and darkvision");
    expect(renderText("{@book Chapter 9|DMG|9}")).toBe("Chapter 9");
    expect(renderText("{@unknownThing shown|X}")).toBe("shown");
  });

  it("keeps nested tags intact when splitting on |", () => {
    const html = renderText("{@note Inflicted by the {@spell contagion|PHB} spell.}");
    expect(html).toContain('data-name="contagion" data-source="PHB"');
    expect(html).not.toContain("{@");
  });

  it("escapes HTML", () => {
    expect(renderText("<script>")).toBe("&lt;script&gt;");
  });
});

describe("entries", () => {
  it("renders named entries, lists, tables and items", () => {
    const html = renderEntries([
      { type: "entries", name: "Section", entries: ["Body text."] },
      { type: "list", items: ["one", { type: "item", name: "Two.", entry: "second" }] },
      { type: "table", colLabels: ["d6", "Result"], rows: [["1", "Nothing"], [{ roll: { min: 2, max: 6 } }, "Thing"]] },
      { type: "inset", name: "Box", entries: ["Sidebar"] },
    ]);
    expect(html).toContain("<p><b><i>Section.</i></b> Body text.</p>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<b><i>Two.</i></b> second");
    expect(html).toContain("<th>d6</th>");
    expect(html).toContain("<td>2–6</td>");
    expect(html).toContain('class="inset"');
  });
});

describe("_copy", () => {
  const base = {
    name: "Goblin", source: "MM", hp: { average: 7, formula: "2d6" }, str: 8,
    trait: [{ name: "Nimble Escape", entries: ["The goblin can Disengage."] }],
    action: [{ name: "Scimitar", entries: ["Hit"] }, { name: "Shortbow", entries: ["Hit"] }],
  };
  const lookup = (name: string, source: string) =>
    name.toLowerCase() === "goblin" && source === "MM" ? base : undefined;

  it("merges the override over its base", () => {
    const r = resolveCopy({ name: "Goblin Boss", source: "X", str: 10, _copy: { name: "Goblin", source: "MM" } }, lookup);
    expect(r).toMatchObject({ name: "Goblin Boss", source: "X", str: 10, hp: { average: 7 } });
    expect(r._copy).toBeUndefined();
  });

  it("applies _mod edits", () => {
    const r = resolveCopy(
      {
        name: "Goblin Archer", source: "X",
        _copy: {
          name: "Goblin", source: "MM",
          _mod: {
            "*": { mode: "replaceTxt", replace: "the goblin", with: "the {=name/l}", flags: "i" },
            action: [
              { mode: "removeArr", names: "Scimitar" },
              { mode: "appendArr", items: { name: "Volley", entries: ["Many arrows"] } },
            ],
          },
        },
      },
      lookup,
    );
    expect(r.action.map((a: any) => a.name)).toEqual(["Shortbow", "Volley"]);
    expect(r.trait[0].entries[0]).toBe("the goblin archer can Disengage.");
    expect(r.trait[0].name).toBe("Nimble Escape");
  });

  it("follows chains and leaves unresolvable copies alone", () => {
    const chainLookup = (name: string) =>
      name === "Goblin" ? base : name === "Mid" ? { name: "Mid", source: "X", str: 12, _copy: { name: "Goblin", source: "MM" } } : undefined;
    expect(resolveCopy({ name: "Top", source: "X", _copy: { name: "Mid", source: "X" } }, chainLookup)).toMatchObject({
      name: "Top", str: 12, hp: { average: 7 },
    });
    const orphan = { name: "Lost", source: "X", _copy: { name: "Nope", source: "MM" } };
    expect(resolveCopy(orphan, lookup)).toBe(orphan);
  });

  it("renders a copied creature fully", () => {
    const entry: Entry = { kind: "creature", name: "Goblin Boss", source: "X", raw: { name: "Goblin Boss", source: "X", _copy: { name: "Goblin", source: "MM" } } };
    const html = renderCard(entry, lookup);
    expect(html).toContain("Nimble Escape");
    expect(html).toContain('data-roll="2d6"');
  });
});

describe("cards", () => {
  it("renders a spell header", () => {
    const spell: Entry = {
      kind: "spell", name: "Fireball", source: "PHB", page: 241,
      raw: {
        name: "Fireball", source: "PHB", level: 3, school: "V",
        time: [{ number: 1, unit: "action" }],
        range: { type: "point", distance: { type: "feet", amount: 150 } },
        components: { v: true, s: true, m: "bat guano" },
        duration: [{ type: "instant" }],
        entries: ["Boom {@damage 8d6}."],
      },
    };
    const html = renderCard(spell);
    expect(html).toContain("Level 3 Evocation");
    expect(html).toContain("PHB p241");
    expect(html).toContain("150 feet");
    expect(html).toContain("V, S, M (bat guano)");
    expect(html).toContain("Instantaneous");
    expect(html).toContain('data-roll="8d6"');
  });

  it("renders a creature header with ability modifiers", () => {
    const html = renderCard({
      kind: "creature", name: "Owlbear", source: "MM",
      raw: {
        size: ["L"], type: "monstrosity", cr: "3", ac: [{ ac: 13, from: ["natural armor"] }],
        hp: { average: 59, formula: "7d10 + 21" }, speed: { walk: 40 },
        str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7,
        action: [{ name: "Beak", entries: ["{@atk mw} {@hit 7} to hit"] }],
        legendary: [{ name: "Swipe", entries: ["Claws."] }],
      },
    });
    expect(html).toContain("Large monstrosity · CR 3");
    expect(html).toContain("13 (natural armor)");
    expect(html).toContain('data-roll="7d10 + 21"');
    expect(html).toContain('data-roll="1d20+5">+5<');
    expect(html).toContain('data-roll="1d20-4">-4<');
    expect(html).toContain("<h4>Actions</h4>");
    expect(html).toContain("<h4>Legendary actions</h4>");
  });

  it("renders tags in action names and speeds in every format", () => {
    const html = renderCard({
      kind: "creature", name: "Dragon", source: "MM",
      raw: {
        speed: { walk: 40, fly: { number: 80, condition: "(hover)" }, alternate: { climb: [{ number: 30 }] } },
        action: [{ name: "Fire Breath {@recharge 5}", entries: ["Whoosh."] }],
      },
    });
    expect(html).toContain("Fire Breath (Recharge 5–6).");
    expect(html).toContain("40 ft., fly 80 ft. (hover)");
    expect(html).not.toContain("undefined");
    expect(speedText({ walk: 20, choose: { from: ["fly", "swim"], amount: 20 } })).toBe("20 ft., fly or swim 20 ft.");
  });

  it("renders table cells given as objects", () => {
    const html = renderEntries({ type: "table", rows: [[{ type: "cell", roll: { exact: 1 } }, { type: "cell", entry: "{@b Bold}" }]] });
    expect(html).toContain("<td>1</td><td><b>Bold</b></td>");
  });

  it("renders item type, rarity and attunement", () => {
    const html = renderCard({
      kind: "item", name: "Cloak", source: "DMG",
      raw: { wondrous: true, rarity: "rare", reqAttune: true, entries: ["Swish."] },
    });
    expect(html).toContain("Wondrous item, rare, requires attunement");
  });
});

describe("entry URLs", () => {
  it("builds 5e.tools page links", () => {
    expect(entryUrl("https://example.org/", "spell", "Hold Person", "XPHB")).toBe("https://example.org/spells.html#hold%20person_xphb");
    expect(entryUrl("https://example.org", "creature", "Owlbear", "MM")).toBe("https://example.org/bestiary.html#owlbear_mm");
  });
  it("needs a URL", () => {
    expect(entryUrl("", "spell", "Fireball", "PHB")).toBe("");
  });
});
