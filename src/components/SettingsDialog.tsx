// Settings: 5e.tools URL, sources, check for updates, data stats, About.

import { useEffect, useState } from "react";
import { SRD_ATTRIBUTION, type DataStore } from "../lib/data.ts";
import { CATEGORIES } from "../lib/extract.ts";
import { normalizeBaseUrl, syncAll, type Progress, type SyncReport } from "../lib/fivetools.ts";
import { loadCampaignConfig, saveCampaignConfig } from "../lib/store.ts";
import type { CampaignConfig, Settings } from "../lib/types.ts";
import { Modal, ProgressBar, SyncReportView } from "./common.tsx";
import { play, setSoundPrefs, soundPrefs, type SoundPrefs } from "../lib/sfx.ts";
import { backupNow, DEFAULT_AUTO_BACKUP, listBackups, restoreBackup, type BackupInfo } from "../lib/backup.ts";
import { ConfirmDialog } from "./common.tsx";
import { DEFAULT_APPEARANCE, HEADING_FONTS, isDark, TEXT_FONTS, TEXT_SIZES, THEMES, type Appearance } from "../lib/theme.ts";

interface Props {
  settings: Settings;
  data: DataStore;
  /** The open campaign, whose allowed sources can be edited here. */
  campaign?: string;
  onClose: () => void;
  onSettings: (s: Settings) => Promise<void>;
  /** Re-read the cache after a sync. */
  onReload: () => Promise<void>;
  onChangeSources: () => void;
  /** The campaign's settings file changed. */
  onCampaignConfig: () => void;
}

export default function SettingsDialog({ settings, data, campaign, onClose, onSettings, onReload, onChangeSources, onCampaignConfig }: Props) {
  const [url, setUrl] = useState(settings.baseUrl);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [error, setError] = useState("");
  const stats = data.stats();
  const urlChanged = normalizeBaseUrl(url) !== settings.baseUrl;

  const saveUrl = async () => {
    await onSettings({ ...settings, baseUrl: normalizeBaseUrl(url) });
    setUrl(normalizeBaseUrl(url));
  };

  const checkUpdates = async () => {
    setError("");
    setReport(null);
    setProgress({ done: 0, total: 1, current: "" });
    try {
      const s = { ...settings, baseUrl: normalizeBaseUrl(url) };
      const r = await syncAll(s, setProgress);
      await onSettings(r.files > 0 ? { ...s, lastSync: new Date().toISOString() } : s);
      await onReload();
      setReport(r);
    } catch (e) {
      setError((e as Error).message || String(e));
    } finally {
      setProgress(null);
    }
  };

  const describeSources = (kind: (typeof CATEGORIES)[number]["kind"]) => {
    if ((settings.disabledKinds ?? []).includes(kind)) return "off";
    const s = settings.sources[kind];
    return s?.length ? s.join(", ") : "all sources";
  };

  return (
    <Modal onClose={onClose}>
      <div className="row">
        <h2 className="grow">Settings</h2>
        <button className="ghost" onClick={onClose} aria-label="Close settings">✕</button>
      </div>

      <h3>5e.tools data</h3>
      <div className="row">
        <input className="grow" value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
        <button onClick={saveUrl} disabled={!urlChanged || !!progress}>Save URL</button>
      </div>
      <ul className="small muted" style={{ paddingLeft: 18 }}>
        {CATEGORIES.map((c) => (
          <li key={c.kind}>
            {c.label}: {describeSources(c.kind)}
          </li>
        ))}
        <li>Character sheet rules: {settings.characterRules === false ? "off" : "on"}</li>
      </ul>
      <div className="row">
        <button className="primary" onClick={checkUpdates} disabled={!!progress || !normalizeBaseUrl(url)}>
          {progress ? "Checking…" : "Check for updates"}
        </button>
        <button onClick={onChangeSources} disabled={!!progress}>Change sources…</button>
        <span className="small muted grow">
          {settings.lastSync ? `Last synced ${new Date(settings.lastSync).toLocaleString()}` : "Never synced"}
        </span>
      </div>
      {progress && (
        <div style={{ marginTop: 8 }}>
          <ProgressBar value={progress.total ? progress.done / progress.total : 0} />
          <div className="small muted">{progress.done} / {progress.total} files</div>
        </div>
      )}
      {error && <p className="error small">{error}</p>}
      {report && <SyncReportView report={report} />}

      {campaign && <CampaignSources campaign={campaign} sources={data.sources()} onSaved={onCampaignConfig} />}

      <Backups campaign={campaign} settings={settings} onSettings={onSettings} onRestored={onCampaignConfig} />

      <h3>Loaded entries</h3>
      <div className="stats">
        {CATEGORIES.map((c) => (
          <div key={c.kind} className={`k-${c.kind}`}>
            <b>{stats[c.kind].toLocaleString()}</b>
            <span className="small muted"><span className="kind-dot" /> {c.label}</span>
          </div>
        ))}
      </div>

      <AppearanceSettings settings={settings} onSettings={onSettings} />

      <SoundSettings />

      <h3>About</h3>
      <p className="small">
        Lorewright 0.1.0 by Ryson Hyde. Rules content from 5e.tools is downloaded by you, from the URL you choose, and stored only on
        this computer. Lorewright does not include or host that content.
      </p>
      <p className="small muted">{SRD_ATTRIBUTION}</p>
    </Modal>
  );
}

