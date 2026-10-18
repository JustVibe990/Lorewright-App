// Import and sync 5e.tools data from the user's chosen URL.
// Files are downloaded once, cached on disk, and loaded from the cache at
// startup, so the app works fully offline at the table.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  CATEGORIES,
  extractEntries,
  filesFromIndex,
  hashText,
  normalizeBaseUrl,
  RULES,
  rulesKind,
  type CategorySpec,
  type RulesSpec,
} from "./extract.ts";
import { isTauri } from "./fsapi.ts";
import { listCache, readCache, removeCacheFile, writeCache } from "./store.ts";
import type { Entry, Kind, Settings } from "./types.ts";

export interface ManifestFile {
  /** A linkable kind ("spell"…) or a rules file ("rules:class"…). */
  kind: Kind | string;
  path: string; // e.g. data/spells/spells-phb.json
  hash: string;
  count: number;
}
export interface Manifest {
  baseUrl: string;
  files: ManifestFile[];
  updated: string;
}

export const cacheName = (path: string) => path.replace(/^data\//, "").replace(/\//g, "__");

/** Use Tauri's HTTP client (no CORS limits); fall back to browser fetch in plain dev mode. */
async function getText(url: string): Promise<string> {
  const f = isTauri ? tauriFetch : window.fetch.bind(window);
  let res: Response;
  try {
    res = await f(url, { method: "GET" });
  } catch (e) {
    throw new Error(`Couldn't reach ${url} (${(e as Error)?.message ?? e})`);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText || "error"} for ${url}`);
  return res.text();
}

async function getJson(url: string): Promise<any> {
  const text = await getText(url);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} isn't JSON. Is this a 5e.tools site?`);
  }
}

export type ProbeResult = Partial<Record<Kind, string[]>>;

/** Check the URL serves 5e.tools data, and list the sources available for spells and monsters. */
export async function probe(baseUrl: string): Promise<ProbeResult> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error("Paste your 5e.tools URL first.");
  const indexed = CATEGORIES.filter((c) => c.index);
  const results = await Promise.all(indexed.map((spec) => getJson(`${base}/${spec.index}`)));
  const out: ProbeResult = {};
  indexed.forEach((spec, i) => {
    const idx = results[i];
    if (!idx || typeof idx !== "object" || Array.isArray(idx) || !Object.keys(idx).length) {
      throw new Error(`${spec.index} doesn't look like a 5e.tools index file.`);
    }
    out[spec.kind] = Object.keys(idx).sort();
  });
  return out;
}

export interface Progress {
  done: number;
  total: number;
  current: string;
}

async function filesFor(base: string, spec: CategorySpec, sources?: string[]) {
  if (spec.files) return spec.files.map((path) => ({ path }));
  return filesFromIndex(spec, await getJson(`${base}/${spec.index}`), sources);
}

export interface SyncReport {
  entries: number;
  files: number;
  changed: string[];
  added: string[];
  removed: string[];
  failed: string[];
}

const kindOn = (s: Settings, k: Kind) => !(s.disabledKinds ?? []).includes(k);
/** Fixed files (items, conditions, feats) hold every source; filter them on load. */
const fileFilter = (s: Settings, spec: CategorySpec) => (spec.files ? s.sources[spec.kind] : undefined);

/** Entry count for a rules file, for the manifest and reports. */
function countRules(rules: RulesSpec, json: any): number {
  if (rules.id === "spellsource") return Object.values<any>(json ?? {}).reduce((n, bySpell) => n + Object.keys(bySpell ?? {}).length, 0);
  const keys: Record<RulesSpec["id"], string[]> = {
    class: ["class", "subclass"],
    race: ["race", "subrace"],
    background: ["background"],
    optionalfeature: ["optionalfeature"],
    spellsource: [],
    magicvariant: ["magicvariant"],
  };
  return keys[rules.id].reduce((n, k) => n + (Array.isArray(json?.[k]) ? json[k].length : 0), 0);
}

/** Read every cached rules file of one kind (e.g. all class files). */
export async function loadCachedRules(): Promise<Partial<Record<RulesSpec["id"], any[]>>> {
  const m = await loadManifest();
  const out: Partial<Record<RulesSpec["id"], any[]>> = {};
  for (const f of m?.files ?? []) {
    if (!String(f.kind).startsWith("rules:")) continue;
    const id = String(f.kind).slice(6) as RulesSpec["id"];
    const text = await readCache(cacheName(f.path));
    if (!text) continue;
    try {
      (out[id] ??= []).push(JSON.parse(text));
    } catch {
      /* corrupt file: skipped until the next sync */
    }
  }
  return out;
}

