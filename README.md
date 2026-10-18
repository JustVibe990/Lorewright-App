# Lorewright

Campaign notes for D&D 5e Dungeon Masters, linked to the rules.

Highlight a word in a note, press **Ctrl+L** (or click **Link to 5e.tools**), and it becomes a link to the
matching spell, creature, item, condition or feat. Hover a link to see the full statblock or rules text,
click it to pin the card beside your notes, and click dice to roll. Everything works offline at the table.

Notes are plain Markdown files in `Documents\Lorewright\<Campaign>\`, with links written as 5e.tools tags
(`{@spell Fireball|XPHB|fireballs}`), so they stay readable in any editor, including Obsidian.

> **Renamed from Marginalia.** On first start, Lorewright moves `Documents\Marginalia` to
> `Documents\Lorewright` (only if there's no Lorewright folder yet). Settings and the downloaded data stay in
> `%APPDATA%\app.marginalia.notes`, so nothing needs importing again. Uninstall the old "Marginalia" app from
> Windows Settings → Apps after installing Lorewright.

## Install the prerequisites (Windows)

You need these once per computer:

1. **Microsoft C++ Build Tools** (the "Desktop development with C++" workload):
   ```bash
   winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   ```
2. **Node.js** (LTS):
   ```bash
   winget install --id OpenJS.NodeJS.LTS
   ```
3. **Rust** (installs the stable MSVC toolchain):
   ```bash
   winget install --id Rustlang.Rustup
   ```
4. **WebView2 runtime**: already part of Windows 10 (recent updates) and Windows 11. If it's missing, get the
   "Evergreen Bootstrapper" from Microsoft's WebView2 page.

Open a new terminal after installing so the new `PATH` is picked up.

## Run it

```bash
npm install
```

```bash
npm run tauri dev
```

The first run compiles the Rust side, which takes a few minutes; later runs start in seconds.

## Build the installer

```bash
npm run tauri build
```

The output lands in `src-tauri\target\release\`:

| File | What it is |
|---|---|
| `lorewright.exe` | The app itself (runs without installing) |
| `bundle\nsis\Lorewright_0.1.0_x64-setup.exe` | Installer (NSIS) |
| `bundle\msi\Lorewright_0.1.0_x64_en-US.msi` | Installer (MSI) |

The first build downloads the NSIS and WiX tools that Tauri uses to make the installers.

**Windows SmartScreen:** the builds aren't code-signed, so Windows may show "Windows protected your PC" the
first time you run the installer. Click **More info → Run anyway**.

## First run

1. Paste the address of the 5e.tools site you use and press **Check**. Lorewright doesn't come with a URL;
   it uses whichever one you give it.
2. Untick any sources you don't want (all are ticked by default), or switch a whole kind off.
3. Press **Import**. The files are cached in `%APPDATA%\app.marginalia.notes\cache`, and from then on the app
   starts from that cache with no network needed.

Or choose **Skip for now** to use the built-in SRD 5.1 starter set (a few spells, monsters and items, plus all
15 conditions) and import later from **Settings**.

**Settings** also has **Check for updates** (re-downloads and reports which files changed), the sources each
campaign may link to, entry counts, and the About/licence text.

## Using it

| Do this | To |
|---|---|
| Select text, then **Ctrl+L** or **Link to 5e.tools** | Link it. A single match links instantly (newest printing first); otherwise a picker opens |
| **Ctrl+L** inside a link | Unlink it |
| Hover a link | See its card (links inside cards are hoverable too) |
| Click a link | Pin its card to the right panel |
| **Ctrl+click** a link | Open the entry on your 5e.tools site |
| Click dice in a card | Roll; the result appears as a toast and in the Roll log |
| **Ctrl+Shift+F** | Search all notes in the campaign |

- The picker understands word forms: "fireballs", "the owlbear's", "paralysis" (→ Paralyzed), and typos.
- What you pick is remembered for that campaign, so the same words link instantly next time.
- After linking, Lorewright offers to link the other mentions of the same words in the note.
- A link whose entry isn't in your data (say, after removing a source) gets a red wavy underline;
  hovering it offers **Relink…**.
- **Used this session** (left sidebar) lists everything you've linked or looked at since opening the app.

## Character sheets (2014 rules)

Switch the left sidebar to **Characters** and press **New character**. Characters are saved as JSON in
`Documents\Lorewright\<Campaign>\Characters\`.

- **Build** tab: name, species, background and class (searchable), ability scores (point buy, standard
  array, 4d6 drop lowest, or manual), and every choice the rules ask for (skills, languages, tools,
  fighting style, subclass, invocations, maneuvers, expertise, ASI or feat…). Changing an early choice
  re-derives everything. Custom effects cover anything the data doesn't (e.g. "+1 AC from Bracers").
- **Level up**: pick a class (multiclassing shows its requirements), roll or take average HP, then make the
  new choices for that level.
- **Sheet** tab: AC, HP (damage, heal, temp HP, death saves), hit dice, short and long rests, abilities,
  saves and skills (click to roll), attacks with to-hit and damage, class resources (Rage, Ki, Action
  Surge…) and proficiencies.
- **Spells**: slot trackers (multiclass and pact magic), cantrips, spells known or spellbook, prepared
  spells, picked from each class's list. Spell names are links with hover cards.
- **Inventory**: items from your data (with +1/+2/+3 variants), equip and attune, custom items, coins,
  carrying weight. Starting equipment is offered when a character is new.
- **Item Forge**: start from any item (including "+2 Breastplate"-style variants) and homebrew it: damage
  dice and type, extra damage, properties, attack/damage/AC/save bonuses, ability scores, resistances,
  spells it can cast, and your own features. Forged items can be reopened from the inventory.
- **Features**: a level-by-level timeline, 1 → now: class and subclass features (filled in from the data),
  ASIs and which scores went up, feats, and picks like fighting styles, invocations, maneuvers and
  metamagic. Every feature is a link (hover, click to pin, Ctrl+click for 5e.tools). Unmade choices are
  marked red and can be made right there. Multiclass level order is saved on level up and can be
  reordered with ↑ ↓.

Needs the "Character sheets" data (ticked by default in setup; Settings → Change sources if not).
Only 2014 content is offered; Tasha's optional class features can be switched on per character.

## Development

```bash
npm test
```

```bash
npm run build
```

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

- All logic is TypeScript in `src/`; Rust (`src-tauri/src/lib.rs`) only registers the Tauri plugins.
- `src/lib/`: data import and cache (`fivetools.ts`), tag parser/writer (`tags.ts`), search and word forms
  (`search.ts`), card renderer (`render.ts`), dice (`dice.ts`), file storage (`store.ts`).
- `src/editor/`: the TipTap `fiveLink` mark, Markdown loading/saving, linking helpers.
- `npm run dev` also works in a plain browser (files are kept in browser storage there), which is handy for UI
  work. `node scripts/mock-5etools.mjs` serves the SRD set in 5e.tools' file layout on
  `http://localhost:5055` for testing imports without the network.
- File access is limited to `%APPDATA%\app.marginalia.notes` and `Documents\Lorewright`
  (`src-tauri/capabilities/default.json`).

## Licences

- Includes material from the System Reference Document 5.1 by Wizards of the Coast LLC, licensed under
  [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode). See `src/data/srd.json`.
- Lorewright doesn't include or host 5e.tools content. You download it yourself, from a URL you choose, and it
  stays on your computer.
