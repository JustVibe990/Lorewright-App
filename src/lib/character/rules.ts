// Character-builder rules: classes with resolved features, species options
// (race + subrace merged), backgrounds, optional features, feats, spell lists
// and items, built from the cached 5e.tools files. 2014 ("classic") rules only.

import type { DataStore } from "../data.ts";
import { resolveCopy } from "../render.ts";
import type { Entry } from "../types.ts";

/** Sources from the 2024 rules; their content is hidden from the 2014 builder. */
const SOURCES_2024 = new Set(["XPHB", "XDMG", "XMM", "EFA"]);
export const isClassic = (x: any) => x && x.edition !== "one" && !SOURCES_2024.has(String(x.source ?? "").toUpperCase());

const low = (s: unknown) => String(s ?? "").toLowerCase();
export const refOf = (x: { name: string; source: string }) => `${x.name}|${x.source}`;

/** Link kinds that the character rules (not the notes data) answer for. */
export const RULE_LINK_KINDS = new Set(["class", "classFeature", "subclassFeature", "subclass", "optfeature", "race", "background"]);

const OPTION_TYPES: Record<string, string> = {
  EI: "Eldritch Invocation", "MV:B": "Maneuver", MM: "Metamagic", "FS:F": "Fighting Style", "FS:R": "Fighting Style", "FS:P": "Fighting Style", "FS:B": "Fighting Style",
  PB: "Pact Boon", AI: "Artificer Infusion", AS: "Arcane Shot", RN: "Rune", ED: "Elemental Discipline", OTH: "Option",
};
const optionLabel = (types: string[] | undefined) => OPTION_TYPES[types?.[0] ?? ""] ?? "Class option";
/** "Name|SOURCE" → [name, source], with a default source. */
export function splitRef(ref: string, defaultSource = "PHB"): [string, string] {
  const [n = "", s = ""] = String(ref).split("|");
  return [n.trim(), (s.trim() || defaultSource).toUpperCase()];
}

export interface ClassFeatureRef {
  level: number;
  name: string;
  /** Resolved 5e.tools feature object (entries with refs expanded). */
  feature: any;
  /** This level grants subclass features (e.g. "Martial Archetype feature"). */
  gainSubclassFeature: boolean;
}

export interface SubclassDef {
  name: string;
  shortName: string;
  source: string;
  raw: any;
  features: { level: number; name: string; feature: any }[];
}

export interface ClassDef {
  name: string;
  source: string;
  raw: any;
  features: ClassFeatureRef[];
  subclasses: SubclassDef[];
  /** Level at which the subclass is chosen. */
  subclassLevel: number;
}

export interface RaceOption {
  /** Stable id: "Elf|PHB|High|PHB" or "Tiefling|PHB". */
  key: string;
  /** Display name: "Elf (High)". */
  name: string;
  raceName: string;
  raceSource: string;
  subrace?: string;
  subraceSource?: string;
  /** Race and subrace merged. */
  raw: any;
}

export interface RawRules {
  class?: any[];
  race?: any[];
  background?: any[];
  optionalfeature?: any[];
  spellsource?: any[];
  magicvariant?: any[];
}

export class Rules {
  readonly classes: ClassDef[] = [];
  readonly races: RaceOption[] = [];
  readonly backgrounds: any[] = [];
  readonly optionalFeatures: any[] = [];
  readonly magicVariants: any[] = [];
  readonly feats: any[] = [];
  readonly hasData: boolean;
  private spellClasses = new Map<string, { name: string; source: string }[]>();
  private classFeatures = new Map<string, any>();
  private subclassFeatures = new Map<string, any>();
  private optFeatureMap = new Map<string, any>();

