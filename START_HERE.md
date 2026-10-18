# Lorewright: status

v1 is built. See `README.md` for setup, running, building and usage.

## What's here

| Area | Files |
|---|---|
| Data: import, cache, search, cards, dice | `src/lib/` (`fivetools.ts`, `extract.ts`, `search.ts`, `render.ts`, `dice.ts`, `data.ts`, `tags.ts`, `notesearch.ts`) |
| Built-in SRD 5.1 starter set | `src/data/srd.json` |
| Files on disk (with a browser fallback for UI work) | `src/lib/store.ts`, `src/lib/fsapi.ts` |
| Editor: `fiveLink` mark, Markdown round trip, linking, missing links | `src/editor/` |
| UI | `src/App.tsx`, `src/components/` |
| Tests (Vitest) | `tests/` |
| Mock 5e.tools server for testing imports | `scripts/mock-5etools.mjs` |
| Character sheets: rules, engine, storage | `src/lib/character/` (design: `docs/character-sheets.md`) |
| Character sheet UI | `src/components/character/` |

## Next (planned, not built)

- `{@pc Name}` links from notes to character sheets (hover shows a summary).
- Forgotten Realms wiki links for places and lore.
- Out of scope for v1: wiki `[[links]]`, initiative tracker, encounter builder, session recaps,
  player-safe export, alias memory, Fight Club XML import.
