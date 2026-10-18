// The three-pane main screen: campaigns and notes on the left, the note in the
// centre, pinned cards and the roll log on the right.

import { getMarkRange } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchNotes } from "../lib/notesearch.ts";
import type { DataStore } from "../lib/data.ts";
import { roll, rollModeLabel, rollModeOf, withRollMode, type RollResult } from "../lib/dice.ts";
import { playRoll } from "../lib/sfx.ts";
import { isTauri } from "../lib/fsapi.ts";
import { entryUrl } from "../lib/render.ts";
import type { Entry } from "../lib/types.ts";
import HoverCards, { linkAttrs, type LinkAttrs } from "./HoverCards.tsx";
import { pinKey, RightPanel, RollToast, type LoggedRoll, type Pin } from "./SessionPanels.tsx";
import {
  createCampaign,
  createNote,
  DEFAULT_CAMPAIGN,
  listCampaigns,
  listNotes,
  deleteNote,
  loadCampaignConfig,
  readNote,
  saveCampaignConfig,
} from "../lib/store.ts";
import { ConfirmDialog } from "./common.tsx";
import type { CampaignConfig, NoteMeta, Settings } from "../lib/types.ts";
import NoteEditor, { type NoteEditorApi } from "./NoteEditor.tsx";
import QuickSearch from "./QuickSearch.tsx";
import HelpDialog from "./HelpDialog.tsx";
import { TourContext, TourOverlay, type TourApi } from "./Tour.tsx";
import type { TourId } from "../lib/tours.ts";
import CombatView from "./CombatView.tsx";
import DmView, { DM_SECTIONS, type DmSection } from "./dm/DmView.tsx";
import { autoBackup, backupCampaign, DEFAULT_AUTO_BACKUP, importCharacter } from "../lib/backup.ts";
import type { QuickItem } from "../lib/quicksearch.ts";
import { loadDm } from "../lib/dm.ts";
import { rollOn, tableSize, type RandomTable } from "../lib/tables.ts";
import CharacterView, { type Tab } from "./character/CharacterView.tsx";
import { Avatar } from "./character/Portrait.tsx";
import { RULE_LINK_KINDS, type Rules } from "../lib/character/rules.ts";
import { findItemCard, INV_ITEM_KIND } from "../lib/character/itemcard.ts";
import { deleteCharacter, listCharacters, newCharacter, saveCharacter, type CharacterFile } from "../lib/character/storage.ts";

let openCount = 0;

interface Props {
  settings: Settings;
  data: DataStore;
  /** Character-builder rules, built on first use. */
  getRules: () => Rules;
  /** Bumped when the campaign's settings file was changed elsewhere (Settings dialog). */
  configVersion: number;
  onSettings: (s: Settings) => Promise<void>;
  openSettings: () => void;
}

