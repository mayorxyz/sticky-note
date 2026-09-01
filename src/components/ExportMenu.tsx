import { useRef, useState } from "react";
import type { AnnotationsState, DocumentRecord, ExportFormat } from "../data/types";
import { exportAnnotatedPdf } from "../lib/pdf";
import { downloadBlob, safeFileName } from "../lib/store";
import { IconChevronDown, IconDownload, IconFile, IconSpin } from "./icons";

interface Props {
  doc: DocumentRecord;
  annotations: AnnotationsState;
  /** the user's preferred format — surfaced first with a “default” tag */
  preferred: ExportFormat;
  onToast: (msg: string) => void;
}

function markdownWithAnnotations(doc: DocumentRecord, ann: AnnotationsState): string {
  const lines: string[] = [doc.markdown ?? "", "", "---", "", "## Annotations", ""];
  if (ann.highlights.length) {
    lines.push("### Marks", "");
    for (const h of ann.highlights) {
      const where =
        h.anchor.kind === "text"
          ? `chars ${h.anchor.start}–${h.anchor.end}`
          : `page ${h.anchor.page}`;
      lines.push(
        `- **${h.type}** (${h.color}, ${where})${h.anchor.snippet ? ` — “${h.anchor.snippet}”` : ""}`
      );
    }
    lines.push("");
  }
  if (ann.notes.length) {
    lines.push("### Sticky notes", "");
    for (const n of ann.notes) {
      const tags = n.tags.length ? ` [${n.tags.map((t) => `#${t}`).join(" ")}]` : "";
      const src = ann.highlights.find((h) => h.id === n.highlightId)?.anchor.snippet;
      lines.push(`- *${n.font} · ${n.ink} ink*${tags}${src ? ` — on “${src}”` : ""}`);
      if (n.content.trim()) lines.push(`  > ${n.content.trim().replace(/\n/g, " ")}`);
    }
  }
  if (!ann.highlights.length && !ann.notes.length) lines.push("_No annotations yet._");
  return lines.join("\n") + "\n";
}

export default function ExportMenu({ doc, annotations, preferred, onToast }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const closeTimer = useRef<number>(0);

  function closeSoon() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  }

  async function exportPdf() {
    setBusy("pdf");
    try {
      const blob = await exportAnnotatedPdf(doc, annotations);
      downloadBlob(blob, `${safeFileName(doc.title)}-annotated.pdf`);
      onToast("Flattened PDF exported — marks and notes baked in.");
      setOpen(false);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "PDF export failed.");
    } finally {
      setBusy(null);
    }
  }

  function exportMarkdown() {
    downloadBlob(
      new Blob([markdownWithAnnotations(doc, annotations)], { type: "text/markdown" }),
      `${safeFileName(doc.title)}.md`
    );
    onToast("Markdown exported with an annotations appendix.");
    setOpen(false);
  }

  function exportBackup() {
    const payload = JSON.stringify({ app: "paper-annotate", version: 1, doc, annotations }, null, 2);
    downloadBlob(
      new Blob([payload], { type: "application/json" }),
      `${safeFileName(doc.title)}.paper-annotate.json`
    );
    onToast("Backup saved — restore it any time from the library.");
    setOpen(false);
  }

  const all: {
    key: ExportFormat;
    label: string;
    hint: string;
    disabled?: boolean;
    onClick: () => void;
  }[] = [
    {
      key: "pdf",
      label: "Annotated PDF",
      hint: "Flattened — marks & notes baked into the pages",
      disabled: !doc.pages?.length,
      onClick: () => void exportPdf(),
    },
    {
      key: "markdown",
      label: "Markdown + appendix",
      hint: "Reflow text with every mark and note listed",
      disabled: !doc.markdown,
      onClick: exportMarkdown,
    },
    {
      key: "json",
      label: "Backup (.json)",
      hint: "Document + all annotations, portable",
      onClick: exportBackup,
    },
  ];
  // preferred format first
  const items = [...all.filter((i) => i.key === preferred), ...all.filter((i) => i.key !== preferred)];

  return (
    <div
      className="relative"
      onMouseEnter={() => window.clearTimeout(closeTimer.current)}
      onMouseLeave={closeSoon}
    >
      <button
        className={`btn-ghost ${open ? "!text-ink" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <IconDownload size={15} /> Export <IconChevronDown size={13} />
      </button>
      {open && (
        <div
          className="pop absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-line bg-sheet p-1.5 shadow-[0_18px_40px_-16px_rgba(var(--shadow-ink),0.5)]"
          role="menu"
        >
          {items.map((it) => (
            <button
              key={it.key}
              role="menuitem"
              disabled={it.disabled || busy !== null}
              onClick={it.onClick}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[rgba(var(--shadow-ink),0.06)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-ink-faint">
                {busy === it.key ? <IconSpin size={16} className="spin-slow" /> : <IconFile size={16} />}
              </span>
              <span>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  {it.label}
                  {it.key === preferred && (
                    <span className="rounded-full bg-accent/15 px-1.5 py-px text-[0.58rem] font-bold uppercase tracking-wide text-accent-deep">
                      default
                    </span>
                  )}
                </span>
                <span className="block text-[0.68rem] leading-snug text-ink-faint">
                  {it.disabled ? "Needs the layout pages — switch mode first" : it.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
