/* Core data model — persisted under "paper-annotate.docs.v1". */

export type MarkType =
  | "highlight"
  | "underline"
  | "strikethrough"
  | "squiggly"
  | "box"
  | "circle";
export type MarkColor =
  | "sun"
  | "rose"
  | "moss"
  | "sky"
  | "amber"
  | "violet"
  | "teal"
  | "graphite"
  | "coral";
export type NoteFont =
  | "caveat"
  | "kalam"
  | "patrick-hand"
  | "shadows"
  | "indie"
  | "architects";
export type NoteInk = "blue" | "red" | "pencil";
export type Placement = "margin" | "freeform";
export type RenderMode = "reflow" | "layout";
export type ThemeChoice = "light" | "dark" | "black" | "system";
export type PaperStyle = "plain" | "lined" | "grid" | "dot" | "crumpled" | "aged" | "blueprint";
export type Orientation = "portrait" | "landscape";
export type ExportFormat = "pdf" | "markdown" | "json";

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
  /** per-document override of the global default note placement */
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
   * Freeform: { x, y } — px inside the reading container, or page fractions
   * (0..1) inside a layout page; w/h optional remembered size.
   * Margin: { afterHighlight: true }.
   */
  position: { x: number; y: number; w?: number; h?: number } | { afterHighlight: true };
  collapsed: boolean;
  createdAt: string;
  /** addressed/done — faded but kept in history and filters */
  resolved?: boolean;
  /** manual ordering slot for margin notes (future drag-reorder) */
  order?: number;
}

/** Lightweight position flag, separate from notes and highlights. */
export interface Bookmark {
  id: string;
  docId: string;
  label: string;
  anchor: { kind: "text"; offset: number } | { kind: "page"; page: number };
  createdAt: string;
}

export interface AnnotationsState {
  highlights: Highlight[];
  notes: Note[];
}

export interface Settings {
  theme: ThemeChoice;
  paperStyle: PaperStyle;
  orientation: Orientation;
  /** ordered subset of the full palette shown in the picker */
  activeHighlightColors: MarkColor[];
  /** color key → user-assigned meaning, surfaced as tooltips */
  highlightLabels: Record<string, string>;
  defaultNotePlacement: Placement;
  defaultNoteFont: NoteFont;
  defaultNoteInk: NoteInk;
  /** reflow body text size, px */
  readingFontSize: number;
  /** reflow column width, px */
  readingWidth: number;
  /** sticky-note hand size, px — independent of reading size */
  noteFontSize: number;
  reduceMotion: boolean;
  defaultExportFormat: ExportFormat;
}

export interface StoredData {
  version: 1;
  docs: DocumentRecord[];
  annotations: Record<string, AnnotationsState>;
  bookmarks: Bookmark[];
  /** legacy pre-settings theme, kept for migration */
  theme?: "light" | "dark";
  settings: Settings;
}

/* ————— presentation metadata ————— */

export const MARK_COLORS: { key: MarkColor; label: string }[] = [
  { key: "sun", label: "Sunflower" },
  { key: "rose", label: "Rose" },
  { key: "moss", label: "Moss" },
  { key: "sky", label: "Sky" },
  { key: "amber", label: "Amber" },
  { key: "violet", label: "Violet" },
  { key: "teal", label: "Teal" },
  { key: "graphite", label: "Graphite" },
  { key: "coral", label: "Coral" },
];

export const MARK_TYPES: { key: MarkType; label: string }[] = [
  { key: "highlight", label: "Highlight" },
  { key: "underline", label: "Underline" },
  { key: "strikethrough", label: "Strikethrough" },
  { key: "squiggly", label: "Squiggle" },
  { key: "box", label: "Box" },
  { key: "circle", label: "Oval" },
];

export const NOTE_FONTS: { key: NoteFont; label: string; css: string }[] = [
  { key: "caveat", label: "Caveat", css: "var(--font-note-caveat)" },
  { key: "kalam", label: "Kalam", css: "var(--font-note-kalam)" },
  { key: "patrick-hand", label: "Patrick Hand", css: "var(--font-note-patrick)" },
  { key: "shadows", label: "Shadows Into Light", css: "var(--font-note-shadows)" },
  { key: "indie", label: "Indie Flower", css: "var(--font-note-indie)" },
  { key: "architects", label: "Architects Daughter", css: "var(--font-note-architects)" },
];

export const NOTE_INKS: { key: NoteInk; label: string; css: string }[] = [
  { key: "blue", label: "Blue ink", css: "var(--ink-blue)" },
  { key: "red", label: "Red ink", css: "var(--ink-red)" },
  { key: "pencil", label: "Pencil", css: "var(--ink-pencil)" },
];

export const PAPER_STYLES: { key: PaperStyle; label: string }[] = [
  { key: "plain", label: "Plain" },
  { key: "lined", label: "Lined" },
  { key: "grid", label: "Grid" },
  { key: "dot", label: "Dot grid" },
  { key: "crumpled", label: "Crumpled" },
  { key: "aged", label: "Aged" },
  { key: "blueprint", label: "Blueprint" },
];

export const EMPTY_ANNOTATIONS: AnnotationsState = { highlights: [], notes: [] };
