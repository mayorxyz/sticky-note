import { useCallback, useEffect, useRef, useState } from "react";
import type { AnnotationsState, DocumentRecord, StoredData } from "./data/types";
import { EMPTY_ANNOTATIONS } from "./data/types";
import { loadData, saveData, uid } from "./lib/store";
import { SAMPLE_MARKDOWN, SAMPLE_TITLE } from "./data/sampleDoc";
import Library from "./components/Library";
import DocumentView from "./components/DocumentView";

export default function App() {
  const [data, setData] = useState<StoredData>(() => {
    const d = loadData();
    if (!d.theme) {
      d.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return d;
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const saveTimer = useRef(0);
  const toastTimer = useRef(0);

  const theme = data.theme ?? "light";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const showToast = useCallback((msg: string) => {
    setToast({ id: Date.now(), msg });
  }, []);

  useEffect(() => {
    if (!toast) return;
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(toastTimer.current);
  }, [toast]);

  /* debounced persistence to paper-annotate.docs.v1 */
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const err = saveData(data);
      if (err) showToast(err);
    }, 350);
    return () => window.clearTimeout(saveTimer.current);
  }, [data, showToast]);

  const ingest = useCallback(
    (doc: DocumentRecord, ann: AnnotationsState) => {
      setData((d) => ({
        ...d,
        docs: [doc, ...d.docs],
        annotations: { ...d.annotations, [doc.id]: ann },
      }));
      setOpenId(doc.id);
      showToast(`“${doc.title}” is on the desk.`);
    },
    [showToast]
  );

  const updateDoc = useCallback((doc: DocumentRecord) => {
    setData((d) => ({ ...d, docs: d.docs.map((x) => (x.id === doc.id ? doc : x)) }));
  }, []);

  const deleteDoc = useCallback(
    (id: string) => {
      const doc = data.docs.find((x) => x.id === id);
      setData((d) => {
        const annotations = { ...d.annotations };
        delete annotations[id];
        return { ...d, docs: d.docs.filter((x) => x.id !== id), annotations };
      });
      setOpenId((cur) => (cur === id ? null : cur));
      if (doc) showToast(`“${doc.title}” was torn up. Undo is not possible for this.`);
    },
    [data.docs, showToast]
  );

  const setAnnotations = useCallback((docId: string, ann: AnnotationsState) => {
    setData((d) => ({ ...d, annotations: { ...d.annotations, [docId]: ann } }));
  }, []);

  const addSample = useCallback(() => {
    const words = SAMPLE_MARKDOWN.split(/\s+/).filter(Boolean).length;
    ingest(
      {
        id: uid(),
        title: SAMPLE_TITLE,
        sourceType: "text",
        mode: "reflow",
        markdown: SAMPLE_MARKDOWN,
        createdAt: new Date().toISOString(),
        fileName: "sample-paper.md",
        words,
      },
      { ...EMPTY_ANNOTATIONS }
    );
  }, [ingest]);

  const toggleTheme = useCallback(() => {
    setData((d) => ({ ...d, theme: d.theme === "dark" ? "light" : "dark" }));
  }, []);

  const openDoc = openId ? data.docs.find((d) => d.id === openId) : undefined;

  return (
    <div className="relative min-h-dvh bg-paper text-ink">
      <div className="vignette-layer" aria-hidden="true" />
      <div className="crease-layer" aria-hidden="true" />
      <div className="grain-layer" aria-hidden="true" />

      {openDoc ? (
        <DocumentView
          key={openDoc.id}
          doc={openDoc}
          annotations={data.annotations[openDoc.id] ?? { highlights: [], notes: [] }}
          onAnnotationsChange={setAnnotations}
          onDocChange={updateDoc}
          onBack={() => setOpenId(null)}
          theme={theme}
          onToggleTheme={toggleTheme}
          onToast={showToast}
        />
      ) : (
        <Library
          docs={data.docs}
          annotations={data.annotations}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpen={setOpenId}
          onDelete={deleteDoc}
          onIngest={ingest}
          onSample={addSample}
        />
      )}

      {toast && (
        <div
          key={toast.id}
          role="status"
          className="toast-in desk-card fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm font-medium text-ink"
        >
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          {toast.msg}
        </div>
      )}
    </div>
  );
}
