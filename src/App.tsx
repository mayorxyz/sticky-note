import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import type {
  AnnotationsState,
  Bookmark,
  DocumentRecord,
  Settings,
  StoredData,
} from "./data/types";
import { EMPTY_ANNOTATIONS } from "./data/types";
import {
  downloadBlob,
  loadData,
  saveData,
  storageBytes,
  uid,
} from "./lib/store";
import Library, { type BackupPayload } from "./components/Library";
import DocumentView from "./components/DocumentView";
import SettingsPage from "./components/Settings";
import { SAMPLE_MARKDOWN, SAMPLE_TITLE } from "./data/sampleDoc";

interface Toast {
  id: string;
  msg: string;
}

export default function App() {
  const [data, setData] = useState<StoredData>(() => loadData());
  const [storeError, setStoreError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sysDark, setSysDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const firstRun = useRef(true);

  const settings = data.settings;

  /* ————— persistence ————— */
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setStoreError(saveData(data));
  }, [data]);

  useEffect(() => {
    if (!storeError) return;
    const id = uid();
    setToasts((t) => [...t.slice(-2), { id, msg: storeError }]);
    const h = window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
    return () => window.clearTimeout(h);
  }, [storeError]);

  /* ————— theme: light / dark / black / system ————— */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => setSysDark(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const resolvedTheme: "light" | "dark" | "black" =
    settings.theme === "system" ? (sysDark ? "dark" : "light") : settings.theme;

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", resolvedTheme === "dark");
    el.classList.toggle("black", resolvedTheme === "black");
    el.classList.toggle("reduce-motion", settings.reduceMotion);
    el.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme, settings.reduceMotion]);

  const toggleTheme = useCallback(() => {
    setData((d) => ({
      ...d,
      settings: { ...d.settings, theme: resolvedTheme === "light" ? "dark" : "light" },
    }));
  }, [resolvedTheme]);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }, []);

  /* ————— toasts ————— */
  const toast = useCallback((msg: string) => {
    const id = uid();
    setToasts((t) => [...t.slice(-2), { id, msg }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  /* ————— doc / annotation mutations ————— */
  const ingest = useCallback((doc: DocumentRecord, ann: AnnotationsState) => {
    setData((d) => ({
      ...d,
      docs: [doc, ...d.docs],
      annotations: { ...d.annotations, [doc.id]: ann },
    }));
  }, []);

  const updateDoc = useCallback((doc: DocumentRecord) => {
    setData((d) => ({ ...d, docs: d.docs.map((x) => (x.id === doc.id ? doc : x)) }));
  }, []);

  const deleteDoc = useCallback(
    (id: string) => {
      const title = data.docs.find((d) => d.id === id)?.title ?? "paper";
      setData((d) => {
        const annotations = { ...d.annotations };
        delete annotations[id];
        return {
          ...d,
          docs: d.docs.filter((x) => x.id !== id),
          annotations,
          bookmarks: d.bookmarks.filter((b) => b.docId !== id),
        };
      });
      toast(`“${title}” torn up.`);
    },
    [data.docs, toast]
  );

  const setAnnotations = useCallback((docId: string, ann: AnnotationsState) => {
    setData((d) => ({ ...d, annotations: { ...d.annotations, [docId]: ann } }));
  }, []);

  const addBookmark = useCallback((bm: Bookmark) => {
    setData((d) => ({ ...d, bookmarks: [...d.bookmarks, bm] }));
  }, []);

  const deleteBookmark = useCallback(
    (id: string) => {
      setData((d) => ({ ...d, bookmarks: d.bookmarks.filter((b) => b.id !== id) }));
      toast("Bookmark removed.");
    },
    [toast]
  );

  /* ————— backups ————— */
  const importBackup = useCallback(
    (payload: BackupPayload) => {
      const idMap = new Map<string, string>();
      let created = 0;
      setData((d) => {
        const existing = new Set(d.docs.map((x) => x.id));
        const docs = payload.docs.map((doc) => {
          let id = doc.id;
          if (existing.has(id)) {
            id = uid();
            created++;
          }
          idMap.set(doc.id, id);
          existing.add(id);
          return { ...doc, id };
        });
        const annotations = { ...d.annotations };
        for (const [oldId, ann] of Object.entries(payload.annotations)) {
          const newId = idMap.get(oldId) ?? oldId;
          annotations[newId] = ann;
        }
        const bookmarks = [...d.bookmarks];
        for (const bm of payload.bookmarks ?? []) {
          const newId = idMap.get(bm.docId) ?? bm.docId;
          if (docs.some((x) => x.id === newId)) bookmarks.push({ ...bm, id: uid(), docId: newId });
        }
        return { ...d, docs: [...docs, ...d.docs], annotations, bookmarks };
      });
      const count = payload.docs.length;
      toast(
        count === 1
          ? "Paper restored to the desk."
          : `${count} papers restored${created ? ` (${created} renamed to avoid collisions)` : ""}.`
      );
    },
    [toast]
  );

  const exportAll = useCallback(() => {
    const payload = {
      ...data,
      app: "paper-annotate",
      theme: undefined,
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      "paper-annotate-backup.json"
    );
    toast("Whole desk exported as one backup file.");
  }, [data, toast]);

  const clearAll = useCallback(() => {
    setData((d) => ({
      version: 1,
      docs: [],
      annotations: {},
      bookmarks: [],
      settings: d.settings, // keep desk preferences, wipe the papers
    }));
    toast("The desk is clear. Settings were kept.");
  }, [toast]);

  const sample = useCallback(() => {
    const doc: DocumentRecord = {
      id: uid(),
      title: SAMPLE_TITLE,
      sourceType: "text",
      mode: "reflow",
      markdown: SAMPLE_MARKDOWN,
      createdAt: new Date().toISOString(),
      fileName: "field-notes.md",
      words: SAMPLE_MARKDOWN.split(/\s+/).filter(Boolean).length,
    };
    ingest(doc, { ...EMPTY_ANNOTATIONS });
    toast("Sample paper is on the desk.");
    return doc.id;
  }, [ingest, toast]);

  const bytes = useMemo(() => storageBytes(), [data]);

  return (
    <HashRouter>
      <div aria-hidden="true">
        <div className="grain-layer" />
        <div className="crease-layer" />
        <div className="vignette-layer" />
      </div>
      <Routes>
        <Route
          path="/"
          element={
            <LibraryPage
              data={data}
              resolvedTheme={resolvedTheme}
              onToggleTheme={toggleTheme}
              onDelete={deleteDoc}
              onIngest={ingest}
              onImportBackup={importBackup}
              onSample={sample}
              onToast={toast}
            />
          }
        />
        <Route
          path="/doc/:id"
          element={
            <DocPage
              data={data}
              settings={settings}
              resolvedTheme={resolvedTheme}
              onToggleTheme={toggleTheme}
              onAnnotationsChange={setAnnotations}
              onDocChange={updateDoc}
              onBookmarkAdd={addBookmark}
              onBookmarkDelete={deleteBookmark}
              onPatchSettings={patchSettings}
              onToast={toast}
            />
          }
        />
        <Route
          path="/settings"
          element={
            <SettingsRoute
              settings={settings}
              bytes={bytes}
              onPatch={patchSettings}
              onExportAll={exportAll}
              onClearAll={clearAll}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* toasts */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[99] flex w-[min(22rem,90vw)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="toast-in pointer-events-auto flex items-start gap-2.5 rounded-lg border border-[rgba(var(--shadow-ink),0.25)] bg-[var(--ink)] px-3.5 py-2.5 text-sm font-medium text-[var(--paper)] shadow-[0_12px_28px_-10px_rgba(var(--shadow-ink),0.6)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0 opacity-80">
              <path d="m20 6-11 11-5-5" />
            </svg>
            {t.msg}
          </div>
        ))}
      </div>
    </HashRouter>
  );
}

/* ————— route pages ————— */

function LibraryPage({
  data,
  resolvedTheme,
  onToggleTheme,
  onDelete,
  onIngest,
  onImportBackup,
  onSample,
  onToast,
}: {
  data: StoredData;
  resolvedTheme: "light" | "dark" | "black";
  onToggleTheme: () => void;
  onDelete: (id: string) => void;
  onIngest: (doc: DocumentRecord, ann: AnnotationsState) => void;
  onImportBackup: (p: BackupPayload) => void;
  onSample: () => string;
  onToast: (msg: string) => void;
}) {
  const navigate = useNavigate();
  return (
    <Library
      docs={data.docs}
      annotations={data.annotations}
      resolvedTheme={resolvedTheme}
      onToggleTheme={onToggleTheme}
      onOpenSettings={() => navigate("/settings")}
      onOpen={(id) => navigate(`/doc/${id}`)}
      onDelete={onDelete}
      onIngest={(doc, ann) => {
        onIngest(doc, ann);
        navigate(`/doc/${doc.id}`);
      }}
      onImportBackup={onImportBackup}
      onSample={() => navigate(`/doc/${onSample()}`)}
      onToast={onToast}
    />
  );
}

function DocPage({
  data,
  settings,
  resolvedTheme,
  onToggleTheme,
  onAnnotationsChange,
  onDocChange,
  onBookmarkAdd,
  onBookmarkDelete,
  onPatchSettings,
  onToast,
}: {
  data: StoredData;
  settings: Settings;
  resolvedTheme: "light" | "dark" | "black";
  onToggleTheme: () => void;
  onAnnotationsChange: (docId: string, ann: AnnotationsState) => void;
  onDocChange: (doc: DocumentRecord) => void;
  onBookmarkAdd: (bm: Bookmark) => void;
  onBookmarkDelete: (id: string) => void;
  onPatchSettings: (patch: Partial<Settings>) => void;
  onToast: (msg: string) => void;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const doc = data.docs.find((d) => d.id === id);
  if (!doc) return <Navigate to="/" replace />;
  return (
    <DocumentView
      doc={doc}
      annotations={data.annotations[doc.id] ?? { highlights: [], notes: [] }}
      bookmarks={data.bookmarks.filter((b) => b.docId === doc.id)}
      settings={settings}
      onAnnotationsChange={onAnnotationsChange}
      onDocChange={onDocChange}
      onBookmarkAdd={onBookmarkAdd}
      onBookmarkDelete={onBookmarkDelete}
      onPatchSettings={onPatchSettings}
      onBack={() => navigate("/")}
      onOpenSettings={() => navigate("/settings")}
      resolvedTheme={resolvedTheme}
      onToggleTheme={onToggleTheme}
      onToast={onToast}
    />
  );
}

function SettingsRoute({
  settings,
  bytes,
  onPatch,
  onExportAll,
  onClearAll,
}: {
  settings: Settings;
  bytes: number;
  onPatch: (patch: Partial<Settings>) => void;
  onExportAll: () => void;
  onClearAll: () => void;
}) {
  const navigate = useNavigate();
  return (
    <SettingsPage
      settings={settings}
      storageBytes={bytes}
      onPatch={onPatch}
      onBack={() => navigate("/")}
      onExportAll={onExportAll}
      onClearAll={onClearAll}
    />
  );
}
