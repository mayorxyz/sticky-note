/* Core data model — persisted under "paper-annotate.docs.v1". */

export type MarkType = "highlight" | "underline" | "strikethrough";
export type MarkColor = "sun" | "rose" | "moss" | "sky" | "amber";
export type NoteFont = "caveat" | "kalam" | "patrick-hand";
export type NoteInk = "blue" | "red" | "pencil";
export type Placement = "margin" | "freeform";
export type RenderMode = "reflow" | "layout";

/** Fractional rect (0..1) relative to its page — resolution independent. */
export interface RectF {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextItemF {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageData {
  pageNum: number;
  imageUrl: string;
  textItems: TextItemF[];
  /** pixel size of the rendered image, used for aspect ratio */
  w: number;
  h: number;
}

export interface DocumentRecord {
  id: string;
  title: string;
  sourceType: "pdf" | "text";
  mode: RenderMode;
  /** reflow content (always kept for PDFs too, so switching back is instant) */
  markdown?: string;
  /** layout pages; only present when layout has been processed */
  pages?: PageData[];
  createdAt: string;
  /** small jpeg data-url thumbnail (layout PDFs) */
  thumb?: string;
  fileName?: string;
  pageCount?: number;
  words?: number;
  /** document-wide default placement for new sticky notes */
  notePlacement?: Placement;
}

export type HighlightAnchor =
  | { kind: "text"; start: number; end: number; snippet?: string }
  | { kind: "page"; page: number; rects: RectF[]; snippet?: string };

export interface Highlight {
  id: string;
  docId: string;
  type: MarkType;
  color: MarkColor;
  anchor: HighlightAnchor;
}

export interface Note {
  id: string;
  docId: string;
  highlightId?: string;
  content: string;
  tags: string[];
  font: NoteFont;
  ink: NoteInk;
  placement: Placement;
  /** For freeform notes in layout mode: the page the note is stuck on. */
  page?: number;
  /**
   * Freeform: { x, y } — px inside the reflow article, or page fractions (0..1)
   * inside a layout page; w/h optional remembered size.
   * Margin: { afterHighlight: true }.
   */
  position: { x: number; y: number; w?: number; h?: number } | { afterHighlight: true };
  collapsed: boolean;
  createdAt: string;
}

export interface AnnotationsState {
  highlights: Highlight[];
  notes: Note[];
}

export interface StoredData {
  version: 1;
  docs: DocumentRecord[];
  annotations: Record<string, AnnotationsState>;
  theme?: "light" | "dark";
}

/* ————— presentation metadata ————— */

export const MARK_COLORS: { key: MarkColor; label: string }[] = [
  { key: "sun", label: "Sunflower" },
  { key: "rose", label: "Rose" },
  { key: "moss", label: "Moss" },
  { key: "sky", label: "Sky" },
  { key: "amber", label: "Amber" },
];

export const MARK_TYPES: { key: MarkType; label: string }[] = [
  { key: "highlight", label: "Highlight" },
  { key: "underline", label: "Underline" },
  { key: "strikethrough", label: "Strikethrough" },
];

export const NOTE_FONTS: { key: NoteFont; label: string; css: string }[] = [
  { key: "caveat", label: "Caveat", css: "var(--font-note-caveat)" },
  { key: "kalam", label: "Kalam", css: "var(--font-note-kalam)" },
  { key: "patrick-hand", label: "Patrick Hand", css: "var(--font-note-patrick)" },
];

export const NOTE_INKS: { key: NoteInk; label: string; css: string }[] = [
  { key: "blue", label: "Blue ink", css: "var(--ink-blue)" },
  { key: "red", label: "Red ink", css: "var(--ink-red)" },
  { key: "pencil", label: "Pencil", css: "var(--ink-pencil)" },
];

export const EMPTY_ANNOTATIONS: AnnotationsState = { highlights: [], notes: [] };
