// The character engine: Character + Rules → Sheet. Pure and deterministic.
// Every number on the sheet is derived here from the character's choices.

import { renderText } from "../render.ts";
import { ammoFamily, ammoName, armorKind, bonus, isActive, isRanged, isWeapon, itemData, packSize, properties, weaponAmmo } from "./items.ts";
import { readFlags, readLanguages, readSkills, readTools, stripRef, textProficiencies, type ProfResult } from "./profs.ts";
import { refOf, splitRef, type ClassDef, type Rules, type SubclassDef } from "./rules.ts";
import {
  ABILITIES,
  ABILITY_NAMES,
  SKILLS,
  type Ability,
  type Attack,
  type Bonus,
  type Character,
  type Choice,
  type Feature,
  type Resource,
  type Sheet,
  type SpellcastingInfo,
  type TimelineItem,
} from "./types.ts";
import { levelOrder } from "./levels.ts";

const SIZE_NAMES: Record<string, string> = { T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" };
const DAMAGE_TYPES: Record<string, string> = {
  A: "acid", B: "bludgeoning", C: "cold", F: "fire", O: "force", L: "lightning", N: "necrotic",
  P: "piercing", I: "poison", Y: "psychic", R: "radiant", S: "slashing", T: "thunder",
};
/** PHB multiclass spellcaster table: slots per spell level by caster level. */
const MULTICLASS_SLOTS: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
/** Race traits that are just bookkeeping (shown elsewhere on the sheet). */
// Weapon picks some subclasses offer (PHB weapons).
const ONE_HANDED_MELEE = ["battleaxe", "club", "dagger", "flail", "handaxe", "javelin", "light hammer", "longsword", "mace", "morningstar", "quarterstaff", "rapier", "scimitar", "shortsword", "sickle", "spear", "trident", "war pick", "warhammer", "whip"];
/** Simple or martial weapons without the heavy or special property, plus the longbow. */
const KENSEI_WEAPONS = [...ONE_HANDED_MELEE, "blowgun", "dart", "hand crossbow", "light crossbow", "longbow", "shortbow", "sling"].sort();
const HIDDEN_TRAITS =new Set(["Age", "Alignment", "Size", "Speed", "Languages", "Ability Score Increase", "Creature Type"]);

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level: number) => Math.ceil(Math.max(level, 1) / 4) + 1;
const plain = (s: string) => renderText(String(s ?? "")).replace(/<[^>]+>/g, "");
const low = (s: unknown) => String(s ?? "").toLowerCase();
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const dmg = (dice: string, mod: number) => (mod ? `${dice}${mod > 0 ? "+" : ""}${mod}` : dice);

export const classRefOf = (c: { name: string; source: string }) => `${c.name}|${c.source}`;

/** Value of a level-indexed progression: an array (index = level-1) or { "3": 3, "7": 5 }. */
export function progressionAt(prog: any, level: number): number {
  if (Array.isArray(prog)) return Number(prog[Math.min(level, prog.length) - 1] ?? 0) || 0;
  if (prog && typeof prog === "object") {
    let v = 0;
    for (const [k, n] of Object.entries<any>(prog)) if (Number(k) <= level) v = Math.max(v, Number(n) || 0);
    return v;
  }
  return 0;
}

/** Evaluate a 5e.tools formula like "<$level$> + <$int_mod$>" or "<$level$> / 2 + <$cha_mod$>". */
export function evalFormula(formula: string, level: number, mods: Record<Ability, number>): number {
  const expr = String(formula)
    .replace(/<\$level\$>/g, String(level))
    .replace(/<\$(\w{3})_mod\$>/g, (_, a) => String(mods[a as Ability] ?? 0));
  if (!/^[\d\s+\-*/().]+$/.test(expr)) return 0;
  try {
    // eslint-disable-next-line no-new-func
    return Math.max(1, Math.floor(Function(`"use strict"; return (${expr});`)()));
  } catch {
    return 0;
  }
}

/** A class-table cell as text: numbers, dice objects, "+2" bonuses, "+10 ft." speed bonuses. */
export function cellText(c: any): string {
  if (c == null) return "";
  if (typeof c === "number") return String(c);
  if (typeof c === "string") return plain(c);
  if (c.type === "dice") return (c.toRoll ?? []).map((d: any) => `${d.number}d${d.faces}`).join("+");
  if (c.type === "bonus") return signed(Number(c.value));
  if (c.type === "bonusSpeed") return `${signed(Number(c.value))} ft.`;
  if (c.value != null) return String(c.value);
  return "";
}

interface Ctx {
  ch: Character;
  rules: Rules;
  choices: Choice[];
  warnings: string[];
  features: Feature[];
  ability: Record<Ability, Bonus[]>;
  skillProf: Set<string>;
  expertise: Set<string>;
  saveProf: Set<Ability>;
  armor: Set<string>;
  weapons: Set<string>;
  tools: Set<string>;
  languages: Set<string>;
  resist: Set<string>;
  immune: Set<string>;
  feats: any[];
  optFeatures: any[];
  extraSpells: Sheet["extraSpells"];
}

/** Labels for proficiency choices. */
const L = { skills: "Skill proficiencies", languages: "Languages", tools: "Tool proficiencies" };

/**
 * Spells granted by a species, feat or subclass ("additionalSpells"):
 * fixed spells, innate spells with uses per day, and picks like
 * { choose: "level=0|class=Wizard" }. Several alternatives (Magic Initiate)
 * become a choice of which list to use.
 */
function applyAdditionalSpells(ctx: Ctx, blocks: any[] | undefined, idPrefix: string, from: string, level: number) {
  if (!blocks?.length) return;
  let block = blocks[0];
  if (blocks.length > 1) {
    const labels = Object.fromEntries(blocks.map((b, i) => [String(i), b.name ?? `Option ${i + 1}`]));
    const pick = ask(ctx, { id: `${idPrefix}:alt`, type: "racealternative", label: "Spell list", from, count: 1, options: Object.keys(labels), labels });
    block = blocks[Number(pick[0] ?? 0)] ?? blocks[0];
  }
  const ability = typeof block.ability === "string" ? block.ability : undefined;
  let n = 0;
  const handle = (spell: any, note: string) => {
    if (typeof spell === "string") {
      ctx.extraSpells.push({ ref: spellRef(spell), from, note, ability });
    } else if (spell?.choose) {
      const filter = parseSpellFilter(String(spell.choose));
      const options = ctx.rules.data.index
        .entries()
        .filter((e) => e.kind === "spell" && (filter.levels.length ? filter.levels.includes(e.raw.level) : true))
        .filter((e) => !filter.className || ctx.rules.spellClassesOf(e.name, e.source).some((c) => low(c.name) === low(filter.className)))
        .map((e) => `${e.name}|${e.source}`);
      const count = spell.count ?? 1;
      const type: Choice["type"] = filter.levels.length === 1 && filter.levels[0] === 0 ? "cantrip" : "spell";
      for (const r of ask(ctx, { id: `${idPrefix}:${n++}`, type, label: type === "cantrip" ? `Cantrip${count > 1 ? "s" : ""}` : `Spell${count > 1 ? "s" : ""}`, from, count, options })) {
        ctx.extraSpells.push({ ref: r, from, note, ability });
      }
    }
  };
  const walkLevels = (section: any, kind: "known" | "innate") => {
    for (const [lvl, v] of Object.entries<any>(section ?? {})) {
      if (lvl !== "_" && Number(lvl) > level) continue;
      if (Array.isArray(v)) v.forEach((s) => handle(s, kind === "innate" ? "at will" : "known"));
      else if (v && typeof v === "object") {
        for (const [k, inner] of Object.entries<any>(v)) {
          if (k === "_" && Array.isArray(inner)) inner.forEach((s) => handle(s, kind === "innate" ? "at will" : "known"));
          else if (k === "will" && Array.isArray(inner)) inner.forEach((s) => handle(s, "at will"));
          else if (k === "daily" || k === "rest") {
            for (const [uses, list] of Object.entries<any>(inner ?? {})) {
              (Array.isArray(list) ? list : []).forEach((s) => handle(s, `${uses.replace("e", "")}/${k === "daily" ? "long rest" : "short rest"}`));
            }
          } else if (k === "ritual" && Array.isArray(inner)) inner.forEach((s) => handle(s, "ritual"));
        }
      }
    }
  };
  walkLevels(block.known, "known");
  walkLevels(block.innate, "innate");
}

