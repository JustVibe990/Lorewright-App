// First-run setup: paste a 5e.tools URL, check it, pick sources, import.
// Also reused from Settings to change which sources are imported.

import { useState } from "react";
import { CATEGORIES } from "../lib/extract.ts";
import { normalizeBaseUrl, probe, syncAll, type Progress, type ProbeResult, type SyncReport } from "../lib/fivetools.ts";
import type { Kind, Settings } from "../lib/types.ts";
import { ProgressBar, SyncReportView } from "./common.tsx";

interface Props {
  settings: Settings;
  /** Called with the saved settings after a finished import or a skip. */
  onDone: (s: Settings, report?: SyncReport) => void | Promise<void>;
  onCancel?: () => void;
  saveSettings: (s: Settings) => Promise<void>;
}

export default function Setup({ settings, onDone, onCancel, saveSettings }: Props) {
  const [url, setUrl] = useState(settings.baseUrl);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<ProbeResult | null>(null);
  const [ticked, setTicked] = useState<Partial<Record<Kind, Set<string>>>>({});
  const [enabled, setEnabled] = useState<Record<Kind, boolean>>(() => {
    const off = settings.disabledKinds ?? [];
    return Object.fromEntries(CATEGORIES.map((c) => [c.kind, !off.includes(c.kind)])) as Record<Kind, boolean>;
  });
  const [characterRules, setCharacterRules] = useState(settings.characterRules !== false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  // The how-to is open the first time, before an address has been set.
  const [guide, setGuide] = useState(!settings.baseUrl);

  /** Paste from the clipboard (if the system allows it; Ctrl+V in the box always works). */
  const paste = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) {
        setUrl(t);
        setError("");
      }
    } catch {
      setPasteMsg("Couldn't read the clipboard here. Click in the box and press Ctrl+V instead.");
    }
  };
  const [pasteMsg, setPasteMsg] = useState("");

  const check = async () => {
    setError("");
    setFound(null);
    setChecking(true);
    try {
      const res = await probe(url);
      setUrl(normalizeBaseUrl(url));
      setFound(res);
      // Tick everything, or what was ticked last time.
      const t: Partial<Record<Kind, Set<string>>> = {};
      for (const [kind, list] of Object.entries(res) as [Kind, string[]][]) {
        const prev = settings.sources[kind];
        t[kind] = new Set(prev?.length ? list.filter((s) => prev.includes(s)) : list);
      }
      setTicked(t);
    } catch (e) {
      setError((e as Error).message || String(e));
    } finally {
      setChecking(false);
    }
  };

  const toggle = (kind: Kind, src: string) =>
    setTicked((t) => {
      const s = new Set(t[kind]);
      s.has(src) ? s.delete(src) : s.add(src);
      return { ...t, [kind]: s };
    });
  const setAll = (kind: Kind, on: boolean) =>
    setTicked((t) => ({ ...t, [kind]: new Set(on ? found?.[kind] ?? [] : []) }));

  const runImport = async () => {
    if (!found) return;
    const sources: Settings["sources"] = {};
    for (const c of CATEGORIES) {
      const all = found[c.kind];
      const t = ticked[c.kind];
      // All ticked is stored as "all", so sources added to the site later come along on sync.
      sources[c.kind] = all && t && t.size < all.length ? [...t] : [];
    }
    const disabledKinds = CATEGORIES.filter((c) => !enabled[c.kind] || (found[c.kind] && !ticked[c.kind]?.size)).map((c) => c.kind);
    const next: Settings = { ...settings, baseUrl: normalizeBaseUrl(url), sources, disabledKinds, characterRules, setupDone: true };
    setError("");
    setReport(null);
    setProgress({ done: 0, total: 1, current: "" });
    try {
      const r = await syncAll(next, setProgress);
      if (r.files === 0) throw new Error(`Nothing could be downloaded. ${r.failed[0] ?? ""}`);
      const withTime = { ...next, lastSync: new Date().toISOString() };
      await saveSettings(withTime);
      setSaved(withTime);
      setReport(r);
    } catch (e) {
      setError((e as Error).message || String(e));
    } finally {
      setProgress(null);
    }
  };

  const skip = async () => {
    const next = { ...settings, setupDone: true };
    await saveSettings(next);
    await onDone(next);
  };

  const busy = checking || !!progress;
  const anything = CATEGORIES.some((c) => enabled[c.kind] && (!found?.[c.kind] || ticked[c.kind]?.size));

  return (
    <div className="screen">
      <div className="screen-inner">
        <h1>Lorewright</h1>
        <p className="muted">Campaign notes that link to the rules. Everything works offline once imported.</p>

        <h2>1. Your 5e.tools site</h2>
        <p className="small muted">
          Paste the address of the 5e.tools site you use. The data is downloaded once and kept on this computer.
        </p>
        <LinkGuide open={guide} onToggle={() => setGuide((x) => !x)} />
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void check();
          }}
        >
          <input
            className="grow"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            autoFocus
            spellCheck={false}
          />
          <button type="button" className="ghost" disabled={busy} onClick={() => void paste()} title="Paste the address you copied">
            Paste
          </button>
          <button type="submit" className={url.trim() && !found ? "primary" : ""} disabled={busy || !url.trim()}>
            {checking ? "Checking…" : "Check"}
          </button>
        </form>
        {pasteMsg && <p className="small muted">{pasteMsg}</p>}
        {error && (
          <div className="setup-error small">
            <p className="error">{error}</p>
            <p>That address didn't give Lorewright any 5e.tools data. Things to try:</p>
            <ul>
              <li>Open the address in your browser. If the 5e.tools home page shows, copy the address again from the address bar.</li>
              <li>Check you're online, and that there are no extra words or spaces in the box.</li>
              <li>Copy the address of the site's home page, rather than a search page.</li>
              <li>Some sites don't let apps download from them. Another copy of 5e.tools (or one you host yourself) can work instead.</li>
            </ul>
          </div>
        )}
        {found && !report && <p className="ok small">Found it. Now pick what to download.</p>}

        {found && !report && (
          <>
            <h2>2. What to import</h2>
            {CATEGORIES.map((c) => {
              const list = found[c.kind];
              const t = ticked[c.kind];
              return (
                <div className={`kind-block k-${c.kind}`} key={c.kind}>
                  <header>
                    <label>
                      <input
                        type="checkbox"
                        checked={enabled[c.kind]}
                        disabled={busy}
                        onChange={(e) => setEnabled((x) => ({ ...x, [c.kind]: e.target.checked }))}
                      />
                      <span className="kind-dot" /> {c.label}
                    </label>
                    {list ? (
                      <span className="small muted">
                        {t?.size ?? 0} of {list.length} sources
                      </span>
                    ) : (
                      <span className="small muted">all sources, one file</span>
                    )}
                    <span className="grow" />
                    {list && enabled[c.kind] && (
                      <>
                        <button type="button" className="link small" onClick={() => setAll(c.kind, true)} disabled={busy}>
                          All
                        </button>
                        <button type="button" className="link small" onClick={() => setAll(c.kind, false)} disabled={busy}>
                          None
                        </button>
                      </>
                    )}
                  </header>
                  {list && enabled[c.kind] && (
                    <div className="source-grid">
                      {list.map((src) => (
                        <label key={src}>
                          <input type="checkbox" checked={!!t?.has(src)} onChange={() => toggle(c.kind, src)} disabled={busy} />
                          {src}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="kind-block">
              <header>
                <label>
                  <input type="checkbox" checked={characterRules} disabled={busy} onChange={(e) => setCharacterRules(e.target.checked)} />
                  Character sheets
                </label>
                <span className="small muted">classes, species, backgrounds and class options, all sources</span>
              </header>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="primary" onClick={runImport} disabled={busy || !anything}>
                Import
              </button>
              {progress && (
                <div className="grow">
                  <ProgressBar value={progress.total ? progress.done / progress.total : 0} />
                  <div className="small muted" style={{ marginTop: 4 }}>
                    {progress.done} / {progress.total} files {progress.current && `· ${progress.current.replace(/^data\//, "")}`}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {report && saved && (
          <>
            <h2>Imported</h2>
            <SyncReportView report={report} />
            <button className="primary" onClick={() => onDone(saved, report)}>
              Open Lorewright
            </button>
          </>
        )}

        {!report && (
          <p className="small" style={{ marginTop: 36 }}>
            {onCancel ? (
              <button className="link" onClick={onCancel} disabled={busy}>
                Cancel
              </button>
            ) : (
              <>
                <button className="link" onClick={skip} disabled={busy}>
                  Skip for now
                </button>{" "}
                <span className="muted">and use the built-in SRD 5.1 starter set. You can import later in Settings.</span>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** How to find the 5e.tools address: four short steps and a picture of the address bar. */
function LinkGuide({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className={`link-guide ${open ? "open" : ""}`}>
      <button type="button" className="link small" onClick={onToggle} aria-expanded={open}>
        {open ? "▾" : "▸"} Where do I find this address?
      </button>
      {open && (
        <ol className="small">
          <li>
            <b>Open the 5e.tools site you use</b> in your web browser (Chrome, Edge, Firefox…), the same site you'd look up a spell on.
          </li>
          <li>
            <b>Click the address bar</b> at the top of the browser, so the address is highlighted, and copy it with <kbd>Ctrl+C</kbd>.
            <div className="fake-bar" aria-hidden>
              <span className="fake-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="fake-url">
                <span className="fake-lock">🔒</span>
                <mark>https://5e.tools</mark>
              </span>
            </div>
            <span className="muted">Any page of the site works, like a spell or a monster: Lorewright keeps just the site's address.</span>
          </li>
          <li>
            <b>Come back here and paste it</b> in the box below with <kbd>Ctrl+V</kbd> (or the Paste button), then press <b>Check</b>.
          </li>
          <li>
            <b>Pick what to download</b> (leaving everything ticked is fine) and press <b>Import</b>. It takes a minute or two, once. After that Lorewright works offline, and Settings → Check for updates gets anything new.
          </li>
        </ol>
      )}
      {open && <p className="small muted">No site to use? Skip for now (below) and start with the free SRD rules built in. You can add a site later in Settings.</p>}
    </div>
  );
}
