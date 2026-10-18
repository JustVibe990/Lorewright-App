// Roll treasure for one creature or a hoard, by challenge rating, with magic
// items drawn from the imported (and homebrew) items. Then hand coins and
// items straight to the characters' sheets. Every roll is kept.

import { useMemo, useState } from "react";
import { uid } from "../../lib/combat.ts";
import { listCharacters, saveCharacter } from "../../lib/character/storage.ts";
import type { InventoryItem } from "../../lib/character/types.ts";
import { coinsText, crNumber, LOOT_BANDS, magicItemPool, rollLoot, splitCoins, type Coins, type LootItem, type LootKind, type LootRoll } from "../../lib/dm.ts";
import { play } from "../../lib/sfx.ts";
import SearchSelect from "../character/SearchSelect.tsx";
import type { DmChildProps } from "./DmView.tsx";

const BAND_CR = [2, 7, 13, 18];

export default function Treasure({ dm, change, data, characters, campaign, onCharactersSaved }: DmChildProps) {
  const [cr, setCr] = useState(2);
  const [kind, setKind] = useState<LootKind>("hoard");
  const [error, setError] = useState("");
  const pool = useMemo(() => magicItemPool(data.index.entries().filter((e) => e.kind === "item")), [data]);
  const allItems = useMemo(
    () =>
      data.index
        .entries()
        .filter((e) => e.kind === "item")
        .map((e) => ({ value: `${e.name}|${e.source}`, label: e.name, hint: `${e.raw.rarity && e.raw.rarity !== "none" ? e.raw.rarity : "mundane"} · ${e.source}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data],
  );
  // The toughest monster in each planned encounter, for a quick pick.
  const fromEncounters = dm.encounters
    .filter((e) => e.monsters.length)
    .map((e) => ({ name: e.name, cr: Math.max(...e.monsters.map((m) => crNumber(m.cr))) }));

  const doRoll = () => {
    const r = rollLoot(cr, kind, pool);
    const loot: LootRoll = { id: uid(), at: new Date().toISOString(), ...r };
    change((d) => ({ ...d, loot: [loot, ...d.loot] }));
    play("dice");
  };
  const setLoot = (id: string, fn: (l: LootRoll) => LootRoll) => change((d) => ({ ...d, loot: d.loot.map((l) => (l.id === id ? fn(l) : l)) }));

  /** Change characters' files: add coins and items. */
  const give = async (edits: { file: string; coins?: Coins; items?: LootItem[] }[]) => {
    setError("");
    try {
      const files = await listCharacters(campaign);
      for (const ed of edits) {
        const cf = files.find((x) => x.file === ed.file);
        if (!cf) continue;
        const c = cf.character;
        const currency = { ...c.currency };
        if (ed.coins) for (const k of Object.keys(ed.coins) as (keyof Coins)[]) currency[k] += ed.coins[k];
        const added: InventoryItem[] = (ed.items ?? []).map((it) => ({
          id: uid(),
          ref: it.ref,
          name: it.value ? `${it.name} (${it.value} gp)` : it.name,
          qty: 1,
          equipped: false,
          attuned: false,
          notes: it.value ? `Worth ${it.value} gp` : undefined,
        }));
        await saveCharacter(campaign, { ...c, currency, inventory: [...c.inventory, ...added] }, cf.file);
      }
      onCharactersSaved();
      return true;
    } catch (e) {
      setError(`Couldn't give it: ${(e as Error)?.message ?? e}`);
      return false;
    }
  };
  const charName = (file?: string) => (file === "split" ? "split between the party" : characters.find((c) => c.file === file)?.character.name ?? "someone");

  return (
    <div className="dm-treasure">
      <section className="dm-card">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <select value={kind} onChange={(e) => setKind(e.target.value as LootKind)} aria-label="Kind of treasure">
            <option value="hoard">Treasure hoard</option>
            <option value="individual">One creature's pockets</option>
          </select>
          <label className="row small">
            Challenge rating
            <input className="hp-roll" type="number" min={0} max={30} value={cr} onChange={(e) => setCr(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} />
          </label>
          <span className="row small">
            {LOOT_BANDS.map((b, i) => (
              <button key={b.label} className="ghost small" onClick={() => setCr(BAND_CR[i])}>
                {b.label}
              </button>
            ))}
          </span>
          {fromEncounters.length > 0 && (
            <select value="" onChange={(e) => e.target.value !== "" && setCr(Number(e.target.value))} aria-label="Use an encounter's CR">
              <option value="">CR from an encounter…</option>
              {fromEncounters.map((e) => (
                <option key={e.name} value={e.cr}>
                  {e.name} (CR {e.cr})
                </option>
              ))}
            </select>
          )}
          <button className="primary" onClick={doRoll}>
            🎲 Roll treasure
          </button>
        </div>
        <p className="small muted">
          Lorewright's own treasure tables, scaled by challenge rating. Magic items are picked by rarity from your {pool.length.toLocaleString()} imported and homebrew magic items. Change anything before handing it out.
        </p>
      </section>
      {error && <p className="error small">{error}</p>}

      {dm.loot.map((l) => (
        <section key={l.id} className="dm-card loot">
          <div className="row">
            <b className="grow">{l.label}</b>
            <span className="small muted">{new Date(l.at).toLocaleString()}</span>
            <button className="ghost small" aria-label="Delete this treasure" onClick={() => change((d) => ({ ...d, loot: d.loot.filter((x) => x.id !== l.id) }))}>
              ✕
            </button>
          </div>
          <div className="row small" style={{ flexWrap: "wrap" }}>
            <span className="grow">
              <b>Coins:</b> {coinsText(l.coins)}
            </span>
            {l.coinsGiven ? (
              <span className="ok">Given ({charName(l.coinsGiven)})</span>
            ) : (
              characters.length > 0 &&
              coinsText(l.coins) !== "no coins" && (
                <select
                  value=""
                  aria-label="Give the coins"
                  onChange={async (e) => {
                    const to = e.target.value;
                    if (!to) return;
                    const edits =
                      to === "split"
                        ? splitCoins(l.coins, characters.length).map((coins, i) => ({ file: characters[i].file, coins }))
                        : [{ file: to, coins: l.coins }];
                    if (await give(edits)) setLoot(l.id, (x) => ({ ...x, coinsGiven: to }));
                  }}
                >
                  <option value="">Give coins to…</option>
                  <option value="split">Split between everyone ({characters.length})</option>
                  {characters.map((c) => (
                    <option key={c.file} value={c.file}>
                      {c.character.name}
                    </option>
                  ))}
                </select>
              )
            )}
          </div>
          {l.items.length > 0 && (
            <table className="inv-table">
              <tbody>
                {l.items.map((it, i) => {
                  const [name, source] = (it.ref ?? "").split("|");
                  return (
                    <tr key={i}>
                      <td>
                        {it.ref ? (
                          <span className="lk lk-item" data-5e="item" data-name={name} data-source={source}>
                            {it.name}
                          </span>
                        ) : (
                          it.name
                        )}
                        <span className="small muted">{it.value ? ` · ${it.value.toLocaleString()} gp` : it.rarity ? ` · ${it.rarity}` : ""}</span>
                      </td>
                      <td className="cell-actions small">
                        {it.givenTo ? (
                          <span className="ok">→ {charName(it.givenTo)}</span>
                        ) : (
                          characters.length > 0 && (
                            <select
                              value=""
                              aria-label={`Give ${it.name}`}
                              onChange={async (e) => {
                                const to = e.target.value;
                                if (to && (await give([{ file: to, items: [it] }]))) setLoot(l.id, (x) => ({ ...x, items: x.items.map((y, j) => (j === i ? { ...y, givenTo: to } : y)) }));
                              }}
                            >
                              <option value="">Give to…</option>
                              {characters.map((c) => (
                                <option key={c.file} value={c.file}>
                                  {c.character.name}
                                </option>
                              ))}
                            </select>
                          )
                        )}{" "}
                        <button className="ghost small" aria-label={`Remove ${it.name}`} onClick={() => setLoot(l.id, (x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div style={{ maxWidth: 360, marginTop: 4 }}>
            <SearchSelect
              options={allItems}
              placeholder="Add an item to this treasure"
              onChange={(ref) => {
                const [name, source] = ref.split("|");
                const e = data.find("item", name, source);
                setLoot(l.id, (x) => ({ ...x, items: [...x.items, { name: e?.name ?? name, ref, rarity: e?.raw.rarity }] }));
              }}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