/** Which sources the picker may offer in this campaign (none ticked = all). */
function CampaignSources({ campaign, sources, onSaved }: { campaign: string; sources: string[]; onSaved: () => void }) {
  const [cfg, setCfg] = useState<CampaignConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCampaignConfig(campaign).then(setCfg, (e) => setError(String(e?.message ?? e)));
  }, [campaign]);

  const update = async (allowedSources: string[]) => {
    if (!cfg) return;
    const next = { ...cfg, allowedSources };
    setCfg(next);
    try {
      await saveCampaignConfig(campaign, next);
      onSaved();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  };

  if (!cfg) return error ? <p className="error small">{error}</p> : null;
  const all = !cfg.allowedSources.length;
  const allowed = new Set(cfg.allowedSources.map((s) => s.toUpperCase()));
  const remembered = Object.keys(cfg.choices).length;
  return (
    <>
      <h3>Campaign: {campaign}</h3>
      <label className="row small">
        <input type="checkbox" checked={all} onChange={(e) => update(e.target.checked ? [] : sources)} />
        Offer every source when linking
      </label>
      {!all && (
        <div className="source-grid" style={{ marginTop: 6 }}>
          {sources.map((s) => (
            <label key={s}>
              <input
                type="checkbox"
                checked={allowed.has(s.toUpperCase())}
                onChange={(e) => {
                  const list = e.target.checked
                    ? [...cfg.allowedSources, s]
                    : cfg.allowedSources.filter((x) => x.toUpperCase() !== s.toUpperCase());
                  void update(list.length ? list : []);
                }}
              />
              {s}
            </label>
          ))}
        </div>
      )}
      <div className="row small muted" style={{ marginTop: 6 }}>
        <span className="grow">
          {remembered} remembered link choice{remembered === 1 ? "" : "s"} in this campaign.
        </span>
        {remembered > 0 && (
          <button
            className="link small"
            onClick={async () => {
              const next = { ...cfg, choices: {} };
              setCfg(next);
              await saveCampaignConfig(campaign, next);
              onSaved();
            }}
          >
            Forget them
          </button>
        )}
      </div>
      {error && <p className="error small">{error}</p>}
    </>
  );
}

/** Sound effects: on or off, dice on or off, and how loud. */
function SoundSettings() {
  const [p, setP] = useState<SoundPrefs>(soundPrefs);
  const change = (next: SoundPrefs) => {
    setP(next);
    setSoundPrefs(next);
  };
  return (
    <>
      <h3>Sound effects</h3>
      <div className="row small sound-settings">
        <label className="row">
          <input type="checkbox" checked={p.on} onChange={(e) => change({ ...p, on: e.target.checked })} /> Sounds on
        </label>
        <label className="row">
          <input type="checkbox" checked={p.dice} disabled={!p.on} onChange={(e) => change({ ...p, dice: e.target.checked })} /> Dice sounds
        </label>
        <label className="row grow">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={p.volume}
            disabled={!p.on}
            onChange={(e) => change({ ...p, volume: Number(e.target.value) })}
            onPointerUp={() => play("heal")}
            aria-label="Sound volume"
          />
        </label>
        <button className="ghost small" disabled={!p.on} onClick={() => play("spell")}>Test</button>
      </div>
      <p className="small muted">Plays for damage, healing, spells, potions, features, rests, level ups and dice.</p>
    </>
  );
}

