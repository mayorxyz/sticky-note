import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnnotationsState, DocumentRecord, Settings, StoredData } from "./data/types";
import { EMPTY_ANNOTATIONS, sheetClass } from "./data/types";
import {
  DEFAULT_SETTINGS,
  downloadBlob,
  loadData,
  saveData,
  storageBytes,
  uid,
} from "./lib/store";
import { SAMPLE_MARKDOWN, SAMPLE_TITLE } from "./data/sampleDoc";
import Library from "./components/Library";
import DocumentView from "./components/DocumentView";
import SettingsPage from "./components/Settings";

type View = { kind: "library" } | { kind: "doc"; id: string } | { kind: "settings" };

export default function App() {
  const [data, setData] = useState<StoredData>(() => loadData());
  const [view, setView] = useState<View>({ kind: "library" });
  const [settingsFrom, setSettingsFrom] = useState<View>({ kind: "library" });
  const [toast, setToast] = useState<string | null>(null);
  const [osDark, setOsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const toastTimer = useRef(0);

  const settings: Settings = data.settings ?? DEFAULT_SETTINGS;

  /* ————— persist everything through the single versioned key ————— */
  useEffect(() => {
    const err = saveData({
      ...data,
      theme: settings.theme === "dark" ? "dark" : settings.theme === "light" ? "light" : undefined,
    });
    if (err) showToast(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function showToast(msg: string) {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }

  /* ————— theme resolution: system → light|dark only; black is explicit ————— */
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [settings.theme]);

  const resolvedTheme: "light" | "dark" | "black" =
    settings.theme === "system" ? (osDark ? "dark" : "light") : settings.theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.classList.toggle("black", resolvedTheme === "black");
    root.classList.toggle("reduce-motion", settings.reduceMotion);
    root.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme, settings.reduceMotion]);

  const styleCls = useMemo(() => sheetClass(settings.paperStyle), [settings.paperStyle]);

  /* ————— document handlers ————— */
  const ingest = useCallback((doc: DocumentRecord, ann: AnnotationsState) => {
    setData((d) => ({
      ...d,
      docs: [doc, ...d.docs],
      annotations: { ...d.annotations, [doc.id]: ann },
    }));
    setView({ kind: "doc", id: doc.id });
  }, []);

  const ingestMany = useCallback(
    (docs: DocumentRecord[], annotations: Record<string, AnnotationsState>) => {
      setData((d) => {
        const existing = new Set(d.docs.map((x) => x.id));
        const remap = new Map<string, string>();
        const newDocs = docs.map((doc) => {
          const id = existing.has(doc.id) ? uid() : doc.id;
          remap.set(doc.id, id);
          return { ...doc, id };
        });
        const ann: Record<string, AnnotationsState> = {};
        for (const [oldId, a] of Object.entries(annotations)) {
          const nid = remap.get(oldId);
          if (!nid) continue;
          ann[nid] = {
            highlights: (a.highlights ?? []).map((h) => ({ ...h, docId: nid })),
            notes: (a.notes ?? []).map((n) => ({ ...n, docId: nid })),
          };
        }
        return {
          ...d,
          docs: [...newDocs, ...d.docs],
          annotations: { ...d.annotations, ...ann },
        };
      });
      showToast(`Restored ${docs.length} document${docs.length === 1 ? "" : "s"} from backup.`);
    },
    []
  );

  const updateDoc = useCallback((doc: DocumentRecord) => {
    setData((d) => ({ ...d, docs: d.docs.map((x) => (x.id === doc.id ? doc : x)) }));
  }, []);

  const deleteDoc = useCallback((id: string) => {
    setData((d) => {
      const annotations = { ...d.annotations };
      delete annotations[id];
      return { ...d, docs: d.docs.filter((x) => x.id !== id), annotations };
    });
    showToast("Torn up and gone.");
  }, []);

  const annotationsChange = useCallback((docId: string, ann: AnnotationsState) => {
    setData((d) => ({ ...d, annotations: { ...d.annotations, [docId]: ann } }));
  }, []);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setData((d) => ({ ...d, settings: { ...(d.settings ?? DEFAULT_SETTINGS), ...patch } }));
  }, []);

  function toggleThemeQuick() {
    patchSettings({ theme: resolvedTheme === "light" ? "dark" : "light" });
  }

  function addSample() {
    ingest(
      {
        id: uid(),
        title: SAMPLE_TITLE,
        sourceType: "text",
        mode: "reflow",
        markdown: SAMPLE_MARKDOWN,
        createdAt: new Date().toISOString(),
        words: SAMPLE_MARKDOWN.split(/\s+/).filter(Boolean).length,
      },
      { ...EMPTY_ANNOTATIONS }
    );
  }

  function exportAll() {
    const payload: StoredData = { ...data, settings };
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(
      new Blob([JSON.stringify({ ...payload, app: "paper-annotate" }, null, 2)], {
        type: "application/json",
      }),
      `paper-annotate-backup-${stamp}.json`
    );
    showToast("Whole desk exported — one JSON to rule them all.");
  }

  function clearAll() {
    try {
      localStorage.clear();
    } catch {
      /* noop */
    }
    const keepTheme = settings.theme;
    setData({
      version: 1,
      docs: [],
      annotations: {},
      settings: { ...DEFAULT_SETTINGS, theme: keepTheme },
    });
    setView({ kind: "library" });
    showToast("The desk is bare again.");
  }

  const bytes = useMemo(
    () => (view.kind === "settings" ? storageBytes() : 0),
    [view.kind, data]
  );

  const activeDoc = view.kind === "doc" ? data.docs.find((d) => d.id === view.id) : undefined;

  return (
    <div className="relative min-h-dvh">
      <div className="grain-layer" aria-hidden="true" />
      <div className="crease-layer" aria-hidden="true" />
      <div className="vignette-layer" aria-hidden="true" />

      {view.kind === "library" || (view.kind === "doc" && !activeDoc) ? (
        <Library
          docs={data.docs}
          annotations={data.annotations}
          resolvedTheme={resolvedTheme}
          sheetClass={styleCls}
          onToggleTheme={toggleThemeQuick}
          onOpenSettings={() => {
            setSettingsFrom(view);
            setView({ kind: "settings" });
          }}
          onOpen={(id) => setView({ kind: "doc", id })}
          onDelete={deleteDoc}
          onIngest={ingest}
          onIngestMany={ingestMany}
          onSample={addSample}
        />
      ) : view.kind === "doc" && activeDoc ? (
        <DocumentView
          key={activeDoc.id}
          doc={activeDoc}
          annotations={data.annotations[activeDoc.id] ?? { ...EMPTY_ANNOTATIONS }}
          settings={settings}
          sheetClass={styleCls}
          onAnnotationsChange={annotationsChange}
          onDocChange={updateDoc}
          onBack={() => setView({ kind: "library" })}
          onOpenSettings={() => {
            setSettingsFrom(view);
            setView({ kind: "settings" });
          }}
          resolvedTheme={resolvedTheme}
          onToggleTheme={toggleThemeQuick}
          onToast={showToast}
        />
      ) : (
        <SettingsPage
          settings={settings}
          sheetClass={styleCls}
          storageBytes={bytes}
          onPatch={patchSettings}
          onBack={() => setView(settingsFrom)}
          onExportAll={exportAll}
          onClearAll={clearAll}
        />
      )}

      {toast && (
        <div
          className="toast-in fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-lg border border-line bg-sheet px-4 py-2.5 text-sm font-medium text-ink shadow-[0_14px_34px_-12px_rgba(var(--shadow-ink),0.55)]"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