  constructor(raw: RawRules, readonly data: DataStore) {
    this.hasData = !!raw.class?.length;
    // ----- optional features (needed to expand refs in class features)
    for (const file of raw.optionalfeature ?? []) {
      for (const o of file.optionalfeature ?? []) {
        if (!isClassic(o)) continue;
        this.optionalFeatures.push(o);
        this.optFeatureMap.set(low(refOf(o)), o);
      }
    }
    // ----- classes
    const classRaws: any[] = [];
    const subRaws: any[] = [];
    for (const file of raw.class ?? []) {
      classRaws.push(...(file.class ?? []));
      subRaws.push(...(file.subclass ?? []));
      for (const f of file.classFeature ?? []) {
        this.classFeatures.set(low(`${f.name}|${f.className}|${f.classSource}|${f.level}|${f.source}`), f);
      }
      for (const f of file.subclassFeature ?? []) {
        this.subclassFeatures.set(
          low(`${f.name}|${f.className}|${f.classSource}|${f.subclassShortName}|${f.subclassSource}|${f.level}|${f.source}`),
          f,
        );
      }
    }
    for (const c of classRaws) {
      if (!isClassic(c) || c.isSidekick || /sidekick/i.test(c.name)) continue;
      const features: ClassFeatureRef[] = (c.classFeatures ?? []).map((cf: any) => {
        const uid = typeof cf === "string" ? cf : cf.classFeature;
        const f = this.classFeatureByUid(uid, c.source);
        return {
          level: f?.level ?? Number(String(uid).split("|")[3]) ?? 1,
          name: f?.name ?? String(uid).split("|")[0],
          feature: f ? this.expand(f) : { name: String(uid).split("|")[0], entries: [] },
          gainSubclassFeature: typeof cf === "object" && !!cf.gainSubclassFeature,
        };
      });
      const subclasses: SubclassDef[] = subRaws
        .filter((s) => s.className === c.name && low(s.classSource) === low(c.source) && isClassic(s) && !s._copy)
        .map((s) => ({
          name: s.name,
          shortName: s.shortName ?? s.name,
          source: s.source,
          raw: s,
          features: (s.subclassFeatures ?? []).map((uid: string) => {
            const f = this.subclassFeatureByUid(uid, c.source);
            return {
              level: f?.level ?? Number(uid.split("|")[5]) ?? 1,
              name: f?.name ?? uid.split("|")[0],
              feature: f ? this.expand(f) : { name: uid.split("|")[0], entries: [] },
            };
          }),
        }));
      const subclassLevel = features.find((f) => f.gainSubclassFeature)?.level ?? 3;
      this.classes.push({ name: c.name, source: c.source, raw: c, features, subclasses, subclassLevel });
    }
    this.classes.sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));

    // ----- species
    const raceList: any[] = [];
    const subList: any[] = [];
    for (const file of raw.race ?? []) {
      raceList.push(...(file.race ?? []));
      subList.push(...(file.subrace ?? []));
    }
    const findRace = (n: string, s: string) => raceList.find((r) => low(r.name) === low(n) && low(r.source) === low(s));
    for (const r0 of raceList) {
      if (!isClassic(r0)) continue;
      const r = resolveCopy(r0, findRace);
      const subs = subList.filter((s) => low(s.raceName) === low(r.name) && low(s.raceSource) === low(r.source) && isClassic(s));
      if (!subs.length) {
        this.races.push({ key: `${r.name}|${r.source}`, name: r.name, raceName: r.name, raceSource: r.source, raw: r });
        continue;
      }
      for (const s of subs) {
        const merged = mergeSubrace(r, s);
        this.races.push({
          key: `${r.name}|${r.source}|${s.name ?? ""}|${s.source ?? r.source}`,
          name: s.name ? `${r.name} (${s.name})` : r.name,
          raceName: r.name,
          raceSource: r.source,
          subrace: s.name,
          subraceSource: s.source,
          raw: merged,
        });
      }
    }
    this.races.sort((a, b) => a.name.localeCompare(b.name) || a.raceSource.localeCompare(b.raceSource));

    // ----- backgrounds
    const bgList: any[] = (raw.background ?? []).flatMap((f) => f.background ?? []);
    const findBg = (n: string, s: string) => bgList.find((b) => low(b.name) === low(n) && low(b.source) === low(s));
    for (const b of bgList) if (isClassic(b)) this.backgrounds.push(resolveCopy(b, findBg));
    this.backgrounds.sort((a, b) => a.name.localeCompare(b.name));

    // ----- spell class lists: { SOURCE: { SpellName: { class: [...], classVariant: [...] } } }
    // `class` is the list the spell's own book gives; `classVariant` is a class
    // added by another book (every Xanathar's spell, Tasha's expanded lists).
    for (const file of raw.spellsource ?? []) {
      for (const [src, bySpell] of Object.entries<any>(file ?? {})) {
        for (const [spell, info] of Object.entries<any>(bySpell ?? {})) {
          const all = [...(info?.class ?? []), ...(info?.classVariant ?? [])];
          const seen = new Set<string>();
          this.spellClasses.set(
            low(`${spell}|${src}`),
            all.filter((c) => {
              const k = low(`${c.name}|${c.source}`);
              return !seen.has(k) && !!seen.add(k);
            }),
          );
        }
      }
    }

    for (const file of raw.magicvariant ?? []) for (const v of file.magicvariant ?? []) if (isClassic(v)) this.magicVariants.push(v);

    for (const e of data.index.entries()) if (e.kind === "feat" && isClassic(e.raw)) this.feats.push(e.raw);
    this.feats.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---------- lookups ----------

  findClass(name: string, source: string): ClassDef | undefined {
    return this.classes.find((c) => low(c.name) === low(name) && low(c.source) === low(source));
  }

  findSubclass(cls: ClassDef, shortName: string, source: string): SubclassDef | undefined {
    return cls.subclasses.find((s) => low(s.shortName) === low(shortName) && low(s.source) === low(source));
  }

  findRace(key: string): RaceOption | undefined {
    return this.races.find((r) => low(r.key) === low(key));
  }

  findBackground(name: string, source: string): any | undefined {
    return this.backgrounds.find((b) => low(b.name) === low(name) && low(b.source) === low(source));
  }

  findOptionalFeature(ref: string): any | undefined {
    const [n, s] = splitRef(ref);
    return this.optFeatureMap.get(low(`${n}|${s}`));
  }

  findFeat(ref: string): any | undefined {
    const [n, s] = splitRef(ref);
    return this.feats.find((f) => low(f.name) === low(n) && low(f.source) === low(s));
  }

  findSpell(ref: string): Entry | undefined {
    const [n, s] = splitRef(ref);
    return this.data.find("spell", n, s);
  }

  findItem(ref: string): any | undefined {
    const [n, s] = splitRef(ref, "PHB");
    const e = this.data.find("item", n, s) ?? this.data.index.entries().find((x) => x.kind === "item" && low(x.name) === low(n));
    return e ? resolveCopy(e.raw, (name, source) => this.data.find("item", name, source)?.raw) : undefined;
  }

  /** Optional features of a type ("EI", "FS:F", "MV:B"…). */
  optionalFeaturesOfType(types: string[]): any[] {
    const want = new Set(types.map((t) => t.toUpperCase()));
    return this.optionalFeatures.filter((o) => (o.featureType ?? []).some((t: string) => want.has(String(t).toUpperCase())));
  }

  /** Spells on a class's list that are in the imported spell data. */
  classSpells(className: string, classSource: string): Entry[] {
    const out: Entry[] = [];
    for (const e of this.data.index.entries()) {
      if (e.kind !== "spell") continue;
      const classes = this.spellClasses.get(low(`${e.name}|${e.source}`)) ?? [];
      if (classes.some((c) => low(c.name) === low(className) && low(c.source) === low(classSource))) out.push(e);
    }
    return out.sort((a, b) => (a.raw.level ?? 0) - (b.raw.level ?? 0) || a.name.localeCompare(b.name));
  }

  spellClassesOf(name: string, source: string) {
    return this.spellClasses.get(low(`${name}|${source}`)) ?? [];
  }

  /**
   * A card for a rules link on the character sheet (class feature, subclass,
   * class option, species, background), shaped like any other entry so the
   * existing hover cards and pins can show it.
   */
  linkEntry(a: { kind: string; name: string; source: string }): Entry | undefined {
    const make = (name: string, source: string, raw: any): Entry => ({ kind: a.kind as Entry["kind"], name, source, page: raw?.page, raw: { ...raw, entries: raw?.entries ?? [] } });
    switch (a.kind) {
      case "class": {
        const cls = this.findClass(a.name, a.source);
        if (!cls) return undefined;
        const r = cls.raw;
        const hd = r.hd ? `d${r.hd.faces}` : "";
        const profs = r.startingProficiencies ?? {};
        const flat = (xs: any[] | undefined) => (xs ?? []).map((x) => (typeof x === "string" ? x.replace(/\{@\w+ ([^|}]+)[^}]*\}/g, "$1") : "")).filter(Boolean).join(", ");
        const summary = [
          hd && `{@b Hit Die:} ${hd}`,
          r.proficiency?.length && `{@b Saving throws:} ${r.proficiency.map((p: string) => p.toUpperCase()).join(", ")}`,
          flat(profs.armor) && `{@b Armor:} ${flat(profs.armor)}`,
          flat(profs.weapons) && `{@b Weapons:} ${flat(profs.weapons)}`,
        ].filter(Boolean);
        // Every class feature by level, then the subclasses to choose from.
        const entries: any[] = [
          ...(summary.length ? [{ type: "list", style: "list-no-bullets", items: summary }] : []),
          ...cls.features.filter((f) => !f.gainSubclassFeature || f.feature?.entries?.length).map((f) => ({ type: "entries", name: `Level ${f.level}: ${f.name}`, entries: f.feature?.entries ?? [] })),
        ];
        if (cls.subclasses.length) {
          entries.push({
            type: "entries",
            name: `Subclasses (level ${cls.subclassLevel})`,
            entries: [{ type: "list", items: cls.subclasses.map((s) => `${s.name} (${s.source})`) }],
          });
        }
        return make(cls.name, cls.source, { ...r, entries });
      }
      case "classFeature": {
        const f = this.classFeatureByUid(a.name, "PHB");
        return f ? make(f.name, f.source, this.expand(f)) : undefined;
      }
      case "subclassFeature": {
        const f = this.subclassFeatureByUid(a.name, "PHB");
        return f ? make(f.name, f.source, this.expand(f)) : undefined;
      }
      case "subclass": {
        const [short, source, className, classSource] = a.name.split("|");
        const cls = this.findClass(className, classSource);
        const sub = cls && this.findSubclass(cls, short, source);
        if (!sub) return undefined;
        // The whole subclass: every feature, by level.
        const entries = sub.features.map((f) => ({ type: "entries", name: `Level ${f.level}: ${f.name}`, entries: f.feature.entries ?? [] }));
        return make(sub.name, sub.source, { ...sub.raw, entries });
      }
      case "optfeature": {
        const o = this.findOptionalFeature(`${a.name}|${a.source}`);
        return o ? make(o.name, o.source, o) : undefined;
      }
      case "race": {
        const r = this.findRace(a.name);
        return r ? make(r.name, r.subraceSource ?? r.raceSource, r.raw) : undefined;
      }
      case "background": {
        const b = this.findBackground(a.name, a.source);
        return b ? make(b.name, b.source, b) : undefined;
      }
    }
    return undefined;
  }

  /**
   * Rules you can look up from quick search, like a compendium: classes,
   * subclasses, species, backgrounds and class options (invocations,
   * maneuvers, fighting styles…). Each opens with linkEntry.
   */
  compendium(): { kind: string; name: string; source: string; label: string; hint: string }[] {
    const out: { kind: string; name: string; source: string; label: string; hint: string }[] = [];
    for (const c of this.classes) {
      out.push({ kind: "class", name: c.name, source: c.source, label: c.name, hint: `Class · ${c.source}` });
      for (const s of c.subclasses) {
        out.push({ kind: "subclass", name: `${s.shortName}|${s.source}|${c.name}|${c.source}`, source: s.source, label: s.name, hint: `${c.name} subclass · ${s.source}` });
      }
    }
    for (const r of this.races) out.push({ kind: "race", name: r.key, source: r.subraceSource ?? r.raceSource, label: r.name, hint: `Species · ${r.subraceSource ?? r.raceSource}` });
    for (const b of this.backgrounds) out.push({ kind: "background", name: b.name, source: b.source, label: b.name, hint: `Background · ${b.source}` });
    for (const o of this.optionalFeatures) out.push({ kind: "optfeature", name: o.name, source: o.source, label: o.name, hint: `${optionLabel(o.featureType)} · ${o.source}` });
    return out;
  }

  // ---------- feature resolution ----------

  private classFeatureByUid(uid: string, defaultClassSource: string): any {
    const [name, className, classSource, level, source] = String(uid).split("|");
    const cs = classSource || "PHB";
    return this.classFeatures.get(low(`${name}|${className}|${cs}|${level}|${source || cs}`)) ??
      this.classFeatures.get(low(`${name}|${className}|${defaultClassSource}|${level}|${source || defaultClassSource}`));
  }

  private subclassFeatureByUid(uid: string, defaultClassSource: string): any {
    const [name, className, classSource, scShort, scSource, level, source] = String(uid).split("|");
    const cs = classSource || defaultClassSource || "PHB";
    const ss = scSource || "PHB";
    return this.subclassFeatures.get(low(`${name}|${className}|${cs}|${scShort}|${ss}|${level}|${source || ss}`));
  }

  /**
   * Replace refClassFeature / refSubclassFeature entries with their content
   * (refOptionalfeature too, except inside "options" lists, which are menus of
   * choices rather than things the character has). `refNames` lists the
   * features that were pulled in, e.g. Battle Master → Combat Superiority.
   */
  expand(feature: any, depth = 0): any {
    if (depth > 6) return feature;
    const refNames: string[] = [];
    /** Nested features with their full uids, so each can be its own link. */
    const refs: { kind: "classFeature" | "subclassFeature"; uid: string; name: string }[] = [];
    const walk = (x: any, inOptions = false): any => {
      if (Array.isArray(x)) return x.map((y) => walk(y, inOptions));
      if (!x || typeof x !== "object") return x;
      if (x.type === "refClassFeature") {
        const f = this.classFeatureByUid(x.classFeature, "PHB");
        if (!f) return null;
        const inner = this.expand(f, depth + 1);
        refNames.push(f.name, ...(inner.refNames ?? []));
        refs.push({ kind: "classFeature", uid: `${f.name}|${f.className}|${f.classSource}|${f.level}|${f.source}`, name: f.name }, ...(inner.refs ?? []));
        return { type: "entries", name: f.name, entries: inner.entries };
      }
      if (x.type === "refSubclassFeature") {
        const f = this.subclassFeatureByUid(x.subclassFeature, "PHB");
        if (!f) return null;
        const inner = this.expand(f, depth + 1);
        refNames.push(f.name, ...(inner.refNames ?? []));
        refs.push(
          { kind: "subclassFeature", uid: `${f.name}|${f.className}|${f.classSource}|${f.subclassShortName}|${f.subclassSource}|${f.level}|${f.source}`, name: f.name },
          ...(inner.refs ?? []),
        );
        return { type: "entries", name: f.name, entries: inner.entries };
      }
      if (x.type === "refOptionalfeature") {
        const o = this.findOptionalFeature(x.optionalfeature);
        if (o && !inOptions) refNames.push(o.name);
        return o ? { type: "entries", name: o.name, entries: o.entries } : null;
      }
      const out: any = {};
      for (const [k, v] of Object.entries(x)) out[k] = walk(v, inOptions || x.type === "options");
      return out;
    };
    const entries = walk(feature.entries ?? []);
    return { ...feature, entries: Array.isArray(entries) ? entries.filter((e: any) => e != null) : entries, refNames, refs };
  }
}

