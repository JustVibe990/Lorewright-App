// Sound effects, made in code with the Web Audio API (no sound files): dice,
// taking damage, healing, casting, drinking a potion, using a feature, resting,
// levelling up. Sounds can be switched off or turned down in Settings; that
// choice is kept in this computer's browser storage.

import type { RollResult } from "./dice.ts";

export type Sound =
  | "dice"
  | "crit"
  | "fumble"
  | "hurt"
  | "hurtBig"
  | "down"
  | "heal"
  | "temp"
  | "spell"
  | "potion"
  | "feature"
  | "condition"
  | "rest"
  | "levelup"
  | "saveGood"
  | "saveBad";

export const SOUND_LABELS: Record<Sound, string> = {
  dice: "Dice roll",
  crit: "Natural 20",
  fumble: "Natural 1",
  hurt: "Taking damage",
  hurtBig: "Big hit",
  down: "Dropping to 0 HP",
  heal: "Healing",
  temp: "Temp HP",
  spell: "Casting a spell",
  potion: "Drinking a potion",
  feature: "Using a feature",
  condition: "Gaining a condition",
  rest: "Resting",
  levelup: "Level up",
  saveGood: "Death save success",
  saveBad: "Death save failure",
};

export interface SoundPrefs {
  on: boolean;
  /** 0–1. */
  volume: number;
  /** Dice sounds can be turned off on their own (they happen a lot). */
  dice: boolean;
}

const KEY = "lorewright.sound";
const DEFAULTS: SoundPrefs = { on: true, volume: 0.6, dice: true };

export function soundPrefs(): SoundPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setSoundPrefs(p: SoundPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Not kept; still applies until the app closes.
  }
  prefs = p;
  if (master) master.gain.value = p.volume;
}

let prefs: SoundPrefs | null = null;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = (prefs ??= soundPrefs()).volume;
    // A gentle limiter so stacked sounds never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// ---------- building blocks ----------

/** A volume envelope: quick attack, then fade out over `len` seconds. */
function env(a: AudioContext, t: number, peak: number, len: number, attack = 0.005) {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + len);
  g.connect(master!);
  return g;
}

function tone(a: AudioContext, t: number, o: { type?: OscillatorType; from: number; to?: number; len: number; peak?: number; attack?: number; glide?: number; detune?: number }) {
  const osc = a.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.from, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? o.len));
  if (o.detune) osc.detune.value = o.detune;
  const g = env(a, t, o.peak ?? 0.3, o.len, o.attack);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + (o.attack ?? 0.005) + o.len + 0.05);
  return osc;
}

function noise(a: AudioContext, t: number, o: { len: number; peak?: number; type?: BiquadFilterType; freq: number; to?: number; q?: number; attack?: number }) {
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = a.createBiquadFilter();
  f.type = o.type ?? "bandpass";
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.len);
  f.Q.value = o.q ?? 1;
  const g = env(a, t, o.peak ?? 0.3, o.len, o.attack);
  src.connect(f).connect(g);
  src.start(t, Math.random() * 0.5);
  src.stop(t + (o.attack ?? 0.005) + o.len + 0.05);
}

/** Notes as semitones above A4 → Hz. */
const hz = (semi: number) => 440 * 2 ** (semi / 12);

/** A plucked string (lute, harp), made by the Karplus-Strong method. Cached per note. */
const plucks = new Map<string, AudioBuffer>();
function pluckBuffer(a: AudioContext, f: number, len: number, soft: number): AudioBuffer {
  const key = `${f.toFixed(1)}|${len}|${soft}`;
  const hit = plucks.get(key);
  if (hit) return hit;
  const sr = a.sampleRate;
  const buf = a.createBuffer(1, Math.ceil(sr * len), sr);
  const d = buf.getChannelData(0);
  const n = Math.max(2, Math.round(sr / f));
  // A softer pluck starts from smoothed noise (a thumb, not a pick).
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.random() * 2 - 1;
    prev = prev * soft + r * (1 - soft);
    d[i] = prev;
  }
  for (let i = n; i < d.length; i++) d[i] = 0.996 * 0.5 * (d[i - n] + d[i - n - 1 < 0 ? 0 : i - n - 1]);
  plucks.set(key, buf);
  return buf;
}

function pluck(a: AudioContext, t: number, o: { freq: number; len?: number; peak?: number; soft?: number }) {
  const len = o.len ?? 1.2;
  const src = a.createBufferSource();
  src.buffer = pluckBuffer(a, o.freq, len, o.soft ?? 0.5);
  const g = a.createGain();
  g.gain.setValueAtTime(o.peak ?? 0.4, t);
  g.gain.setValueAtTime(o.peak ?? 0.4, t + len * 0.7);
  g.gain.linearRampToValueAtTime(0.0001, t + len);
  // A wooden body: take the edge off the top.
  const body = a.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.value = 3200;
  src.connect(body).connect(g).connect(master!);
  src.start(t);
}

