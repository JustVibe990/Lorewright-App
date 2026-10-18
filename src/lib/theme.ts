// Themes: colours (each with a light and a dark version), fonts and text
// size. Applied by setting the colour variables the stylesheet uses.

export interface Palette {
  bg: string;
  panel: string;
  panel2: string;
  card: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  accentText: string;
  danger: string;
  ok: string;
}

export interface Theme {
  id: string;
  name: string;
  light: Palette;
  dark: Palette;
}

export const THEMES: Theme[] = [
  {
    id: "parchment",
    name: "Parchment",
    light: { bg: "#f8f4ec", panel: "#f0e9db", panel2: "#e9e0cd", card: "#fffdf8", text: "#2b2520", muted: "#7a6d5f", line: "#ddd2bd", accent: "#6d4a96", accentText: "#ffffff", danger: "#b3261e", ok: "#2e7d4f" },
    dark: { bg: "#1c1916", panel: "#23201b", panel2: "#2b2721", card: "#282420", text: "#ebe3d5", muted: "#a59784", line: "#3b352d", accent: "#b08ee0", accentText: "#1c1916", danger: "#f2827a", ok: "#74c69d" },
  },
  {
    id: "arcane",
    name: "Arcane",
    light: { bg: "#f2f3fb", panel: "#e6e8f6", panel2: "#d9dcf0", card: "#ffffff", text: "#1f2140", muted: "#666a8f", line: "#ccd0e8", accent: "#3f51c9", accentText: "#ffffff", danger: "#c0262f", ok: "#23845a" },
    dark: { bg: "#11132a", panel: "#171a36", panel2: "#1f2344", card: "#1b1e3c", text: "#e4e6ff", muted: "#9499c4", line: "#2d325c", accent: "#8c9cff", accentText: "#11132a", danger: "#ff8a8f", ok: "#6fd3a2" },
  },
  {
    id: "forest",
    name: "Forest",
    light: { bg: "#f2f5ee", panel: "#e5ecdd", panel2: "#d8e2cc", card: "#fcfdf9", text: "#1f2a1c", muted: "#62705a", line: "#cdd8c0", accent: "#2f6b3a", accentText: "#ffffff", danger: "#b0322a", ok: "#2f6b3a" },
    dark: { bg: "#121a12", panel: "#172117", panel2: "#1e2b1e", card: "#1b261b", text: "#e2ecd9", muted: "#97a88c", line: "#2c3d2b", accent: "#86c78f", accentText: "#121a12", danger: "#f08a80", ok: "#86c78f" },
  },
  {
    id: "crimson",
    name: "Crimson",
    light: { bg: "#faf3f1", panel: "#f2e4e0", panel2: "#ead5cf", card: "#fffbfa", text: "#2c1a18", muted: "#80625d", line: "#e2cbc5", accent: "#9c1c2b", accentText: "#ffffff", danger: "#9c1c2b", ok: "#2e7d4f" },
    dark: { bg: "#1a1010", panel: "#221515", panel2: "#2c1c1c", card: "#271818", text: "#f2e2df", muted: "#b08f8a", line: "#3f2828", accent: "#ef6b77", accentText: "#1a1010", danger: "#ff8f8f", ok: "#7fcf9d" },
  },
  {
    id: "frost",
    name: "Frost",
    light: { bg: "#f1f6f9", panel: "#e3edf3", panel2: "#d4e3ec", card: "#ffffff", text: "#16262f", muted: "#5d7380", line: "#c8dae5", accent: "#1f6f9c", accentText: "#ffffff", danger: "#b8302c", ok: "#2b7d5a" },
    dark: { bg: "#0f171c", panel: "#141f26", panel2: "#1b2a33", card: "#18252d", text: "#dceaf2", muted: "#8ea6b3", line: "#28404d", accent: "#7cc4ec", accentText: "#0f171c", danger: "#f28c86", ok: "#76d0a6" },
  },
  {
    id: "dungeon",
    name: "Dungeon",
    light: { bg: "#f1f0ee", panel: "#e5e3df", panel2: "#d9d6d0", card: "#fbfaf8", text: "#22211f", muted: "#6c6964", line: "#cfccc5", accent: "#a05a12", accentText: "#ffffff", danger: "#b3261e", ok: "#3a7a46" },
    dark: { bg: "#151514", panel: "#1c1c1a", panel2: "#252422", card: "#21201e", text: "#e6e3dd", muted: "#9b968e", line: "#36342f", accent: "#e8a04a", accentText: "#151514", danger: "#f2827a", ok: "#86c890" },
  },
  {
    id: "infernal",
    name: "Infernal",
    light: { bg: "#fbf4ee", panel: "#f4e6da", panel2: "#ecd7c4", card: "#fffaf6", text: "#2a1710", muted: "#82614f", line: "#e4cdb9", accent: "#c2410c", accentText: "#ffffff", danger: "#b91c1c", ok: "#2e7d4f" },
    dark: { bg: "#160d0a", panel: "#1e120e", panel2: "#2a1912", card: "#241510", text: "#f6e3d6", muted: "#bb917a", line: "#42261b", accent: "#ff7a3d", accentText: "#160d0a", danger: "#ff8f7a", ok: "#86cf9a" },
  },
  {
    id: "contrast",
    name: "High contrast",
    light: { bg: "#ffffff", panel: "#f2f2f2", panel2: "#e2e2e2", card: "#ffffff", text: "#000000", muted: "#3d3d3d", line: "#7a7a7a", accent: "#0040c0", accentText: "#ffffff", danger: "#b00000", ok: "#006b2e" },
    dark: { bg: "#000000", panel: "#0d0d0d", panel2: "#1f1f1f", card: "#0a0a0a", text: "#ffffff", muted: "#d0d0d0", line: "#8a8a8a", accent: "#ffd400", accentText: "#000000", danger: "#ff6b6b", ok: "#6dff9e" },
  },
];