/** Merge a subrace onto its race (5e.tools convention: subrace adds to or overwrites race fields). */
export function mergeSubrace(race: any, sub: any): any {
  const out: any = { ...race };
  const overwrite = sub.overwrite ?? {};
  const mergeOne = (a: any, b: any) => {
    // Arrays of alternatives: usually one alternative each; merge their contents.
    if (!a?.length) return b;
    if (!b?.length) return a;
    if (a.length === 1 && b.length === 1) {
      const m: any = { ...a[0] };
      for (const [k, v] of Object.entries<any>(b[0])) m[k] = typeof v === "number" && typeof m[k] === "number" ? m[k] + v : v;
      return [m];
    }
    return b;
  };
  for (const key of ["ability", "skillProficiencies", "languageProficiencies", "toolProficiencies", "weaponProficiencies", "armorProficiencies", "resist", "immune", "conditionImmune", "additionalSpells", "feats", "skillToolLanguageProficiencies"]) {
    if (sub[key] === undefined) continue;
    out[key] = overwrite[key] ? sub[key] : mergeOne(race[key], sub[key]);
  }
  for (const key of ["speed", "darkvision", "size", "heightAndWeight", "age"]) if (sub[key] !== undefined) out[key] = sub[key];
  // Entries: subrace traits are added; one with data.overwrite replaces the race trait of that name.
  const entries = [...(race.entries ?? [])];
  for (const e of sub.entries ?? []) {
    const target = e?.data?.overwrite;
    const i = target ? entries.findIndex((x: any) => x?.name === target) : -1;
    if (i >= 0) entries[i] = e;
    else entries.push(e);
  }
  out.entries = entries;
  out.name = sub.name ? `${race.name} (${sub.name})` : race.name;
  return out;
}