/** A struck bell: partials that don't line up the way a synth's do. */
function bell(a: AudioContext, t: number, o: { freq: number; len?: number; peak?: number }) {
  const len = o.len ?? 1.5;
  const partials: [number, number][] = [[0.5, 0.35], [1, 1], [2, 0.5], [2.76, 0.45], [4.07, 0.25], [5.4, 0.18], [8.93, 0.08]];
  partials.forEach(([ratio, amp], i) => {
    const f = o.freq * ratio;
    if (f > 12000) return;
    tone(a, t, { from: f, len: len / (1 + i * 0.5), peak: (o.peak ?? 0.15) * amp, attack: 0.002 });
  });
}

/** A frame drum or a body blow: a skin thump with a short, small drop in pitch. */
function drum(a: AudioContext, t: number, o: { freq?: number; len?: number; peak?: number }) {
  const f = o.freq ?? 90;
  tone(a, t, { from: f * 1.3, to: f, glide: 0.04, len: o.len ?? 0.3, peak: o.peak ?? 0.5, attack: 0.002 });
  noise(a, t, { len: (o.len ?? 0.3) * 0.5, peak: (o.peak ?? 0.5) * 0.5, type: "lowpass", freq: 500 });
}

// D major pentatonic, the go-to for harps and lutes.
const PENTA = [-7, -5, -3, 0, 2, 5, 7, 9, 12, 14, 17, 19];

// ---------- the sounds ----------

const SOUNDS: Record<Sound, (a: AudioContext, t: number) => void> = {
  dice(a, t) {
    // Bone or wooden dice tumbling on a tabletop.
    let at = t;
    for (let i = 0; i < 6; i++) {
      noise(a, at, { len: 0.025 + Math.random() * 0.025, peak: 1.6 - i * 0.18, freq: 1400 + Math.random() * 1800, q: 4 });
      at += 0.04 + Math.random() * 0.07;
    }
    noise(a, at, { len: 0.05, peak: 0.3, type: "lowpass", freq: 700 });
  },
  crit(a, t) {
    SOUNDS.dice(a, t);
    PENTA.slice(3, 10).forEach((s, i) => pluck(a, t + 0.4 + i * 0.045, { freq: hz(s), len: 1.4, peak: 0.28 }));
    bell(a, t + 0.75, { freq: hz(19), len: 1.6, peak: 0.1 });
  },
  fumble(a, t) {
    SOUNDS.dice(a, t);
    pluck(a, t + 0.4, { freq: hz(-24), len: 0.9, peak: 0.45, soft: 0.8 });
    pluck(a, t + 0.7, { freq: hz(-25), len: 1.3, peak: 0.45, soft: 0.8 });
  },
  hurt(a, t) {
    // A blow landing: a thud and a scuff.
    drum(a, t, { freq: 70, len: 0.22, peak: 0.6 });
    noise(a, t, { len: 0.07, peak: 0.25, freq: 900, q: 0.8 });
  },
  hurtBig(a, t) {
    // Steel on armour, then the weight of it.
    bell(a, t, { freq: 640, len: 0.5, peak: 0.12 });
    noise(a, t, { len: 0.05, peak: 0.3, freq: 3000, q: 1.5 });
    drum(a, t + 0.01, { freq: 60, len: 0.4, peak: 0.7 });
  },
  down(a, t) {
    drum(a, t, { freq: 52, len: 0.7, peak: 0.8 });
    bell(a, t + 0.1, { freq: 98, len: 3, peak: 0.25 });
  },
  heal(a, t) {
    // A harp running up, and a small bell.
    PENTA.slice(2, 9).forEach((s, i) => pluck(a, t + i * 0.055, { freq: hz(s), len: 1.6, peak: 0.22, soft: 0.6 }));
    bell(a, t + 0.4, { freq: hz(14), len: 1.6, peak: 0.06 });
  },
  temp(a, t) {
    // A shield taking the blow.
    bell(a, t, { freq: 420, len: 0.9, peak: 0.14 });
    noise(a, t, { len: 0.04, peak: 0.25, freq: 2500, q: 2 });
    drum(a, t, { freq: 110, len: 0.15, peak: 0.3 });
  },
  spell(a, t) {
    // Wind rising, and the air glittering.
    noise(a, t, { len: 0.7, peak: 0.5, freq: 300, to: 2400, q: 0.9, attack: 0.25 });
    [24, 31, 28, 36, 33].forEach((s, i) => bell(a, t + 0.25 + i * 0.07 + Math.random() * 0.03, { freq: hz(s - 12), len: 0.9, peak: 0.09 }));
  },
  potion(a, t) {
    // The cork, a clink of glass, three swallows.
    noise(a, t, { len: 0.03, peak: 1, freq: 1100, q: 5 });
    tone(a, t, { from: 500, to: 900, len: 0.03, peak: 0.15 });
    bell(a, t + 0.08, { freq: 2300, len: 0.3, peak: 0.05 });
    for (let i = 0; i < 3; i++) {
      const at = t + 0.3 + i * 0.24;
      noise(a, at, { len: 0.11, peak: 1.4, freq: 260, to: 650, q: 6, attack: 0.015 });
      drum(a, at + 0.02, { freq: 130, len: 0.08, peak: 0.25 });
    }
  },
  feature(a, t) {
    // Two beats on a war drum and a ring of steel.
    drum(a, t, { freq: 80, len: 0.3, peak: 0.6 });
    drum(a, t + 0.16, { freq: 95, len: 0.35, peak: 0.7 });
    bell(a, t + 0.16, { freq: 880, len: 0.4, peak: 0.05 });
  },
  condition(a, t) {
    // Something's wrong: two low strings that clash.
    pluck(a, t, { freq: hz(-29), len: 1.4, peak: 0.4, soft: 0.7 });
    pluck(a, t + 0.03, { freq: hz(-28), len: 1.4, peak: 0.35, soft: 0.7 });
  },
  rest(a, t) {
    // A slow strum on a lute.
    [-19, -12, -7, -3, 0].forEach((s, i) => pluck(a, t + i * 0.06, { freq: hz(s), len: 2, peak: 0.22, soft: 0.7 }));
    [-12, -5, 0].forEach((s, i) => pluck(a, t + 0.9 + i * 0.08, { freq: hz(s), len: 1.8, peak: 0.14, soft: 0.7 }));
  },
  levelup(a, t) {
    // A harp flourish into a chord, and a bell.
    PENTA.forEach((s, i) => pluck(a, t + i * 0.04, { freq: hz(s), len: 1.6, peak: 0.2 }));
    [0, 7, 12, 16].forEach((s) => pluck(a, t + 0.6, { freq: hz(s), len: 2.2, peak: 0.18, soft: 0.6 }));
    bell(a, t + 0.6, { freq: hz(12), len: 2.4, peak: 0.1 });
  },
  saveGood(a, t) {
    bell(a, t, { freq: hz(15), len: 1.4, peak: 0.12 });
  },
  saveBad(a, t) {
    // A funeral bell.
    bell(a, t, { freq: 110, len: 3, peak: 0.28 });
  },
};

