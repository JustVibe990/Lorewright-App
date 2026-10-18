// File storage. Notes live in Documents\Lorewright\<Campaign>\*.md so you own
// them; settings and the 5e.tools cache live in the app's data folder.

import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  stat,
  writeTextFile,
} from "./fsapi.ts";
import type { CampaignConfig, NoteMeta, Settings } from "./types.ts";

const APP = { baseDir: BaseDirectory.AppData };
const DOCS = { baseDir: BaseDirectory.Document };
export const NOTES_ROOT = "Lorewright";
/** Where notes lived before the app was renamed from Marginalia. */
export const OLD_NOTES_ROOT = "Marginalia";

async function ensureDir(path: string, opts: { baseDir: BaseDirectory }) {
  if (!(await exists(path, opts))) await mkdir(path, { ...opts, recursive: true });
}

async function readJson<T>(path: string, opts: { baseDir: BaseDirectory }, fallback: T): Promise<T> {
  try {
    if (!(await exists(path, opts))) return fallback;
    return { ...fallback, ...JSON.parse(await readTextFile(path, opts)) };
  } catch {
    return fallback;
  }
}

// ---------- settings + cache (AppData) ----------

export const DEFAULT_SETTINGS: Settings = { baseUrl: "", sources: {} };

export async function loadSettings(): Promise<Settings> {
  return readJson("settings.json", APP, DEFAULT_SETTINGS);
}
export async function saveSettings(s: Settings) {
  await ensureDir("", APP);
  await writeTextFile("settings.json", JSON.stringify(s, null, 2), APP);
}

export async function writeCache(name: string, text: string) {
  await ensureDir("cache", APP);
  await writeTextFile(`cache/${name}`, text, APP);
}
export async function readCache(name: string): Promise<string | null> {
  try {
    if (!(await exists(`cache/${name}`, APP))) return null;
    return await readTextFile(`cache/${name}`, APP);
  } catch {
    return null;
  }
}
export async function listCache(): Promise<string[]> {
  if (!(await exists("cache", APP))) return [];
  return (await readDir("cache", APP)).filter((i) => i.isFile).map((i) => i.name);
}
export async function removeCacheFile(name: string) {
  if (await exists(`cache/${name}`, APP)) await remove(`cache/${name}`, APP);
}
export async function clearCache() {
  if (await exists("cache", APP)) await remove("cache", { ...APP, recursive: true });
}

// ---------- campaigns + notes (Documents\Lorewright) ----------

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").trim() || "Untitled";

let migrated = false;

/**
 * The app used to be called Marginalia and kept notes in Documents\Marginalia.
 * On first start after the rename, move that folder to Documents\Lorewright,
 * but only if there's no Lorewright folder yet (never merge or overwrite).
 * Returns what happened, for the log and tests.
 */
export async function migrateNotesFolder(): Promise<"moved" | "none" | "kept-both" | "failed"> {
  try {
    const hasOld = await exists(OLD_NOTES_ROOT, DOCS);
    if (!hasOld) return "none";
    if (await exists(NOTES_ROOT, DOCS)) return "kept-both";
    await rename(OLD_NOTES_ROOT, NOTES_ROOT, { oldPathBaseDir: BaseDirectory.Document, newPathBaseDir: BaseDirectory.Document });
    return "moved";
  } catch {
    // Leave everything where it is; the app starts with an empty Lorewright folder.
    return "failed";
  }
}

export async function listCampaigns(): Promise<string[]> {
  if (!migrated) {
    migrated = true;
    await migrateNotesFolder();
  }
  await ensureDir(NOTES_ROOT, DOCS);
  const items = await readDir(NOTES_ROOT, DOCS);
  // Folders starting with a dot (.backups) aren't campaigns.
  return items.filter((i) => i.isDirectory && !i.name.startsWith(".")).map((i) => i.name).sort();
}

export async function createCampaign(name: string): Promise<string> {
  const n = safe(name);
  await ensureDir(`${NOTES_ROOT}/${n}`, DOCS);
  return n;
}

export const DEFAULT_CAMPAIGN: CampaignConfig = { allowedSources: [], choices: {} };

export async function loadCampaignConfig(c: string): Promise<CampaignConfig> {
  return readJson(`${NOTES_ROOT}/${c}/.marginalia.json`, DOCS, DEFAULT_CAMPAIGN);
}
export async function saveCampaignConfig(c: string, cfg: CampaignConfig) {
  await writeTextFile(`${NOTES_ROOT}/${c}/.marginalia.json`, JSON.stringify(cfg, null, 2), DOCS);
}

export async function listNotes(c: string): Promise<NoteMeta[]> {
  const items = await readDir(`${NOTES_ROOT}/${c}`, DOCS);
  const notes: NoteMeta[] = [];
  for (const i of items) {
    if (!i.isFile || !i.name.toLowerCase().endsWith(".md")) continue;
    let modified = 0;
    try {
      modified = (await stat(`${NOTES_ROOT}/${c}/${i.name}`, DOCS)).mtime?.getTime() ?? 0;
    } catch {
      /* ignore */
    }
    notes.push({ file: i.name, title: i.name.replace(/\.md$/i, ""), modified });
  }
  return notes.sort((a, b) => b.modified - a.modified);
}

export async function readNote(c: string, file: string): Promise<string> {
  return readTextFile(`${NOTES_ROOT}/${c}/${file}`, DOCS);
}
export async function writeNote(c: string, file: string, text: string) {
  await writeTextFile(`${NOTES_ROOT}/${c}/${file}`, text, DOCS);
}

/** Create a note with a unique file name and return that name. */
export async function createNote(c: string, title: string): Promise<string> {
  const base = safe(title);
  let file = `${base}.md`;
  for (let n = 2; await exists(`${NOTES_ROOT}/${c}/${file}`, DOCS); n++) file = `${base} ${n}.md`;
  await writeTextFile(`${NOTES_ROOT}/${c}/${file}`, "", DOCS);
  return file;
}

/**
 * Move a file inside a campaign to the campaign's ".trash" folder (the same
 * convention Obsidian uses), so a deletion can be undone by moving it back.
 * `path` is relative to the campaign folder, e.g. "Session 1.md" or "Characters/Kara.json".
 * Returns the name it got in the trash.
 */
export async function moveToTrash(c: string, path: string): Promise<string> {
  const trash = `${NOTES_ROOT}/${c}/.trash`;
  if (!(await exists(trash, DOCS))) await mkdir(trash, { ...DOCS, recursive: true });
  const name = path.split("/").pop()!;
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let target = name;
  for (let n = 2; await exists(`${trash}/${target}`, DOCS); n++) target = `${stem} (${n})${ext}`;
  await rename(`${NOTES_ROOT}/${c}/${path}`, `${trash}/${target}`, {
    oldPathBaseDir: BaseDirectory.Document,
    newPathBaseDir: BaseDirectory.Document,
  });
  return target;
}

export async function deleteNote(c: string, file: string): Promise<string> {
  return moveToTrash(c, file);
}

export async function renameNote(c: string, file: string, title: string): Promise<string> {
  const target = `${safe(title)}.md`;
  if (target === file) return file;
  if (await exists(`${NOTES_ROOT}/${c}/${target}`, DOCS)) throw new Error("A note with that name already exists.");
  await rename(`${NOTES_ROOT}/${c}/${file}`, `${NOTES_ROOT}/${c}/${target}`, {
    oldPathBaseDir: BaseDirectory.Document,
    newPathBaseDir: BaseDirectory.Document,
  });
  return target;
}
