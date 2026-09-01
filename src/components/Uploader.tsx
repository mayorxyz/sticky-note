import { useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { AnnotationsState, DocumentRecord, RenderMode } from "../data/types";
import { EMPTY_ANNOTATIONS } from "../data/types";
import { ingestPdf } from "../lib/pdf";
import { uid } from "../lib/store";
import { IconClip, IconLayout, IconRows, IconSpin, IconUpload } from "./icons";

const ACCEPT = ".pdf,.txt,.md,.markdown";
const MAX_TEXT_BYTES = 20 * 1024 * 1024;

interface Props {
  onIngest: (doc: DocumentRecord, annotations: AnnotationsState) => void;
}

type Status = "idle" | "choose" | "working" | "error";

export default function Uploader({ onIngest }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState("");
  const [frac, setFrac] = useState(0);
  const [drag, setDrag] = useState(false);
  const [pickedName, setPickedName] = useState("");
  const [mode, setMode] = useState<RenderMode>("layout");
  const pendingRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFile(file: File, useMode: RenderMode) {
    setStatus("working");
    setError(null);
    setFrac(0);
    setStep("Warming up the press…");
    try {
      const title = file.name.replace(/\.[^.]+$/, "") || file.name;
      const isPdf = /\.pdf$/i.test(file.name);
      if (isPdf) {
        const res = await ingestPdf(file, useMode, (label, f) => {
          setStep(label);
          setFrac(f);
        });
        const words = res.markdown.split(/\s+/).filter(Boolean).length;
        onIngest(
          {
            id: uid(),
            title,
            sourceType: "pdf",
            mode: useMode,
            markdown: res.markdown,
            pages: res.pages,
            thumb: res.thumb,
            createdAt: new Date().toISOString(),
            fileName: file.name,
            pageCount: res.numPages,
            words,
          },
          { ...EMPTY_ANNOTATIONS }
        );
      } else {
        if (file.size > MAX_TEXT_BYTES) {
          throw new Error(`“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB — the limit is 20 MB.`);
        }
        const text = await file.text();
        const words = text.split(/\s+/).filter(Boolean).length;
        onIngest(
          {
            id: uid(),
            title,
            sourceType: "text",
            mode: "reflow",
            markdown: text,
            createdAt: new Date().toISOString(),
            fileName: file.name,
            words,
          },
          { ...EMPTY_ANNOTATIONS }
        );
      }
      setStatus("idle");
      setStep("");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong while reading the file.");
    }
  }

  function acceptFile(file: File | undefined | null) {
    if (!file) return;
    const ok = /\.(pdf|txt|md|markdown)$/i.test(file.name);
    if (!ok) {
      setStatus("error");
      setError(`“${file.name}” isn't supported. Drop a PDF, .txt, .md or .markdown file.`);
      return;
    }
    if (/\.pdf$/i.test(file.name)) {
      pendingRef.current = file;
      setPickedName(file.name);
      setStatus("choose");
      setError(null);
    } else {
      void processFile(file, "reflow");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    acceptFile(e.dataTransfer.files?.[0]);
  }

  function onZoneKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  return (
    <div className="desk-card tilted rise relative rounded-xl p-5 sm:p-7" style={{ rotate: "-0.35deg" }}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          acceptFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {status === "choose" ? (
        <div className="pop">
          <p className="font-display text-lg font-semibold text-ink">
            How should <span className="text-accent-deep">“{pickedName}”</span> sit on the desk?
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            You can switch between the two any time — the text is always extracted.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  key: "layout",
                  icon: <IconLayout size={20} />,
                  name: "Original layout",
                  desc: "Page images exactly as printed. Marks land where the page says so.",
                },
                {
                  key: "reflow",
                  icon: <IconRows size={20} />,
                  name: "Reflow text",
                  desc: "Re-typed as a clean flowing document with a table of contents.",
                },
              ] as { key: RenderMode; icon: ReactNode; name: string; desc: string }[]
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setMode(opt.key)}
                className={`rounded-lg border p-4 text-left transition-all ${
                  mode === opt.key
                    ? "border-accent bg-[rgba(var(--shadow-ink),0.06)] shadow-sm"
                    : "border-line hover:border-ink-faint"
                }`}
                aria-pressed={mode === opt.key}
              >
                <span className={`inline-flex ${mode === opt.key ? "text-accent" : "text-ink-faint"}`}>{opt.icon}</span>
                <span className="mt-2 block font-display text-base font-semibold text-ink">{opt.name}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{opt.desc}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button className="btn-ink" onClick={() => void processFile(pendingRef.current!, mode)}>
              <IconUpload size={15} /> Set it on the desk
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setStatus("idle");
                pendingRef.current = null;
              }}
            >
              Choose another file
            </button>
          </div>
        </div>
      ) : status === "working" ? (
        <div className="py-4" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            <span className="text-accent">
              <IconSpin size={22} className="spin-slow" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-semibold text-ink">{step}</p>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-paper-deep shadow-inner">
                <div
                  className="working-bar h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.round(6 + frac * 94)}%` }}
                />
              </div>
            </div>
            <span className="font-display text-sm font-bold text-ink-soft">{Math.round(frac * 100)}%</span>
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            Big PDFs take a moment — every page is pressed and dried locally.
          </p>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a document: press Enter to browse, or drop a file"
          onKeyDown={onZoneKey}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`group flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-all sm:flex-row sm:justify-between sm:text-left ${
            drag
              ? "scale-[1.01] border-accent bg-[var(--hl-sun)]"
              : "border-line hover:border-ink-faint hover:bg-[rgba(var(--shadow-ink),0.03)]"
          }`}
        >
          <div className="flex items-center gap-4">
            <span
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg border transition-transform ${
                drag ? "border-accent text-accent" : "border-line text-ink-faint group-hover:-rotate-6"
              }`}
            >
              <IconClip size={24} />
            </span>
            <div>
              <p className="font-display text-lg font-semibold text-ink">
                {drag ? "Let go —" : "Drop a paper on the desk"}
              </p>
              <p className="text-sm text-ink-soft">PDF, .txt, .md or .markdown · up to 20 MB · up to 300 pages</p>
            </div>
          </div>
          <span className="btn-ghost pointer-events-none shrink-0">
            <IconUpload size={15} /> Browse files
          </span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="pop mt-4 flex items-start gap-2 rounded-lg border border-accent/40 bg-[var(--hl-rose)] px-3 py-2.5 text-sm font-medium text-ink"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="mt-0.5 shrink-0 text-accent-deep"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4.5M12 16h.01" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}