/** "level=0|class=Wizard" or "level=1;2|class=Cleric" → filter parts. */
function parseSpellFilter(f: string): { levels: number[]; className?: string } {
  const out: { levels: number[]; className?: string } = { levels: [] };
  for (const part of f.split("|")) {
    const [k, v = ""] = part.split("=");
    if (k === "level") out.levels = v.split(";").map(Number).filter((x) => !Number.isNaN(x));
    if (k === "class") out.className = v.split(";")[0];
  }
  return out;
}

/** Register a choice and return its (validated) answer. */
function ask(ctx: Ctx, c: Omit<Choice, "answer">): string[] {
  const raw = ctx.ch.choices[c.id] ?? [];
  const valid = c.options.length ? raw.filter((a) => c.options.includes(a) || c.type === "asi") : raw;
  const answer = valid.slice(0, c.count);
  ctx.choices.push({ ...c, answer });
  return answer;
}

function applyProf(ctx: Ctx, res: ProfResult, target: Set<string>, idPrefix: string, type: Choice["type"], from: string) {
  for (const f of res.fixed) target.add(f);
  for (const req of res.choices) {
    // Don't offer what's already known from elsewhere.
    for (const a of ask(ctx, { id: `${idPrefix}:${req.key}`, type, label: req.label, from, count: req.count, options: req.options })) target.add(a);
  }
}

/** Ability score increases: [{ dex: 2 }], [{ choose: { from, count, amount } }], [{ choose: { weighted } }]. */
function applyAbilityBlock(ctx: Ctx, block: any[] | undefined, idPrefix: string, from: string) {
  if (!block?.length) return;
  let alt = block[0];
  if (block.length > 1) {
    const pick = ask(ctx, {
      id: `${idPrefix}:alt`,
      type: "racealternative",
      label: "Ability score option",
      from,
      count: 1,
      options: block.map((_, i) => String(i)),
    });
    alt = block[Number(pick[0] ?? 0)] ?? block[0];
  }
  for (const [k, v] of Object.entries<any>(alt)) {
    if ((ABILITIES as string[]).includes(k) && typeof v === "number") ctx.ability[k as Ability].push({ value: v, from });
    if (k === "choose") {
      if (v.weighted) {
        (v.weighted.weights ?? []).forEach((w: number, i: number) => {
          const opts = (v.weighted.from ?? ABILITIES).map(String);
          for (const a of ask(ctx, { id: `${idPrefix}:w${i}`, type: "ability", label: `Increase one ability by ${w}`, from, count: 1, options: opts, amount: w })) {
            ctx.ability[a as Ability]?.push({ value: w, from });
          }
        });
      } else {
        const amount = v.amount ?? 1;
        const count = v.count ?? 1;
        for (const a of ask(ctx, {
          id: `${idPrefix}:choose`,
          type: "ability",
          label: `Increase ${count === 1 ? "one ability" : `${count} abilities`} by ${amount}`,
          from,
          count,
          options: (v.from ?? ABILITIES).map(String),
          amount,
        })) {
          ctx.ability[a as Ability]?.push({ value: amount, from });
        }
      }
    }
  }
}

/** A feat's structured benefits plus its card. */
function applyFeat(ctx: Ctx, feat: any, idPrefix: string, from: string) {
  ctx.feats.push(feat);
  ctx.features.push({ name: feat.name, from: `Feat (${from})`, entries: feat.entries ?? [], source: feat.source });
  applyAbilityBlock(ctx, feat.ability, `${idPrefix}:ability`, feat.name);
  const st = feat.savingThrowProficiencies?.[0];
  if (st?.choose) {
    for (const a of ask(ctx, { id: `${idPrefix}:save`, type: "save", label: "Saving throw proficiency", from: feat.name, count: 1, options: st.choose.from ?? ABILITIES })) {
      ctx.saveProf.add(a as Ability);
    }
  } else if (st) for (const a of ABILITIES) if (st[a]) ctx.saveProf.add(a);
  applyProf(ctx, readSkills(feat.skillProficiencies, L.skills), ctx.skillProf, `${idPrefix}:skills`, "skill", feat.name);
  applyProf(ctx, readLanguages(feat.languageProficiencies, L.languages), ctx.languages, `${idPrefix}:lang`, "language", feat.name);
  applyProf(ctx, readTools(feat.toolProficiencies, L.tools), ctx.tools, `${idPrefix}:tools`, "tool", feat.name);
  applyAdditionalSpells(ctx, feat.additionalSpells, `${idPrefix}:spells`, feat.name, 20);
  for (const a of readFlags(feat.armorProficiencies)) ctx.armor.add(a);
  for (const w of readFlags(feat.weaponProficiencies)) ctx.weapons.add(w);
  // "Skilled": any combination of three skills or tools (offered as skills).
  const stl = feat.skillToolLanguageProficiencies?.[0]?.choose?.[0];
  if (stl) {
    for (const a of ask(ctx, { id: `${idPrefix}:stl`, type: "skill", label: "Skill proficiencies", from: feat.name, count: stl.count ?? 1, options: Object.keys(SKILLS) })) {
      ctx.skillProf.add(a);
    }
  }
}

function applyRace(ctx: Ctx, sheetSize: { size: string; speed: Record<string, number>; senses: string[] }) {
  const ch = ctx.ch;
  if (!ch.race) return;
  const opt = ctx.rules.findRace(ch.race.key);
  if (!opt) {
    ctx.warnings.push(`Species "${ch.race.name}" isn't in the imported data.`);
    return;
  }
  const r = opt.raw;
  const from = opt.name;
  applyAbilityBlock(ctx, r.ability, "race:ability", from);
  sheetSize.size = (r.size ?? ["M"]).map((s: string) => SIZE_NAMES[s] ?? s).join(" or ");
  if (typeof r.speed === "number") sheetSize.speed.walk = r.speed;
  else if (r.speed && typeof r.speed === "object") {
    for (const [k, v] of Object.entries<any>(r.speed)) {
      if (typeof v === "number") sheetSize.speed[k] = v;
      else if (v === true) sheetSize.speed[k] = r.speed.walk ?? 30;
    }
  }
  if (r.darkvision) sheetSize.senses.push(`Darkvision ${r.darkvision} ft.`);
  if (r.blindsight) sheetSize.senses.push(`Blindsight ${r.blindsight} ft.`);
  applyProf(ctx, readSkills(r.skillProficiencies, L.skills), ctx.skillProf, "race:skills", "skill", from);
  applyProf(ctx, readLanguages(r.languageProficiencies, L.languages), ctx.languages, "race:lang", "language", from);
  applyProf(ctx, readTools(r.toolProficiencies, L.tools), ctx.tools, "race:tools", "tool", from);
  applyAdditionalSpells(ctx, r.additionalSpells, "race:spells", from, ctx.ch.classes.reduce((n, c) => n + c.level, 0) || 1);
  for (const a of readFlags(r.armorProficiencies)) ctx.armor.add(a);
  for (const w of readFlags(r.weaponProficiencies)) ctx.weapons.add(w);
  for (const x of r.resist ?? []) {
    if (typeof x === "string") ctx.resist.add(x);
    else if (x?.choose) {
      for (const a of ask(ctx, { id: "race:resist", type: "skill", label: "Damage resistance", from, count: 1, options: x.choose.from ?? [] })) ctx.resist.add(a);
    }
  }
  for (const x of r.immune ?? []) if (typeof x === "string") ctx.immune.add(x);
  // Variant Human and similar: a feat at 1st level.
  if (r.feats?.[0]?.any) {
    const pick = ask(ctx, { id: "race:feat", type: "feat", label: "Feat", from, count: 1, options: ctx.rules.feats.map(refOf) });
    const feat = pick[0] && ctx.rules.findFeat(pick[0]);
    if (feat) applyFeat(ctx, feat, "race:feat", from);
  }
  for (const e of r.entries ?? []) {
    if (e?.name && !HIDDEN_TRAITS.has(e.name)) ctx.features.push({ name: e.name, from, entries: e.entries ?? [], source: opt.subraceSource ?? opt.raceSource });
  }
}

