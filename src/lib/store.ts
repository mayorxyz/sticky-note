import type { AnnotationsState, StoredData } from "../data/types";

export const STORAGE_KEY = "paper-annotate.docs.v1";

export function uid(): string {
  return (
    Math.random().toString(36).slice(2, 9) +
    Date.now().toString(36).slice(-5)
  );
}

const DEFAULT_DATA: StoredData = { version: 1, docs: [], annotations: {} };

/** Load & lightly validate; future shape changes bump the key suffix + migrate here. */
export function loadData(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DATA };
    const parsed = JSON.parse(raw) as Partial<StoredData>;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_DATA };
    return {
      version: 1,
      docs: Array.isArray(parsed.docs) ? parsed.docs : [],
      annotations:
        parsed.annotations && typeof parsed.annotations === "object"
          ? (parsed.annotations as Record<string, AnnotationsState>)
          : {},
      theme: parsed.theme === "dark" || parsed.theme === "light" ? parsed.theme : undefined,
    };
  } catch {
    return { ...DEFAULT_DATA };
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

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
