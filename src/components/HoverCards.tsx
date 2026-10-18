// Floating cards shown when hovering a link (~250 ms). Links inside a card open
// another card on top, so you can follow "paralyzed" from inside Hold Person.
// Cards stay open while the pointer is on them or their link.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DataStore } from "../lib/data.ts";
import type { Entry } from "../lib/types.ts";
import { EntryCard, MissingCard } from "./EntryCard.tsx";

const OPEN_MS = 250;
const CLOSE_MS = 300;

export type LinkAttrs = { kind: string; name: string; source: string };

export const linkAttrs = (el: HTMLElement): LinkAttrs => ({
  kind: el.dataset["5e"] ?? "",
  name: el.dataset.name ?? "",
  source: el.dataset.source ?? "",
});

interface Card {
  id: number;
  level: number;
  link: HTMLElement;
  attrs: LinkAttrs;
  entry?: Entry;
  rect: DOMRect;
}

interface Props {
  data: DataStore;
  /** A card for a found entry was shown (feeds "Used this session"). */
  onShown?: (entry: Entry) => void;
  /** Relink a missing link that lives in the note editor. */
  onRelink: (link: HTMLElement) => void;
  /** Bumped by the parent to close every card (e.g. after a click). */
  closeSignal: number;
  /** Looks up links the notes data doesn't know (character-sheet rules: class features…). */
  resolve?: (attrs: LinkAttrs) => Entry | undefined;
}

let nextId = 1;

export default function HoverCards({ data, onShown, onRelink, closeSignal, resolve }: Props) {
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  const [cards, setCards] = useState<Card[]>([]);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const dataRef = useRef(data);
  dataRef.current = data;
  const shownRef = useRef(onShown);
  shownRef.current = onShown;

  useEffect(() => setCards([]), [closeSignal, data]);

  const open = useCallback((link: HTMLElement, level: number) => {
    if (!link.isConnected) return;
    const attrs = linkAttrs(link);
    const entry = dataRef.current.find(attrs.kind, attrs.name, attrs.source) ?? resolveRef.current?.(attrs);
    const card: Card = { id: nextId++, level, link, attrs, entry, rect: link.getBoundingClientRect() };
    setCards((c) => [...c.slice(0, level), card]);
    if (entry) shownRef.current?.(entry);
  }, []);

  useEffect(() => {
    let openTimer: number | undefined;
    let trimTimer: number | undefined;

    const over = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const cardEl = t.closest<HTMLElement>(".hover-card");
      const level = cardEl ? Number(cardEl.dataset.level) : -1;
      const link = t.closest<HTMLElement>("[data-5e]");
      const cur = cardsRef.current;

      window.clearTimeout(openTimer);
      const alreadyOpen = !!link && cur[level + 1]?.link === link;
      if (link && !alreadyOpen) openTimer = window.setTimeout(() => open(link, level + 1), OPEN_MS);

      // Close cards deeper than where the pointer is, after a short grace period
      // (so the pointer can travel from a link to its card).
      const keep = alreadyOpen ? level + 1 : level;
      window.clearTimeout(trimTimer);
      if (cur.length - 1 > keep) trimTimer = window.setTimeout(() => setCards((c) => c.slice(0, keep + 1)), CLOSE_MS);
    };
    const close = () => {
      window.clearTimeout(openTimer);
      setCards([]);
    };
    const scroll = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(".hover-card")) return;
      if (cardsRef.current.length) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && cardsRef.current.length) close();
    };
    const leaveWindow = (e: MouseEvent) => {
      if (!e.relatedTarget) {
        window.clearTimeout(openTimer);
        window.clearTimeout(trimTimer);
        trimTimer = window.setTimeout(close, CLOSE_MS);
      }
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("scroll", scroll, true);
    document.addEventListener("keydown", key);
    document.addEventListener("mouseout", leaveWindow);
    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(trimTimer);
      document.removeEventListener("mouseover", over);
      document.removeEventListener("scroll", scroll, true);
      document.removeEventListener("keydown", key);
      document.removeEventListener("mouseout", leaveWindow);
    };
  }, [open]);

  return (
    <>
      {cards.map((c) => (
        <FloatingCard key={c.id} card={c}>
          {c.entry ? (
            <EntryCard entry={c.entry} data={data} />
          ) : (
            <MissingCard
              attrs={c.attrs}
              onRelink={
                c.link.closest(".ProseMirror")
                  ? () => {
                      setCards([]);
                      onRelink(c.link);
                    }
                  : undefined
              }
            />
          )}
        </FloatingCard>
      ))}
    </>
  );
}

function FloatingCard({ card, children }: { card: Card; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: card.rect.left, top: card.rect.bottom + 4, ready: false });

  // Below the link if it fits, otherwise above; never off the side of the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(card.rect.left, window.innerWidth - r.width - 8));
    const below = card.rect.bottom + 4;
    const fitsBelow = below + r.height <= window.innerHeight - 8;
    const top = fitsBelow ? below : Math.max(8, card.rect.top - r.height - 4);
    setPos({ left, top, ready: true });
  }, [card]);

  return (
    <div
      ref={ref}
      className={`hover-card card k-${card.attrs.kind}`}
      data-level={card.level}
      style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden", zIndex: 30 + card.level }}
      role="tooltip"
    >
      {children}
    </div>
  );
}
