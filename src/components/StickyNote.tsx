import { useMemo, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { Note, NoteFont, NoteInk } from "../data/types";
import { NOTE_FONTS, NOTE_INKS } from "../data/types";
import { IconCheck, IconMaximize, IconMinimize, IconPen, IconTrash } from "./icons";

const FONT_CYCLE: NoteFont[] = ["caveat", "kalam", "patrick-hand", "shadows", "indie", "architects"];
const INK_CYCLE: NoteInk[] = ["blue", "red", "pencil"];
/** size factor per hand, so each face reads at a comparable scale */
const SIZE_FACTOR: Record<NoteFont, number> = {
  caveat: 1.25,
  kalam: 0.94,
  "patrick-hand": 1.0,
  shadows: 1.05,
  indie: 0.95,
  architects: 0.88,
};

interface Props {
  note: Note;
  snippet?: string;
  onPatch: (id: string, patch: Partial<Note>) => void;
  onDelete: (id: string) => void;
  /** present only for draggable margin notes (desktop) */
  onLiftPointerDown?: (e: PointerEvent, noteId: string) => void;
}

export default function StickyNote({ note, snippet, onPatch, onDelete, onLiftPointerDown }: Props) {
  const tilt = useMemo(() => {
    let h = 0;
    for (const ch of note.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return ((h % 100) / 100) * 3 - 1.5;
  }, [note.id]);

  const fontCss = NOTE_FONTS.find((f) => f.key === note.font)?.css ?? NOTE_FONTS[0].css;
  const inkCss = NOTE_INKS.find((i) => i.key === note.ink)?.css ?? NOTE_INKS[0].css;

  function onTextareaKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onPatch(note.id, { collapsed: true });
    }
  }

  const style: CSSProperties = {
    fontFamily: fontCss,
    color: inkCss,
    fontSize: `calc(var(--note-size) * ${SIZE_FACTOR[note.font] ?? 1})`,
    rotate: `${tilt}deg`,
    transition: "box-shadow 0.2s ease, opacity 0.25s ease, filter 0.25s ease",
  };

  return (
    <div
      data-note-anchor={note.id}
      id={`note-${note.id}`}
      className={`pa-note${note.resolved ? " resolved" : ""}`}
      style={style}
      aria-label={`Sticky note${note.tags.length ? `, tagged ${note.tags.join(", ")}` : ""}`}
    >
      <div className="note-toolbar" data-nodrag>
        <button
          title={note.resolved ? "Reopen this note" : "Mark note as resolved"}
          aria-pressed={!!note.resolved}
          className={note.resolved ? "toggled" : ""}
          onClick={() => onPatch(note.id, { resolved: !note.resolved })}
        >
          <IconCheck size={13} />
        </button>
        <button
          title="Switch handwriting"
          onClick={() =>
            onPatch(note.id, {
              font: FONT_CYCLE[(FONT_CYCLE.indexOf(note.font) + 1) % FONT_CYCLE.length],
            })
          }
        >
          <IconPen size={13} />
        </button>
        <button
          title="Switch ink"
          onClick={() =>
            onPatch(note.id, { ink: INK_CYCLE[(INK_CYCLE.indexOf(note.ink) + 1) % INK_CYCLE.length] })
          }
        >
          <span
            className="inline-block h-3 w-3 rounded-full border border-[rgba(60,50,10,0.4)]"
            style={{ background: inkCss }}
          />
        </button>
        <button
          title={`Move to ${note.placement === "margin" ? "freeform" : "the margin rail"}`}
          onClick={() =>
            onPatch(note.id, { placement: note.placement === "margin" ? "freeform" : "margin" })
          }
        >
          {note.placement === "margin" ? <IconMaximize size={13} /> : <IconMinimize size={13} />}
        </button>
        <button
          title={note.collapsed ? "Expand note" : "Collapse note"}
          onClick={() => onPatch(note.id, { collapsed: !note.collapsed })}
        >
          {note.collapsed ? <IconMaximize size={13} /> : <IconMinimize size={13} />}
        </button>
        <button title="Tear up note" onClick={() => onDelete(note.id)}>
          <IconTrash size={13} />
        </button>
      </div>

      {onLiftPointerDown && (
        <span
          className="drag-grip"
          data-nodrag
          title="Drag — drop on the margin rail to pin it there, or anywhere else to leave it free"
          onPointerDown={(e) => onLiftPointerDown(e, note.id)}
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
            <circle cx="2.5" cy="2.5" r="1.3" />
            <circle cx="7.5" cy="2.5" r="1.3" />
            <circle cx="2.5" cy="7" r="1.3" />
            <circle cx="7.5" cy="7" r="1.3" />
            <circle cx="2.5" cy="11.5" r="1.3" />
            <circle cx="7.5" cy="11.5" r="1.3" />
          </svg>
        </span>
      )}

      {note.collapsed ? (
        <button
          className="block w-full text-left"
          onClick={() => onPatch(note.id, { collapsed: false })}
          title="Expand note"
        >
          <span className="block truncate text-[0.85em] font-semibold">
            {note.content.trim()
              ? note.content.trim().slice(0, 46)
              : note.resolved
                ? "✓ resolved"
                : "…empty note"}
          </span>
        </button>
      ) : (
        <>
          <textarea
            className="note-body"
            value={note.content}
            placeholder={snippet ? "Write back…" : "Jot something down…"}
            onChange={(e) => onPatch(note.id, { content: e.target.value })}
            onKeyDown={onTextareaKey}
            rows={Math.max(2, Math.min(8, note.content.split("\n").length + 1))}
            aria-label="Note text — type #word to tag"
          />
          <textarea
            className="note-body !min-h-0 opacity-70"
            value={note.tags.map((t) => `#${t}`).join(" ")}
            placeholder="#tags"
            style={{ fontSize: "0.62em", fontFamily: "var(--font-body)", lineHeight: 1.4 }}
            rows={1}
            aria-label="Note tags, space separated"
            onChange={(e) => {
              const tags = Array.from(
                e.target.value.matchAll(/#([\p{L}\d_-]+)/gu),
                (m) => m[1].toLowerCase()
              );
              onPatch(note.id, { tags: Array.from(new Set(tags)) });
            }}
          />
          {snippet && (
            <p
              className="mt-1.5 border-t border-dashed border-[rgba(60,50,10,0.3)] pt-1 text-[0.62rem] leading-snug text-[rgba(60,50,10,0.75)]"
              style={{ fontFamily: "var(--font-body)" }}
            >
              ↳ “{snippet.slice(0, 90)}{snippet.length > 90 ? "…" : ""}”
            </p>
          )}
        </>
      )}
      <span className="fold-corner" aria-hidden="true" />
    </div>
  );
}
