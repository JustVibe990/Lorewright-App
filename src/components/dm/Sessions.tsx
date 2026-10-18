// Session notes: "Session 1", "Session 2"… as ordinary notes, each started
// from a template that carries over last session's "Next time". The list
// shows which NPCs and other notes (places, factions…) each session mentions.

import { useEffect, useState } from "react";
import { mentions, nextTimeOf, sessionNumber, sessionTemplate } from "../../lib/dm.ts";
import { createNote, readNote, writeNote } from "../../lib/store.ts";
import type { DmChildProps } from "./DmView.tsx";

export default function Sessions({ dm, notes, campaign, onOpenNote, onNotesChanged }: DmChildProps) {
  const sessions = notes
    .map((n) => ({ ...n, n: sessionNumber(n.title) }))
    .filter((n): n is typeof n & { n: number } => n.n != null)
    .sort((a, b) => b.n - a.n);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const key = sessions.map((s) => `${s.file}:${s.modified}`).join("|");
  useEffect(() => {
    let live = true;
    Promise.all(sessions.map(async (s) => [s.file, await readNote(campaign, s.file).catch(() => "")] as const)).then((list) => live && setTexts(Object.fromEntries(list)));
    return () => {
      live = false;
    };
  }, [campaign, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setError("");
    try {
      const last = sessions[0];
      const n = (last?.n ?? 0) + 1;
      const lastNext = last ? nextTimeOf(texts[last.file] ?? (await readNote(campaign, last.file))) : "";
      const date = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      const file = await createNote(campaign, `Session ${n}`);
      await writeNote(campaign, file, sessionTemplate(n, date, lastNext));
      await onNotesChanged();
      onOpenNote(file);
    } catch (e) {
      setError(`Couldn't make the note: ${(e as Error)?.message ?? e}`);
    }
  };

  const npcNames = dm.npcs.map((n) => n.name);
  // Places, factions…: notes that aren't sessions or an NPC's own note (those show as the NPC).
  const npcNotes = new Set(dm.npcs.map((n) => n.note).filter(Boolean));
  const otherNotes = notes.filter((n) => sessionNumber(n.title) == null && !npcNotes.has(n.file));

  return (
    <div className="dm-sessions">
      <div className="row">
        <button className="primary" onClick={() => void create()}>
          + New session {sessions.length ? sessions[0].n + 1 : 1}
        </button>
        <span className="small muted">Starts a note with headings for what happened, NPCs met, loot and next time, and brings over last session's "Next time".</span>
      </div>
      {error && <p className="error small">{error}</p>}
      {!sessions.length && <p className="muted pad">No sessions yet. Notes whose names start with "Session" and a number show up here.</p>}
      {sessions.map((s) => {
        const t = texts[s.file] ?? "";
        const who = mentions(t, npcNames);
        const where = otherNotes.filter((n) => mentions(t, [n.title]).length);
        const summary = t.match(/##\s*What happened\s*\n([\s\S]*?)(?=\n##\s|$)/i)?.[1].trim().replace(/^-\s*$/, "") ?? "";
        return (
          <section key={s.file} className="dm-card session">
            <div className="row">
              <button className="link grow session-title" onClick={() => onOpenNote(s.file)}>
                {s.title}
              </button>
              <span className="small muted">edited {new Date(s.modified).toLocaleDateString()}</span>
            </div>
            {summary && <p className="small session-summary">{summary.length > 300 ? `${summary.slice(0, 297)}…` : summary}</p>}
            {(who.length > 0 || where.length > 0) && (
              <div className="row small" style={{ flexWrap: "wrap" }}>
                {who.length > 0 && <span className="muted">NPCs:</span>}
                {who.map((name) => {
                  const npc = dm.npcs.find((n) => n.name === name);
                  return npc?.note ? (
                    <button key={name} className="pill small" onClick={() => onOpenNote(npc.note!)}>
                      {name}
                    </button>
                  ) : (
                    <span key={name} className="pill small">
                      {name}
                    </span>
                  );
                })}
                {where.length > 0 && <span className="muted">Notes:</span>}
                {where.map((n) => (
                  <button key={n.file} className="pill small" onClick={() => onOpenNote(n.file)}>
                    {n.title}
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
