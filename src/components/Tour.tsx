// Shows a guided tour: dims the screen, lights up what each step is about,
// and puts a card next to it with Back, Next and Skip. Arrow keys and Enter
// move through it; Esc ends it.

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cardPosition, tourById, type TourId } from "../lib/tours.ts";

export interface TourApi {
  /** Start a tour now (from Help). */
  start: (id: TourId) => void;
  /** Start it only if it hasn't been seen (the first time an area opens). */
  auto: (id: TourId) => void;
}

export const TourContext = createContext<TourApi>({ start: () => {}, auto: () => {} });
export const useTour = () => useContext(TourContext);

type Box = { top: number; left: number; width: number; height: number };

const findTarget = (sel?: string): HTMLElement | null => {
  if (!sel) return null;
  for (const s of sel.split(",")) {
    const el = document.querySelector<HTMLElement>(s.trim());
    // Empty or hidden parts (an empty list) count as not on screen.
    const r = el?.getBoundingClientRect();
    if (el && r && r.width > 4 && r.height > 4) return el;
  }
  return null;
};

export function TourOverlay({ id, onEnd }: { id: TourId; onEnd: () => void }) {
  const tour = tourById(id);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const card = useRef<HTMLDivElement>(null);
  const step = tour.steps[i];
  const last = i === tour.steps.length - 1;

  // Follow the target as the page moves or resizes.
  useEffect(() => {
    const el = findTarget(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: "center" });
    }
    const measure = () => {
      const t = findTarget(step.target);
      if (!t) return setBox(null);
      const r = t.getBoundingClientRect();
      const pad = 6;
      setBox({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
    };
    measure();
    const t = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("resize", measure);
    };
  }, [step.target]);

  useLayoutEffect(() => {
    const c = card.current;
    if (!c) return;
    // A whole pane (taller than half the screen) gets the card inside it.
    const big = box && box.height > window.innerHeight * 0.6 && box.width > 300;
    setPos(cardPosition(big ? { ...box!, height: 0 } : box, { width: c.offsetWidth, height: c.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }));
  }, [box, i]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEnd();
      else if (e.key === "ArrowRight" || e.key === "Enter") last ? onEnd() : setI((x) => x + 1);
      else if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [last, onEnd]);

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label={tour.name}>
      {/* Clicks outside the card do nothing while the tour is open. */}
      <div className={`tour-catch ${box ? "" : "dim"}`} />
      {box && <div className="tour-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />}
      <div className="tour-card" ref={card} style={{ top: pos.top, left: pos.left }}>
        <div className="row">
          <b className="grow">{step.title}</b>
          <span className="small muted">
            {i + 1} / {tour.steps.length}
          </span>
        </div>
        <p>{step.text}</p>
        {step.target && !box && <p className="small muted">(That part isn't on screen right now.)</p>}
        <div className="row">
          <button className="ghost small" onClick={onEnd}>
            {last ? "Close" : "Skip tour"}
          </button>
          <span className="grow" />
          {i > 0 && (
            <button className="small" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          <button className="primary small" autoFocus onClick={() => (last ? onEnd() : setI(i + 1))}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