function applyBackground(ctx: Ctx) {
  const bgRef = ctx.ch.background;
  if (!bgRef) return;
  const bg = ctx.rules.findBackground(bgRef.name, bgRef.source);
  if (!bg) {
    ctx.warnings.push(`Background "${bgRef.name}" isn't in the imported data.`);
    return;
  }
  const from = bg.name;
  applyProf(ctx, readSkills(bg.skillProficiencies, L.skills), ctx.skillProf, "bg:skills", "skill", from);
  applyProf(ctx, readLanguages(bg.languageProficiencies, L.languages), ctx.languages, "bg:lang", "language", from);
  applyProf(ctx, readTools(bg.toolProficiencies, L.tools), ctx.tools, "bg:tools", "tool", from);
  for (const e of bg.entries ?? []) {
    if (e?.name && /^Feature:/i.test(e.name)) ctx.features.push({ name: e.name.replace(/^Feature:\s*/i, ""), from: `Background: ${bg.name}`, entries: e.entries ?? [], source: bg.source });
  }
}

interface ClassState {
  cd: ClassDef;
  sub?: SubclassDef;
  level: number;
  ref: string;
  /** Feature names the character has from this class (for built-ins). */
  names: Set<string>;
  /** The subclass's additionalSpells block in use (one of several for e.g. Circle of the Land). */
  subSpells?: any;
  /** Spells the subclass teaches for free. */
  bonusKnown: string[];
}

/** Items from a level-keyed spell section: { "3": [...] } or { "1": { "_": [...] } }, up to `level`. */
function levelItems(section: any, level: number): any[] {
  const out: any[] = [];
  for (const [k, v] of Object.entries<any>(section ?? {})) {
    if (k !== "_" && Number(k) > level) continue;
    if (Array.isArray(v)) out.push(...v);
    else if (v && typeof v === "object" && Array.isArray(v._)) out.push(...v._);
  }
  return out;
}

/** Imported spells matching a 5e.tools filter like "level=0;1|class=Wizard". */
function spellsMatching(ctx: Ctx, filter: string): string[] {
  const f = parseSpellFilter(filter);
  return ctx.rules.data.index
    .entries()
    .filter((e) => e.kind === "spell" && (!f.levels.length || f.levels.includes(e.raw.level)))
    .filter((e) => !f.className || ctx.rules.spellClassesOf(e.name, e.source).some((c) => low(c.name) === low(f.className)))
    .map((e) => `${e.name}|${e.source}`);
}

/**
 * Subclass spells: pick which list if there are several (Circle of the Land,
 * Divine Soul), then the free spells it teaches ("known", with picks such as
 * Lore bards' extra Magical Secrets) and innate spells. "prepared" and
 * "expanded" are applied with the class's spellcasting.
 */
function applySubclassSpells(ctx: Ctx, state: ClassState, level: number) {
  const blocks: any[] = state.sub?.raw.additionalSpells ?? [];
  if (!blocks.length || !state.sub) return;
  let block: any = blocks[0];
  if (blocks.length > 1) {
    const labels = Object.fromEntries(blocks.map((b, i) => [String(i), b.name ?? `Option ${i + 1}`]));
    const pick = ask(ctx, {
      id: `class:${state.ref}:subspells:alt`,
      type: "racealternative",
      label: `${state.sub.shortName} spells`,
      from: `${state.sub.shortName} ${state.sub.features[0]?.level ?? ""}`.trim(),
      count: 1,
      options: Object.keys(labels),
      labels,
    });
    block = pick.length ? blocks[Number(pick[0])] : null;
  }
  state.subSpells = block;
  if (!block) return;
  let n = 0;
  for (const item of levelItems(block.known, level)) {
    if (typeof item === "string") state.bonusKnown.push(spellRef(item));
    else if (item?.choose) {
      const options = spellsMatching(ctx, String(item.choose));
      const f = parseSpellFilter(String(item.choose));
      const cantrip = f.levels.length === 1 && f.levels[0] === 0;
      for (const r of ask(ctx, {
        id: `class:${state.ref}:subspells:known:${n++}`,
        type: cantrip ? "cantrip" : "spell",
        label: cantrip ? "Bonus cantrip" : "Bonus spell",
        from: state.sub.shortName,
        count: item.count ?? 1,
        options,
      })) {
        state.bonusKnown.push(r);
      }
    }
  }
  if (block.innate) applyAdditionalSpells(ctx, [{ ability: block.ability, innate: block.innate }], `class:${state.ref}:subinnate`, state.sub.shortName, level);
}

