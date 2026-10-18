// Backups and sharing: zip a whole campaign folder, export one character as
// JSON, and import a character file into a campaign. The user picks where
// files go (save/open dialogs), which also lets the app write there.

import { open, save } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, exists, isTauri, mkdir, readDir, readFile, readTextFile, remove, stat, writeFile, writeFileIn } from "./fsapi.ts";
import { NOTES_ROOT } from "./store.ts";
import { saveCharacter, upgradeCharacter } from "./character/storage.ts";
import type { Character } from "./character/types.ts";
import { makeZip, readZip, type ZipFile } from "./zip.ts";

const DOCS = { baseDir: BaseDirectory.Document };
const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`;
};

/** Every file in a campaign folder, except the trash. */
async function campaignFiles(campaign: string, sub = ""): Promise<ZipFile[]> {
  const base = `${NOTES_ROOT}/${campaign}${sub ? `/${sub}` : ""}`;
  const out: ZipFile[] = [];
  for (const e of await readDir(base, DOCS)) {
    const rel = sub ? `${sub}/${e.name}` : e.name;
    if (e.isDirectory) {
      if (e.name !== ".trash") out.push(...(await campaignFiles(campaign, rel)));
    } else if (e.isFile) {
      let modified: Date | undefined;
      try {
        modified = (await stat(`${base}/${e.name}`, DOCS)).mtime ?? undefined;
      } catch {
        /* keep now */
      }
      out.push({ path: `${campaign}/${rel}`, data: await readFile(`${base}/${e.name}`, DOCS), modified });
    }
  }
  return out;
}

/** Ask where to save, then write the file. Returns the path, or null if cancelled. */
async function saveAs(defaultName: string, filter: { name: string; extensions: string[] }, data: Uint8Array): Promise<string | null> {
  const path = isTauri ? await save({ defaultPath: defaultName, filters: [filter] }) : defaultName;
  if (!path) return null;
  await writeFile(path, data);
  return path;
}

/** Zip the campaign (notes, characters, settings). Returns where it was saved, or null. */
export async function backupCampaign(campaign: string): Promise<{ path: string; files: number } | null> {
  const files = await campaignFiles(campaign);
  const path = await saveAs(`${campaign} backup ${stamp()}.zip`, { name: "Zip archive", extensions: ["zip"] }, makeZip(files));
  return path ? { path, files: files.length } : null;
}

export async function exportCharacter(ch: Character): Promise<string | null> {
  const name = (ch.name || "Character").replace(/[\\/:*?"<>|]/g, "-");
  return saveAs(`${name}.json`, { name: "Lorewright character", extensions: ["json"] }, new TextEncoder().encode(JSON.stringify(ch, null, 2)));
}

/** True when the JSON looks like a character file. */
export function isCharacterJson(raw: any): boolean {
  return !!raw && typeof raw === "object" && typeof raw.name === "string" && Array.isArray(raw.classes) && typeof raw.baseAbilities === "object";
}

/** Pick a character JSON file and add it to the campaign (as a new file; nothing is overwritten). */
export async function importCharacter(campaign: string): Promise<{ file: string; name: string } | null> {
  if (!isTauri) return null;
  const picked = await open({ multiple: false, filters: [{ name: "Lorewright character", extensions: ["json"] }] });
  if (!picked || Array.isArray(picked)) return null;
  const raw = JSON.parse(await readTextFile(picked));
  if (!isCharacterJson(raw)) throw new Error("That file isn't a Lorewright character.");
  // A fresh id, so an imported copy never clashes with the original.
  const ch = { ...upgradeCharacter(raw), id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` };
  const file = await saveCharacter(campaign, ch);
  return { file, name: ch.name };
}

// ---------- automatic backups ----------
// Kept in Documents\Lorewright\.backups, outside the campaign's own folder,
// so a campaign deleted or broken by mistake can still be brought back.

const APP = DOCS;
const backupDir = (campaign: string) => `${NOTES_ROOT}/.backups/${campaign}`;

