import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Note, NoteFont, NoteInk, Placement } from "../data/types";
import { NOTE_FONTS, NOTE_INKS } from "../data/types";
import {
  IconMaximize,
  IconMove,
  IconRows,
  IconTag,
  IconTrash,
  IconType,
  IconX,
} from "./icons";

export function tiltFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * 3 - 1.5; // ±1.5°
}

interface Props {
  note: Note;
  snippet?: string;
  onPatch: (id: string, patch: Partial<Note>) => void;
  onDelete: (id: string) => void;
}

export default function StickyNote({ note, snippet, onPatch, onDelete }: Props) {
  const [tagOpen, setTagOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const fontMeta = NOTE_FONTS.find((f) => f.key === note.font) ?? NOTE_FONTS[0];
  const inkMeta = NOTE_INKS.find((k) => k.key === note.ink) ?? NOTE_INKS[0];
  const tilt = tiltFor(note.id);

  useEffect(() => {
    const el = areaRef.current;
    if (!el || note.collapsed) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 74)}px`;
  }, [note.content, note.collapsed, note.font]);

  function cycleFont() {
    const i = NOTE_FONTS.findIndex((f) => f.key === note.font);
    const next = NOTE_FONTS[(i + 1) % NOTE_FONTS.length].key as NoteFont;
    onPatch(note.id, { font: next });
  }
  function cycleInk() {
    const i = NOTE_INKS.findIndex((f) => f.key === note.ink);
    const next = NOTE_INKS[(i + 1) % NOTE_INKS.length].key as NoteInk;
    onPatch(note.id, { ink: next });
  }
  function togglePlacement() {
    const next: Placement = note.placement === "margin" ? "freeform" : "margin";
    onPatch(note.id, { placement: next });
  }
  function commitTag() {
    const t = tagDraft.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
    if (t && !note.tags.includes(t)) onPatch(note.id, { tags: [...note.tags, t] });
    setTagDraft("");
  }
  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      commitTag();
    } else if (e.key === "Escape") {
      setTagOpen(false);
    }
  }

  return (
    <div
      id={`note-${note.id}`}
      data-note-anchor={note.id}
      className="pa-note wiggle-hover"
      style={
        {
          fontFamily: fontMeta.css,
          color: inkMeta.css,
          "--tilt": `${tilt}deg`,
          transform: `rotate(${tilt}deg)`,
        } as CSSProperties
      }
      aria-label={
        note.collapsed
          ? `Collapsed sticky note${snippet ? ` on “${snippet}”` : ""}`
          : `Sticky note${snippet ? ` on “${snippet}”` : ""}`
      }
    >
      <div className="note-toolbar" role="toolbar" aria-label="Note controls">
        <button onClick={cycleFont} title={`Hand: ${fontMeta.label} — click to cycle`} aria-label="Change handwriting font">
          <IconType size={13} />
        </button>
        <button onClick={cycleInk} title={`Ink: ${inkMeta.label} — click to cycle`} aria-label="Change ink color">
          <span
            className="inline-block h-3 w-3 rounded-full border border-[rgba(var(--shadow-ink),0.3)]"
            style={{ background: inkMeta.css }}
          />
        </button>
        <button
          onClick={togglePlacement}
          title={note.placement === "margin" ? "Unpin — place freely" : "Pin to margin rail"}
          aria-label={note.placement === "margin" ? "Switch to freeform placement" : "Switch to margin placement"}
        >
          {note.placement === "margin" ? <IconMove size={13} /> : <IconRows size={13} />}
        </button>
        <button onClick={() => setTagOpen((v) => !v)} title="Tags" aria-label="Edit tags" aria-expanded={tagOpen}>
          <IconTag size={13} />
        </button>
        <button
          onClick={() => onPatch(note.id, { collapsed: !note.collapsed })}
          title={note.collapsed ? "Expand note" : "Collapse note"}
          aria-label={note.collapsed ? "Expand note" : "Collapse note"}
        >
          {note.collapsed ? <IconMaximize size={13} /> : <span className="text-[13px] leading-none">—</span>}
        </button>
        <button onClick={() => onDelete(note.id)} title="Delete note" aria-label="Delete note">
          <IconTrash size={13} />
        </button>
      </div>

      {note.collapsed ? (
        <button
          className="flex w-full items-center gap-1.5 text-left text-[1.02em] font-medium"
          onClick={() => onPatch(note.id, { collapsed: false })}
        >
          <IconMaximize size={12} className="shrink-0 opacity-70" />
          <span className="truncate">
            {note.content.trim() ? note.content.trim().slice(0, 26) : "(empty note)"}
            {note.content.trim().length > 26 ? "…" : ""}
          </span>
        </button>
      ) : (
        <textarea
          ref={areaRef}
          className="note-body"
          style={{ fontSize: note.font === "caveat" ? "1.28em" : "1.02em" }}
          value={note.content}
          placeholder="Write in the margin…"
          aria-label="Note text"
          onChange={(e) => onPatch(note.id, { content: e.target.value })}
        />
      )}

      {(note.tags.length > 0 || tagOpen) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {note.tags.map((t) => (
            <span key={t} className="tag-chip">
              #{t}
              <button
                className="ml-0.5 opacity-60 hover:opacity-100"
                onClick={() => onPatch(note.id, { tags: note.tags.filter((x) => x !== t) })}
                aria-label={`Remove tag ${t}`}
              >
                <IconX size={9} />
              </button>
            </span>
          ))}
          {tagOpen && (
            <input
              autoFocus
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={onTagKey}
              onBlur={() => {
                commitTag();
                setTagOpen(false);
              }}
              placeholder="#tag ⏎"
              className="w-16 rounded border border-[rgba(var(--shadow-ink),0.25)] bg-transparent px-1 py-0 font-body text-[0.66rem] outline-none placeholder:opacity-60"
              aria-label="Add a tag"
            />
          )}
        </div>
      )}

      <div className="fold-corner" aria-hidden="true" />
    </div>
  );
}
