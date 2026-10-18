// The centre pane: editable note title (renames the file) and the TipTap editor.
// Saves Markdown back to disk ~600 ms after the last change.

import { Extension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { BubbleMenu, EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyLink, applyLinks, findMentions, linkAtSelection, selectedRange, type TextRange } from "../editor/linking.ts";
import { fileShape, fromEditor, noteExtensions, toEditorContent, type FileShape } from "../editor/markdown.ts";
import { MissingLinks, missingLinksKey } from "../editor/MissingLinks.ts";
import type { DataStore } from "../lib/data.ts";
import { choiceKey, resolveSelection, type Match } from "../lib/search.ts";
import { readNote, renameNote, writeNote } from "../lib/store.ts";
import { entryKey, type CampaignConfig, type Entry } from "../lib/types.ts";
import LinkPicker, { KIND_LABEL } from "./LinkPicker.tsx";

export type SaveState = { kind: "saved" } | { kind: "dirty" } | { kind: "saving" } | { kind: "error"; message: string };

/** What the editor can be asked to do from outside (e.g. "relink" from a hover card). */
export interface NoteEditorApi {
  /** Open the picker for the link currently spanning `from..to`. */
  relink: (range: { from: number; to: number }) => void;
}

interface Props {
  campaign: string;
  file: string;
  data: DataStore;
  config: CampaignConfig;
  onConfig: (cfg: CampaignConfig) => void;
  /** Focus and select the title (for a brand-new note). */
  isNew?: boolean;
  onSaved: (file: string) => void;
  onRenamed: (oldFile: string, newFile: string) => void;
  /** Ask to delete this note (the workspace confirms and moves it to the trash). */
  onDelete?: (file: string, title: string) => void;
  /** Called whenever an entry is linked (for the "Used this session" tray). */
  onLinked?: (entry: Entry) => void;
  /** Lets later features (hover cards) reach the editor. */
  onEditor?: (editor: Editor | null, api: NoteEditorApi) => void;
}

interface PickerState {
  range: TextRange;
  initial?: Match[];
  anchor: { left: number; top: number; bottom: number };
  title?: string;
}

interface Notice {
  entry: Entry;
  text: string;
  range: { from: number; to: number };
  mentions: number;
}

const AUTOSAVE_MS = 600;
const NOTICE_MS = 7000;
const titleOf = (file: string) => file.replace(/\.md$/i, "");

export default function NoteEditor({ campaign, file, data, config, onConfig, isNew, onSaved, onRenamed, onDelete, onLinked, onEditor }: Props) {
  const [loaded, setLoaded] = useState<{ text: string; shape: FileShape } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState(titleOf(file));
  const [titleError, setTitleError] = useState("");
  const [save, setSave] = useState<SaveState>({ kind: "saved" });
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const editorRef = useRef<Editor | null>(null);
  // Ctrl+L is registered once per editor; it always calls the latest handler.
  const linkHandler = useRef<() => void>(() => {});
  const shortcuts = useMemo(
    () =>
      Extension.create({
        name: "lorewrightShortcuts",
        addKeyboardShortcuts: () => ({
          "Mod-l": () => {
            linkHandler.current();
            return true;
          },
        }),
      }),
    [],
  );

  const fileRef = useRef(file);
  const pending = useRef<string | null>(null); // Markdown not yet written
  const timer = useRef<number | undefined>(undefined);
  const titleInput = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const flush = async () => {
    window.clearTimeout(timer.current);
    const text = pending.current;
    if (text == null) return;
    pending.current = null;
    setSave({ kind: "saving" });
    try {
      await writeNote(campaign, fileRef.current, text);
      setSave((s) => (pending.current == null && s.kind !== "error" ? { kind: "saved" } : s));
      onSaved(fileRef.current);
    } catch (e) {
      pending.current ??= text; // retry on the next change
      setSave({ kind: "error", message: (e as Error)?.message ?? String(e) });
    }
  };

  // Load the file once per note.
  useEffect(() => {
    let cancelled = false;
    readNote(campaign, file)
      .then((text) => !cancelled && setLoaded({ text, shape: fileShape(text) }))
      .catch((e) => !cancelled && setLoadError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
    // The component is keyed by campaign + file, so this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One editor per note; the file's content is put in once it has loaded.
  const shapeRef = useRef<FileShape | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const missingLinks = useMemo(
    () => MissingLinks.configure({ isMissing: (a) => !dataRef.current.find(a.kind, a.name, a.source) }),
    [],
  );
  const editor = useEditor({
    extensions: noteExtensions([Placeholder.configure({ placeholder: "Write your session notes…" }), shortcuts, missingLinks]),
    content: "",
    editable: false,
    editorProps: {
      attributes: { class: "note-body", spellcheck: "true", role: "textbox", "aria-multiline": "true", "aria-label": "Note text" },
    },
    onUpdate: ({ editor }) => {
      if (!shapeRef.current) return;
      pending.current = fromEditor(editor, shapeRef.current);
      setSave({ kind: "dirty" });
      // Any edit makes an earlier "linked / link other mentions" notice stale.
      setNotice(null);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), AUTOSAVE_MS);
    },
  });

  useEffect(() => {
    if (!editor || !loaded || shapeRef.current) return;
    editor.commands.setContent(toEditorContent(loaded.text), false); // no update event: loading isn't an edit
    editor.setEditable(true, false);
    shapeRef.current = loaded.shape;
  }, [editor, loaded]);

  editorRef.current = editor;

  // Re-check which links are missing when the loaded data changes (import, sync).
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(missingLinksKey, true));
  }, [editor, data]);

  // ---------- highlight-to-link ----------

  const anchorFor = (ed: Editor, range: { from: number; to: number }) => {
    const a = ed.view.coordsAtPos(range.from);
    const b = ed.view.coordsAtPos(range.to);
    return { left: a.left, top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
  };

  const openPicker = (range: TextRange, initial?: Match[], pickerTitle?: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    setNotice(null);
    setPicker({ range, initial, anchor: anchorFor(ed, range), title: pickerTitle });
  };

  const finishLink = (range: TextRange, entry: Entry, remember: boolean) => {
    const ed = editorRef.current;
    if (!ed) return;
    applyLink(ed, range, entry);
    ed.commands.focus();
    if (remember) {
      onConfig({ ...config, choices: { ...config.choices, [choiceKey(range.text)]: entryKey(entry) } });
    }
    onLinked?.(entry);
    const mentions = findMentions(ed.state.doc, range.text).length;
    setNotice({ entry, text: range.text, range: { from: range.from, to: range.to }, mentions });
  };

  /** Ctrl+L and the bubble menu button: unlink a link, or link the selection. */
  const toggleLink = () => {
    const ed = editorRef.current;
    if (!ed || !ed.isEditable) return;
    const link = linkAtSelection(ed);
    if (link) {
      ed.chain().focus().setTextSelection({ from: link.from, to: link.to }).unsetFiveLink().setTextSelection(link.to).run();
      return;
    }
    const range = selectedRange(ed);
    if (!range) return;
    const res = resolveSelection(data.index, range.text, config);
    if (res.type === "link") finishLink(range, res.entry, false);
    else openPicker(range, res.matches);
  };
  linkHandler.current = toggleLink;

  const relink = (r: { from: number; to: number }) => {
    const ed = editorRef.current;
    if (!ed) return;
    const text = ed.state.doc.textBetween(r.from, r.to);
    openPicker({ ...r, text }, undefined, "Relink");
  };
  const apiRef = useRef<NoteEditorApi>({ relink });
  apiRef.current.relink = relink;

  const linkAllMentions = () => {
    const ed = editorRef.current;
    if (!ed || !notice) return;
    applyLinks(ed, findMentions(ed.state.doc, notice.text), notice.entry);
    setNotice(null);
  };

  const changeLink = () => {
    const ed = editorRef.current;
    if (!ed || !notice) return;
    openPicker({ ...notice.range, text: notice.text }, undefined, "Change link");
  };

  // The plain "Linked to …" notice fades; one offering to link other mentions stays until used.
  useEffect(() => {
    if (!notice || notice.mentions) return;
    const t = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    onEditor?.(editor, apiRef.current);
    return () => onEditor?.(null, apiRef.current);
  }, [editor, onEditor]);

  // Write any pending change when switching notes or closing.
  useEffect(() => {
    const beforeUnload = () => void flush();
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isNew && loaded) {
      titleInput.current?.focus();
      titleInput.current?.select();
    }
  }, [isNew, loaded]);

  const commitTitle = async () => {
    const wanted = title.trim();
    setTitleError("");
    if (!wanted) {
      setTitle(titleOf(fileRef.current));
      return;
    }
    if (wanted === titleOf(fileRef.current)) return;
    try {
      await flush();
      const old = fileRef.current;
      const next = await renameNote(campaign, old, wanted);
      fileRef.current = next;
      setTitle(titleOf(next));
      onRenamed(old, next);
    } catch (e) {
      setTitleError((e as Error)?.message ?? String(e));
    }
  };

  return (
    <div className="note" ref={rootRef}>
      <div className="note-head">
        <input
          ref={titleInput}
          className="note-title"
          value={title}
          aria-label="Note title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commitTitle().then(() => {
                // Focus the live editor element (the editor instance can be rebuilt after load).
                const el = rootRef.current?.querySelector<HTMLElement>(".ProseMirror");
                el?.focus();
              });
            } else if (e.key === "Escape") {
              setTitle(titleOf(fileRef.current));
            }
          }}
        />
        <SaveIndicator state={save} />
        {onDelete && (
          <button className="ghost small" title="Delete this note" onClick={() => onDelete(fileRef.current, titleOf(fileRef.current))}>
            Delete
          </button>
        )}
      </div>
      {titleError && <div className="small error note-msg">{titleError}</div>}
      {loadError ? (
        <div className="error note-msg">Couldn't open this note: {loadError}</div>
      ) : (
        <EditorContent editor={editor} className="note-scroll" />
      )}

      {/* Wrapped: the menu element is moved into a popup, which confuses React if it's a direct sibling. */}
      <div className="bubble-host">
        {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 120, placement: "top", maxWidth: "none" }}
          shouldShow={({ editor: ed, state }) => !picker && !state.selection.empty && ed.isFocused && !!selectedRange(ed as Editor)}
        >
          <div className="bubble">
            <button
              className="bubble-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleLink}
              title="Ctrl+L"
            >
              {linkAtSelection(editor) ? "Unlink" : "Link to 5e.tools"}
              <kbd>Ctrl+L</kbd>
            </button>
          </div>
        </BubbleMenu>
        )}
      </div>

      {picker && (
        <LinkPicker
          data={data}
          query={picker.range.text}
          initial={picker.initial}
          allowedSources={config.allowedSources}
          anchor={picker.anchor}
          title={picker.title}
          onPick={(entry) => {
            const range = picker.range;
            setPicker(null);
            finishLink(range, entry, true);
          }}
          onClose={() => {
            const range = picker.range;
            setPicker(null);
            editorRef.current?.chain().focus().setTextSelection(range).run();
          }}
        />
      )}

      {notice && (
        <div className={`notice k-${notice.entry.kind}`} role="status">
          <span className="kind-dot" />
          <span className="grow">
            Linked “{notice.text}” to <b>{notice.entry.name}</b>{" "}
            <span className="muted">
              {KIND_LABEL[notice.entry.kind]} · {notice.entry.source}
            </span>
          </span>
          <button className="ghost small" onClick={changeLink}>
            Change
          </button>
          {notice.mentions > 0 && (
            <button className="primary small" onClick={linkAllMentions}>
              Link {notice.mentions} other mention{notice.mentions > 1 ? "s" : ""}
            </button>
          )}
          <button className="ghost small" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const label =
    state.kind === "saved" ? "Saved" : state.kind === "saving" ? "Saving…" : state.kind === "dirty" ? "Edited" : "Not saved";
  return (
    <span className={`save-state save-${state.kind}`} title={state.kind === "error" ? state.message : undefined} aria-live="polite">
      {label}
    </span>
  );
}
