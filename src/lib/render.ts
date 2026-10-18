// Render 5e.tools entry JSON as card HTML.
// Covers the common shapes (strings, entries, lists, tables, insets) and the
// inline tags you see inside rules text. Unknown shapes fall back to their text.

import type { Entry } from "./types.ts";
import { TAG_TO_KIND, defaultSource } from "./tags.ts";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const SCHOOLS: Record<string, string> = {
  A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment",
  V: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation",
};
const SIZES: Record<string, string> = {
  T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan",
};
const RARITY_SKIP = new Set(["none", "unknown", "unknown (magic)"]);
const ABILITIES: Record<string, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};
const DISPLAY_FIRST = new Set(["book", "adventure", "filter", "quickref", "footnote", "note", "link", "5etools", "homebrew"]);

function dice(expr: string, label = expr): string {
  return `<span class="roll" data-roll="${esc(expr)}">${esc(label)}</span>`;
}

/** Split a tag body on "|", ignoring pipes inside nested {@tags}. */
function splitTop(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    if (ch === "|" && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** Render one inline tag, e.g. {@damage 2d6} or {@spell fireball}. */
function renderTag(name: string, body: string): string {
  const parts = splitTop(body);
  const first = parts[0] ?? "";
  switch (name) {
    case "b": case "bold": return `<b>${renderText(body)}</b>`;
    case "i": case "italic": return `<i>${renderText(body)}</i>`;
    case "damage": case "dice": return dice(first, parts[1] || first);
    case "hit": {
      const n = Number(first);
      return dice(`1d20${n >= 0 ? "+" : ""}${n}`, `${n >= 0 ? "+" : ""}${n}`);
    }
    case "d20": {
      const n = Number(first);
      return dice(`1d20${n >= 0 ? "+" : ""}${n}`, `${n >= 0 ? "+" : ""}${n}`);
    }
    case "dc": return `DC ${esc(first)}`;
    case "h": return "<i>Hit:</i> ";
    case "atk": case "atkr": {
      const m: Record<string, string> = {
        mw: "Melee Weapon Attack:", rw: "Ranged Weapon Attack:",
        "mw,rw": "Melee or Ranged Weapon Attack:", ms: "Melee Spell Attack:",
        rs: "Ranged Spell Attack:", "ms,rs": "Melee or Ranged Spell Attack:",
        m: "Melee Attack Roll:", r: "Ranged Attack Roll:", "m,r": "Melee or Ranged Attack Roll:",
      };
      return `<i>${m[first] ?? "Attack:"}</i>`;
    }
    case "recharge": return `(Recharge ${esc(first || "6")}${first && first !== "6" ? "–6" : ""})`;
    case "chance": return `${esc(first)} percent`;
    case "scaledamage": case "scaledice": return dice(parts[2] ?? first, parts[2] ?? first);
    // 2024 (XMM) statblock wording.
    case "actSave": return `<i>${esc(ABILITIES[first] ?? first)} Saving Throw:</i>`;
    case "actSaveFail": return `<i>${first ? `Failure by ${esc(first)} or More:` : "Failure:"}</i>`;
    case "actSaveSuccess": return "<i>Success:</i>";
    case "actSaveSuccessOrFail": return "<i>Failure or Success:</i>";
    case "actTrigger": return "<i>Trigger:</i>";
    case "actResponse": return "<i>Response:</i>";
    case "hitYourSpellAttack": return esc(first || "your spell attack modifier");
  }
  const kind = TAG_TO_KIND[name];
  // Most tags are name|source|display; these put the display text first.
  const display = DISPLAY_FIRST.has(name) ? first : parts[2] || first;
  if (kind) {
    return `<span class="lk lk-${kind}" data-5e="${kind}" data-name="${esc(first)}" data-source="${esc(
      parts[1] || defaultSource(kind),
    )}">${esc(display)}</span>`;
  }
  // Any other tag (skill, sense, note, book, filter...): show its text, which may hold more tags.
  return renderText(display);
}

/** Render a string containing {@tags}. Handles nested tags. */
export function renderText(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf("{@", i);
    if (start === -1) {
      out += esc(s.slice(i));
      break;
    }
    out += esc(s.slice(i, start));
    // Find the matching close brace, allowing nesting.
    let depth = 0;
    let j = start;
    for (; j < s.length; j++) {
      if (s[j] === "{") depth++;
      else if (s[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const inner = s.slice(start + 2, j);
    const space = inner.indexOf(" ");
    const tag = space === -1 ? inner : inner.slice(0, space);
    const body = space === -1 ? "" : inner.slice(space + 1);
    out += renderTag(tag, body);
    i = j + 1;
  }
  return out;
}

/** A table cell: a string, a number, a roll range ({type:"cell", roll}), or any entry. */
function renderCell(c: any): string {
  if (typeof c === "string") return renderText(c);
  if (typeof c === "number") return esc(c);
  if (c?.roll) {
    const r = c.roll;
    return esc(r.exact != null ? r.exact : `${r.min}${r.max != null && r.max !== r.min ? "–" + r.max : ""}`);
  }
  if (c?.entry != null) return typeof c.entry === "string" ? renderText(c.entry) : renderEntries(c.entry).replace(/^<p>|<\/p>$/g, "");
  if (c && typeof c === "object") return renderEntries(c).replace(/^<p>|<\/p>$/g, "");
  return "";
}

export function renderEntries(entries: any, depth = 0): string {
  if (entries == null) return "";
  if (typeof entries === "string") return `<p>${renderText(entries)}</p>`;
  if (Array.isArray(entries)) return entries.map((e) => renderEntries(e, depth)).join("");
  if (typeof entries !== "object") return `<p>${esc(entries)}</p>`;

  const e = entries;
  switch (e.type) {
    case "entries":
    case "section":
    case "inset":
    case "insetReadaloud":
    case "variant":
    case "variantSub": {
      // Names can hold tags too: "Acid Breath {@recharge 5}".
      const title = e.name ? `<b><i>${renderText(e.name)}.</i></b> ` : "";
      const body = renderEntries(e.entries, depth + 1);
      const cls = e.type.startsWith("inset") || e.type.startsWith("variant") ? "inset" : "";
      // Put the title inline with the first paragraph, like the books do.
      return `<div class="${cls}">${body.replace(/^<p>/, `<p>${title}`) || title}</div>`;
    }
    case "list":
      return `<ul>${(e.items ?? [])
        .map((it: any) => `<li>${renderEntries(it, depth + 1).replace(/^<p>|<\/p>$/g, "")}</li>`)
        .join("")}</ul>`;
    case "item":
    case "itemSub":
      return `<p><b><i>${renderText(e.name ?? "")}</i></b> ${
        e.entry ? renderText(e.entry) : renderEntries(e.entries, depth + 1).replace(/^<p>|<\/p>$/g, "")
      }</p>`;
    case "table": {
      const head = (e.colLabels ?? []).map((c: string) => `<th>${renderText(c)}</th>`).join("");
      const rows = (e.rows ?? [])
        .map(
          (r: any) =>
            `<tr>${(Array.isArray(r) ? r : r.row ?? [])
              .map((c: any) => `<td>${renderCell(c)}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      return `<table>${e.caption ? `<caption>${esc(e.caption)}</caption>` : ""}${head ? `<tr>${head}</tr>` : ""}${rows}</table>`;
    }
    case "quote":
      return `<blockquote>${renderEntries(e.entries, depth + 1)}</blockquote>`;
    default:
      if (e.entries) return renderEntries(e.entries, depth + 1);
      if (e.entry) return renderEntries(e.entry, depth + 1);
      if (e.name) return `<p>${renderText(e.name)}</p>`;
      return "";
  }
}

// ---------- headers per kind ----------

function spellMeta(s: any): string {
  const lvl = s.level === 0 ? `${SCHOOLS[s.school] ?? s.school} cantrip` : `Level ${s.level} ${SCHOOLS[s.school] ?? s.school}`;
  // HTML: reaction conditions can hold tags ("…an {@variantrule Unarmed Strike|XPHB}").
  const time = (s.time ?? [])
    .map((t: any) => `${esc(t.number)} ${esc(t.unit)}${t.condition ? `, ${renderText(t.condition)}` : ""}`)
    .join(" or ");
  let range = "";
  const r = s.range;
  if (r) {
    if (r.type === "special") range = "Special";
    else if (r.distance?.type === "self") range = "Self";
    else if (r.distance?.type === "touch") range = "Touch";
    else if (r.distance?.type === "sight") range = "Sight";
    else if (r.distance?.type === "unlimited") range = "Unlimited";
    else if (r.distance) range = `${r.distance.amount ?? ""} ${r.distance.type}`;
    if (["cone", "line", "radius", "sphere", "cube", "emanation"].includes(r.type))
      range = `Self (${r.distance?.amount} ${r.distance?.type} ${r.type})`;
  }
  const c = s.components ?? {};
  const comps = [c.v && "V", c.s && "S", c.m && `M (${typeof c.m === "string" ? c.m : c.m.text ?? ""})`]
    .filter(Boolean)
    .join(", ");
  const dur = (s.duration ?? [])
    .map((d: any) => {
      if (d.type === "instant") return "Instantaneous";
      if (d.type === "permanent") return "Until dispelled";
      if (d.type === "special") return "Special";
      if (d.type === "timed")
        return `${d.concentration ? "Concentration, up to " : ""}${d.duration?.amount} ${d.duration?.type}${d.duration?.amount > 1 ? "s" : ""}`;
      return d.type;
    })
    .join(" or ");
  return (
    `<div class="sub">${esc(lvl)}${s.meta?.ritual ? " (ritual)" : ""}</div>` +
    `<dl><dt>Casting time</dt><dd>${time}</dd><dt>Range</dt><dd>${esc(range)}</dd>` +
    `<dt>Components</dt><dd>${esc(comps)}</dd><dt>Duration</dt><dd>${esc(dur)}</dd></dl>`
  );
}

function crText(cr: any): string {
  return typeof cr === "object" && cr ? cr.cr : cr ?? "—";
}
function mod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return `${m >= 0 ? "+" : ""}${m}`;
}

/**
 * "30 ft., fly 60 ft. (hover)". Handles plain numbers, {number, condition},
 * `choose` ({from: ["fly","swim"], amount}) and skips `alternate` (form-specific speeds).
 */
export function speedText(speed: any): string {
  if (typeof speed === "number") return `${speed} ft.`;
  if (!speed || typeof speed !== "object") return "";
  const out: string[] = [];
  const plain = (s: string) => renderText(s).replace(/<[^>]+>/g, "");
  for (const [k, v] of Object.entries<any>(speed)) {
    if (k === "canHover" || k === "alternate" || k === "hidden") continue;
    if (k === "choose") {
      if (v?.from?.length) out.push(`${v.from.join(" or ")} ${v.amount} ft.${v.note ? ` ${plain(v.note)}` : ""}`);
      continue;
    }
    const label = k === "walk" ? "" : `${k} `;
    if (typeof v === "number") out.push(`${label}${v} ft.`);
    else if (v === true) out.push(`${label}equal to your walking speed`);
    else if (v && typeof v === "object" && v.number != null) out.push(`${label}${v.number} ft.${v.condition ? ` ${plain(v.condition)}` : ""}`);
  }
  if (speed.canHover && !out.some((s) => s.includes("hover"))) {
    const i = out.findIndex((s) => s.startsWith("fly "));
    if (i >= 0) out[i] += " (hover)";
  }
  return out.join(", ");
}

function creatureMeta(m: any): string {
  const size = (m.size ?? []).map((x: string) => SIZES[x] ?? x).join(" or ");
  const baseType = typeof m.type === "string" ? m.type : m.type?.type?.choose?.join("/") ?? m.type?.type ?? "";
  const typeTags = typeof m.type === "object" && m.type?.tags?.length
    ? ` (${m.type.tags.map((t: any) => (typeof t === "string" ? t : t.tag)).join(", ")})`
    : "";
  const type = baseType + typeTags;
  const plain = (s: string) => renderText(s).replace(/<[^>]+>/g, "");
  const ac = (m.ac ?? [])
    .map((a: any) => {
      if (typeof a === "number") return a;
      if (a.special) return plain(a.special);
      return `${a.ac}${a.from ? ` (${a.from.map(plain).join(", ")})` : ""}${a.condition ? ` ${plain(a.condition)}` : ""}`;
    })
    .join(", ");
  const hp = m.hp?.average != null ? `${m.hp.average} (${dice(m.hp.formula)})` : esc(m.hp?.special ?? "");
  const speed = speedText(m.speed);
  const stats = ["str", "dex", "con", "int", "wis", "cha"]
    .map((k) => `<div><span>${k.toUpperCase()}</span>${m[k] ?? "—"} ${m[k] != null ? `(${dice(`1d20${mod(m[k])}`, mod(m[k]))})` : ""}</div>`)
    .join("");
  return (
    `<div class="sub">${esc(size)} ${esc(type)} · CR ${esc(crText(m.cr))}</div>` +
    `<div class="stats3"><div><span>AC</span>${esc(ac)}</div><div><span>HP</span>${hp}</div><div><span>Speed</span>${esc(speed)}</div></div>` +
    `<div class="abil">${stats}</div>`
  );
}

/** A monster's spellcasting block (at will / per day / spell slots) as an entries object. */
function spellcastingEntry(sc: any): any {
  const lines: string[] = [];
  const list = (spells: string[]) => spells.join(", ");
  if (sc.will?.length) lines.push(`At will: ${list(sc.will)}`);
  for (const [k, spells] of Object.entries<any>(sc.daily ?? {})) {
    lines.push(`${k.replace("e", "")}/day${k.endsWith("e") ? " each" : ""}: ${list(spells)}`);
  }
  for (const [lvl, v] of Object.entries<any>(sc.spells ?? {})) {
    const label = lvl === "0" ? "Cantrips (at will)" : `Level ${lvl}${v.slots ? ` (${v.slots} slot${v.slots > 1 ? "s" : ""})` : ""}`;
    lines.push(`${label}: ${list(v.spells ?? [])}`);
  }
  return {
    type: "entries",
    name: sc.name,
    entries: [...(sc.headerEntries ?? []), ...(lines.length ? [{ type: "list", items: lines }] : []), ...(sc.footerEntries ?? [])],
  };
}

function creatureBody(m: any): string {
  const named = (a: any) => renderEntries({ type: "entries", name: a.name, entries: a.entries });
  const casting = (where: string) =>
    (m.spellcasting ?? []).filter((s: any) => (s.displayAs ?? "trait") === where).map(spellcastingEntry);
  const block = (title: string, list: any[] | undefined, extra: any[] = []) => {
    const all = [...(list ?? []), ...extra];
    return all.length ? `<h4>${title}</h4>${all.map(named).join("")}` : "";
  };
  return (
    [...(m.trait ?? []), ...casting("trait")].map(named).join("") +
    block("Actions", m.action, casting("action")) +
    block("Bonus actions", m.bonus, casting("bonus")) +
    block("Reactions", m.reaction, casting("reaction")) +
    block("Legendary actions", m.legendary)
  );
}

const ITEM_TYPES: Record<string, string> = {
  W: "Wondrous item", A: "Ammunition", AF: "Ammunition", HA: "Heavy armor", LA: "Light armor",
  MA: "Medium armor", S: "Shield", M: "Melee weapon", R: "Ranged weapon", P: "Potion",
  RD: "Rod", RG: "Ring", SC: "Scroll", WD: "Wand", G: "Adventuring gear", INS: "Instrument",
  AT: "Artisan's tools", T: "Tools", GS: "Gaming set", SCF: "Spellcasting focus", TAH: "Tack and harness",
  TG: "Trade good", MNT: "Mount", VEH: "Vehicle (land)", SHP: "Vehicle (water)", AIR: "Vehicle (air)",
  SPC: "Vehicle (space)", FD: "Food and drink", EXP: "Explosive", OTH: "Other", $A: "Art object",
  $G: "Gemstone", $C: "Coinage", TB: "Trade bar",
};
const DAMAGE_TYPES: Record<string, string> = {
  A: "acid", B: "bludgeoning", C: "cold", F: "fire", O: "force", L: "lightning", N: "necrotic",
  P: "piercing", I: "poison", Y: "psychic", R: "radiant", S: "slashing", T: "thunder",
};

function itemMeta(it: any): string {
  const code = it.type ? String(it.type).split("|")[0] : "";
  const bits = [
    code ? esc(ITEM_TYPES[code] ?? code) : it.wondrous ? "Wondrous item" : "",
    it.rarity && !RARITY_SKIP.has(it.rarity) ? esc(it.rarity) : "",
    // Attunement text can hold tags ("by a creature that has proficiency in the {@skill Arcana} skill").
    it.reqAttune ? `requires attunement${typeof it.reqAttune === "string" ? " " + renderText(it.reqAttune) : ""}` : "",
  ].filter(Boolean);
  const extra = [
    it.ac != null ? `AC ${it.ac}` : "",
    it.dmg1 ? `Damage ${it.dmg1}${it.dmgType ? " " + (DAMAGE_TYPES[it.dmgType] ?? it.dmgType) : ""}` : "",
    it.weight ? `${it.weight} lb.` : "",
  ].filter(Boolean);
  return `<div class="sub">${bits.join(", ")}</div>${extra.length ? `<div class="sub">${esc(extra.join(" · "))}</div>` : ""}`;
}

/**
 * Merge a "_copy" entry onto its base, so reprinted monsters/items render fully.
 * The override's own fields win; `_copy._mod` edits (append/replace/remove
 * array items, text replacement) are applied to the merged result.
 */
export function resolveCopy(raw: any, lookup: (name: string, source: string) => any | undefined, depth = 0): any {
  if (!raw?._copy || depth > 5) return raw;
  const found = lookup(raw._copy.name, raw._copy.source);
  if (!found) return raw;
  const base = resolveCopy(found, lookup, depth + 1);
  const { _copy, ...rest } = raw;
  const merged = { ...base, ...rest };
  delete merged._copy;
  return _copy._mod ? applyMods(merged, _copy._mod, merged.name) : merged;
}

function fillTemplate(s: string, name: string): string {
  return String(s ?? "")
    .replace(/\{=name\/l\}/g, name.toLowerCase())
    .replace(/\{=name\/a\}/g, /^[aeiou]/i.test(name) ? "an" : "a")
    .replace(/\{=name(\/[a-z]+)?\}/g, name);
}

function replaceTxtDeep(value: any, re: RegExp, withText: string): any {
  if (typeof value === "string") return value.replace(re, withText);
  if (Array.isArray(value)) return value.map((v) => replaceTxtDeep(v, re, withText));
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = k === "name" || k === "source" || k === "type" ? v : replaceTxtDeep(v, re, withText);
    }
    return out;
  }
  return value;
}

const nameOf = (x: any) => (typeof x === "string" ? x : x?.name);

function applyMods(obj: any, mods: Record<string, any>, name: string): any {
  let out = { ...obj };
  for (const [prop, opsRaw] of Object.entries(mods)) {
    for (const op of [opsRaw].flat()) {
      if (op === "remove") {
        delete out[prop];
        continue;
      }
      if (!op || typeof op !== "object") continue;
      const items = op.items == null ? [] : [op.items].flat();
      const arr: any[] = Array.isArray(out[prop]) ? [...out[prop]] : [];
      switch (op.mode) {
        case "appendArr":
          out[prop] = [...arr, ...items];
          break;
        case "prependArr":
          out[prop] = [...items, ...arr];
          break;
        case "insertArr":
          arr.splice(op.index ?? arr.length, 0, ...items);
          out[prop] = arr;
          break;
        case "replaceArr": {
          const target = typeof op.replace === "object" ? op.replace?.index : op.replace;
          const i = typeof target === "number" ? target : arr.findIndex((x) => nameOf(x) === target);
          if (i >= 0) arr.splice(i, 1, ...items);
          out[prop] = arr;
          break;
        }
        case "removeArr": {
          const names = [op.names ?? op.items].flat().map(nameOf);
          out[prop] = arr.filter((x) => !names.includes(nameOf(x)));
          break;
        }
        case "replaceTxt": {
          let re: RegExp;
          try {
            re = new RegExp(op.replace, `g${(op.flags ?? "").replace(/g/g, "")}`);
          } catch {
            break;
          }
          const withText = fillTemplate(op.with ?? "", name);
          out = prop === "*" ? replaceTxtDeep(out, re, withText) : { ...out, [prop]: replaceTxtDeep(out[prop], re, withText) };
          break;
        }
      }
    }
  }
  return out;
}

/** Full card HTML for an entry. */
export function renderCard(entry: Entry, lookup?: (name: string, source: string) => any): string {
  const raw = lookup ? resolveCopy(entry.raw, lookup) : entry.raw;
  let meta = "";
  let body = "";
  switch (entry.kind) {
    case "spell":
      meta = spellMeta(raw);
      body = renderEntries(raw.entries) + (raw.entriesHigherLevel ? renderEntries(raw.entriesHigherLevel) : "");
      break;
    case "creature":
      meta = creatureMeta(raw);
      body = creatureBody(raw);
      break;
    case "item":
      meta = itemMeta(raw);
      body = renderEntries(raw.entries);
      break;
    case "feat":
      meta = `<div class="sub">Feat${raw.category ? ` · ${esc(raw.category)}` : ""}</div>`;
      body = renderEntries(raw.entries);
      break;
    default:
      body = renderEntries(raw.entries);
  }
  return (
    `<div class="card-head"><span class="card-name lk-${entry.kind}">${esc(entry.name)}</span>` +
    `<span class="card-src">${esc(entry.source)}${entry.page ? ` p${entry.page}` : ""}</span></div>` +
    meta +
    `<div class="card-body">${body || "<p><i>No text in this entry.</i></p>"}</div>`
  );
}

/**
 * 5e.tools page for an entry, for Ctrl+click "open in browser".
 * Returns "" when the user hasn't set a URL (there is no built-in default).
 */
export function entryUrl(baseUrl: string, kind: string, name: string, source: string): string {
  const pages: Record<string, string> = {
    spell: "spells.html", creature: "bestiary.html", item: "items.html",
    condition: "conditionsdiseases.html", feat: "feats.html",
  };
  const base = (baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) return "";
  const h = (n: string, s: string) => `${encodeURIComponent(n.toLowerCase())}_${encodeURIComponent(s.toLowerCase())}`;
  // Character-sheet links: their name carries the 5e.tools uid.
  switch (kind) {
    case "classFeature": {
      const [, className, classSource] = name.split("|");
      return `${base}/classes.html#${h(className, classSource || "PHB")}`;
    }
    case "subclassFeature": {
      const [, className, classSource] = name.split("|");
      return `${base}/classes.html#${h(className, classSource || "PHB")}`;
    }
    case "subclass": {
      const [, , className, classSource] = name.split("|");
      return `${base}/classes.html#${h(className, classSource || "PHB")}`;
    }
    case "optfeature":
      return `${base}/optionalfeatures.html#${h(name, source)}`;
    case "race": {
      // Key "Elf|PHB|High|PHB" → 5e.tools hash "elf (high)_phb".
      const [race, raceSource, sub, subSource] = name.split("|");
      return `${base}/races.html#${h(sub ? `${race} (${sub})` : race, sub ? subSource || raceSource : raceSource)}`;
    }
    case "background":
      return `${base}/backgrounds.html#${h(name, source)}`;
  }
  return `${base}/${pages[kind] ?? "index.html"}#${h(name, source)}`;
}
