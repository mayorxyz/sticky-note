/* Core data model — persisted under "paper-annotate.docs.v1". */

export type MarkType = "highlight" | "underline" | "strikethrough";
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
export type NoteFont = "caveat" | "kalam" | "patrick-hand";
export type NoteInk = "blue" | "red" | "pencil";
export type Placement = "margin" | "freeform";
export type RenderMode = "reflow" | "layout";
export type PaperStyle = "plain" | "lined" | "grid" | "dot" | "crumpled" | "aged" | "blueprint";
export type Orientation = "portrait" | "landscape";
export type ThemeChoice = "light" | "dark" | "black" | "system";
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
  /** per-document default placement for new notes (overrides the global setting) */
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

/* ————— Settings (nested in StoredData, single storage funnel) ————— */

export interface Settings {
  theme: ThemeChoice;
  paperStyle: PaperStyle;
  orientation: Orientation;
  /** ordered subset of the full palette shown in the picker */
  activeHighlightColors: MarkColor[];
  /** color key → user-assigned meaning, shown as tooltip */
  highlightLabels: Record<string, string>;
  defaultNotePlacement: Placement;
  defaultNoteFont: NoteFont;
  defaultNoteInk: NoteInk;
  /** reflow body size in px */
  readingFontSize: number;
  /** reflow content column width in px */
  readingWidth: number;
  reduceMotion: boolean;
  defaultExportFormat: ExportFormat;
}

export interface StoredData {
  version: 1;
  docs: DocumentRecord[];
  annotations: Record<string, AnnotationsState>;
  /** legacy location for the theme (kept for migration compatibility) */
  theme?: "light" | "dark";
  settings?: Settings;
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

export function sheetClass(style: PaperStyle): string {
  return style === "plain" ? "" : `paper-${style}`;
}
