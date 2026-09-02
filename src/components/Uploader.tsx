import { useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from "react";
import type { AnnotationsState, DocumentRecord, RenderMode } from "../data/types";
import { EMPTY_ANNOTATIONS } from "../data/types";
import { ingestPdf } from "../lib/pdf";
import { uid } from "../lib/store";
import { IconClip, IconLayout, IconPaste, IconRows, IconSpin, IconUpload } from "./icons";

const ACCEPT = ".pdf,.txt,.md,.markdown";
const MAX_TEXT_BYTES = 20 * 1024 * 1024;
const MAX_PASTE_CHARS = 500_000;

interface Props {
  onIngest: (doc: DocumentRecord, annotations: AnnotationsState) => void;
}

type Status = "idle" | "choose" | "working" | "paste" | "error";

export default function Uploader({ onIngest }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState("");
  const [frac, setFrac] = useState(0);
  const [drag, setDrag] = useState(false);
  const [mode, setMode] = useState<RenderMode>("layout");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const pendingRef = useRef<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function textRecord(title: string, body: string, fileName?: string): DocumentRecord {
    const words = body.split(/\s+/).filter(Boolean).length;
    return {
      id: uid(),
      title: title || "Untitled note",
      sourceType: "text",
      mode: "reflow",
      markdown: body,
      createdAt: new Date().toISOString(),
      fileName,
      words,
    };
  }

  async function processFiles(files: File[], useMode: RenderMode) {
    setStatus("working");
    setError(null);
    setFrac(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const prefix = files.length > 1 ? `File ${i + 1} of ${files.length} — ` : "";
        const isPdf = /\.pdf$/i.test(file.name);
        const title = file.name.replace(/\.[^.]+$/, "") || file.name;
        if (isPdf) {
          const res = await ingestPdf(file, useMode, (label, f) => {
            setStep(prefix + label);
            setFrac((i + f) / files.length);
          });
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
              words: res.markdown.split(/\s+/).filter(Boolean).length,
            },
            { ...EMPTY_ANNOTATIONS }
          );
        } else {
          setStep(`${prefix}Reading “${file.name}”`);
          setFrac(i / files.length);
          if (file.size > MAX_TEXT_BYTES) {
            throw new Error(`“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB — the limit is 20 MB.`);
          }
          onIngest(textRecord(title, await file.text(), file.name), { ...EMPTY_ANNOTATIONS });
        }
      }
      setStatus("idle");
      setStep("");
      setFrac(0);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong while reading the files.");
    }
  }

  function acceptFiles(list: FileList | File[] | undefined | null) {
    const files = Array.from(list ?? []).filter((f) => /\.(pdf|txt|md|markdown)$/i.test(f.name));
    const rejected = (list ? Array.from(list).length : 0) - files.length;
    if (!files.length) {
      setStatus("error");
      setError("No supported files found. Drop PDF, .txt, .md or .markdown files.");
      return;
    }
    if (rejected > 0) {
      setError(`${rejected} unsupported file${rejected > 1 ? "s" : ""} skipped.`);
    } else {
      setError(null);
    }
    if (files.some((f) => /\.pdf$/i.test(f.name))) {
      pendingRef.current = files;
      setStatus("choose");
    } else {
      void processFiles(files, "reflow");
    }
  }

  function submitPaste() {
    const body = pasteBody.trim();
    if (!body) {
      setError("Paste some text first — the sheet is blank.");
      return;
    }
    if (body.length > MAX_PASTE_CHARS) {
      setError(`That's ${(body.length / 1000).toFixed(0)}k characters — the paste sheet holds ${MAX_PASTE_CHARS / 1000}k.`);
      return;
    }
    setError(null);
    onIngest(textRecord(pasteTitle.trim(), body), { ...EMPTY_ANNOTATIONS });
    setPasteTitle("");
    setPasteBody("");
    setStatus("idle");
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    acceptFiles(e.dataTransfer.files);
  }

  function onZoneKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  return (
    <div className="desk-card tilted rise relative rounded-xl p-5 sm:p-7" style={{ "--tilt": "-0.35deg" } as CSSProperties}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          acceptFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {status === "choose" ? (
        <div className="pop">
          <p className="font-display text-lg font-semibold text-ink">
            How should <span className="text-accent-deep">{pendingRef.current.length > 1 ? `${pendingRef.current.length} papers` : `“${pendingRef.current[0]?.name}”`}</span> sit on the desk?
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Applies to the PDFs in this batch. You can switch per document any time — the text is always extracted.
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
              ] as { key: RenderMode; icon: React.ReactNode; name: string; desc: string }[]
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
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="btn-ink" onClick={() => void processFiles(pendingRef.current, mode)}>
              <IconUpload size={15} /> Set {pendingRef.current.length > 1 ? "them" : "it"} on the desk
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setStatus("idle");
                pendingRef.current = [];
              }}
            >
              Choose other files
            </button>
          </div>
        </div>
      ) : status === "paste" ? (
        <div className="pop">
          <p className="font-display text-lg font-semibold text-ink">Paste a paper</p>
          <p className="mt-1 text-sm text-ink-soft">
            Raw text or Markdown — headings, lists and quotes all survive. Goes onto the desk as a reflow document.
          </p>
          <input
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="Title — e.g. “Meeting notes, Tuesday”"
            className="mt-3 h-10 w-full rounded-lg border border-line bg-transparent px-3 font-display text-base font-semibold text-ink outline-none transition-colors placeholder:font-body placeholder:text-sm placeholder:font-normal placeholder:text-ink-faint focus:border-accent"
            aria-label="Pasted document title"
          />
          <textarea
            value={pasteBody}
            onChange={(e) => setPasteBody(e.target.value)}
            placeholder={"## Paste here\n\nMarkdown works: **bold**, lists, > quotes…"}
            rows={9}
            className="mt-2 w-full resize-y rounded-lg border border-line bg-transparent px-3 py-2.5 font-mono text-[0.8rem] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent"
            aria-label="Pasted document text"
          />
          <div className="mt-1 flex items-center justify-between text-[0.65rem] text-ink-faint">
            <span>{pasteBody.length.toLocaleString()} characters</span>
            <span>max {(MAX_PASTE_CHARS / 1000).toFixed(0)}k</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn-ink" onClick={submitPaste}>
              <IconPaste size={15} /> Press it onto the desk
            </button>
            <button className="btn-ghost" onClick={() => setStatus("idle")}>
              Back
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload documents: press Enter to browse, or drop files. Multiple files supported."
            onKeyDown={onZoneKey}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={`group flex min-w-0 flex-1 cursor-pointer flex-col justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-all sm:py-7 ${
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
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold text-ink">
                  {drag ? "Let go —" : "Drop papers on the desk"}
                </p>
                <p className="truncate text-sm text-ink-soft">
                  PDF, .txt, .md or .markdown · batches welcome · 20 MB / 300 pages each
                </p>
              </div>
            </div>
          </div>
          <button
            className="btn-ghost shrink-0 justify-center !px-5"
            onClick={() => {
              setStatus("paste");
              setError(null);
            }}
          >
            <IconPaste size={16} /> Paste text instead
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="pop mt-4 flex items-start gap-2 rounded-lg border border-accent/40 bg-[var(--hl-rose)] px-3 py-2.5 text-sm font-medium text-ink"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="mt-0.5 shrink-0 text-accent-deep">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4.5M12 16h.01" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}