/** Run `work` over `items` with a few downloads in flight at once. */
async function pool<T>(items: T[], size: number, work: (item: T, i: number) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await work(items[i], i);
    }
  });
  await Promise.all(runners);
}

/**
 * Download everything the settings ask for, then write the manifest.
 * Re-running it is how "Check for updates" works: files are compared by hash.
 * A file that fails to download keeps its previously cached copy.
 */
export async function syncAll(settings: Settings, onProgress: (p: Progress) => void): Promise<SyncReport> {
  const base = normalizeBaseUrl(settings.baseUrl);
  if (!base) throw new Error("Set your 5e.tools URL first.");
  const old = await loadManifest();
  const oldByPath = new Map((old?.files ?? []).map((f) => [f.path, f]));

  const report: SyncReport = { entries: 0, files: 0, changed: [], added: [], removed: [], failed: [] };
  // `spec` is set for linkable data; `rules` for character-builder rules files.
  const plan: { kind: string; spec?: CategorySpec; rules?: RulesSpec; path: string }[] = [];
  for (const spec of CATEGORIES) {
    if (!kindOn(settings, spec.kind)) continue;
    try {
      for (const f of await filesFor(base, spec, settings.sources[spec.kind])) plan.push({ kind: spec.kind, spec, path: f.path });
    } catch (e) {
      report.failed.push(`${spec.index}: ${(e as Error).message}`);
      // Keep what we had for this kind.
      for (const f of old?.files ?? []) if (f.kind === spec.kind) plan.push({ kind: spec.kind, spec, path: f.path });
    }
  }
  if (settings.characterRules !== false) {
    for (const rules of RULES) {
      const kind = rulesKind(rules.id);
      try {
        const paths = rules.files ?? filesFromIndex(rules, await getJson(`${base}/${rules.index}`)).map((f) => f.path);
        for (const path of paths) plan.push({ kind, rules, path });
      } catch (e) {
        report.failed.push(`${rules.index}: ${(e as Error).message}`);
        for (const f of old?.files ?? []) if (f.kind === kind) plan.push({ kind, rules, path: f.path });
      }
    }
  }

  const files: ManifestFile[] = [];
  let done = 0;
  onProgress({ done, total: plan.length, current: "" });
  await pool(plan, 4, async ({ kind, spec, rules, path }) => {
    try {
      const text = await getText(`${base}/${path}`);
      const json = JSON.parse(text);
      const count = spec ? extractEntries(spec, json, fileFilter(settings, spec)).length : rules ? countRules(rules, json) : 0;
      const hash = hashText(text);
      const before = oldByPath.get(path);
      if (!before) report.added.push(path);
      else if (before.hash !== hash) report.changed.push(path);
      await writeCache(cacheName(path), text);
      files.push({ kind, path, hash, count });
      report.entries += count;
      report.files++;
    } catch (e) {
      report.failed.push(`${path}: ${(e as Error).message}`);
      const before = oldByPath.get(path);
      if (before) files.push(before);
    } finally {
      onProgress({ done: ++done, total: plan.length, current: path });
    }
  });

  // Files no longer wanted (a source unticked or a kind switched off).
  const keep = new Set(files.map((f) => cacheName(f.path)));
  for (const f of old?.files ?? []) {
    if (!keep.has(cacheName(f.path))) report.removed.push(f.path);
  }
  for (const name of await listCache()) {
    if (name !== "manifest.json" && !keep.has(name)) await removeCacheFile(name);
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  await writeCache("manifest.json", JSON.stringify({ baseUrl: base, files, updated: new Date().toISOString() } satisfies Manifest, null, 1));
  return report;
}

export async function loadManifest(): Promise<Manifest | null> {
  const t = await readCache("manifest.json");
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** Load all cached entries from disk (fast, offline). */
export async function loadCachedEntries(settings: Settings): Promise<Entry[]> {
  const m = await loadManifest();
  if (!m) return [];
  const out: Entry[] = [];
  for (const f of m.files) {
    const spec = CATEGORIES.find((c) => c.kind === f.kind);
    if (!spec || !kindOn(settings, spec.kind)) continue;
    const text = await readCache(cacheName(f.path));
    if (!text) continue;
    try {
      out.push(...extractEntries(spec, JSON.parse(text), fileFilter(settings, spec)));
    } catch {
      /* skip a corrupt file; next sync replaces it */
    }
  }
  return out;
}

export { CATEGORIES, normalizeBaseUrl };
