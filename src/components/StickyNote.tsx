import { useMemo, type CSSProperties, type KeyboardEvent } from "react";
import type { Note, NoteFont, NoteInk } from "../data/types";
import { NOTE_FONTS, NOTE_INKS } from "../data/types";
import { IconCheck, IconMaximize, IconMinimize, IconPen, IconTrash } from "./icons";

const FONT_STACK: Record<NoteFont, string> = {
  caveat: "var(--font-note-caveat)",
  kalam: "var(--font-note-kalam)",
  "patrick-hand": "var(--font-note-patrick)",
};

const FONT_SIZE: Record<NoteFont, string> = {
  caveat: "1.32rem",
  kalam: "1rem",
  "patrick-hand": "1.06rem",
};

const INK_COLOR: Record<NoteInk, string> = {
  blue: "var(--ink-blue)",
  red: "var(--ink-red)",
  pencil: "var(--ink-pencil)",
};

interface Props {
  note: Note;
  /** snippet of the annotated passage, shown on the collapsed card */
  snippet?: string;
  onPatch: (id: string, patch: Partial<Note>) => void;
  onDelete: (id: string) => void;
}

export default function StickyNote({ note, snippet, onPatch, onDelete }: Props) {
  const tilt = useMemo(() => {
    const h = Array.from(note.id).reduce((a, c) => a + c.charCodeAt(0), 0);
    return ((h % 31) / 10 - 1.5).toFixed(2);
  }, [note.id]);

  function addTagFromInput(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const v = e.currentTarget.value.trim().replace(/^#/, "");
    if (!v) return;
    if (!note.tags.includes(v)) onPatch(note.id, { tags: [...note.tags, v] });
    e.currentTarget.value = "";
  }

  const style: CSSProperties = {
    transform: `rotate(${tilt}deg)`,
    fontFamily: FONT_STACK[note.font],
    fontSize: FONT_SIZE[note.font],
    color: INK_COLOR[note.ink],
  };

  const toolbar = (
    <div className="note-toolbar" role="toolbar" aria-label="Note controls">
      {NOTE_FONTS.map((f) => (
        <button
          key={f.key}
          title={`${f.label} hand`}
          aria-label={`Font: ${f.label}`}
          aria-pressed={note.font === f.key}
          style={{ fontFamily: FONT_STACK[f.key], fontSize: "0.95rem", fontWeight: 700, opacity: note.font === f.key ? 1 : 0.55 }}
          onClick={() => onPatch(note.id, { font: f.key })}
        >
          A
        </button>
      ))}
      {NOTE_INKS.map((i) => (
        <button
          key={i.key}
          title={i.label}
          aria-label={`Ink: ${i.label}`}
          aria-pressed={note.ink === i.key}
          onClick={() => onPatch(note.id, { ink: i.key })}
        >
          <span
            className="block h-2.5 w-2.5 rounded-full border border-[rgba(var(--shadow-ink),0.3)]"
            style={{ background: INK_COLOR[i.key], outline: note.ink === i.key ? "1.5px solid var(--ink)" : "none", outlineOffset: 1 }}
          />
        </button>
      ))}
      <button
        title={note.collapsed ? "Expand note" : "Collapse note"}
        aria-label={note.collapsed ? "Expand note" : "Collapse note"}
        onClick={() => onPatch(note.id, { collapsed: !note.collapsed })}
      >
        {note.collapsed ? <IconMaximize size={13} /> : <IconMinimize size={13} />}
      </button>
      <button title="Tear note off" aria-label="Delete note" onClick={() => onDelete(note.id)}>
        <IconTrash size={13} />
      </button>
    </div>
  );

  return (
    <div
      id={`note-${note.id}`}
      data-note-anchor={note.id}
      className="pa-note wiggle-hover h-full"
      style={style}
      aria-label={`Sticky note${note.tags.length ? ` tagged ${note.tags.map((t) => "#" + t).join(", ")}` : ""}`}
    >
      <span className="fold-corner" aria-hidden="true" />
      {toolbar}

      {note.collapsed ? (
        <button
          className="w-full cursor-pointer text-left"
          onClick={() => onPatch(note.id, { collapsed: false })}
          aria-expanded="false"
          title="Expand note"
        >
          <span className="block text-[0.72em] font-bold opacity-70">
            <IconPen size={12} className="mr-1 inline" style={{ verticalAlign: "-2px" }} />
            {note.tags.slice(0, 3).map((t) => `#${t}`).join(" ") || "note"}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-[0.85em] leading-snug opacity-80">
            {note.content.trim() || snippet || "…"}
          </span>
        </button>
      ) : (
        <div className="flex h-full flex-col">
          <textarea
            className="note-body flex-1"
            value={note.content}
            placeholder="Scribble here… #tags stick"
            aria-label="Note text"
            onChange={(e) => onPatch(note.id, { content: e.target.value })}
          />
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {note.tags.map((t) => (
              <span key={t} className="tag-chip" title={`Remove #${t}`}>
                #{t}
                <button
                  className="cursor-pointer opacity-60 hover:opacity-100"
                  aria-label={`Remove tag ${t}`}
                  onClick={() => onPatch(note.id, { tags: note.tags.filter((x) => x !== t) })}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              className="w-14 bg-transparent text-[0.62rem] font-semibold text-inherit outline-none placeholder:opacity-45"
              style={{ fontFamily: "var(--font-body)" }}
              placeholder="+ tag"
              aria-label="Add tag"
              onKeyDown={addTagFromInput}
            />
          </div>
          {snippet && (
            <p
              className="mt-1.5 border-t border-dashed border-[rgba(60,50,10,0.3)] pt-1 text-[0.62rem] leading-snug text-[rgba(60,50,10,0.75)]"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <IconCheck size={10} className="mr-0.5 inline" style={{ verticalAlign: "-1px" }} />
              <span className="line-clamp-2 italic">“{snippet}”</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