export default function Workspace({ settings, data, getRules, configVersion, onSettings, openSettings }: Props) {
  const [mode, setMode] = useState<"notes" | "characters" | "combat" | "dm">("notes");
  const [dmSection, setDmSection] = useState<DmSection>("encounters");
  const [helpOpen, setHelpOpen] = useState(false);
  const [tour, setTour] = useState<TourId | null>(null);
  const tourRef = useRef<TourId | null>(null);
  tourRef.current = tour;
  const seenRef = useRef(new Set(settings.toursSeen ?? []));
  const [characters, setCharacters] = useState<CharacterFile[]>([]);
  const [currentChar, setCurrentChar] = useState<{ file: string; isNew?: boolean; tab?: { tab: Tab; n: number } } | null>(null);
  const [campaigns, setCampaigns] = useState<string[] | null>(null);
  const [campaign, setCampaign] = useState<string | null>(null);
  const [config, setConfig] = useState<CampaignConfig>(DEFAULT_CAMPAIGN);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  // `id` keys the editor: it survives a rename, so the editor isn't rebuilt mid-typing.
  const [current, setCurrentRaw] = useState<{ id: number; file: string; isNew?: boolean } | null>(null);
  const setCurrent = useCallback(
    (c: { file: string; isNew?: boolean } | null) => setCurrentRaw(c && { ...c, id: ++openCount }),
    [],
  );
  const [error, setError] = useState("");
  const editorRef = useRef<{ editor: Editor | null; api: NoteEditorApi } | null>(null);
  const onEditor = useCallback((editor: Editor | null, api: NoteEditorApi) => {
    editorRef.current = { editor, api };
  }, []);

  // ---------- session state: pins and rolls ----------
  const [pins, setPins] = useState<Pin[]>([]);
  const [rolls, setRolls] = useState<LoggedRoll[]>([]);
  const [toast, setToast] = useState<LoggedRoll | null>(null);
  const [notice, setNotice] = useState("");
  const [closeCards, setCloseCards] = useState(0);
  const rollId = useRef(0);

  const pin = useCallback((attrs: LinkAttrs) => {
    const key = pinKey(attrs);
    setPins((list) => [{ key, attrs }, ...list.filter((p) => p.key !== key)]);
  }, []);

  /** Roll and log it. `describe` can write the label from the result (random tables). */
  const doRoll = useCallback((expr: string, label: string, describe?: (r: RollResult) => string) => {
    const base = roll(expr);
    const r: LoggedRoll = { ...base, id: ++rollId.current, label: describe ? describe(base) : label, at: Date.now() };
    setRolls((list) => [r, ...list].slice(0, 200));
    setToast(r);
    playRoll(r);
    return r;
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  /** Open the picker for a link element inside the note editor. */
  const relinkElement = useCallback((el: HTMLElement) => {
    const ed = editorRef.current?.editor;
    if (!ed || ed.isDestroyed || !ed.view.dom.contains(el)) return;
    const pos = ed.view.posAtDOM(el, 0);
    const range = getMarkRange(ed.state.doc.resolve(pos), ed.schema.marks.fiveLink);
    if (range) editorRef.current?.api.relink(range);
  }, []);

  /** Character-sheet links (class features, subclasses…) come from the character rules. */
  const resolveLink = useCallback(
    (a: LinkAttrs) => (a.kind === INV_ITEM_KIND ? findItemCard(a.name) : RULE_LINK_KINDS.has(a.kind) ? getRules().linkEntry(a) : undefined),
    [getRules],
  );

  const openInBrowser = useCallback(
    async (a: LinkAttrs) => {
      const url = entryUrl(settings.baseUrl, a.kind, a.name, a.source);
      if (!url) {
        setNotice("Set your 5e.tools URL in Settings to open entries in the browser.");
        return;
      }
      try {
        if (isTauri) await openUrl(url);
        else window.open(url, "_blank", "noopener");
      } catch (e) {
        setNotice(`Couldn't open the browser: ${(e as Error)?.message ?? e}`);
      }
    },
    [settings.baseUrl],
  );

  /** Clicks anywhere in the workspace: dice roll, Ctrl+click opens 5e.tools, click pins. */
  const onClick = (e: React.MouseEvent) => {
    const t = e.target as Element;
    const die = t.closest<HTMLElement>(".roll");
    if (die?.dataset.roll) {
      e.preventDefault();
      const label = die.closest<HTMLElement>("[data-card-name]")?.dataset.cardName ?? "Roll";
      // d20 rolls in cards (attack bonuses, checks) take Shift/Ctrl for advantage/disadvantage.
      const mode = rollModeOf(e);
      doRoll(withRollMode(die.dataset.roll, mode), label + rollModeLabel(mode));
      return;
    }
    const link = t.closest<HTMLElement>("[data-5e]");
    if (!link || link.closest(".picker")) return;
    const attrs = linkAttrs(link);
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      void openInBrowser(attrs);
      return;
    }
    const entry = data.find(attrs.kind, attrs.name, attrs.source) ?? resolveLink(attrs);
    if (!entry && link.closest(".ProseMirror")) {
      setCloseCards((n) => n + 1);
      relinkElement(link);
      return;
    }
    pin(attrs);
    setCloseCards((n) => n + 1);
  };

  const onConfig = useCallback(
    (cfg: CampaignConfig) => {
      setConfig(cfg);
      if (campaign) saveCampaignConfig(campaign, cfg).catch((e) => setError(`Couldn't save campaign settings: ${e?.message ?? e}`));
    },
    [campaign],
  );

  // Load the campaign list, reopening the last campaign used.
  useEffect(() => {
    listCampaigns()
      .then((list) => {
        setCampaigns(list);
        const last = settings.lastCampaign && list.includes(settings.lastCampaign) ? settings.lastCampaign : list[0];
        if (last) setCampaign(last);
      })
      .catch((e) => setError(`Couldn't open Documents\\Lorewright: ${e?.message ?? e}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshNotes = useCallback(async (c: string) => {
    const list = await listNotes(c);
    setNotes(list);
    return list;
  }, []);

  // Switching campaign: load its notes and settings, open its newest note.
  useEffect(() => {
    if (!campaign) return;
    setCurrent(null);
    void (async () => {
      try {
        const [list, cfg] = await Promise.all([refreshNotes(campaign), loadCampaignConfig(campaign)]);
        setConfig(cfg);
        setCurrent(list[0] ? { file: list[0].file } : null);
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      }
    })();
    if (settings.lastCampaign !== campaign) void onSettings({ ...settings, lastCampaign: campaign });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign]);

  useEffect(() => {
    if (campaign && configVersion) loadCampaignConfig(campaign).then(setConfig, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configVersion]);

  // ---------- characters ----------
  const refreshCharacters = useCallback(async (c: string) => {
    try {
      setCharacters(await listCharacters(c));
    } catch (e) {
      setError(`Couldn't read characters: ${(e as Error)?.message ?? e}`);
    }
  }, []);
  useEffect(() => {
    setCurrentChar(null);
    if (campaign) void refreshCharacters(campaign);
  }, [campaign, refreshCharacters]);

  // Automatic backup of the campaign, a few seconds after it opens (when one is due).
  useEffect(() => {
    if (!campaign) return;
    const t = window.setTimeout(() => {
      autoBackup(campaign, settings.autoBackup ?? DEFAULT_AUTO_BACKUP)
        .then((b) => b && setNotice(`Backed up ${campaign} (Settings → Backups)`))
        .catch(() => {});
    }, 4000);
    return () => window.clearTimeout(t);
  }, [campaign]); // eslint-disable-line react-hooks/exhaustive-deps

  const newCharacterFile = async () => {
    if (!campaign) return;
    const file = await saveCharacter(campaign, newCharacter("New character"));
    await refreshCharacters(campaign);
    setCurrentChar({ file, isNew: true });
  };

  const doBackup = async () => {
    if (!campaign) return;
    try {
      const r = await backupCampaign(campaign);
      if (r) setNotice(`Backed up ${r.files} files to ${r.path}`);
    } catch (e) {
      setError(`Backup failed: ${(e as Error)?.message ?? e}`);
    }
  };

  const doImportCharacter = async () => {
    if (!campaign) return;
    try {
      const r = await importCharacter(campaign);
      if (!r) return;
      await refreshCharacters(campaign);
      setCurrentChar({ file: r.file });
      setNotice(`Imported ${r.name}.`);
    } catch (e) {
      setError(`Couldn't import: ${(e as Error)?.message ?? e}`);
    }
  };

  const newCampaign = async (name: string) => {
    const created = await createCampaign(name);
    const list = await listCampaigns();
    setCampaigns(list);
    setCampaign(created);
  };

  const newNote = async () => {
    if (!campaign) return;
    const file = await createNote(campaign, "Untitled");
    await refreshNotes(campaign);
    setCurrent({ file, isNew: true });
  };

  // ---------- deleting (to the campaign's .trash folder) ----------
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "note" | "character"; file: string; title: string } | null>(null);

  const doDelete = async () => {
    const target = confirmDelete;
    setConfirmDelete(null);
    if (!target || !campaign) return;
    try {
      if (target.kind === "note") {
        const wasOpen = current?.file === target.file;
        if (wasOpen) {
          // Close the editor first so its last autosave lands before the file moves.
          setCurrent(null);
          await new Promise((r) => setTimeout(r, 400));
        }
        await deleteNote(campaign, target.file);
        textCache.current.delete(target.file);
        const list = await refreshNotes(campaign);
        if (wasOpen && list[0]) setCurrent({ file: list[0].file });
      } else {
        if (currentChar?.file === target.file) {
          setCurrentChar(null);
          await new Promise((r) => setTimeout(r, 700));
        }
        await deleteCharacter(campaign, target.file);
        await refreshCharacters(campaign);
      }
      setNotice(`Moved “${target.title}” to the campaign's .trash folder.`);
    } catch (e) {
      setError(`Couldn't delete “${target.title}”: ${(e as Error)?.message ?? e}`);
    }
  };

  // ---------- note search ----------
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const textCache = useRef(new Map<string, string>());
  const [cacheVersion, setCacheVersion] = useState(0);

  useEffect(() => {
    textCache.current = new Map();
    setQuery("");
  }, [campaign]);

  const [quickOpen, setQuickOpen] = useState(false);

  // While searching, read any note not yet cached (edited notes are dropped from the cache on save).
  useEffect(() => {
    if ((!query.trim() && !quickOpen) || !campaign) return;
    let cancelled = false;
    void (async () => {
      const missing = notes.filter((n) => !textCache.current.has(n.file));
      for (const n of missing) {
        try {
          textCache.current.set(n.file, await readNote(campaign, n.file));
        } catch {
          /* unreadable note: skip */
        }
      }
      if (!cancelled && missing.length) setCacheVersion((v) => v + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, quickOpen, notes, campaign]);

  const hits = useMemo(
    () =>
      query.trim()
        ? searchNotes(
            notes.map((n) => ({ file: n.file, title: n.title, text: textCache.current.get(n.file) ?? "" })),
            query,
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, notes, cacheVersion],
  );

  // Ctrl+Shift+F jumps to note search; Ctrl+K opens quick search.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickOpen((o) => !o);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  // The rules compendium (classes, subclasses…), built the first time quick search opens.
  const compendium = useMemo(() => {
    if (!quickOpen) return undefined;
    try {
      const r = getRules();
      return r.hasData ? r.compendium() : [];
    } catch {
      return [];
    }
  }, [quickOpen, getRules]);

  // The DM's random tables, read when quick search opens.
  const [quickTables, setQuickTables] = useState<RandomTable[]>([]);
  useEffect(() => {
    if (quickOpen && campaign) loadDm(campaign).then((d) => setQuickTables(d.tables ?? []));
  }, [quickOpen, campaign]);

  const quickSources = useMemo(
    () => ({
      tables: quickTables.map((t) => ({ id: t.id, name: t.name, size: tableSize(t) })).filter((t) => t.size > 0),
      rules: compendium,
      notes: notes.map((n) => ({ file: n.file, title: n.title, text: textCache.current.get(n.file) ?? "" })),
      characters: characters.map(({ file, character: c }) => ({
        file,
        name: c.name,
        detail: [c.race?.name, c.classes.map((x) => `${x.name} ${x.level}`).join(" / ")].filter(Boolean).join(" · "),
      })),
      index: data.index,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, characters, data, cacheVersion, compendium, quickTables],
  );

  const onQuickPick = (item: QuickItem, { browser }: { browser: boolean }) => {
    if (item.type === "note") {
      setMode("notes");
      setQuery("");
      if (current?.file !== item.file) setCurrent({ file: item.file });
    } else if (item.type === "character") {
      setMode("characters");
      if (currentChar?.file !== item.file) setCurrentChar({ file: item.file });
    } else if (item.type === "table") {
      const t = quickTables.find((x) => x.id === item.id);
      if (t) doRoll(`1d${tableSize(t)}`, t.name, (r) => `${t.name}: ${rollOn(t, quickTables, Math.random, 0, r.total).text}`);
    } else if (item.type === "rule") {
      pin({ kind: item.rule.kind, name: item.rule.name, source: item.rule.source });
    } else {
      const attrs = { kind: item.entry.kind, name: item.entry.name, source: item.entry.source };
      if (browser) void openInBrowser(attrs);
      else pin(attrs);
    }
  };

  const onSaved = useCallback(
    (file: string) => {
      textCache.current.delete(file);
      // Bump the saved note to the top without re-reading every file.
      setNotes((list) => {
        const i = list.findIndex((n) => n.file === file);
        if (i < 0) return list;
        const updated = { ...list[i], modified: Date.now() };
        return [updated, ...list.slice(0, i), ...list.slice(i + 1)];
      });
    },
    [],
  );

  const onRenamed = useCallback((oldFile: string, newFile: string) => {
    textCache.current.delete(oldFile);
    setNotes((list) => list.map((n) => (n.file === oldFile ? { ...n, file: newFile, title: newFile.replace(/\.md$/i, "") } : n)));
    setCurrentRaw((c) => (c?.file === oldFile ? { ...c, file: newFile, isNew: false } : c));
  }, []);

  // ---------- guided tours ----------
  const endTour = useCallback(() => {
    const id = tourRef.current;
    setTour(null);
    if (!id || seenRef.current.has(id)) return;
    seenRef.current.add(id);
    void onSettings({ ...settings, toursSeen: [...seenRef.current] });
  }, [settings, onSettings]);
  const tourApi: TourApi = {
    start: (id) => {
      // Go to the part of the app the tour is about, then start it once it's drawn.
      if (id === "main") setMode("notes");
      if (id === "combat") setMode("combat");
      if (id === "dm") setMode("dm");
      if (id === "character") {
        setMode("characters");
        if (!currentChar && characters[0]) setCurrentChar({ file: characters[0].file, tab: { tab: "sheet", n: Date.now() } });
      }
      setTour(null);
      window.setTimeout(() => setTour(id), 350);
    },
    auto: (id) => {
      if (seenRef.current.has(id) || tourRef.current) return;
      window.setTimeout(() => {
        if (!tourRef.current && !seenRef.current.has(id)) setTour(id);
      }, 700);
    },
  };
  const tourApiRef = useRef(tourApi);
  tourApiRef.current = tourApi;
  // The welcome tour on first launch, and each area's tour the first time it's opened.
  useEffect(() => {
    if (campaign) tourApiRef.current.auto("main");
  }, [campaign]);
  useEffect(() => {
    if (mode === "combat" || mode === "dm") tourApiRef.current.auto(mode);
  }, [mode]);
  const tourValue = useMemo<TourApi>(() => ({ start: (id) => tourApiRef.current.start(id), auto: (id) => tourApiRef.current.auto(id) }), []);

  if (campaigns === null) return <div className="screen">{error && <p className="error" style={{ padding: 24 }}>{error}</p>}</div>;
  if (!campaigns.length || !campaign) return <FirstCampaign onCreate={newCampaign} error={error} />;

  return (
    <TourContext.Provider value={tourValue}>
    <div className="layout" onClick={onClick}>
      <aside className="left">
        <CampaignSwitcher campaigns={campaigns} current={campaign} onSwitch={setCampaign} onCreate={newCampaign} />
        <div className="seg" role="tablist" aria-label="Section">
          <button role="tab" aria-selected={mode === "notes"} className={mode === "notes" ? "on" : ""} onClick={() => setMode("notes")}>
            Notes
          </button>
          <button role="tab" aria-selected={mode === "characters"} className={mode === "characters" ? "on" : ""} onClick={() => setMode("characters")}>
            Characters
          </button>
          <button role="tab" aria-selected={mode === "combat"} className={mode === "combat" ? "on" : ""} onClick={() => setMode("combat")}>
            Combat
          </button>
          <button role="tab" aria-selected={mode === "dm"} className={mode === "dm" ? "on" : ""} onClick={() => setMode("dm")} title="Encounters, NPCs, treasure, sessions and homebrew">
            DM
          </button>
        </div>
        {mode === "dm" ? (
          <nav className="note-list dm-nav grow" aria-label="DM">
            {DM_SECTIONS.map(([s, label, hint]) => (
              <button key={s} className={`note-item ${dmSection === s ? "active" : ""}`} onClick={() => setDmSection(s)}>
                <span className="note-item-title">{label}</span>
                <span className="note-item-date">{hint}</span>
              </button>
            ))}
          </nav>
        ) : mode === "combat" ? (
          <p className="small muted pad grow">
            Initiative, rounds and every creature in the fight. Add your characters, monsters from the bestiary, or your own NPCs and summons.
          </p>
        ) : mode === "characters" ? (
          <>
            <div className="row new-row">
              <button className="primary new-note grow" onClick={newCharacterFile}>
                New character
              </button>
              <button className="small" onClick={() => void doImportCharacter()} title="Add a character from a .json file">
                Import
              </button>
            </div>
            <nav className="note-list" aria-label="Characters">
              {characters.map(({ file, character: c }) => (
                <div key={file} className="note-row">
                  <button
                    className={`note-item ${currentChar?.file === file ? "active" : ""}`}
                    onClick={() => setCurrentChar({ file })}
                    title={c.name}
                  >
                    <span className="note-item-title">
                      <Avatar src={c.portrait} name={c.name} size={20} /> {c.name}
                    </span>
                    <span className="note-item-date">
                      {[c.race?.name, c.classes.map((x) => `${x.name} ${x.level}`).join(" / ")].filter(Boolean).join(" · ") || "Not built yet"}
                    </span>
                  </button>
                  <TrashButton label={`Delete ${c.name}`} onClick={() => setConfirmDelete({ kind: "character", file, title: c.name })} />
                  {(c.companions?.length ?? 0) > 0 && (
                    <div className="companion-list">
                      {c.companions!.map((comp) => (
                        <button
                          key={comp.id}
                          className="companion-item small"
                          title={`${c.name}'s companion · open the Companions tab`}
                          onClick={() => setCurrentChar({ file, tab: { tab: "companions", n: Date.now() } })}
                        >
                          <span className="grow">↳ {comp.name}</span>
                          {comp.hpMax != null && (
                            <span className={(comp.hp ?? 0) <= 0 ? "error" : "muted"}>
                              {comp.hp ?? 0}/{comp.hpMax}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {!characters.length && <p className="small muted pad">No characters yet.</p>}
            </nav>
          </>
        ) : (
          <>
        <button className="primary new-note" onClick={newNote}>
          New note
        </button>
        <input
          ref={searchInput}
          type="search"
          className="note-search"
          placeholder="Search notes"
          aria-label="Search notes (Ctrl+Shift+F)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
        />
        <nav className="note-list" aria-label={query.trim() ? "Search results" : "Notes"}>
          {query.trim()
            ? hits.map((h) => (
                <div key={h.file} className="note-row">
                  <button
                    className={`note-item ${current?.file === h.file ? "active" : ""}`}
                    onClick={() => current?.file !== h.file && setCurrent({ file: h.file })}
                    title={h.title}
                  >
                    <span className="note-item-title">{h.title}</span>
                    <span className="note-hit">
                      {h.snippet[0]}
                      <mark>{h.snippet[1]}</mark>
                      {h.snippet[2]}
                    </span>
                  </button>
                  <TrashButton label={`Delete ${h.title}`} onClick={() => setConfirmDelete({ kind: "note", file: h.file, title: h.title })} />
                </div>
              ))
            : notes.map((n) => (
                <div key={n.file} className="note-row">
                  <button
                    className={`note-item ${current?.file === n.file ? "active" : ""}`}
                    onClick={() => current?.file !== n.file && setCurrent({ file: n.file })}
                    title={n.title}
                  >
                    <span className="note-item-title">{n.title}</span>
                    <span className="note-item-date">{n.modified ? new Date(n.modified).toLocaleDateString() : ""}</span>
                  </button>
                  <TrashButton label={`Delete ${n.title}`} onClick={() => setConfirmDelete({ kind: "note", file: n.file, title: n.title })} />
                </div>
              ))}
          {!query.trim() && !notes.length && <p className="small muted pad">No notes yet.</p>}
          {query.trim() && !hits.length && <p className="small muted pad">No notes mention “{query.trim()}”.</p>}
        </nav>
          </>
        )}
        <div className="left-foot">
          <button className="ghost small" onClick={openSettings}>
            Settings
          </button>
          <button className="ghost small" onClick={() => void doBackup()} title="Save this campaign (notes and characters) as a .zip">
            Backup
          </button>
          <button className="ghost small" data-tour="search" onClick={() => setQuickOpen(true)} title="Search everything (Ctrl+K)">
            Search <kbd>Ctrl K</kbd>
          </button>
          <button className="ghost small" data-tour="help" onClick={() => setHelpOpen(true)} title="Tours, tips and shortcuts">
            Help
          </button>
        </div>
      </aside>

      <main className="centre">
        {error && <div className="error small note-msg">{error}</div>}
        {mode === "dm" ? (
          <DmView
            key={campaign}
            section={dmSection}
            campaign={campaign}
            data={data}
            characters={characters}
            notes={notes}
            getRules={getRules}
            onRoll={doRoll}
            onOpenNote={(file) => {
              setMode("notes");
              setQuery("");
              if (current?.file !== file) setCurrent({ file });
            }}
            onOpenCombat={() => setMode("combat")}
            onNotesChanged={() => refreshNotes(campaign)}
            onCharactersSaved={() => void refreshCharacters(campaign)}
          />
        ) : mode === "combat" ? (
          <CombatView
            key={campaign}
            campaign={campaign}
            data={data}
            characters={characters}
            getRules={getRules}
            onRoll={doRoll}
            onCharactersSaved={() => void refreshCharacters(campaign)}
            onOpenCharacter={(file) => {
              setMode("characters");
              setCurrentChar({ file });
            }}
          />
        ) : mode === "characters" ? (
          currentChar ? (
            <CharacterView
              key={`${campaign}/${currentChar.file}`}
              campaign={campaign}
              file={currentChar.file}
              isNew={currentChar.isNew}
              getRules={getRules}
              data={data}
              onRoll={doRoll}
              onSaved={() => void refreshCharacters(campaign)}
              onDeleted={() => {
                setCurrentChar(null);
                void refreshCharacters(campaign);
              }}
              openSettings={openSettings}
              openTab={currentChar.tab}
            />
          ) : (
            <div className="empty-centre">
              <p className="muted">{characters.length ? "Pick a character, or make a new one." : "No characters in this campaign yet."}</p>
              <button className="primary" onClick={newCharacterFile}>
                New character
              </button>
            </div>
          )
        ) : current ? (
          <NoteEditor
            key={current.id}
            campaign={campaign}
            file={current.file}
            data={data}
            config={config}
            onConfig={onConfig}
            isNew={current.isNew}
            onSaved={onSaved}
            onRenamed={onRenamed}
            onDelete={(file, title) => setConfirmDelete({ kind: "note", file, title })}
            onEditor={onEditor}
          />
        ) : (
          <div className="empty-centre">
            <p className="muted">No note open.</p>
            <button className="primary" onClick={newNote}>
              New note
            </button>
          </div>
        )}
      </main>

      <RightPanel
        pins={pins}
        rolls={rolls}
        data={data}
        onUnpin={(key) => setPins((list) => list.filter((p) => p.key !== key))}
        onClearRolls={() => setRolls([])}
        resolve={resolveLink}
        onRoll={doRoll}
      />

      <HoverCards data={data} onRelink={relinkElement} closeSignal={closeCards} resolve={resolveLink} />
      <RollToast roll={toast} />
      {quickOpen && <QuickSearch sources={quickSources} onPick={onQuickPick} onClose={() => setQuickOpen(false)} />}
      {helpOpen && (
        <HelpDialog
          onClose={() => setHelpOpen(false)}
          onTour={(id) => tourApi.start(id)}
          onResetTours={() => {
            seenRef.current = new Set(["main"]);
            void onSettings({ ...settings, toursSeen: ["main"] });
            setHelpOpen(false);
          }}
        />
      )}
      {tour && <TourOverlay key={tour} id={tour} onEnd={endTour} />}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.kind === "note" ? "note" : "character"} “${confirmDelete.title}”?`}
          confirmLabel="Delete"
          onConfirm={() => void doDelete()}
          onCancel={() => setConfirmDelete(null)}
        >
          <p>
            It moves to <b>Documents\Lorewright\{campaign}\.trash</b>. To get it back, move the file out of that folder
            {confirmDelete.kind === "character" ? " into Characters" : ""}.
          </p>
        </ConfirmDialog>
      )}
      {notice && (
        <div className="roll-toast" role="status">
          <span className="small">{notice}</span>
        </div>
      )}
    </div>
    </TourContext.Provider>
  );
}

/** Small trash button shown on hover next to a note or character in the sidebar. */
function TrashButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="trash-btn ghost" aria-label={label} title={label} onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6 2h4l.5 1H13v1.5H3V3h2.5L6 2zm-2 3.5h8l-.6 8.1a1 1 0 0 1-1 .9H5.6a1 1 0 0 1-1-.9L4 5.5zm2.5 1.5v5.5h1V7h-1zm2 0v5.5h1V7h-1z" fill="currentColor" />
      </svg>
    </button>
  );
}

function CampaignSwitcher({
  campaigns,
  current,
  onSwitch,
  onCreate,
}: {
  campaigns: string[];
  current: string;
  onSwitch: (c: string) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  if (adding) {
    return (
      <form
        className="campaign-switcher"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          try {
            await onCreate(name.trim());
            setAdding(false);
            setName("");
          } catch (err) {
            setError(String((err as Error)?.message ?? err));
          }
        }}
      >
        <input autoFocus placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAdding(false)} />
        {error && <div className="small error">{error}</div>}
      </form>
    );
  }
  return (
    <div className="campaign-switcher">
      <select
        aria-label="Campaign"
        value={current}
        onChange={(e) => (e.target.value === "__new__" ? setAdding(true) : onSwitch(e.target.value))}
      >
        {campaigns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value="__new__">New campaign…</option>
      </select>
    </div>
  );
}

function FirstCampaign({ onCreate, error }: { onCreate: (name: string) => Promise<void>; error: string }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="screen">
      <div className="screen-inner">
        <h1>Start a campaign</h1>
        <p className="muted">
          Each campaign is a folder of Markdown notes in <b>Documents\Lorewright</b>. You can open them in any editor.
        </p>
        <form
          className="row"
          style={{ marginTop: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            try {
              await onCreate(name.trim());
            } catch (x) {
              setErr(String((x as Error)?.message ?? x));
            }
          }}
        >
          <input className="grow" autoFocus placeholder="e.g. Curse of Strahd" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary" type="submit" disabled={!name.trim()}>
            Create
          </button>
        </form>
        {(err || error) && <p className="error small">{err || error}</p>}
      </div>
    </div>
  );
}