export interface AutoBackupSettings {
  on: boolean;
  /** Make a new one when the newest is this many days old. */
  days: number;
  /** How many to keep per campaign. */
  keep: number;
}
export const DEFAULT_AUTO_BACKUP: AutoBackupSettings = { on: true, days: 3, keep: 5 };

export interface BackupInfo {
  name: string;
  /** When it was made, from its name. */
  at: Date;
}

/** "Name 2026-10-17 1830.zip" → that date. */
export function backupDate(name: string): Date | null {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(?:\D|$)/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) : null;
}

/** Which backups to delete so only the newest `keep` stay. */
export function backupsToPrune(list: BackupInfo[], keep: number): BackupInfo[] {
  return [...list].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(Math.max(1, keep));
}

/** Is a new backup due? */
export function backupDue(list: BackupInfo[], days: number, now = new Date()): boolean {
  const newest = Math.max(0, ...list.map((b) => b.at.getTime()));
  return now.getTime() - newest >= days * 86400000;
}

export async function listBackups(campaign: string): Promise<BackupInfo[]> {
  try {
    if (!(await exists(backupDir(campaign), APP))) return [];
    const out: BackupInfo[] = [];
    for (const e of await readDir(backupDir(campaign), APP)) {
      const at = e.isFile && e.name.endsWith(".zip") ? backupDate(e.name) : null;
      if (at) out.push({ name: e.name, at });
    }
    return out.sort((a, b) => b.at.getTime() - a.at.getTime());
  } catch {
    return [];
  }
}

/** Back the campaign up now, then delete the oldest beyond `keep`. */
export async function backupNow(campaign: string, keep = DEFAULT_AUTO_BACKUP.keep, note = ""): Promise<BackupInfo> {
  const files = await campaignFiles(campaign);
  if (!(await exists(backupDir(campaign), APP))) await mkdir(backupDir(campaign), { ...APP, recursive: true });
  let name = `${campaign} ${stamp()}${note ? ` ${note}` : ""}.zip`;
  for (let n = 2; await exists(`${backupDir(campaign)}/${name}`, APP); n++) name = `${campaign} ${stamp()}${note ? ` ${note}` : ""} (${n}).zip`;
  await writeFileIn(`${backupDir(campaign)}/${name}`, makeZip(files), APP);
  for (const old of backupsToPrune(await listBackups(campaign), keep)) await remove(`${backupDir(campaign)}/${old.name}`, APP).catch(() => {});
  return { name, at: new Date() };
}

/** On opening a campaign: back it up if the last backup is old enough. Returns the new backup, if one was made. */
export async function autoBackup(campaign: string, s: AutoBackupSettings = DEFAULT_AUTO_BACKUP): Promise<BackupInfo | null> {
  if (!s.on || !isTauri) return null;
  const list = await listBackups(campaign);
  if (!backupDue(list, s.days)) return null;
  return backupNow(campaign, s.keep);
}

/**
 * Put a backup's files back into the campaign folder (files made since are
 * kept). The campaign as it is now is backed up first, so this can be undone.
 */
export async function restoreBackup(campaign: string, name: string, keep = DEFAULT_AUTO_BACKUP.keep): Promise<number> {
  const zip = readZip(await readFile(`${backupDir(campaign)}/${name}`, APP));
  await backupNow(campaign, keep + 1, "before restore");
  let n = 0;
  for (const f of zip) {
    // Paths start with the campaign's name as it was when backed up.
    const rel = f.path.split("/").slice(1).join("/");
    if (!rel || rel.split("/").includes("..")) continue;
    const dir = rel.split("/").slice(0, -1).join("/");
    if (dir && !(await exists(`${NOTES_ROOT}/${campaign}/${dir}`, DOCS))) await mkdir(`${NOTES_ROOT}/${campaign}/${dir}`, { ...DOCS, recursive: true });
    await writeFileIn(`${NOTES_ROOT}/${campaign}/${rel}`, f.data, DOCS);
    n++;
  }
  return n;
}