function applyClasses(ctx: Ctx): ClassState[] {
  const out: ClassState[] = [];
  ctx.ch.classes.forEach((cl, i) => {
    const cd = ctx.rules.findClass(cl.name, cl.source);
    const ref = classRefOf(cl);
    if (!cd) {
      ctx.warnings.push(`Class "${cl.name}" (${cl.source}) isn't in the imported data.`);
      return;
    }
    const first = i === 0;
    const label = `${cd.name} ${cl.level}`;
    const state: ClassState = { cd, level: cl.level, ref, names: new Set(), bonusKnown: [] };

    // Proficiencies: full set for the starting class, the multiclass subset otherwise.
    const profs = first ? cd.raw.startingProficiencies ?? {} : cd.raw.multiclassing?.proficienciesGained ?? {};
    if (first) for (const a of cd.raw.proficiency ?? []) ctx.saveProf.add(a as Ability);
    for (const a of readFlags(profs.armorProficiencies, profs.armor)) ctx.armor.add(a);
    for (const w of readFlags(profs.weaponProficiencies, profs.weapons)) ctx.weapons.add(w);
    applyProf(ctx, readTools(profs.toolProficiencies, L.tools), ctx.tools, `class:${ref}:tools`, "tool", `${cd.name} 1`);
    if (!profs.toolProficiencies) for (const t of profs.tools ?? []) if (!/any|choose|of your choice/i.test(t)) ctx.tools.add(stripRef(t));
    applyProf(ctx, readSkills(profs.skills, L.skills), ctx.skillProf, `class:${ref}`, "skill", `${cd.name} 1`);
    const variantFeatures = (ctx.ch.choices["options:variantFeatures"] ?? [])[0] === "1";

    // Subclass.
    if (cl.level >= cd.subclassLevel && cd.subclasses.length) {
      const pick = ask(ctx, {
        id: `class:${ref}:subclass`,
        type: "subclass",
        label: cd.raw.subclassTitle ?? "Subclass",
        from: `${cd.name} ${cd.subclassLevel}`,
        count: 1,
        options: cd.subclasses.map((s) => `${s.shortName}|${s.source}`),
      });
      if (pick[0]) {
        const [sn, ss] = splitRef(pick[0]);
        state.sub = ctx.rules.findSubclass(cd, sn, ss);
      }
    }

    // Features up to this level.
    for (const f of cd.features) {
      if (f.level > cl.level) continue;
      // Optional class features (Tasha's) only when the player opts in.
      if (f.feature.isClassFeatureVariant && !variantFeatures) continue;
      state.names.add(f.name);
      for (const n of f.feature.refNames ?? []) state.names.add(n);
      if (!f.gainSubclassFeature) ctx.features.push({ name: f.name, from: `${cd.name} ${f.level}`, level: f.level, entries: f.feature.entries ?? [], source: f.feature.source });
      if (f.name === "Ability Score Improvement") {
        const id = `class:${ref}:asi:${f.level}`;
        const ans = ask(ctx, {
          id,
          type: "asi",
          label: "Ability Score Improvement or feat",
          from: `${cd.name} ${f.level}`,
          count: 2,
          options: [...ABILITIES, ...ctx.rules.feats.map((x) => `feat:${refOf(x)}`)],
        });
        if (ans[0]?.startsWith("feat:")) {
          const feat = ctx.rules.findFeat(ans[0].slice(5));
          if (feat) applyFeat(ctx, feat, id, `${cd.name} ${f.level}`);
        } else {
          for (const a of ans) if ((ABILITIES as string[]).includes(a)) ctx.ability[a as Ability].push({ value: 1, from: `ASI (${cd.name} ${f.level})` });
        }
      }
      if (f.name === "Expertise") {
        const opts = [...Object.keys(SKILLS), ...(cd.name === "Rogue" ? ["thieves' tools"] : [])];
        for (const a of ask(ctx, { id: `class:${ref}:expertise:${f.level}`, type: "expertise", label: "Expertise", from: `${cd.name} ${f.level}`, count: 2, options: opts })) {
          ctx.expertise.add(a);
        }
      }
    }
    if (state.sub) {
      for (const f of state.sub.features) {
        if (f.level > cl.level) continue;
        state.names.add(f.name);
        // Subclasses nest their features: "Battle Master" pulls in Combat Superiority, etc.
        for (const n of f.feature.refNames ?? []) state.names.add(n);
        ctx.features.push({ name: f.name, from: `${state.sub.shortName} ${f.level}`, level: f.level, entries: f.feature.entries ?? [], source: f.feature.source });
        // Proficiencies only given in the text (Hex Warrior, College of Valor…).
        const tp = textProficiencies(f.feature.entries);
        for (const a of tp.armor) ctx.armor.add(a);
        for (const w of tp.weapons) ctx.weapons.add(w);
        // Subclasses that let you pick the weapon.
        const pickWeapons = (count: number, options: string[], label: string) => {
          for (const w of ask(ctx, { id: `class:${ref}:weapon:${f.name}`, type: "weapon", label, from: `${state.sub!.shortName} ${f.level}`, count, options })) ctx.weapons.add(w);
        };
        // Feature names, including ones nested inside (the Kensei feature holds "Path of the Kensei").
        const named = [f.name, ...(f.feature.refNames ?? [])];
        if (named.some((n) => /^Training in War and Song/i.test(n))) pickWeapons(1, ONE_HANDED_MELEE, "One-handed melee weapon proficiency");
        if (named.includes("Path of the Kensei") && state.sub.shortName === "Kensei") {
          const n = 2 + [6, 11, 17].filter((l) => cl.level >= l).length;
          pickWeapons(n, KENSEI_WEAPONS, "Kensei weapons (one melee, one ranged at 3rd)");
        }
      }
      // Bonus proficiencies some subclasses grant (structured only).
      for (const a of readFlags(state.sub.raw.armorProficiencies)) ctx.armor.add(a);
      for (const w of readFlags(state.sub.raw.weaponProficiencies)) ctx.weapons.add(w);
      applySubclassSpells(ctx, state, cl.level);
    }

    // Optional features: fighting styles, invocations, maneuvers, metamagic…
    const progs = [...(cd.raw.optionalfeatureProgression ?? []), ...(state.sub?.raw.optionalfeatureProgression ?? [])];
    for (const p of progs) {
      const count = progressionAt(p.progression, cl.level);
      if (!count) continue;
      const pick = ask(ctx, {
        id: `class:${ref}:of:${p.name}`,
        type: "optionalfeature",
        label: p.name,
        from: cd.name,
        count,
        options: ctx.rules.optionalFeaturesOfType(p.featureType ?? []).map(refOf),
      });
      for (const r of pick) {
        const o = ctx.rules.findOptionalFeature(r);
        if (!o) continue;
        ctx.optFeatures.push(o);
        state.names.add(o.name);
        ctx.features.push({ name: o.name, from: p.name, entries: o.entries ?? [], source: o.source });
      }
    }
    out.push(state);
  });

  // Multiclass prerequisites (every class you have must meet its requirement once multiclassed).
  if (out.length > 1) {
    for (const s of out) {
      const req = s.cd.raw.multiclassing?.requirements;
      if (req && !meetsRequirement(req, ctx)) ctx.warnings.push(`${s.cd.name} multiclass requirement not met (${describeRequirement(req)}).`);
    }
  }
  return out;
}

function meetsRequirement(req: any, ctx: Ctx): boolean {
  const score = (a: string) => abilityScoresFrom(ctx)[a as Ability] ?? 0;
  if (req.or) return req.or.some((alt: any) => Object.entries<any>(alt).some(([a, n]) => score(a) >= n));
  return Object.entries<any>(req).every(([a, n]) => typeof n !== "number" || score(a) >= n);
}
function describeRequirement(req: any): string {
  const part = (o: any, join: string) => Object.entries<any>(o).map(([a, n]) => `${a.toUpperCase()} ${n}`).join(join);
  return req.or ? req.or.map((o: any) => part(o, " or ")).join("; ") : part(req, ", ");
}
function abilityScoresFrom(ctx: Ctx): Record<Ability, number> {
  const out = {} as Record<Ability, number>;
  for (const a of ABILITIES) out[a] = (ctx.ch.baseAbilities[a] ?? 10) + ctx.ability[a].reduce((n, b) => n + b.value, 0);
  return out;
}

// ---------- the sheet ----------

