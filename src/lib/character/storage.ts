// Characters on disk: Documents\Lorewright\<Campaign>\Characters\<Name>.json

import { BaseDirectory, exists, mkdir, readDir, readTextFile, writeTextFile } from "../fsapi.ts";
import { moveToTrash, NOTES_ROOT } from "../store.ts";
import type { Character } from "./types.ts";

const DOCS = { baseDir: BaseDirectory.Document };
const dir = (campaign: string) => `${NOTES_ROOT}/${campaign}/Characters`;
const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").trim() || "Character";

export function newCharacter(name = "New character"): Character {
  return {
    version: 1,
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name,
    abilityMethod: "pointbuy",
    baseAbilities: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
    classes: [],
    choices: {},
    hpRolls: {},
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    spells: {},
    effects: [],
    state: {
      hp: 0,
      tempHp: 0,
      slotsUsed: [],
      pactUsed: 0,
      resourcesUsed: {},
      hitDiceUsed: {},
      deathSaves: { successes: 0, failures: 0 },
      conditions: [],
      inspiration: false,
      exhaustion: 0,
    },
    notes: {},
  };
}

/** Fill in fields added in later versions so old files keep loading. */
export function upgradeCharacter(raw: any): Character {
  const base = newCharacter(raw?.name);
  return {
    ...base,
    ...raw,
    state: { ...base.state, ...(raw?.state ?? {}), deathSaves: { ...base.state.deathSaves, ...(raw?.state?.deathSaves ?? {}) } },
    currency: { ...base.currency, ...(raw?.currency ?? {}) },
    notes: { ...(raw?.notes ?? {}) },
  };
}

export interface CharacterFile {
  file: string;
  character: Character;
}

export async function listCharacters(campaign: string): Promise<CharacterFile[]> {
  if (!(await exists(dir(campaign), DOCS))) return [];
  const out: CharacterFile[] = [];
  for (const e of await readDir(dir(campaign), DOCS)) {
    if (!e.isFile || !e.name.toLowerCase().endsWith(".json")) continue;
    try {
      out.push({ file: e.name, character: upgradeCharacter(JSON.parse(await readTextFile(`${dir(campaign)}/${e.name}`, DOCS))) });
    } catch {
      /* unreadable file: skip */
    }
  }
  return out.sort((a, b) => a.character.name.localeCompare(b.character.name));
}

/** Save a character; returns its file name (named after the character, unique within the folder). */
export async function saveCharacter(campaign: string, ch: Character, file?: string): Promise<string> {
  if (!(await exists(dir(campaign), DOCS))) await mkdir(dir(campaign), { ...DOCS, recursive: true });
  let name = file;
  if (!name) {
    const base = safe(ch.name);
    name = `${base}.json`;
    for (let n = 2; await exists(`${dir(campaign)}/${name}`, DOCS); n++) name = `${base} ${n}.json`;
  }
  await writeTextFile(`${dir(campaign)}/${name}`, JSON.stringify(ch, null, 2), DOCS);
  return name;
}

/** Move a character file to the campaign's .trash folder (recoverable). */
export async function deleteCharacter(campaign: string, file: string): Promise<string> {
  return moveToTrash(campaign, `Characters/${file}`);
}