/** Automatic backups: how often and how many, back up now, and restore one. */
function Backups({ campaign, settings, onSettings, onRestored }: { campaign?: string; settings: Settings; onSettings: (s: Settings) => Promise<void>; onRestored: () => void }) {
  const ab = settings.autoBackup ?? DEFAULT_AUTO_BACKUP;
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState<BackupInfo | null>(null);
  const refresh = () => campaign && listBackups(campaign).then(setList);
  useEffect(() => {
    void refresh();
  }, [campaign]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<typeof ab>) => void onSettings({ ...settings, autoBackup: { ...ab, ...patch } });
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg("");
    try {
      setMsg(await fn());
      await refresh();
    } catch (e) {
      setMsg(`Couldn't do that: ${(e as Error)?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <h3>Backups</h3>
      <div className="row small" style={{ flexWrap: "wrap" }}>
        <label className="row">
          <input type="checkbox" checked={ab.on} onChange={(e) => set({ on: e.target.checked })} /> Back up automatically
        </label>
        <label className="row">
          every
          <input className="hp-roll" type="number" min={1} max={30} value={ab.days} disabled={!ab.on} onChange={(e) => set({ days: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} />
          days, keep
          <input className="hp-roll" type="number" min={1} max={50} value={ab.keep} disabled={!ab.on} onChange={(e) => set({ keep: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />
        </label>
      </div>
      <p className="small muted">A zip of the open campaign (notes, characters, combat, DM notes), kept in Documents\Lorewright\.backups, apart from the campaign's own folder.</p>
      {campaign && (
        <>
          <div className="row small">
            <button className="small" disabled={busy} onClick={() => void run(async () => `Saved ${(await backupNow(campaign, ab.keep)).name}`)}>
              Back up {campaign} now
            </button>
            {msg && <span className={msg.startsWith("Couldn't") ? "error" : "ok"}>{msg}</span>}
          </div>
          {list && list.length > 0 && (
            <ul className="small backup-list">
              {list.map((b) => (
                <li key={b.name} className="row">
                  <span className="grow">
                    {b.at.toLocaleString()} <span className="muted">{b.name.replace(`${campaign} `, "").replace(/^\S+ \S+ ?/, "").replace(/\.zip$/, "")}</span>
                  </span>
                  <button className="link small" disabled={busy} onClick={() => setConfirm(b)}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list && !list.length && <p className="small muted">No backups of this campaign yet.</p>}
        </>
      )}
      {confirm && campaign && (
        <ConfirmDialog
          title="Restore this backup?"
          confirmLabel="Restore"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const b = confirm;
            setConfirm(null);
            void run(async () => {
              const n = await restoreBackup(campaign, b.name, ab.keep);
              onRestored();
              // Load everything again from the restored files.
              window.setTimeout(() => window.location.reload(), 1200);
              return `Restored ${n} files. Reloading…`;
            });
          }}
        >
          <p>
            Puts back every note and character from {confirm.at.toLocaleString()}. Files made since are kept. The campaign as it is now is backed up first, so you can undo this.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

/** Colour themes, light or dark, fonts and text size. Changes show straight away. */
function AppearanceSettings({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => Promise<void> }) {
  const a: Appearance = { ...DEFAULT_APPEARANCE, ...(settings.appearance ?? {}) };
  const set = (patch: Partial<Appearance>) => void onSettings({ ...settings, appearance: { ...a, ...patch } });
  const dark = isDark(a.mode, window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  return (
    <>
      <h3>Appearance</h3>
      <div className="theme-grid" role="radiogroup" aria-label="Colour theme">
        {THEMES.map((t) => {
          const p = dark ? t.dark : t.light;
          return (
            <button
              key={t.id}
              role="radio"
              aria-checked={a.theme === t.id}
              className={`theme-swatch ${a.theme === t.id ? "on" : ""}`}
              style={{ background: p.bg, color: p.text, borderColor: a.theme === t.id ? p.accent : p.line }}
              onClick={() => set({ theme: t.id })}
            >
              <span className="theme-chips" aria-hidden>
                <i style={{ background: p.panel }} />
                <i style={{ background: p.card, borderColor: p.line }} />
                <i style={{ background: p.accent }} />
              </span>
              <span>{t.name}</span>
            </button>
          );
        })}
      </div>
      <div className="row small appearance-row" style={{ flexWrap: "wrap" }}>
        <label className="row">
          Light or dark
          <select value={a.mode} onChange={(e) => set({ mode: e.target.value as Appearance["mode"] })}>
            <option value="auto">Same as Windows</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="row">
          Text size
          <select value={a.size} onChange={(e) => set({ size: Number(e.target.value) })}>
            {TEXT_SIZES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row small appearance-row" style={{ flexWrap: "wrap" }}>
        <label className="row">
          Text font
          <select value={a.textFont} onChange={(e) => set({ textFont: e.target.value })}>
            {TEXT_FONTS.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="row">
          Headings and notes
          <select value={a.headingFont} onChange={(e) => set({ headingFont: e.target.value })}>
            {HEADING_FONTS.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <button className="link small" onClick={() => void onSettings({ ...settings, appearance: undefined })}>
          Reset
        </button>
      </div>
      <p className="appearance-preview">
        <span className="serif">The Lost Mine of Phandelver</span> <span className="muted small">· headings and notes look like this; everything else like this.</span>
      </p>
    </>
  );
}