export function computeSheet(ch: Character, rules: Rules): Sheet {
  const ctx: Ctx = {
    ch, rules, choices: [], warnings: [], features: [],
    ability: { str: [], dex: [], con: [], int: [], wis: [], cha: [] },
    skillProf: new Set(), expertise: new Set(), saveProf: new Set(),
    armor: new Set(), weapons: new Set(), tools: new Set(), languages: new Set(),
    resist: new Set(), immune: new Set(), feats: [], optFeatures: [], extraSpells: [],
  };
  const body = { size: "Medium", speed: { walk: 30 } as Record<string, number>, senses: [] as string[] };

  applyRace(ctx, body);
  applyBackground(ctx);
  const classes = applyClasses(ctx);
  const totalLevel = ch.classes.reduce((n, c) => n + c.level, 0);
  const pb = proficiencyBonus(totalLevel);
  const has = (name: string) => classes.some((c) => c.names.has(name)) || ctx.features.some((f) => f.name === name);
  const hasFeat = (name: string) => ctx.feats.some((f) => f.name === name);
  const classLevel = (name: string) => classes.filter((c) => c.cd.name === name).reduce((n, c) => n + c.level, 0);
  const effects = ch.effects.filter((e) => e.active);
  const effectSum = (target: string) => effects.filter((e) => e.op === "add" && e.target === target).reduce((n, e) => n + e.value, 0);
  const effectSet = (target: string) => effects.filter((e) => e.op === "set" && e.target === target).pop()?.value;
  for (const e of effects) {
    if (e.op === "proficiency" && e.target.startsWith("skill.")) ctx.skillProf.add(e.target.slice(6));
    if (e.op === "expertise" && e.target.startsWith("skill.")) ctx.expertise.add(e.target.slice(6));
    if (e.op === "proficiency" && e.target.startsWith("save.")) ctx.saveProf.add(e.target.slice(5) as Ability);
  }

  // Items in use (equipped, and attuned where required).
  const items = ch.inventory.map((inv) => ({ inv, raw: itemData(rules, inv) }));
  const active = items.filter(({ inv, raw }) => isActive(inv, raw));
  // Items in use add their resistances, and Item Forge spells and features.
  for (const { inv, raw } of active) {
    for (const r of raw?.resist ?? []) if (typeof r === "string") ctx.resist.add(r);
    const f = inv.forge;
    if (!f) continue;
    for (const s of f.spells ?? []) ctx.extraSpells.push({ ref: s.ref, from: inv.name || raw?.name || "Item", note: s.note || "from item" });
    const itemName = inv.name || raw?.name || "Item";
    if (f.description?.trim()) ctx.features.push({ name: itemName, from: `Item: ${itemName}`, entries: f.description.split(/\n{2,}/).filter(Boolean) });
    for (const feat of f.features ?? []) {
      if (feat.name.trim()) ctx.features.push({ name: feat.name, from: `Item: ${itemName}`, entries: feat.text.split(/\n{2,}/).filter(Boolean) });
    }
  }

  // ----- ability scores
  const abilities = {} as Sheet["abilities"];
  for (const a of ABILITIES) {
    const parts: Bonus[] = [{ value: ch.baseAbilities[a] ?? 10, from: "Base" }, ...ctx.ability[a]];
    let score = parts.reduce((n, p) => n + p.value, 0);
    if (score > 20 && ctx.ability[a].some((p) => p.from.startsWith("ASI"))) score = Math.max(20, (ch.baseAbilities[a] ?? 10) + ctx.ability[a].filter((p) => !p.from.startsWith("ASI")).reduce((n, p) => n + p.value, 0));
    for (const { raw } of active) {
      const st = raw?.ability?.static?.[a];
      if (st && st > score) {
        parts.push({ value: st - score, from: raw.name });
        score = st;
      } else if (typeof raw?.ability?.[a] === "number") {
        parts.push({ value: raw.ability[a], from: raw.name });
        score += raw.ability[a];
      }
    }
    // Effects switched on (Potion of Giant Strength) set a score while they last.
    for (const fx of ch.state.active ?? []) {
      const v = fx.abilitySet?.[a];
      if (v && v > score) {
        parts.push({ value: v - score, from: fx.name });
        score = v;
      }
    }
    const add = effectSum(`ability.${a}`);
    if (add) parts.push({ value: add, from: "Effects" });
    score += add;
    const set = effectSet(`ability.${a}`);
    if (set != null) score = set;
    abilities[a] = { score, mod: abilityMod(score), parts };
  }
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, abilities[a].mod])) as Record<Ability, number>;

  // ----- saves and skills
  const itemSaveBonus = active.reduce((n, { raw }) => n + bonus(raw, "bonusSavingThrow"), 0);
  const itemCheckBonus = active.reduce((n, { raw }) => n + bonus(raw, "bonusAbilityCheck"), 0);
  const saves = {} as Sheet["saves"];
  for (const a of ABILITIES) {
    const proficient = ctx.saveProf.has(a);
    saves[a] = { proficient, mod: mods[a] + (proficient ? pb : 0) + itemSaveBonus + effectSum(`save.${a}`) + effectSum("save.all") };
  }
  const jack = has("Jack of All Trades");
  const athlete = has("Remarkable Athlete");
  const halfFor = (ab: Ability) => (jack ? Math.floor(pb / 2) : athlete && ["str", "dex", "con"].includes(ab) ? Math.ceil(pb / 2) : 0);
  const skills = {} as Sheet["skills"];
  for (const [name, ab] of Object.entries(SKILLS)) {
    const proficient = ctx.skillProf.has(name) || ctx.expertise.has(name);
    const expertise = ctx.expertise.has(name);
    const half = !proficient && halfFor(ab) > 0;
    const mod = mods[ab] + (proficient ? pb : 0) + (expertise ? pb : 0) + (half ? halfFor(ab) : 0) + itemCheckBonus + effectSum(`skill.${name}`) + effectSum("skill.all");
    skills[name] = { mod, ability: ab, proficient, expertise, half };
  }
  const passive = {
    perception: 10 + skills.perception.mod + (hasFeat("Observant") ? 5 : 0) + effectSum("passive.perception"),
    investigation: 10 + skills.investigation.mod + (hasFeat("Observant") ? 5 : 0) + effectSum("passive.investigation"),
    insight: 10 + skills.insight.mod + effectSum("passive.insight"),
  };
  const initiative = mods.dex + (hasFeat("Alert") ? 5 : 0) + halfFor("dex") + itemCheckBonus + effectSum("initiative");

  // ----- armor class
  const armorItem = active.find(({ raw }) => ["light", "medium", "heavy"].includes(armorKind(raw) ?? ""));
  const shieldItem = active.find(({ raw }) => armorKind(raw) === "shield");
  const options: { value: number; formula: string }[] = [];
  if (armorItem) {
    const kind = armorKind(armorItem.raw);
    const cap = kind === "light" ? Infinity : kind === "medium" ? (hasFeat("Medium Armor Master") ? 3 : 2) : 0;
    const dex = Math.min(mods.dex, cap);
    const base = Number(armorItem.raw.ac ?? 10) + bonus(armorItem.raw, "bonusAc");
    options.push({ value: base + dex, formula: `${armorItem.raw.name} ${base}${cap ? ` + Dex${cap !== Infinity ? ` (max ${cap})` : ""}` : ""}` });
  } else {
    options.push({ value: 10 + mods.dex, formula: "10 + Dex" });
    if (has("Unarmored Defense") && classLevel("Barbarian")) options.push({ value: 10 + mods.dex + mods.con, formula: "Unarmored Defense: 10 + Dex + Con" });
    if (has("Unarmored Defense") && classLevel("Monk") && !shieldItem) options.push({ value: 10 + mods.dex + mods.wis, formula: "Unarmored Defense: 10 + Dex + Wis" });
    if (has("Draconic Resilience")) options.push({ value: 13 + mods.dex, formula: "Draconic Resilience: 13 + Dex" });
  }
  const best = options.reduce((a, b) => (b.value > a.value ? b : a));
  let acValue = best.value;
  const acParts = [best.formula];
  if (shieldItem) {
    const s = 2 + bonus(shieldItem.raw, "bonusAc");
    acValue += s;
    acParts.push(`shield ${signed(s)}`);
  }
  if (armorItem && has("Defense")) {
    acValue += 1;
    acParts.push("Defense +1");
  }
  for (const { raw } of active) {
    if (raw === armorItem?.raw || raw === shieldItem?.raw) continue;
    const b = bonus(raw, "bonusAc");
    if (b) {
      acValue += b;
      acParts.push(`${raw.name} ${signed(b)}`);
    }
  }
  const acAdd = effectSum("ac");
  if (acAdd) {
    acValue += acAdd;
    acParts.push(`effects ${signed(acAdd)}`);
  }
  const acSet = effectSet("ac");
  if (acSet != null) {
    acValue = acSet;
    acParts.splice(0, acParts.length, "set by effect");
  }

  // ----- speed
  const speed = { ...body.speed };
  const heavy = armorItem && armorKind(armorItem.raw) === "heavy";
  if (classLevel("Barbarian") >= 5 && has("Fast Movement") && !heavy) speed.walk += 10;
  if (hasFeat("Mobile")) speed.walk += 10;
  if (armorItem && Number(armorItem.raw.strength) > abilities.str.score) speed.walk -= 10;
  speed.walk += effectSum("speed.walk");
  for (const k of ["fly", "swim", "climb", "burrow"]) {
    const add = effectSum(`speed.${k}`);
    if (add) speed[k] = (speed[k] ?? 0) + add;
  }

  // ----- class tables (Sneak Attack, Martial Arts, Rage Damage…) and spell slots
  const classTable: Sheet["classTable"] = [];
  for (const c of classes) {
    for (const g of [...(c.cd.raw.classTableGroups ?? []), ...(c.sub?.raw.subclassTableGroups ?? [])]) {
      if (g.rowsSpellProgression) continue;
      (g.colLabels ?? []).forEach((label: string, i: number) => {
        const text = plain(label);
        if (/cantrips known|spells known|spell slots|slot level|invocations known|prepared/i.test(text)) return;
        const row = g.rows?.[c.level - 1];
        if (row) classTable.push({ classRef: c.ref, label: text, value: cellText(row[i]) });
      });
    }
  }
  const unarmoredMovement = classTable.find((t) => /unarmored movement/i.test(t.label));
  if (unarmoredMovement && !armorItem && !shieldItem) speed.walk += Number(unarmoredMovement.value.replace(/[^\d]/g, "")) || 0;

  // ----- spellcasting
  const spellcasting: SpellcastingInfo[] = [];
  const casterLevels: { prog: string; level: number; c: ClassState }[] = [];
  let pact: Sheet["pact"] = null;
  const spellBonusAttack = active.reduce((n, { raw }) => n + bonus(raw, "bonusSpellAttack"), 0);
  const spellBonusDc = active.reduce((n, { raw }) => n + bonus(raw, "bonusSpellSaveDc"), 0);
  for (const c of classes) {
    const src = c.cd.raw.casterProgression ? c.cd.raw : c.sub?.raw.casterProgression ? c.sub.raw : null;
    if (!src) continue;
    const ab = (src.spellcastingAbility ?? c.cd.raw.spellcastingAbility) as Ability;
    if (!ab) continue;
    const prog = String(src.casterProgression);
    casterLevels.push({ prog, level: c.level, c });
    const cantripsMax = progressionAt(src.cantripProgression, c.level);
    const fixed = src.spellsKnownProgressionFixed;
    const knownMax = fixed ? fixed.slice(0, c.level).reduce((n: number, x: number) => n + x, 0) : progressionAt(src.spellsKnownProgression, c.level);
    const preparedMax = src.preparedSpells ? evalFormula(src.preparedSpells, c.level, mods) : 0;
    const mode: SpellcastingInfo["mode"] = fixed ? "spellbook" : src.preparedSpells ? "prepared" : "known";
    // Highest spell level from this class's own table at its level.
    let maxSpellLevel = 0;
    const table = (src.classTableGroups ?? src.subclassTableGroups ?? []).find((g: any) => g.rowsSpellProgression);
    const row = table?.rowsSpellProgression?.[c.level - 1] ?? [];
    row.forEach((n: number, i: number) => {
      if (n > 0) maxSpellLevel = i + 1;
    });
    if (prog === "pact") {
      const g = (src.classTableGroups ?? []).find((x: any) => (x.colLabels ?? []).some((l: string) => /slot level/i.test(plain(l))));
      if (g) {
        const labels = g.colLabels.map(plain);
        const r = g.rows?.[c.level - 1] ?? [];
        const slots = Number(cellText(r[labels.findIndex((l: string) => /spell slots/i.test(l))])) || 0;
        const level = parseInt(cellText(r[labels.findIndex((l: string) => /slot level/i.test(l))]), 10) || 1;
        pact = { slots, level };
        maxSpellLevel = level;
      }
    }
    // Subclass spells: always prepared, and extra spells added to the list to choose from.
    const alwaysPrepared: string[] = [];
    for (const s of levelItems(c.subSpells?.prepared, c.level)) if (typeof s === "string") alwaysPrepared.push(spellRef(s));
    const expanded = new Set<string>();
    for (const [key, list] of Object.entries<any>(c.subSpells?.expanded ?? {})) {
      // "s3" = once you can cast 3rd-level spells; "7" = at class level 7.
      const ok = key.startsWith("s") ? Number(key.slice(1)) <= maxSpellLevel : key === "_" || Number(key) <= c.level;
      if (!ok) continue;
      for (const item of Array.isArray(list) ? list : []) {
        if (typeof item === "string") expanded.add(spellRef(item));
        else if (item?.all) for (const r of spellsMatching(ctx, String(item.all))) expanded.add(r);
      }
    }
    spellcasting.push({
      classRef: c.ref,
      className: c.cd.name,
      ability: ab,
      dc: 8 + pb + mods[ab] + spellBonusDc + effectSum("spell.dc"),
      attack: pb + mods[ab] + spellBonusAttack + effectSum("spell.attack"),
      mode,
      cantripsMax,
      knownMax,
      preparedMax,
      maxSpellLevel,
      alwaysPrepared,
      bonusKnown: c.bonusKnown,
      expanded: [...expanded],
    });
  }
  let slots: number[] = [];
  const slotCasters = casterLevels.filter((x) => x.prog !== "pact");
  if (slotCasters.length === 1) {
    const { c, level } = slotCasters[0];
    const src = c.cd.raw.casterProgression && c.cd.raw.casterProgression !== "pact" ? c.cd.raw : c.sub?.raw;
    const table = [...(src?.classTableGroups ?? []), ...(src?.subclassTableGroups ?? [])].find((g: any) => g.rowsSpellProgression);
    slots = [...(table?.rowsSpellProgression?.[level - 1] ?? [])];
  } else if (slotCasters.length > 1) {
    const casterLevel = slotCasters.reduce((n, x) => {
      if (x.prog === "full") return n + x.level;
      if (x.prog === "1/2") return n + Math.floor(x.level / 2);
      if (x.prog === "1/3") return n + Math.floor(x.level / 3);
      if (x.prog === "artificer") return n + Math.ceil(x.level / 2);
      return n;
    }, 0);
    slots = casterLevel ? [...MULTICLASS_SLOTS[Math.min(casterLevel, 20) - 1]] : [];
  }
  while (slots.length && !slots[slots.length - 1]) slots.pop();

  // ----- hit points
  const conMod = mods.con;
  let hpMax = 0;
  const hitDice: Sheet["hitDice"] = [];
  classes.forEach((c, i) => {
    const faces = Number(c.cd.raw.hd?.faces ?? 8);
    hitDice.push({ classRef: c.ref, faces, total: c.level });
    const rolls = ch.hpRolls[c.ref] ?? [];
    for (let lvl = 1; lvl <= c.level; lvl++) {
      const isFirstCharacterLevel = i === 0 && lvl === 1;
      const roll = isFirstCharacterLevel ? faces : rolls[lvl - (i === 0 ? 2 : 1)] ?? Math.floor(faces / 2) + 1;
      hpMax += Math.max(1, roll + conMod);
    }
  });
  if (hasFeat("Tough")) hpMax += 2 * totalLevel;
  if (has("Dwarven Toughness")) hpMax += totalLevel;
  if (has("Draconic Resilience")) hpMax += classLevel("Sorcerer");
  hpMax += effectSum("hp.max");
  const hpSet = effectSet("hp.max");
  if (hpSet != null) hpMax = hpSet;

  // ----- attacks
  const attacks: Attack[] = [];
  const attackAdd = effectSum("attack.all");
  const damageAdd = effectSum("damage.all");
  const proficientWith = (raw: any) => {
    const cat = low(raw.weaponCategory);
    const name = low(raw.variantOf ?? raw.name);
    return ctx.weapons.has(cat) || ctx.weapons.has(name) || [...ctx.weapons].some((w) => low(w) === name || low(w) === `${name}s`);
  };
  const monkLevel = classLevel("Monk");
  // Rage (switched on from the sheet's Actions): extra damage on Strength melee attacks.
  const raging = (ch.state.active ?? []).some((x) => x.name === "Raging");
  const rageBonus = raging ? Number(String(classTable.find((t) => /rage damage/i.test(t.label))?.value ?? "+2").replace(/[^\d-]/g, "")) || 2 : 0;
  if (raging) for (const r of ["bludgeoning", "piercing", "slashing"]) ctx.resist.add(r);
  // Resistance from active effects (potions): "all" means every damage type.
  for (const fx of ch.state.active ?? []) for (const r of fx.resist ?? []) ctx.resist.add(r === "all" ? "all damage" : r);
  const martialArts = classTable.find((t) => /martial arts/i.test(t.label))?.value;
  for (const { inv, raw } of items) {
    if (!inv.equipped || !raw || !isWeapon(raw)) continue;
    const props = properties(raw);
    const ranged = isRanged(raw);
    const finesse = props.has("F");
    const monkWeapon = monkLevel > 0 && !ranged && (low(raw.name) === "shortsword" || (low(raw.weaponCategory) === "simple" && !props.has("2H") && !props.has("H")));
    let ab: Ability = ranged ? "dex" : finesse || monkWeapon ? (mods.dex > mods.str ? "dex" : "str") : "str";
    const notes: string[] = [];
    // Pact of the Blade: you're proficient with your pact weapon and it counts as magical.
    const pact = !!inv.pact && has("Pact of the Blade");
    if (pact) {
      notes.push(inv.pact === "created" ? "pact weapon (magical)" : "pact weapon (bonded)");
      // Hexblade's Hex Warrior extends to every pact weapon: Charisma instead of Strength/Dexterity.
      if (has("Hex Warrior") && mods.cha > mods[ab]) {
        ab = "cha";
        notes.push("Hex Warrior: Cha");
      }
    }
    const prof = pact || proficientWith(raw) ? pb : 0;
    let magicAtk = bonus(raw, "bonusWeapon") + bonus(raw, "bonusWeaponAttack");
    let magicDmg = bonus(raw, "bonusWeapon") + bonus(raw, "bonusWeaponDamage");
    // Improved Pact Weapon: +1 to attack and damage if the weapon isn't already a magic weapon.
    if (pact && has("Improved Pact Weapon") && !magicAtk && !magicDmg && inv.pact === "created") {
      magicAtk += 1;
      magicDmg += 1;
      notes.push("Improved Pact Weapon +1");
    }
    let toHit = mods[ab] + prof + magicAtk + attackAdd;
    let dmgMod = mods[ab] + magicDmg + damageAdd;
    if (ranged && has("Archery")) {
      toHit += 2;
      notes.push("Archery +2");
    }
    if (!ranged && has("Dueling") && !props.has("2H")) {
      dmgMod += 2;
      notes.push("Dueling +2 damage (one-handed, no other weapon)");
    }
    if (!ranged && has("Great Weapon Fighting") && (props.has("2H") || props.has("V"))) notes.push("Great Weapon Fighting: reroll 1s and 2s");
    if (raging && !ranged && ab === "str") {
      dmgMod += rageBonus;
      notes.push(`Rage +${rageBonus}`);
    }
    if (!prof) notes.push("not proficient");
    let die = raw.dmg1 ?? "1";
    if (monkWeapon && martialArts && diceAvg(martialArts) > diceAvg(die)) die = martialArts;
    if (props.has("L")) notes.push("light");
    if (props.has("T")) notes.push("thrown");
    if (props.has("R")) notes.push("reach");
    const family = weaponAmmo(raw);
    let ammo: Attack["ammo"];
    if (family) {
      const stock = items.filter((x) => x.inv.qty > 0 && ammoFamily(x.raw, x.inv.name) === family);
      const left = stock.reduce((n, x) => n + x.inv.qty * packSize(x.inv.name), 0);
      ammo = { name: ammoName(family, left), left, ids: stock.map((x) => x.inv.id) };
    }
    attacks.push({
      ammo,
      name: inv.name || raw.name,
      toHit,
      damage: dmg(die, dmgMod),
      damageType: DAMAGE_TYPES[raw.dmgType] ?? raw.dmgType ?? "",
      versatile: props.has("V") && raw.dmg2 ? dmg(raw.dmg2, dmgMod) : undefined,
      extraDamage: raw._forge?.extraDamage?.filter((x: any) => /\d/.test(x.dice)),
      range: raw.range ? `${raw.range} ft.` : props.has("R") ? "10 ft." : "5 ft.",
      notes,
    });
  }
  // Unarmed strike: everyone has one; monks use Martial Arts.
  const unarmedAb: Ability = monkLevel && mods.dex > mods.str ? "dex" : "str";
  attacks.push({
    name: "Unarmed Strike",
    toHit: mods[unarmedAb] + pb + attackAdd,
    damage: monkLevel && martialArts ? dmg(martialArts, mods[unarmedAb] + damageAdd) : String(Math.max(1, 1 + mods.str + damageAdd)),
    damageType: "bludgeoning",
    range: "5 ft.",
    notes: [],
  });
  const attacksPerAction = has("Extra Attack (3)") ? 4 : has("Extra Attack (2)") ? 3 : has("Extra Attack") || has("Thirsting Blade") ? 2 : 1;

  // ----- resources with uses
  const resources: Resource[] = [];
  const res = (id: string, name: string, max: number, recharge: Resource["recharge"], from: string) => {
    if (max > 0) resources.push({ id, name, max, used: Math.min(ch.state.resourcesUsed[id] ?? 0, max), recharge, from });
  };
  const tableNum = (label: RegExp) => Number(classTable.find((t) => label.test(t.label))?.value) || 0;
  // At 20th level rages are "Unlimited": nothing to track.
  if (classLevel("Barbarian") && has("Rage")) res("rage", "Rage", tableNum(/^rages$/i), "long", "Barbarian");
  if (has("Ki")) res("ki", "Ki points", tableNum(/ki points/i), "short", "Monk");
  if (has("Font of Magic")) res("sorcery", "Sorcery points", tableNum(/sorcery points/i), "long", "Sorcerer");
  if (has("Bardic Inspiration")) res("bardic", "Bardic Inspiration", Math.max(1, mods.cha), has("Font of Inspiration") ? "short" : "long", "Bard");
  if (has("Channel Divinity")) {
    const n = classLevel("Cleric") ? tableNum(/channel divinity/i) || (classLevel("Cleric") >= 18 ? 3 : classLevel("Cleric") >= 6 ? 2 : 1) : 1;
    res("channel", "Channel Divinity", n, "short", classLevel("Cleric") ? "Cleric" : "Paladin");
  }
  if (has("Second Wind")) res("secondwind", "Second Wind", 1, "short", "Fighter");
  if (has("Hexblade's Curse")) res("hexcurse", "Hexblade's Curse", 1, "short", "Hexblade");
  if (has("Action Surge")) res("actionsurge", "Action Surge", classLevel("Fighter") >= 17 ? 2 : 1, "short", "Fighter");
  if (has("Indomitable")) res("indomitable", "Indomitable", classLevel("Fighter") >= 17 ? 3 : classLevel("Fighter") >= 13 ? 2 : 1, "long", "Fighter");
  if (has("Wild Shape")) res("wildshape", "Wild Shape", 2, "short", "Druid");
  if (has("Arcane Recovery")) res("arcanerecovery", "Arcane Recovery", 1, "long", "Wizard");
  if (has("Lay on Hands")) res("layonhands", "Lay on Hands (HP pool)", 5 * classLevel("Paladin"), "long", "Paladin");
  if (has("Divine Sense")) res("divinesense", "Divine Sense", 1 + Math.max(0, mods.cha), "long", "Paladin");
  if (has("Combat Superiority")) {
    const fl = classLevel("Fighter");
    res("superiority", "Superiority dice", fl >= 15 ? 6 : fl >= 7 ? 5 : 4, "short", "Battle Master");
  }
  for (const e of effects) if (e.op === "set" && e.target.startsWith("resource.")) res(e.target.slice(9), e.label, e.value, "long", "Custom");

  return {
    totalLevel,
    timeline: buildTimeline(ctx, classes),
    proficiencyBonus: pb,
    abilities,
    saves,
    skills,
    passive,
    initiative,
    ac: { value: acValue, formula: acParts.join(", ") },
    hp: { max: Math.max(totalLevel ? 1 : 0, hpMax) },
    hitDice,
    speed,
    size: body.size,
    senses: body.senses,
    resistances: [...ctx.resist],
    immunities: [...ctx.immune],
    proficiencies: {
      armor: [...ctx.armor],
      weapons: [...ctx.weapons],
      tools: [...new Set([...ctx.tools, ...[...ctx.expertise].filter((e) => !(e in SKILLS))])],
      languages: [...ctx.languages],
    },
    attacks,
    attacksPerAction,
    spellcasting,
    extraSpells: ctx.extraSpells,
    slots,
    pact,
    resources,
    features: ctx.features,
    featureNames: [...new Set([...classes.flatMap((c) => [...c.names]), ...ctx.features.map((f) => f.name)])],
    classTable,
    choices: ctx.choices,
    warnings: ctx.warnings,
  };
}

