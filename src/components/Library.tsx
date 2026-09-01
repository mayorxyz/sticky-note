import { useRef, useState, type CSSProperties } from "react";
import type { AnnotationsState, DocumentRecord } from "../data/types";
import { formatDate, uid } from "../lib/store";
import Uploader from "./Uploader";
import {
  IconBook,
  IconDownload,
  IconFile,
  IconLayout,
  IconMoon,
  IconNote,
  IconRows,
  IconSpark,
  IconSun,
  IconTrash,
} from "./icons";

interface Props {
  docs: DocumentRecord[];
  annotations: Record<string, AnnotationsState>;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onIngest: (doc: DocumentRecord, ann: AnnotationsState) => void;
  onSample: () => void;
}

const TILTS = ["-0.8deg", "0.6deg", "-0.4deg", "0.9deg", "-0.6deg", "0.3deg"];

export default function Library({
  docs,
  annotations,
  theme,
  onToggleTheme,
  onOpen,
  onDelete,
  onIngest,
  onSample,
}: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  function restoreBackup(file: File | undefined | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as {
          app?: string;
          doc?: DocumentRecord;
          annotations?: AnnotationsState;
        };
        if (!parsed?.doc?.id || !parsed.doc.title) throw new Error("bad file");
        onIngest(
          { ...parsed.doc, id: uid(), createdAt: new Date().toISOString() },
          parsed.annotations ?? { highlights: [], notes: [] }
        );
      } catch {
        window.alert("That doesn't look like a Paper Annotate backup file.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="relative z-10 mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-black tracking-tight text-ink sm:text-5xl">
            Paper Annotate
          </h1>
          <svg viewBox="0 0 320 12" className="mt-1 h-3 w-56 text-accent" aria-hidden="true">
            <path
              d="M3 8.5C60 3 140 2.5 317 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.4"
              strokeLinecap="round"
              className="draw-line"
            />
          </svg>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
            Press PDFs and Markdown onto a paper desk, argue with them in highlights and
            handwritten notes. Single desk, single reader — everything stays in this browser.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              restoreBackup(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            className="btn-ghost"
            onClick={() => importRef.current?.click()}
            title="Restore a .json backup"
          >
            <IconDownload size={15} /> Restore
          </button>
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to daylight paper" : "Switch to lamplight paper"}
            aria-label="Toggle dark mode"
          >
            {theme === "dark" ? <IconSun size={19} /> : <IconMoon size={19} />}
          </button>
        </div>
      </header>

      <main className="mt-8 space-y-10">
        <Uploader onIngest={onIngest} />

        <section aria-label="Your documents">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-bold text-ink">Your desk</h2>
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">
              {docs.length === 0
                ? "empty for now"
                : `${docs.length} paper${docs.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {docs.length === 0 ? (
            <div className="desk-card flex flex-col items-center rounded-xl px-6 py-12 text-center" style={{ rotate: "0.3deg" }}>
              <EmptyDeskArt />
              <p className="mt-5 font-display text-lg font-semibold text-ink">
                The desk is clear.
              </p>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
                Clip a PDF or a Markdown file above — or start with a short sample paper that
                shows off marks, notes and the margin rail.
              </p>
              <button className="btn-ink mt-5" onClick={onSample}>
                <IconSpark size={16} /> Put the sample paper on the desk
              </button>
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((doc, i) => {
                const ann = annotations[doc.id];
                const marks = ann?.highlights.length ?? 0;
                const notes = ann?.notes.length ?? 0;
                return (
                  <li
                    key={doc.id}
                    className="desk-card rise group flex flex-col overflow-hidden rounded-lg"
                    style={{ rotate: TILTS[i % TILTS.length], animationDelay: `${i * 60}ms` } as CSSProperties}
                  >
                    <button
                      className="relative block h-36 w-full overflow-hidden border-b border-[rgba(var(--shadow-ink),0.12)] text-left"
                      onClick={() => onOpen(doc.id)}
                      aria-label={`Open ${doc.title}`}
                    >
                      {doc.thumb ? (
                        <img
                          src={doc.thumb}
                          alt=""
                          className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <MiniTextPage text={doc.markdown ?? ""} />
                      )}
                      <span className="absolute left-2 top-2 flex gap-1">
                        <span className="chip bg-[var(--sheet)]/90">{doc.sourceType === "pdf" ? "PDF" : "Text"}</span>
                        <span className="chip bg-[var(--sheet)]/90">
                          {doc.mode === "layout" ? (
                            <>
                              <IconLayout size={11} /> layout
                            </>
                          ) : (
                            <>
                              <IconRows size={11} /> reflow
                            </>
                          )}
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-1 flex-col p-4">
                      <h3 className="line-clamp-2 font-display text-base font-bold leading-snug text-ink">
                        {doc.title}
                      </h3>
                      <p className="mt-1 text-xs text-ink-faint">
                        {formatDate(doc.createdAt)}
                        {doc.pageCount ? ` · ${doc.pageCount} pages` : ""}
                        {doc.words ? ` · ${doc.words.toLocaleString()} words` : ""}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-xs font-medium text-ink-soft">
                        <span className="inline-flex items-center gap-1">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--hl-sun)" stroke="var(--hl-sun-solid)" strokeWidth="1.5" aria-hidden="true">
                            <rect x="3" y="7" width="18" height="10" rx="2" />
                          </svg>
                          {marks}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[var(--ink-blue)]">
                          <IconNote size={13} /> {notes}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-[rgba(var(--shadow-ink),0.1)] pt-3">
                        <button className="btn-ink !px-3 !py-1.5 text-xs" onClick={() => onOpen(doc.id)}>
                          <IconBook size={14} /> Open
                        </button>
                        {confirmId === doc.id ? (
                          <span className="flex items-center gap-1.5">
                            <button
                              className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-[var(--paper)] transition-transform hover:scale-105"
                              onClick={() => {
                                setConfirmId(null);
                                onDelete(doc.id);
                              }}
                            >
                              Tear it up
                            </button>
                            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setConfirmId(null)}>
                              Keep
                            </button>
                          </span>
                        ) : (
                          <button
                            className="icon-btn !h-8 !w-8"
                            title="Remove from desk"
                            aria-label={`Delete ${doc.title}`}
                            onClick={() => setConfirmId(doc.id)}
                          >
                            <IconTrash size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <footer className="mt-14 flex items-center justify-between text-xs text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <IconFile size={13} /> Local-only · nothing leaves this browser
        </span>
        <span>Stored under <code className="font-semibold">paper-annotate.docs.v1</code></span>
      </footer>
    </div>
  );
}

function MiniTextPage({ text }: { text: string }) {
  const clean = text.replace(/[#>*`_\-[\]()!]/g, " ").replace(/\s+/g, " ").trim();
  return (
    <div className="paper-sheet flex h-full w-full flex-col gap-[3px] overflow-hidden p-3">
      {Array.from({ length: 12 }).map((_, i) => {
        const start = i * 90;
        const chunk = clean.slice(start, start + 90);
        if (!chunk) return <div key={i} className="h-[5px] w-1/3 rounded bg-[rgba(var(--shadow-ink),0.08)]" />;
        return (
          <div key={i} className="h-[7px] overflow-hidden whitespace-nowrap rounded-sm bg-[rgba(var(--shadow-ink),0.14)] text-[0]">
            {chunk}
          </div>
        );
      })}
    </div>
  );
}

function EmptyDeskArt() {
  return (
    <svg width="150" height="110" viewBox="0 0 150 110" fill="none" aria-hidden="true">
      <rect x="30" y="18" width="78" height="84" rx="3" fill="var(--sheet)" stroke="var(--line)" transform="rotate(-6 30 18)" />
      <rect x="42" y="12" width="78" height="84" rx="3" fill="var(--sheet-deep)" stroke="var(--line)" transform="rotate(3 42 12)" />
      <rect x="36" y="8" width="78" height="88" rx="3" fill="var(--sheet)" stroke="var(--ink-faint)" strokeWidth="1.2" />
      <path d="M46 26h56M46 36h56M46 46h40M46 56h52M46 66h30" stroke="var(--ink-faint)" strokeWidth="2.4" strokeLinecap="round" opacity="0.5" />
      <rect x="52" y="32" width="34" height="7" rx="2" fill="var(--hl-sun)" />
      <path d="M98 78l14-16 6 5-14 16-8 2z" fill="var(--accent)" />
      <path d="M112 62l6 5" stroke="var(--paper)" strokeWidth="1.6" />
      <circle cx="118.5" cy="60.5" r="2" fill="var(--accent)" />
    </svg>
  );
}
