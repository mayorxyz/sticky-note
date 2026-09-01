import { useEffect, useState, type RefObject } from "react";
import type { Note, NoteInk } from "../data/types";
import { NOTE_INKS } from "../data/types";
import StickyNote from "./StickyNote";

interface RailProps {
  notes: Note[];
  snippetFor: (noteId: string) => string | undefined;
  onPatch: (id: string, patch: Partial<Note>) => void;
  onDelete: (id: string) => void;
  emptyHint?: string;
}

/** The margin column: notes stacked in source order beside the document. */
export function MarginRail({ notes, snippetFor, onPatch, onDelete, emptyHint }: RailProps) {
  return (
    <div className="pa-notes flex w-60 shrink-0 flex-col gap-6 pt-1 xl:w-72" aria-label="Margin notes">
      {notes.length === 0 && (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs italic leading-relaxed text-ink-faint">
          {emptyHint ?? "Margin notes land here, tied to their passage with a thread of ink."}
        </p>
      )}
      {notes.map((n) => (
        <StickyNote key={n.id} note={n} snippet={snippetFor(n.id)} onPatch={onPatch} onDelete={onDelete} />
      ))}
    </div>
  );
}

const INK_STROKE: Record<NoteInk, string> = {
  blue: NOTE_INKS[0].css,
  red: NOTE_INKS[1].css,
  pencil: NOTE_INKS[2].css,
};

interface ConnectorProps {
  containerRef: RefObject<HTMLDivElement | null>;
  scrollerRef: RefObject<HTMLElement | null>;
  notes: Note[];
  revision: number;
}

/**
 * Draws a thin curved ink thread from each margin note to the mark it
 * annotates. Recomputed on scroll/resize/annotation changes.
 */
export function ConnectorLayer({ containerRef, scrollerRef, notes, revision }: ConnectorProps) {
  const [paths, setPaths] = useState<{ id: string; d: string; color: string }[]>([]);

  useEffect(() => {
    let raf = 0;
    const compute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const root = containerRef.current;
        if (!root) {
          setPaths([]);
          return;
        }
        const rootRect = root.getBoundingClientRect();
        const next: { id: string; d: string; color: string }[] = [];
        for (const note of notes) {
          if (note.placement !== "margin" || !note.highlightId) continue;
          const noteEl = root.querySelector(`[data-note-anchor="${note.id}"]`);
          const markEl = root.querySelector(
            `[data-hlid="${note.highlightId}"], [data-lh="${note.highlightId}"]`
          );
          if (!noteEl || !markEl) continue;
          const a = markEl.getBoundingClientRect();
          const b = noteEl.getBoundingClientRect();
          const x1 = a.right - rootRect.left + 2;
          const y1 = a.top + a.height / 2 - rootRect.top;
          const x2 = b.left - rootRect.left - 3;
          const y2 = b.top - rootRect.top + 18;
          const cx = x1 + Math.max(26, (x2 - x1) * 0.55);
          next.push({
            id: note.id,
            color: INK_STROKE[note.ink],
            d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cx.toFixed(1)} ${y1.toFixed(1)}, ${cx.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`,
          });
        }
        setPaths(next);
      });
    };
    compute();
    const scroller = scrollerRef.current;
    scroller?.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      cancelAnimationFrame(raf);
      scroller?.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
      ro.disconnect();
    };
  }, [notes, containerRef, scrollerRef, revision]);

  return (
    <svg
      className="pa-connectors pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
      aria-hidden="true"
    >
      {paths.map((p) => (
        <path
          key={p.id}
          d={p.d}
          fill="none"
          stroke={p.color}
          strokeWidth="1.5"
          strokeDasharray="1 5.5"
          strokeLinecap="round"
          opacity="0.8"
        />
      ))}
    </svg>
  );
}