/** Fonts that come with Windows (the app works offline, so nothing is downloaded). */
export const TEXT_FONTS: { id: string; name: string; css: string }[] = [
  { id: "segoe", name: "Segoe UI (default)", css: `"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif` },
  { id: "verdana", name: "Verdana (wide, very clear)", css: `Verdana, Geneva, sans-serif` },
  { id: "trebuchet", name: "Trebuchet", css: `"Trebuchet MS", "Segoe UI", sans-serif` },
  { id: "comic", name: "Comic Sans (easy reading)", css: `"Comic Sans MS", "Comic Neue", cursive` },
  { id: "georgia", name: "Georgia (serif)", css: `Georgia, "Times New Roman", serif` },
];

export const HEADING_FONTS: { id: string; name: string; css: string }[] = [
  { id: "book", name: "Book (default)", css: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif` },
  { id: "georgia", name: "Georgia", css: `Georgia, "Times New Roman", serif` },
  { id: "cambria", name: "Cambria", css: `Cambria, Georgia, serif` },
  { id: "constantia", name: "Constantia", css: `Constantia, Georgia, serif` },
  { id: "garamond", name: "Garamond", css: `Garamond, "EB Garamond", Georgia, serif` },
  { id: "inkfree", name: "Handwritten (Ink Free)", css: `"Ink Free", "Segoe Print", cursive` },
  { id: "print", name: "Scribe (Segoe Print)", css: `"Segoe Print", "Ink Free", cursive` },
  { id: "same", name: "Same as the text", css: `var(--sans)` },
];

export const TEXT_SIZES = [
  { id: 0.9, name: "Small" },
  { id: 1, name: "Normal" },
  { id: 1.1, name: "Large" },
  { id: 1.25, name: "Extra large" },
];

export interface Appearance {
  theme: string;
  mode: "auto" | "light" | "dark";
  textFont: string;
  headingFont: string;
  size: number;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: "parchment", mode: "auto", textFont: "segoe", headingFont: "book", size: 1 };

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

/** The colour variables for a palette. */
export function paletteVars(p: Palette): Record<string, string> {
  return {
    "--bg": p.bg,
    "--panel": p.panel,
    "--panel-2": p.panel2,
    "--card": p.card,
    "--text": p.text,
    "--muted": p.muted,
    "--line": p.line,
    "--accent": p.accent,
    "--accent-text": p.accentText,
    "--danger": p.danger,
    "--ok": p.ok,
    "--focus": p.accent,
  };
}

/** Is dark in use, for this mode and the system setting? */
// Colours for spells, monsters, items, conditions and feats, for light and dark.
const KINDS_LIGHT = { "--k-spell": "#7444b8", "--k-creature": "#c4502f", "--k-item": "#a26a00", "--k-condition": "#17806f", "--k-feat": "#2a64b5" };
const KINDS_DARK = { "--k-spell": "#b794f4", "--k-creature": "#f2917a", "--k-item": "#e8b54a", "--k-condition": "#5fcfc0", "--k-feat": "#7fb0f2" };

export const isDark = (mode: Appearance["mode"], systemDark: boolean) => (mode === "auto" ? systemDark : mode === "dark");

let stopWatching: (() => void) | null = null;

/** Text size: the window's own zoom (like Ctrl and + in a browser), so everything stays lined up. */
function setZoom(scale: number) {
  if (!("__TAURI_INTERNALS__" in window)) return;
  void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().setZoom(scale)).catch(() => {});
}

/** Apply the appearance to the page, and keep following the system's light/dark when on auto. */
export function applyAppearance(a: Partial<Appearance> | undefined) {
  if (typeof document === "undefined") return;
  const app = { ...DEFAULT_APPEARANCE, ...(a ?? {}) };
  const root = document.documentElement;
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const paint = () => {
    const dark = isDark(app.mode, !!media?.matches);
    const p = dark ? themeById(app.theme).dark : themeById(app.theme).light;
    for (const [k, v] of Object.entries({ ...paletteVars(p), ...(dark ? KINDS_DARK : KINDS_LIGHT) })) root.style.setProperty(k, v);
    root.style.colorScheme = dark ? "dark" : "light";
    root.dataset.mode = dark ? "dark" : "light";
  };
  paint();
  root.style.setProperty("--sans", (TEXT_FONTS.find((f) => f.id === app.textFont) ?? TEXT_FONTS[0]).css);
  root.style.setProperty("--serif", (HEADING_FONTS.find((f) => f.id === app.headingFont) ?? HEADING_FONTS[0]).css);
  setZoom(app.size || 1);
  stopWatching?.();
  stopWatching = null;
  if (app.mode === "auto" && media) {
    media.addEventListener("change", paint);
    stopWatching = () => media.removeEventListener("change", paint);
  }
}