// ---------- level-by-level timeline (Features tab) ----------

const ABILITY_SHORT: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const cap1 = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** "class:Fighter|PHB:asi:4" → which class level a choice belongs to, if it says. */
function choiceLevel(id: string, classRef: string, subclassLevel: number): number | null {
  const p = `class:${classRef}:`;
  if (!id.startsWith(p)) return null;
  const rest = id.slice(p.length);
  const m = rest.match(/^(?:asi|expertise):(\d+)/);
  if (m) return Number(m[1]);
  if (rest.startsWith("subclass") || rest.startsWith("subspells") || rest.startsWith("subinnate")) return subclassLevel;
  if (rest.startsWith("of:")) return null; // optional features: handled per level from the progression
  return 1; // starting skills and tools
}

function buildTimeline(ctx: Ctx, classes: ClassState[]): Sheet["timeline"] {
  const ch = ctx.ch;
  const order = levelOrder(ch);
  const byRef = new Map(classes.map((c) => [c.ref, c]));
  const choice = (id: string) => ctx.choices.find((c) => c.id === id);
  const pending = (c?: Choice) => !!c && c.answer.length < c.count;
  const used = new Set<string>();
  const variantFeatures = (ch.choices["options:variantFeatures"] ?? [])[0] === "1";
  const levels: Sheet["timeline"] = [];
  const counts = new Map<string, number>();

  order.forEach((ref, i) => {
    const c = byRef.get(ref);
    const classLevel = (counts.get(ref) ?? 0) + 1;
    counts.set(ref, classLevel);
    const items: TimelineItem[] = [];
    const [cName] = ref.split("|");
    if (!c) {
      levels.push({ level: i + 1, classRef: ref, className: cName, classLevel, items });
      return;
    }

    // Character level 1: species and background.
    if (i === 0) {
      if (ch.race) {
        const opt = ctx.rules.findRace(ch.race.key);
        const traits = (opt?.raw.entries ?? []).filter((e: any) => e?.name && !HIDDEN_TRAITS.has(e.name)).map((e: any) => e.name);
        items.push({ type: "species", name: ch.race.name, link: { kind: "race", name: ch.race.key, source: opt?.subraceSource ?? opt?.raceSource ?? "" }, detail: traits.join(", ") });
      } else items.push({ type: "species", name: "Species", pending: true, detail: "not chosen" });
      if (ch.background) {
        items.push({ type: "background", name: ch.background.name, link: { kind: "background", name: ch.background.name, source: ch.background.source } });
      } else items.push({ type: "background", name: "Background", pending: true, detail: "not chosen" });
      // Species and background picks (skills, languages, ability scores, a feat…).
      for (const x of ctx.choices) {
        if (!x.id.startsWith("race:") && !x.id.startsWith("bg:")) continue;
        used.add(x.id);
        if (x.id === "race:feat" && x.answer[0]) {
          const [n, s] = splitRef(x.answer[0]);
          items.push({ type: "feat", name: n, link: { kind: "feat", name: n, source: s }, detail: `from ${x.from}`, choiceId: x.id });
        } else items.push(choiceItem(x));
      }
    }

    // Class features gained at this class level.
    for (const f of c.cd.features) {
      if (f.level !== classLevel) continue;
      if (f.feature.isClassFeatureVariant && !variantFeatures) continue;
      if (f.gainSubclassFeature) {
        // The level where the subclass is chosen, or a level that gives subclass features.
        if (classLevel === c.cd.subclassLevel) {
          const id = `class:${ref}:subclass`;
          used.add(id);
          const sc = choice(id);
          if (c.sub) items.push({ type: "subclass", name: c.sub.name, link: { kind: "subclass", name: `${c.sub.shortName}|${c.sub.source}|${c.cd.name}|${c.cd.source}`, source: c.sub.source }, detail: c.cd.raw.subclassTitle, choiceId: id });
          else items.push({ type: "subclass", name: c.cd.raw.subclassTitle ?? "Subclass", pending: true, detail: "choose your subclass", choiceId: sc ? id : undefined });
        }
        continue;
      }
      if (f.name === "Ability Score Improvement") {
        const id = `class:${ref}:asi:${f.level}`;
        used.add(id);
        const a = choice(id);
        const ans = a?.answer ?? [];
        if (ans[0]?.startsWith("feat:")) {
          const [n, s] = splitRef(ans[0].slice(5));
          const subPending = ctx.choices.some((x) => x.id.startsWith(`${id}:`) && pending(x));
          for (const x of ctx.choices) if (x.id.startsWith(`${id}:`)) used.add(x.id);
          items.push({ type: "feat", name: n, link: { kind: "feat", name: n, source: s }, detail: subPending ? "instead of an ASI · finish the feat's choices" : "instead of an ASI", choiceId: id, pending: subPending });
        } else if (ans.length) {
          const tally: Record<string, number> = {};
          for (const ab of ans) tally[ab] = (tally[ab] ?? 0) + 1;
          items.push({
            type: "asi",
            name: "Ability Score Improvement",
            detail: Object.entries(tally).map(([ab, n]) => `${ABILITY_SHORT[ab] ?? ab} +${n}`).join(", ") + (ans.length < 2 ? " · one more point to spend" : ""),
            choiceId: id,
            pending: ans.length < 2,
          });
        } else items.push({ type: "asi", name: "Ability Score Improvement", detail: "choose +2 / +1 +1, or a feat", choiceId: id, pending: true });
        continue;
      }
      items.push({
        type: "feature",
        name: f.name,
        link: { kind: "classFeature", name: `${f.name}|${c.cd.name}|${c.cd.source}|${f.level}|${f.feature.source ?? c.cd.source}`, source: f.feature.source ?? c.cd.source },
      });
    }

    // Subclass features gained at this class level. A subclass's first entry is
    // usually an intro ("The Hexblade") that nests the real features: list those.
    if (c.sub) {
      for (const f of c.sub.features) {
        if (f.level !== classLevel) continue;
        const nested: { kind: string; uid: string; name: string }[] = (f.feature.refs ?? []).filter((r: any) => r.kind === "subclassFeature");
        const isIntro = nested.length > 0 && (f.name === c.sub.name || f.name === c.sub.shortName || f.level === c.cd.subclassLevel);
        if (!isIntro) {
          items.push({
            type: "subclassFeature",
            name: f.name,
            link: {
              kind: "subclassFeature",
              name: `${f.name}|${c.cd.name}|${c.cd.source}|${c.sub.shortName}|${c.sub.source}|${f.level}|${f.feature.source ?? c.sub.source}`,
              source: f.feature.source ?? c.sub.source,
            },
            detail: c.sub.shortName,
          });
        }
        for (const r of nested) {
          const src = r.uid.split("|")[6] || c.sub.source;
          items.push({ type: "subclassFeature", name: r.name, link: { kind: "subclassFeature", name: r.uid, source: src }, detail: c.sub.shortName });
        }
      }
    }

    // New picks from option progressions (fighting style, invocations, maneuvers, metamagic…).
    const progs = [...(c.cd.raw.optionalfeatureProgression ?? []), ...(c.sub?.raw.optionalfeatureProgression ?? [])];
    for (const p of progs) {
      const now = progressionAt(p.progression, classLevel);
      const before = progressionAt(p.progression, classLevel - 1);
      if (now <= before) continue;
      const id = `class:${ref}:of:${p.name}`;
      used.add(id);
      const ans = choice(id)?.answer ?? [];
      const picked = ans.slice(before, now);
      for (const r of picked) {
        const [n, s] = splitRef(r);
        items.push({ type: "option", name: n, link: { kind: "optfeature", name: n, source: s }, detail: p.name, choiceId: id });
      }
      const missing = now - before - picked.length;
      if (missing > 0) items.push({ type: "option", name: p.name, detail: `choose ${missing} more`, choiceId: id, pending: true });
    }

    // Any other choice tied to this class level (starting skills, expertise, subclass spells…).
    for (const x of ctx.choices) {
      if (used.has(x.id)) continue;
      if (choiceLevel(x.id, ref, c.cd.subclassLevel) === classLevel) {
        used.add(x.id);
        items.push(choiceItem(x));
      }
    }
    levels.push({ level: i + 1, classRef: ref, className: c.cd.name || cName, classLevel, items });
  });

  // Anything not placed (rare): show it at level 1 so no choice is hidden.
  if (levels.length) for (const x of ctx.choices) if (!used.has(x.id)) levels[0].items.push(choiceItem(x));
  return levels;
}

