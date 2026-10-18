import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Rules, type RawRules } from "./lib/character/rules.ts";
import SettingsDialog from "./components/SettingsDialog.tsx";
import Setup from "./components/Setup.tsx";
import Workspace from "./components/Workspace.tsx";
import { DataStore } from "./lib/data.ts";
import { HomebrewContext } from "./components/HomebrewContext.tsx";
import { applyAppearance } from "./lib/theme.ts";
import { loadHomebrewSpells, saveHomebrewSpells, spellEntry, spellSources, type HomebrewSpell } from "./lib/homebrew.ts";
import {
  creatureEntry,
  itemEntry,
  loadHomebrewCreatures,
  loadHomebrewItems,
  saveHomebrewCreatures,
  saveHomebrewItems,
  type HomebrewCreature,
  type HomebrewItem,
} from "./lib/homebrew-more.ts";
import type { Entry } from "./lib/types.ts";
import { loadCachedEntries, loadCachedRules } from "./lib/fivetools.ts";
import { loadSettings, saveSettings } from "./lib/store.ts";
import type { Settings } from "./lib/types.ts";

type Screen = "loading" | "setup" | "main";

/** Shows a recoverable message instead of a blank window if something throws while rendering. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen">
        <div className="screen-inner">
          <h1>Something went wrong</h1>
          <p className="muted">Your notes are saved as you type, so nothing should be lost.</p>
          <pre className="small error" style={{ whiteSpace: "pre-wrap" }}>{this.state.error.message}</pre>
          <button className="primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [settings, setSettings] = useState<Settings | null>(null);
  // Colours, fonts and text size follow the settings (and the system's light/dark on auto).
  useEffect(() => applyAppearance(settings?.appearance), [settings?.appearance]);
  const [data, setData] = useState(() => new DataStore());
  const [showSettings, setShowSettings] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [configVersion, setConfigVersion] = useState(0);

  const [rawRules, setRawRules] = useState<RawRules>({});
  // Homebrew spells sit on top of the imported data, so they're rebuilt without re-reading the cache.
  const cached = useRef<{ entries: Entry[]; rules: RawRules }>({ entries: [], rules: {} });
  type Brew = { spells: HomebrewSpell[]; creatures: HomebrewCreature[]; items: HomebrewItem[] };
  const [homebrew, setHomebrew] = useState<Brew>({ spells: [], creatures: [], items: [] });
  const brewRef = useRef<Brew>(homebrew);
  const build = useCallback((b: Brew) => {
    const { entries, rules } = cached.current;
    brewRef.current = b;
    setHomebrew(b);
    setData(new DataStore([...entries, ...b.spells.map(spellEntry), ...b.creatures.map(creatureEntry), ...b.items.map(itemEntry)]));
    setRawRules(b.spells.length ? { ...rules, spellsource: [...(rules.spellsource ?? []), spellSources(b.spells)] } : rules);
  }, []);
  const reload = useCallback(async (s: Settings) => {
    try {
      cached.current = { entries: await loadCachedEntries(s), rules: await loadCachedRules() };
      const [spells, creatures, items] = await Promise.all([loadHomebrewSpells(), loadHomebrewCreatures(), loadHomebrewItems()]);
      build({ spells, creatures, items });
    } catch (e) {
      setLoadError(`Couldn't read the data cache: ${(e as Error).message ?? e}`);
    }
  }, [build]);

  const homebrewValue = {
    ...homebrew,
    saveSpells: async (spells: HomebrewSpell[]) => {
      await saveHomebrewSpells(spells);
      build({ ...brewRef.current, spells });
    },
    saveCreatures: async (creatures: HomebrewCreature[]) => {
      await saveHomebrewCreatures(creatures);
      build({ ...brewRef.current, creatures });
    },
    saveItems: async (items: HomebrewItem[]) => {
      await saveHomebrewItems(items);
      build({ ...brewRef.current, items });
    },
  };

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setSettings(s);
      await reload(s);
      setScreen(s.setupDone ? "main" : "setup");
    })().catch((e) => {
      setLoadError(String(e?.message ?? e));
      setScreen("main");
    });
  }, [reload]);

  // Character rules are built on first use (they take a moment), and rebuilt when the data changes.
  const rulesCache = useRef<{ raw: RawRules; data: DataStore; rules: Rules } | null>(null);
  const getRules = useCallback(() => {
    const c = rulesCache.current;
    if (c && c.raw === rawRules && c.data === data) return c.rules;
    const rules = new Rules(rawRules, data);
    rulesCache.current = { raw: rawRules, data, rules };
    return rules;
  }, [rawRules, data]);

  const updateSettings = async (s: Settings) => {
    await saveSettings(s);
    setSettings(s);
  };

  if (screen === "loading" || !settings) return <div className="screen" />;

  if (screen === "setup") {
    return (
      <Setup
        settings={settings}
        saveSettings={updateSettings}
        onCancel={settings.setupDone ? () => setScreen("main") : undefined}
        onDone={async (s) => {
          setSettings(s);
          await reload(s);
          setScreen("main");
        }}
      />
    );
  }

  return (
    <>
      {loadError && <div className="banner error small">{loadError}</div>}
      <ErrorBoundary>
        <HomebrewContext.Provider value={homebrewValue}>
        <Workspace
          settings={settings}
          data={data}
          getRules={getRules}
          configVersion={configVersion}
          onSettings={updateSettings}
          openSettings={() => setShowSettings(true)}
        />
        </HomebrewContext.Provider>
      </ErrorBoundary>
      {showSettings && (
        <SettingsDialog
          settings={settings}
          data={data}
          campaign={settings.lastCampaign}
          onCampaignConfig={() => setConfigVersion((v) => v + 1)}
          onClose={() => setShowSettings(false)}
          onSettings={updateSettings}
          onReload={() => reload(settings)}
          onChangeSources={() => {
            setShowSettings(false);
            setScreen("setup");
          }}
        />
      )}
    </>
  );
}
