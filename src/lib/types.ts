// Shared types for Lorewright.

/** The kinds of 5e.tools content the app links to. */
export type Kind = "spell" | "creature" | "item" | "condition" | "feat";

/** One linkable rules entry, normalised from 5e.tools (or SRD) JSON. */
export interface Entry {
  kind: Kind;
  name: string;
  source: string; // e.g. "PHB", "XPHB", "SRD"
  page?: number;
  /** The original JSON object, used to render the card. */
  raw: any;
}

/** Stable key used in notes and remembered picker choices: kind|name|source (lowercased). */
export function entryKey(e: { kind: string; name: string; source: string }): string {
  return `${e.kind}|${e.name}|${e.source}`.toLowerCase();
}

export interface Settings {
  /** Base URL of the 5e.tools site to import from. Blank until the user sets it. */
  baseUrl: string;
  /** Sources the user ticked during import, per kind. Missing or empty = all sources. */
  sources: Partial<Record<Kind, string[]>>;
  /** Kinds switched off in setup; nothing is downloaded for them. */
  disabledKinds?: Kind[];
  /** Download classes, species, backgrounds etc. for character sheets. Default on. */
  characterRules?: boolean;
  /** True once the user finished (or skipped) first-run setup. */
  setupDone?: boolean;
  lastSync?: string;
  /** Automatic backups of the open campaign. Missing = on, every 3 days, keep 5. */
  autoBackup?: { on: boolean; days: number; keep: number };
  /** Colours, fonts and text size. */
  appearance?: { theme: string; mode: "auto" | "light" | "dark"; textFont: string; headingFont: string; size: number };
  /** Guided tours already seen (or skipped). */
  toursSeen?: string[];
  /** Last campaign opened, restored on startup. */
  lastCampaign?: string;
}

export interface CampaignConfig {
  /** Sources allowed in this campaign's picker. Empty = all. */
  allowedSources: string[];
  /** Remembered picker choices: normalised selected text -> entry key. */
  choices: Record<string, string>;
}

export interface NoteMeta {
  file: string; // file name, e.g. "Session 12.md"
  title: string;
  modified: number;
}