/** Play a sound now, or after `delay` seconds. */
export function play(s: Sound, delay = 0) {
  prefs ??= soundPrefs();
  if (!prefs.on || prefs.volume <= 0) return;
  if (!prefs.dice && (s === "dice" || s === "crit" || s === "fumble")) return;
  try {
    const a = audio();
    if (!a) return;
    SOUNDS[s](a, a.currentTime + 0.01 + delay);
  } catch {
    // No sound is never worth an error.
  }
}

/** A die roll's sound: a natural 20 or 1 on a d20 sounds different. */
export function rollSound(r: RollResult): Sound {
  if (!/^[+-]?\d*d20(k[hl]\d+)?(?![\d])/i.test(r.expr.replace(/\s+/g, ""))) return "dice";
  const first = r.detail.match(/\[([^\]]*)\]/)?.[1] ?? "";
  const kept = first.split(",").map((x) => x.trim()).filter((x) => !x.startsWith("("));
  if (kept.includes("20")) return "crit";
  if (kept.includes("1")) return "fumble";
  return "dice";
}

// A sound played by the button itself (Drink, Cast) covers the sounds the same
// change would make on the sheet; the rest of them follow a moment later.
let leading: { at: number; covers: Sound[]; delay: number } | null = null;

export function playLead(s: Sound, covers: Sound[] = [], delay = 0.6) {
  play(s);
  leading = { at: Date.now(), covers: [s, ...covers], delay };
}

/** Play the sounds a change made, after any button's own sound. */
const lead = () => (leading && Date.now() - leading.at < 400 ? leading : null);

export function playAfterLead(sounds: Sound[]) {
  const l = lead();
  const rest = l ? sounds.filter((x) => !l.covers.includes(x)) : sounds;
  rest.forEach((x, i) => play(x, (l ? l.delay : 0) + i * 0.25));
}

/** A die roll's sound, unless a button's own sound covers it. */
export function playRoll(r: RollResult) {
  const s = rollSound(r);
  const l = lead();
  if (l?.covers.includes(s)) return;
  play(s, l ? l.delay : 0);
}
