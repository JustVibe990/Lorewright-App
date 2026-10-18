// Homebrew for the whole app: spells, creatures and items, and saving them
// (which rebuilds the data so they show up everywhere).

import { createContext, useContext } from "react";
import type { HomebrewSpell } from "../lib/homebrew.ts";
import type { HomebrewCreature, HomebrewItem } from "../lib/homebrew-more.ts";

export interface Homebrew {
  spells: HomebrewSpell[];
  creatures: HomebrewCreature[];
  items: HomebrewItem[];
  saveSpells: (list: HomebrewSpell[]) => Promise<void>;
  saveCreatures: (list: HomebrewCreature[]) => Promise<void>;
  saveItems: (list: HomebrewItem[]) => Promise<void>;
}

export const HomebrewContext = createContext<Homebrew>({
  spells: [],
  creatures: [],
  items: [],
  saveSpells: async () => {},
  saveCreatures: async () => {},
  saveItems: async () => {},
});
export const useHomebrew = () => useContext(HomebrewContext);