/** A generic choice as a timeline row: "Skill proficiencies: athletics, survival". */
function choiceItem(x: Choice): TimelineItem {
  const shown = x.answer.map((a) => (x.labels?.[a] ? x.labels[a] : a.includes("|") ? a.split("|")[0] : ABILITY_SHORT[a] ?? cap1(a)));
  return {
    type: "choice",
    name: x.label,
    detail: shown.length ? shown.join(", ") + (x.answer.length < x.count ? ` · ${x.count - x.answer.length} more` : "") : `choose ${x.count}`,
    choiceId: x.id,
    pending: x.answer.length < x.count,
  };
}

/** "fireball" / "fireball|xge" / "hex#c" → "Fireball|PHB" style ref (title-cased name). */
export function spellRef(s: string): string {
  const [name, source] = String(s).replace(/#.*$/, "").split("|");
  const title = name.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Of|The|And|To|From|With|In|On)\b/g, (w) => w.toLowerCase());
  return `${title}|${(source || "PHB").toUpperCase()}`;
}

function diceAvg(expr: string): number {
  const m = String(expr).match(/(\d+)d(\d+)/);
  return m ? (Number(m[1]) * (Number(m[2]) + 1)) / 2 : Number(expr) || 0;
}

export { ABILITY_NAMES };
