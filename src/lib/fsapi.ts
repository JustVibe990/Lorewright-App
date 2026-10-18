// The file-system calls the app uses. Inside Tauri these are the real
// plugin-fs functions. In a plain browser (`npm run dev` without Tauri) a
// small localStorage-backed stand-in is used instead, so the UI can be
// developed and tested in any browser. Nothing here changes Tauri behaviour.

import * as tauriFs from "@tauri-apps/plugin-fs";
import { BaseDirectory } from "@tauri-apps/plugin-fs";

export { BaseDirectory };

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Opts = { baseDir?: BaseDirectory; recursive?: boolean };

interface Shim {
  files: Record<string, { text: string; mtime: number }>;
  dirs: string[];
}

const KEY = "marginalia-dev-fs";
const load = (): Shim => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "") as Shim;
  } catch {
    return { files: {}, dirs: [] };
  }
};
const save = (s: Shim) => localStorage.setItem(KEY, JSON.stringify(s));
const full = (path: string, o?: Opts) => `${o?.baseDir ?? 0}:${path.replace(/\\/g, "/").replace(/\/+$/, "")}`;

const shim = {
  async exists(path: string, o?: Opts) {
    const s = load();
    const k = full(path, o);
    return k.endsWith(":") || k in s.files || s.dirs.includes(k);
  },
  async mkdir(path: string, o?: Opts) {
    const s = load();
    const k = full(path, o);
    const [base, rel] = [k.slice(0, k.indexOf(":") + 1), k.slice(k.indexOf(":") + 1)];
    let acc = "";
    for (const part of rel.split("/").filter(Boolean)) {
      acc = acc ? `${acc}/${part}` : part;
      if (!s.dirs.includes(base + acc)) s.dirs.push(base + acc);
    }
    save(s);
  },
  async readTextFile(path: string, o?: Opts) {
    const f = load().files[full(path, o)];
    if (!f) throw new Error(`No such file: ${path}`);
    return f.text;
  },
  async writeTextFile(path: string, text: string, o?: Opts) {
    const s = load();
    s.files[full(path, o)] = { text, mtime: Date.now() };
    save(s);
  },
  async readDir(path: string, o?: Opts) {
    const s = load();
    const k = full(path, o);
    const prefix = k.endsWith(":") ? k : k + "/";
    const names = new Map<string, boolean>();
    for (const d of s.dirs) if (d.startsWith(prefix) && !d.slice(prefix.length).includes("/")) names.set(d.slice(prefix.length), true);
    for (const f of Object.keys(s.files)) if (f.startsWith(prefix) && !f.slice(prefix.length).includes("/")) names.set(f.slice(prefix.length), false);
    return [...names].map(([name, isDirectory]) => ({ name, isDirectory, isFile: !isDirectory, isSymlink: false }));
  },
  async remove(path: string, o?: Opts) {
    const s = load();
    const k = full(path, o);
    delete s.files[k];
    for (const f of Object.keys(s.files)) if (f.startsWith(k + "/")) delete s.files[f];
    s.dirs = s.dirs.filter((d) => d !== k && !d.startsWith(k + "/"));
    save(s);
  },
  async rename(from: string, to: string, o?: { oldPathBaseDir?: BaseDirectory; newPathBaseDir?: BaseDirectory }) {
    const s = load();
    const a = full(from, { baseDir: o?.oldPathBaseDir });
    const b = full(to, { baseDir: o?.newPathBaseDir });
    if (!s.files[a]) throw new Error(`No such file: ${from}`);
    s.files[b] = { ...s.files[a], mtime: Date.now() };
    delete s.files[a];
    save(s);
  },
  async stat(path: string, o?: Opts) {
    const f = load().files[full(path, o)];
    return { mtime: f ? new Date(f.mtime) : null } as { mtime: Date | null };
  },
};

export const exists: typeof shim.exists = isTauri ? (p, o) => tauriFs.exists(p, o) : shim.exists;
export const mkdir: typeof shim.mkdir = isTauri ? (p, o) => tauriFs.mkdir(p, o) : shim.mkdir;
export const readTextFile: typeof shim.readTextFile = isTauri ? (p, o) => tauriFs.readTextFile(p, o) : shim.readTextFile;
export const writeTextFile: typeof shim.writeTextFile = isTauri ? (p, t, o) => tauriFs.writeTextFile(p, t, o) : shim.writeTextFile;
export const readDir: typeof shim.readDir = isTauri ? (p, o) => tauriFs.readDir(p, o) : shim.readDir;
export const remove: typeof shim.remove = isTauri ? (p, o) => tauriFs.remove(p, o) : shim.remove;
export const rename: typeof shim.rename = isTauri ? (a, b, o) => tauriFs.rename(a, b, o) : shim.rename;
/** Binary read/write (backups). In the browser stand-in, files are text, so this encodes. */
export const readFile = isTauri
  ? (p: string, o?: Opts) => tauriFs.readFile(p, o)
  : async (p: string, o?: Opts) => new TextEncoder().encode(await shim.readTextFile(p, o));
export const writeFile = isTauri
  ? (p: string, data: Uint8Array) => tauriFs.writeFile(p, data)
  : async (p: string, data: Uint8Array) => {
      // No file system in a plain browser: download it instead.
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data as BlobPart]));
      a.download = p.split(/[\\/]/).pop() ?? "download";
      a.click();
    };
/** Binary write inside a base folder (automatic backups in AppData). */
export const writeFileIn = isTauri
  ? (p: string, data: Uint8Array, o: Opts) => tauriFs.writeFile(p, data, o)
  : async (p: string, data: Uint8Array, o: Opts) => shim.writeTextFile(p, new TextDecoder().decode(data), o);
export const stat = isTauri
  ? async (p: string, o?: Opts) => ({ mtime: (await tauriFs.stat(p, o)).mtime })
  : shim.stat;
