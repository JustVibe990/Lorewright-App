// A tiny stand-in for a 5e.tools site, for developing and testing the importer
// without the network. It serves the bundled SRD entries in 5e.tools' file
// layout under fake source codes (PHB/XPHB, MM/XMM).
//
//   node scripts/mock-5etools.mjs [port]      (default 5055)
//   GET /__bump   changes spells-xphb.json, so "Check for updates" reports a change
//   GET /__break  makes bestiary-xmm.json return 500 until bumped again

import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 5055);
const srd = JSON.parse(readFileSync(new URL("../src/data/srd.json", import.meta.url), "utf8"));
const as = (list, source) => list.map((e) => ({ ...e, source, page: 1 }));
let version = 1;
let broken = false;

const files = () => ({
  "/data/spells/index.json": { PHB: "spells-phb.json", XPHB: "spells-xphb.json" },
  "/data/spells/spells-phb.json": { spell: as(srd.spell, "PHB") },
  "/data/spells/spells-xphb.json": {
    spell: as(srd.spell, "XPHB").map((s) => (s.name === "Fireball" ? { ...s, entries: [...s.entries, `Revision ${version}.`] } : s)),
  },
  "/data/bestiary/index.json": { MM: "bestiary-mm.json", XMM: "bestiary-xmm.json" },
  "/data/bestiary/bestiary-mm.json": {
    monster: [
      ...as(srd.monster, "MM"),
      { name: "Goblin Boss", source: "MM", _copy: { name: "Goblin", source: "MM", _mod: { "*": { mode: "replaceTxt", replace: "the goblin", with: "the {=name/l}", flags: "i" } } }, cr: "1" },
    ],
  },
  "/data/bestiary/bestiary-xmm.json": broken ? null : { monster: as(srd.monster, "XMM") },
  "/data/items.json": { item: [...as(srd.item, "DMG"), ...as(srd.item, "XDMG")] },
  "/data/items-base.json": { baseitem: [{ name: "Shield", source: "PHB", type: "S", ac: 2, weight: 6, entries: ["A shield."] }] },
  "/data/conditionsdiseases.json": { condition: [...as(srd.condition, "PHB"), ...as(srd.condition, "XPHB")], disease: [] },
  "/data/feats.json": { feat: as(srd.feat, "PHB") },
});

createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (path === "/__bump") {
    version++;
    broken = false;
    res.end(`version ${version}\n`);
    return;
  }
  if (path === "/__break") {
    broken = true;
    res.end("bestiary-xmm.json now fails\n");
    return;
  }
  const all = files();
  if (path in all && all[path] === null) {
    res.statusCode = 500;
    res.end("broken on purpose");
    return;
  }
  if (!(path in all)) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(all[path]));
}).listen(port, () => console.log(`mock 5e.tools on http://localhost:${port}`));
