import type { AnnotationsState, MarkColor, Settings, StoredData } from "../data/types";
import { MARK_COLORS } from "../data/types";

export const STORAGE_KEY = "paper-annotate.docs.v1";
/** Nominal localStorage quota used for the usage meter. */
export const STORAGE_QUOTA = 5 * 1024 * 1024;

export const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  paperStyle: "plain",
  orientation: "portrait",
  activeHighlightColors: MARK_COLORS.map((c) => c.key),
  highlightLabels: {},
  defaultNotePlacement: "margin",
  defaultNoteFont: "caveat",
  defaultNoteInk: "blue",
  readingFontSize: 17,
  readingWidth: 740,
  reduceMotion: false,
  defaultExportFormat: "pdf",
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
}

const ALL_COLOR_KEYS = MARK_COLORS.map((c) => c.key as string);

/** Merge partial/legacy settings over the defaults; keeps unknown keys out. */
export function normalizeSettings(raw: unknown, legacyTheme?: "light" | "dark"): Settings {
  const s = (raw ?? {}) as Partial<Settings>;
  const theme =
    s.theme === "dark" || s.theme === "black" || s.theme === "system" || s.theme === "light"
      ? s.theme
      : legacyTheme ?? DEFAULT_SETTINGS.theme;
  const active = Array.isArray(s.activeHighlightColors)
    ? (s.activeHighlightColors.filter((k) => ALL_COLOR_KEYS.includes(k)) as MarkColor[])
    : DEFAULT_SETTINGS.activeHighlightColors;
  return {
    theme,
    paperStyle:
      s.paperStyle === "lined" || s.paperStyle === "grid" || s.paperStyle === "dot" ||
      s.paperStyle === "crumpled" || s.paperStyle === "aged" || s.paperStyle === "blueprint"
        ? s.paperStyle
        : "plain",
    orientation: s.orientation === "landscape" ? "landscape" : "portrait",
    activeHighlightColors: active.length ? active : DEFAULT_SETTINGS.activeHighlightColors,
    highlightLabels:
      s.highlightLabels && typeof s.highlightLabels === "object"
        ? { ...s.highlightLabels }
        : {},
    defaultNotePlacement: s.defaultNotePlacement === "freeform" ? "freeform" : "margin",
    defaultNoteFont:
      s.defaultNoteFont === "kalam" || s.defaultNoteFont === "patrick-hand"
        ? s.defaultNoteFont
        : "caveat",
    defaultNoteInk: s.defaultNoteInk === "red" || s.defaultNoteInk === "pencil" ? s.defaultNoteInk : "blue",
    readingFontSize:
      typeof s.readingFontSize === "number" && s.readingFontSize >= 13 && s.readingFontSize <= 26
        ? s.readingFontSize
        : DEFAULT_SETTINGS.readingFontSize,
    readingWidth:
      typeof s.readingWidth === "number" && s.readingWidth >= 520 && s.readingWidth <= 1040
        ? s.readingWidth
        : DEFAULT_SETTINGS.readingWidth,
    reduceMotion: s.reduceMotion === true,
    defaultExportFormat:
      s.defaultExportFormat === "markdown" || s.defaultExportFormat === "json"
        ? s.defaultExportFormat
        : "pdf",
  };
}

/** Load & lightly validate; future shape changes bump the key suffix + migrate here. */
export function loadData(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, docs: [], annotations: {}, settings: { ...DEFAULT_SETTINGS } };
    const parsed = JSON.parse(raw) as Partial<StoredData>;
    if (!parsed || typeof parsed !== "object")
      return { version: 1, docs: [], annotations: {}, settings: { ...DEFAULT_SETTINGS } };
    return {
      version: 1,
      docs: Array.isArray(parsed.docs) ? parsed.docs : [],
      annotations:
        parsed.annotations && typeof parsed.annotations === "object"
          ? (parsed.annotations as Record<string, AnnotationsState>)
          : {},
      theme: parsed.theme === "dark" || parsed.theme === "light" ? parsed.theme : undefined,
      settings: normalizeSettings(parsed.settings, parsed.theme),
    };
  } catch {
    return { version: 1, docs: [], annotations: {}, settings: { ...DEFAULT_SETTINGS } };
  }
}

/** Persist; returns an error message when the quota is blown, null on success. */
export function saveData(data: StoredData): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return null;
  } catch {
    return "Browser storage is full — recent changes are kept in memory only. Export a backup or remove large documents to persist again.";
  }
}

/** Approximate bytes currently held in localStorage for this app. */
export function storageBytes(): number {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      total += key.length * 2 + (localStorage.getItem(key)?.length ?? 0) * 2;
    }
    return total;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFileName(title: string): string {
  return title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "document";
}
