import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Rnd } from "react-rnd";
import type {
  AnnotationsState,
  DocumentRecord,
  Highlight,
  MarkColor,
  MarkType,
  Note,
  PageData,
  Placement,
  Settings,
} from "../data/types";
import { MARK_COLORS, MARK_TYPES } from "../data/types";
import { useHistory } from "../lib/undo";
import { uid } from "../lib/store";
import { makeThumb, openPdf, renderPages } from "../lib/pdf";
import { extractToc, lexMarkdown, plainTextOfTokens, readingStats } from "../lib/markdown";
import ReflowCanvas, { flashRect, scrollToOffset, type ReflowSelection } from "./ReflowCanvas";
import LayoutCanvas, { type LayoutSelection } from "./LayoutCanvas";
import StickyNote from "./StickyNote";
import { ConnectorLayer, MarginRail } from "./MarginRail";
import TocRail, { type RailEntry } from "./TocRail";
import SearchBar, { type SearchSource } from "./SearchBar";
import ExportMenu from "./ExportMenu";
import {
  IconArrowLeft,
  IconEye,
  IconEyeOff,
  IconGear,
  IconHighlighter,
  IconLayout,
  IconMoon,
  IconMove,
  IconNote,
  IconRedo,
  IconRows,
  IconSearch,
  IconSpin,
  IconStrike,
  IconSun,
  IconTrash,
  IconUnderline,
  IconUpload,
  IconUndo,
} from "./icons";

type SelPayload = ({ kind: "text" } & ReflowSelection) | ({ kind: "page" } & LayoutSelection);

interface Props {
  doc: DocumentRecord;
  annotations: AnnotationsState;
  settings: Settings;
  sheetClass: string;
  onAnnotationsChange: (docId: string, ann: AnnotationsState) => void;
  onDocChange: (doc: DocumentRecord) => void;
  onBack: () => void;
  onOpenSettings: () => void;
  resolvedTheme: "light" | "dark" | "black";
  onToggleTheme: () => void;
  onToast: (msg: string) => void;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setMatches(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return matches;
}

const MARK_ICON: Record<MarkType, (p: { size?: number }) => ReactNode> = {
  highlight: (p) => <IconHighlighter {...p} />,
  underline: (p) => <IconUnderline {...p} />,
  strikethrough: (p) => <IconStrike {...p} />,
};

export default function DocumentView({
  doc,
  annotations,
  settings,
  sheetClass,
  onAnnotationsChange,
  onDocChange,
  onBack,
  onOpenSettings,
  resolvedTheme,
  onToggleTheme,
  onToast,
}: Props) {
  const hist = useHistory(annotations);
  const { highlights, notes } = hist.present;

  const [clean, setClean] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selPayload, setSelPayload] = useState<SelPayload | null>(null);
  const [markMenu, setMarkMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [tool, setTool] = useState<MarkType>("highlight");
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [progress, setProgress] = useState(0);
  const [needsAttach, setNeedsAttach] = useState(doc.mode === "layout" && !doc.pages);
  const [attachLabel, setAttachLabel] = useState("");
  const [attaching, setAttaching] = useState(false);
  const lastColor = useRef<MarkColor>("sun");

  const scrollerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);

  const isMobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    onAnnotationsChange(doc.id, hist.present);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist.present, doc.id]);

  /* ————— settings-derived values ————— */

  const palette = useMemo(() => {
    const active = settings.activeHighlightColors.filter((k) =>
      MARK_COLORS.some((c) => c.key === k)
    );
    const source = active.length ? active : MARK_COLORS.map((c) => c.key);
    return MARK_COLORS.filter((c) => source.includes(c.key)).sort(
      (a, b) => source.indexOf(a.key) - source.indexOf(b.key)
    );
  }, [settings.activeHighlightColors]);

  const markTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const h of highlights) {
      const label = settings.highlightLabels[h.color];
      if (label) map[h.id] = label;
    }
    return map;
  }, [highlights, settings.highlightLabels]);

  const noteForMark = useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of notes) if (n.highlightId) map[n.highlightId] = `note-${n.id}`;
    return map;
  }, [notes]);

  const readingStyle = useMemo<CSSProperties>(() => {
    const width =
      settings.readingWidth + (settings.orientation === "landscape" ? 150 : 0);
    return {
      "--reading-size": `${settings.readingFontSize}px`,
      "--reading-width": `${width}px`,
    } as CSSProperties;
  }, [settings.readingFontSize, settings.readingWidth, settings.orientation]);

  const layoutMaxW = settings.orientation === "landscape" ? 1180 : 820;

  /* ————— mutations ————— */

  function applyMark(type: MarkType, color: MarkColor) {
    if (!selPayload) return;
    lastColor.current = color;
    const id = uid();
    const hl: Highlight =
      selPayload.kind === "text"
        ? {
            id,
            docId: doc.id,
            type,
            color,
            anchor: { kind: "text", start: selPayload.start, end: selPayload.end, snippet: selPayload.snippet },
          }
        : {
            id,
            docId: doc.id,
            type,
            color,
            anchor: { kind: "page", page: selPayload.page, rects: selPayload.rects, snippet: selPayload.snippet },
          };
    hist.set((a) => ({ ...a, highlights: [...a.highlights, hl] }));
    window.getSelection()?.removeAllRanges();
    setSelPayload(null);
  }

  function attachNote(existingHlId?: string) {
    const payload = selPayload;
    const placement: Placement = isMobile
      ? "margin"
      : doc.notePlacement ?? settings.defaultNotePlacement;
    let position: Note["position"] = { afterHighlight: true };
    let page: number | undefined;
    if (placement === "freeform") {
      if (payload?.kind === "page") {
        const r = payload.rects[0];
        page = payload.page;
        position = { x: Math.min(0.58, r.x + r.w + 0.02), y: Math.min(0.82, r.y) };
      } else if (payload?.kind === "text" && wrapRef.current) {
        const w = wrapRef.current.getBoundingClientRect();
        position = {
          x: Math.max(8, Math.min(w.width - 260, payload.rect.right - w.left + 14)),
          y: Math.max(8, payload.rect.top - w.top - 10),
        };
      } else {
        position = { x: 48, y: 48 };
      }
    } else if (payload?.kind === "page") {
      page = payload.page;
    }
    let hlId = existingHlId;
    let newHl: Highlight | null = null;
    if (!hlId && payload) {
      hlId = uid();
      newHl =
        payload.kind === "text"
          ? {
              id: hlId,
              docId: doc.id,
              type: "highlight",
              color: lastColor.current,
              anchor: { kind: "text", start: payload.start, end: payload.end, snippet: payload.snippet },
            }
          : {
              id: hlId,
              docId: doc.id,
              type: "highlight",
              color: lastColor.current,
              anchor: { kind: "page", page: payload.page, rects: payload.rects, snippet: payload.snippet },
            };
    }
    const noteId = uid();
    const note: Note = {
      id: noteId,
      docId: doc.id,
      highlightId: hlId,
      content: "",
      tags: [],
      font: settings.defaultNoteFont,
      ink: settings.defaultNoteInk,
      placement,
      page,
      position,
      collapsed: false,
      createdAt: new Date().toISOString(),
    };
    hist.set((a) => ({
      highlights: newHl ? [...a.highlights, newHl] : a.highlights,
      notes: [...a.notes, note],
    }));
    window.getSelection()?.removeAllRanges();
    setSelPayload(null);
    setMarkMenu(null);
    window.setTimeout(() => {
      const el = contentRef.current?.querySelector(
        `[data-note-anchor="${noteId}"] textarea`
      ) as HTMLElement | null;
      el?.focus();
    }, 100);
  }

  function guessFreeform(n: Note): { pos: { x: number; y: number }; page?: number } {
    const hl = highlights.find((h) => h.id === n.highlightId);
    if (hl && hl.anchor.kind === "page") {
      const r = hl.anchor.rects[0];
      return {
        pos: { x: Math.min(0.58, (r?.x ?? 0.1) + (r?.w ?? 0) + 0.03), y: r?.y ?? 0.1 },
        page: hl.anchor.page,
      };
    }
    const el = contentRef.current?.querySelector(`[data-hlid="${n.highlightId}"]`);
    if (el && wrapRef.current) {
      const a = el.getBoundingClientRect();
      const w = wrapRef.current.getBoundingClientRect();
      return {
        pos: {
          x: Math.max(8, Math.min(w.width - 260, a.right - w.left + 14)),
          y: Math.max(8, a.top - w.top - 10),
        },
      };
    }
    return { pos: { x: 60, y: 60 }, page: n.page };
  }

  function patchNote(id: string, patch: Partial<Note>) {
    hist.set((a) => ({
      ...a,
      notes: a.notes.map((n) => {
        if (n.id !== id) return n;
        let merged: Note = { ...n, ...patch };
        if (patch.content !== undefined) {
          const found = Array.from(
            patch.content.matchAll(/(?:^|\s)#([\p{L}\d_-]+)/gu),
            (m) => m[1].toLowerCase()
          );
          if (found.length) merged = { ...merged, tags: Array.from(new Set([...merged.tags, ...found])) };
        }
        if (patch.placement === "freeform" && !("x" in merged.position)) {
          const g = guessFreeform(n);
          merged = { ...merged, position: g.pos, page: g.page };
        }
        if (patch.placement === "margin") merged = { ...merged, position: { afterHighlight: true } };
        return merged;
      }),
    }));
  }

  function deleteNote(id: string) {
    hist.set((a) => ({ ...a, notes: a.notes.filter((n) => n.id !== id) }));
  }

  function deleteMark(id: string) {
    hist.set((a) => ({
      highlights: a.highlights.filter((h) => h.id !== id),
      notes: a.notes.filter((n) => n.highlightId !== id),
    }));
    setMarkMenu(null);
  }

  function patchMark(id: string, patch: Partial<Highlight>) {
    hist.set((a) => ({
      ...a,
      highlights: a.highlights.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));
  }

  /* ————— keyboard ————— */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) hist.redo();
        else hist.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        hist.redo();
        return;
      }
      if (typing) return;
      if (e.key === "Escape") {
        setSelPayload(null);
        setMarkMenu(null);
        setSearchOpen(false);
        return;
      }
      if (!selPayload) return;
      const k = e.key.toLowerCase();
      if (k === "h") applyMark("highlight", lastColor.current);
      else if (k === "u") applyMark("underline", lastColor.current);
      else if (k === "s") applyMark("strikethrough", lastColor.current);
      else if (k === "n") attachNote();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ————— scrolling: progress, spy, popovers ————— */
  const scrollRaf = useRef(0);
  function onScroll() {
    setSelPayload(null);
    setMarkMenu(null);
    cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      const s = scrollerRef.current;
      if (!s) return;
      const max = s.scrollHeight - s.clientHeight;
      setProgress(max > 0 ? s.scrollTop / max : 1);
      if (articleRef.current) {
        const heads = Array.from(articleRef.current.querySelectorAll("h1[id], h2[id], h3[id]"));
        const sRect = s.getBoundingClientRect();
        let current: string | null = null;
        for (const hEl of heads) {
          if (hEl.getBoundingClientRect().top - sRect.top < 160) current = hEl.id;
          else break;
        }
        setActiveHeading(current);
      }
    });
  }

  /* ————— derived ————— */
  const tokens = useMemo(() => lexMarkdown(doc.markdown ?? ""), [doc.markdown]);
  const toc = useMemo(() => extractToc(tokens), [tokens]);
  const stats = useMemo(() => readingStats(doc.markdown ?? ""), [doc.markdown]);
  const plainText = useMemo(() => plainTextOfTokens(tokens), [tokens]);

  const visibleNotes = useMemo(
    () => (tagFilter.length ? notes.filter((n) => n.tags.some((t) => tagFilter.includes(t))) : notes),
    [notes, tagFilter]
  );

  function orderKey(n: Note): number {
    const hl = highlights.find((h) => h.id === n.highlightId);
    if (hl?.anchor.kind === "text") return hl.anchor.start;
    if (hl?.anchor.kind === "page")
      return 1e9 + hl.anchor.page * 1e5 + Math.round((hl.anchor.rects[0]?.y ?? 0) * 1e4);
    return 2e9 + (new Date(n.createdAt).getTime() % 1e9);
  }

  const marginNotes = useMemo(
    () => visibleNotes.filter((n) => n.placement === "margin").sort((a, b) => orderKey(a) - orderKey(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleNotes, highlights]
  );
  const freeformNotes = useMemo(
    () => visibleNotes.filter((n) => n.placement === "freeform"),
    [visibleNotes]
  );

  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) for (const t of n.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [notes]);

  function snippetFor(noteId: string): string | undefined {
    const n = notes.find((x) => x.id === noteId);
    const hl = highlights.find((h) => h.id === n?.highlightId);
    return hl?.anchor.snippet;
  }

  const railEntries: RailEntry[] =
    doc.mode === "reflow" || !doc.pages
      ? toc.map((t) => ({ id: t.id, label: t.text, level: t.level }))
      : doc.pages.map((p) => ({ id: `p${p.pageNum}`, label: `Page ${p.pageNum}` }));

  function jumpRail(id: string) {
    if (id.startsWith("p") && doc.pages) {
      jumpPage(Number(id.slice(1)));
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function jumpPage(page: number, rect?: { x: number; y: number; w: number; h: number }) {
    const s = scrollerRef.current;
    const el = s?.querySelector(`[data-page="${page}"]`) as HTMLElement | null;
    if (!s || !el) return;
    const sRect = s.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    s.scrollTo({ top: s.scrollTop + eRect.top - sRect.top - 28, behavior: "smooth" });
    if (rect) {
      window.setTimeout(() => {
        const r2 = el.getBoundingClientRect();
        flashRect({
          left: r2.left + rect.x * r2.width,
          top: r2.top + rect.y * r2.height,
          width: rect.w * r2.width,
          height: rect.h * r2.height,
        });
      }, 380);
    }
  }

  const searchSource: SearchSource =
    doc.mode === "reflow" || !doc.pages
      ? { kind: "text", text: plainText }
      : { kind: "pages", pages: doc.pages };

  /* ————— mode switching ————— */
  function switchMode(mode: "reflow" | "layout") {
    if (mode === doc.mode) return;
    if (mode === "layout" && !doc.pages) {
      setNeedsAttach(true);
      onDocChange({ ...doc, mode: "layout" });
      return;
    }
    setNeedsAttach(false);
    onDocChange({ ...doc, mode });
  }

  async function attachForLayout(file: File) {
    if (!/\.pdf$/i.test(file.name)) {
      onToast("Please choose a PDF file.");
      return;
    }
    setAttaching(true);
    setAttachLabel("Opening the PDF…");
    try {
      const opened = await openPdf(file);
      const pages = await renderPages(opened.doc, (d, t) =>
        setAttachLabel(`Rendering pages — ${d} of ${t}`)
      );
      const thumb = await makeThumb(pages[0].imageUrl);
      await opened.destroy();
      onDocChange({ ...doc, pages, thumb, pageCount: pages.length, mode: "layout" });
      setNeedsAttach(false);
      onToast("Layout pages pressed and dried.");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Could not render that PDF.");
    } finally {
      setAttaching(false);
    }
  }

  /* ————— popover positioning ————— */
  const tbWidth = 356;
  const tbLeft = selPayload
    ? Math.min(
        Math.max(8, selPayload.rect.left + selPayload.rect.width / 2 - tbWidth / 2),
        window.innerWidth - tbWidth - 8
      )
    : 0;
  const tbTop = selPayload
    ? selPayload.rect.top > 86
      ? selPayload.rect.top - 56
      : selPayload.rect.bottom + 12
    : 0;

  const markMenuHl = markMenu ? highlights.find((h) => h.id === markMenu.id) : undefined;
  const markMenuNote = markMenu ? notes.find((n) => n.highlightId === markMenu.id) : undefined;
  const docPlacement = doc.notePlacement ?? settings.defaultNotePlacement;

  /* ————— render ————— */
  return (
    <div className="relative z-10 flex h-dvh flex-col">
      <header className="relative z-40 border-b border-[rgba(var(--shadow-ink),0.16)] bg-[var(--paper)]/95 px-3 py-2 backdrop-blur-sm sm:px-5">
        <div className="mx-auto flex max-w-[110rem] items-center gap-1.5">
          <button className="icon-btn" onClick={onBack} title="Back to the library" aria-label="Back to library">
            <IconArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-base font-bold leading-tight text-ink sm:text-lg">{doc.title}</h1>
            <p className="hidden text-[0.62rem] font-medium uppercase tracking-[0.16em] text-ink-faint sm:block">
              {doc.sourceType === "pdf" ? "PDF" : "Text"} · {doc.mode} · {highlights.length} marks · {notes.length} notes
            </p>
          </div>

          {doc.sourceType === "pdf" && (
            <div className="hidden items-center gap-0.5 rounded-lg border border-line p-0.5 md:flex" role="group" aria-label="Render mode">
              <button
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                  doc.mode === "layout" ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
                }`}
                onClick={() => switchMode("layout")}
                aria-pressed={doc.mode === "layout"}
                title="Original page layout"
              >
                <IconLayout size={13} /> Layout
              </button>
              <button
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                  doc.mode === "reflow" ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
                }`}
                onClick={() => switchMode("reflow")}
                aria-pressed={doc.mode === "reflow"}
                title="Clean reflow text"
              >
                <IconRows size={13} /> Reflow
              </button>
            </div>
          )}

          <button
            className={`icon-btn ${!isMobile && docPlacement === "freeform" ? "on" : ""}`}
            title={`New notes default to ${docPlacement} — click to switch`}
            aria-label="Toggle default note placement"
            onClick={() =>
              onDocChange({
                ...doc,
                notePlacement: docPlacement === "margin" ? "freeform" : "margin",
              })
            }
          >
            {docPlacement === "margin" ? <IconRows size={17} /> : <IconMove size={17} />}
          </button>

          <div className="relative">
            <button
              className={`icon-btn ${searchOpen ? "on" : ""}`}
              onClick={() => setSearchOpen((v) => !v)}
              title="Search the document"
              aria-label="Search within document"
              aria-expanded={searchOpen}
            >
              <IconSearch size={17} />
            </button>
            {searchOpen && (
              <SearchBar
                source={searchSource}
                onClose={() => setSearchOpen(false)}
                onJumpText={(offset) => {
                  if (articleRef.current) scrollToOffset(articleRef.current, offset);
                }}
                onJumpPage={(page, rect) => jumpPage(page, rect)}
              />
            )}
          </div>

          <button
            className={`icon-btn ${clean ? "on" : ""}`}
            onClick={() => setClean((v) => !v)}
            title={clean ? "Bring the annotations back" : "Clean reading view — hide marks & notes"}
            aria-pressed={clean}
            aria-label="Toggle clean reading view"
          >
            {clean ? <IconEyeOff size={17} /> : <IconEye size={17} />}
          </button>

          <span className="mx-0.5 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />

          <button className="icon-btn" onClick={hist.undo} disabled={!hist.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
            <IconUndo size={17} />
          </button>
          <button className="icon-btn" onClick={hist.redo} disabled={!hist.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            <IconRedo size={17} />
          </button>

          <span className="mx-0.5 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />

          <ExportMenu doc={doc} annotations={hist.present} preferred={settings.defaultExportFormat} onToast={onToast} />

          <button className="icon-btn" onClick={onOpenSettings} title="Desk settings" aria-label="Open settings">
            <IconGear size={17} />
          </button>
          <button className="icon-btn" onClick={onToggleTheme} title="Quick paper-tone switch" aria-label="Toggle dark mode">
            {resolvedTheme === "light" ? <IconMoon size={17} /> : <IconSun size={17} />}
          </button>
        </div>

        {allTags.length > 0 && (
          <div className="mx-auto mt-1.5 flex max-w-[110rem] flex-wrap items-center gap-1.5">
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">Filter by tag</span>
            {allTags.map(([t, count]) => {
              const on = tagFilter.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => setTagFilter((f) => (on ? f.filter((x) => x !== t) : [...f, t]))}
                  className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold transition-all ${
                    on
                      ? "border-accent bg-accent text-[var(--paper)]"
                      : "border-line bg-transparent text-ink-soft hover:border-ink-faint hover:text-ink"
                  }`}
                  aria-pressed={on}
                >
                  #{t} <span className="opacity-70">{count}</span>
                </button>
              );
            })}
            {tagFilter.length > 0 && (
              <button
                className="text-[0.68rem] font-semibold text-accent-deep underline-offset-2 hover:underline"
                onClick={() => setTagFilter([])}
              >
                clear
              </button>
            )}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <TocRail
          entries={railEntries}
          activeId={doc.mode === "reflow" || !doc.pages ? activeHeading : `p${activePage}`}
          progress={doc.mode === "reflow" || !doc.pages ? progress : doc.pages ? activePage / doc.pages.length : 0}
          onJump={jumpRail}
          heading="Reading progress"
          meta={
            doc.mode === "reflow" || !doc.pages
              ? { kind: "toc", words: stats.words, minutes: stats.minutes }
              : { kind: "pages", page: activePage, pages: doc.pages?.length ?? 0 }
          }
        />

        <main
          ref={scrollerRef}
          data-scroller
          className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
          onScroll={onScroll}
        >
          {needsAttach || (doc.mode === "layout" && !doc.pages) ? (
            <div
              className={`paper-sheet rise mx-auto mt-12 max-w-md rounded-lg p-7 text-center ${sheetClass}`}
              style={{ rotate: "-0.4deg" }}
            >
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-line text-accent">
                {attaching ? <IconSpin size={22} className="spin-slow" /> : <IconUpload size={22} />}
              </span>
              <h2 className="mt-4 font-display text-xl font-bold text-ink">
                {attaching ? attachLabel : "Layout pages need the original PDF"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {attaching
                  ? "Pressing each page locally — big files take a little while."
                  : "This document was ingested as reflow text only. Re-attach the PDF and every page will be pressed for the layout view."}
              </p>
              {!attaching && (
                <label className="btn-ink mx-auto mt-5 cursor-pointer">
                  <IconUpload size={15} /> Choose the PDF
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void attachForLayout(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {attaching && <div className="working-bar mx-auto mt-5 h-2.5 w-3/4 rounded-full" />}
            </div>
          ) : (
            <div
              ref={contentRef}
              className={`relative mx-auto flex w-full max-w-6xl items-start gap-8 px-4 py-8 sm:px-6 sm:py-10 ${clean ? "pa-clean" : ""}`}
            >
              <div ref={wrapRef} className="relative min-w-0 flex-1">
                {doc.mode === "reflow" || !doc.pages ? (
                  <ReflowCanvas
                    markdown={doc.markdown ?? ""}
                    marks={highlights}
                    markTitles={markTitles}
                    sheetClass={sheetClass}
                    styleVars={readingStyle}
                    onMarkClick={(id, e) => {
                      setSelPayload(null);
                      setMarkMenu({ id, x: e.clientX, y: e.clientY });
                    }}
                    onSelect={(s) => setSelPayload({ ...s, kind: "text" })}
                    articleRef={articleRef}
                  />
                ) : (
                  <div style={{ maxWidth: layoutMaxW }} className="mx-auto">
                    <LayoutCanvas
                      pages={doc.pages}
                      highlights={highlights}
                      clean={clean}
                      markTitles={markTitles}
                      sheetClass={sheetClass}
                      onMarkClick={(id, e) => {
                        setSelPayload(null);
                        setMarkMenu({ id, x: e.clientX, y: e.clientY });
                      }}
                      onSelect={(s) => setSelPayload({ ...s, kind: "page" })}
                      onPageSeen={setActivePage}
                      pageNotes={(pageNum) => {
                        if (clean) return null;
                        const page = doc.pages?.find((p) => p.pageNum === pageNum);
                        const list = freeformNotes.filter((n) => (n.page ?? 1) === pageNum);
                        if (!page || !list.length) return null;
                        return (
                          <PageNoteHost
                            page={page}
                            notes={list}
                            snippetFor={snippetFor}
                            onPatch={patchNote}
                            onDelete={deleteNote}
                          />
                        );
                      }}
                    />
                  </div>
                )}

                {doc.mode === "reflow" &&
                  !clean &&
                  freeformNotes.map((n) => {
                    const pos = n.position as { x: number; y: number; w?: number; h?: number };
                    return (
                      <Rnd
                        key={n.id}
                        className="pa-freenote !absolute z-30"
                        size={{ width: pos.w ?? 236, height: pos.h ?? 176 }}
                        position={{ x: pos.x, y: pos.y }}
                        bounds="parent"
                        onDragStop={(_, d) =>
                          patchNote(n.id, {
                            position: { ...pos, x: Math.max(0, d.x), y: Math.max(0, d.y) },
                          })
                        }
                        onResizeStop={(_, __, el, ___, p) =>
                          patchNote(n.id, {
                            position: {
                              x: Math.max(0, p.x),
                              y: Math.max(0, p.y),
                              w: parseInt(el.style.width, 10),
                              h: parseInt(el.style.height, 10),
                            },
                          })
                        }
                        enableResizing={{ bottom: true, right: true, bottomRight: true }}
                      >
                        <div className="h-full">
                          <StickyNote note={n} snippet={snippetFor(n.id)} onPatch={patchNote} onDelete={deleteNote} />
                        </div>
                      </Rnd>
                    );
                  })}

                <section className="pa-notes mt-12 md:hidden" aria-label="Margin notes">
                  <h2 className="mb-4 font-display text-lg font-bold text-ink">Marginalia</h2>
                  <div className="flex flex-col gap-6">
                    {marginNotes.map((n) => (
                      <StickyNote key={n.id} note={n} snippet={snippetFor(n.id)} onPatch={patchNote} onDelete={deleteNote} />
                    ))}
                    {marginNotes.length === 0 && (
                      <p className="text-sm italic text-ink-faint">No margin notes yet.</p>
                    )}
                  </div>
                </section>
              </div>

              <div className="hidden md:block">
                <MarginRail notes={marginNotes} snippetFor={snippetFor} onPatch={patchNote} onDelete={deleteNote} />
              </div>

              <ConnectorLayer
                containerRef={contentRef}
                scrollerRef={scrollerRef}
                notes={clean ? [] : visibleNotes}
                revision={highlights.length * 7 + notes.length * 13 + (clean ? 1 : 0)}
              />
            </div>
          )}
        </main>
      </div>

      {selPayload && !clean && (
        <div
          className="pop fixed z-[70] flex items-center gap-1 rounded-lg border border-line bg-sheet p-1.5 shadow-[0_14px_34px_-12px_rgba(var(--shadow-ink),0.55)]"
          style={{ left: tbLeft, top: tbTop, width: tbWidth }}
          role="toolbar"
          aria-label="Annotation toolbar"
        >
          {MARK_TYPES.map((t) => (
            <button
              key={t.key}
              className={`icon-btn !h-8 !w-8 ${tool === t.key ? "on" : ""}`}
              title={`${t.label} — press “${t.key[0].toUpperCase()}” after selecting`}
              aria-pressed={tool === t.key}
              aria-label={t.label}
              onClick={() => {
                setTool(t.key);
                if (t.key !== "highlight") applyMark(t.key, lastColor.current);
              }}
            >
              {MARK_ICON[t.key]({ size: 16 })}
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px bg-line" aria-hidden="true" />
          {palette.map((c) => {
            const label = settings.highlightLabels[c.key];
            const tip = label ? `${c.label} — ${label}` : c.label;
            return (
              <button
                key={c.key}
                className="h-6 w-6 shrink-0 rounded-full border border-[rgba(var(--shadow-ink),0.35)] transition-transform hover:scale-110 active:scale-95"
                style={{ background: `var(--hl-${c.key})` }}
                title={`${tip} — apply ${tool}`}
                aria-label={`Apply ${tip} ${tool}`}
                onClick={() => applyMark(tool, c.key)}
              />
            );
          })}
          <span className="mx-0.5 h-6 w-px bg-line" aria-hidden="true" />
          <button
            className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
            onClick={() => attachNote()}
            title="Attach a sticky note — press “N”"
          >
            <IconNote size={15} className="text-[var(--ink-blue-ui)]" /> Note
          </button>
        </div>
      )}

      {markMenu && markMenuHl && (
        <>
          <div className="fixed inset-0 z-[65]" onClick={() => setMarkMenu(null)} aria-hidden="true" />
          <div
            className="pop fixed z-[70] w-64 rounded-lg border border-line bg-sheet p-2.5 shadow-[0_18px_40px_-14px_rgba(var(--shadow-ink),0.55)]"
            style={{
              left: Math.min(markMenu.x, window.innerWidth - 272),
              top: Math.min(markMenu.y + 6, window.innerHeight - 240),
            }}
            role="menu"
            aria-label="Mark actions"
          >
            {markMenuHl.anchor.snippet && (
              <p
                className="mb-2 line-clamp-2 border-l-2 pl-2 text-[0.7rem] italic leading-snug text-ink-soft"
                style={{ borderColor: `var(--hl-${markMenuHl.color}-solid)` }}
              >
                “{markMenuHl.anchor.snippet}”
              </p>
            )}
            <div className="flex items-center gap-1">
              {MARK_TYPES.map((t) => (
                <button
                  key={t.key}
                  className={`icon-btn !h-7 !w-7 ${markMenuHl.type === t.key ? "on" : ""}`}
                  title={`Change to ${t.label.toLowerCase()}`}
                  onClick={() => patchMark(markMenuHl.id, { type: t.key })}
                >
                  {MARK_ICON[t.key]({ size: 14 })}
                </button>
              ))}
              <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
              {palette.map((c) => {
                const label = settings.highlightLabels[c.key];
                return (
                  <button
                    key={c.key}
                    className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
                      markMenuHl.color === c.key ? "border-ink" : "border-[rgba(var(--shadow-ink),0.35)]"
                    }`}
                    style={{ background: `var(--hl-${c.key})` }}
                    title={label ? `${c.label} — ${label}` : c.label}
                    aria-label={`Recolor ${c.label}`}
                    onClick={() => patchMark(markMenuHl.id, { color: c.key })}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-[rgba(var(--shadow-ink),0.12)] pt-2">
              <button
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-ink-soft transition-colors hover:bg-[rgba(var(--shadow-ink),0.07)] hover:text-ink"
                onClick={() => {
                  if (markMenuNote) {
                    patchNote(markMenuNote.id, { collapsed: false });
                    setMarkMenu(null);
                    window.setTimeout(() => {
                      const el = contentRef.current?.querySelector(
                        `[data-note-anchor="${markMenuNote.id}"] textarea`
                      ) as HTMLElement | null;
                      el?.focus();
                    }, 60);
                  } else {
                    const keep = markMenu.id;
                    setSelPayload(null);
                    attachNote(keep);
                  }
                }}
              >
                <IconNote size={14} className="text-[var(--ink-blue-ui)]" />
                {markMenuNote ? "Open note" : "Add note"}
              </button>
              <button
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-accent-deep transition-colors hover:bg-[var(--hl-rose)]"
                onClick={() => deleteMark(markMenuHl.id)}
              >
                <IconTrash size={14} /> Remove
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* freeform notes hosted inside a layout page (fractions → px) */
function PageNoteHost({
  page,
  notes,
  snippetFor,
  onPatch,
  onDelete,
}: {
  page: PageData;
  notes: Note[];
  snippetFor: (id: string) => string | undefined;
  onPatch: (id: string, patch: Partial<Note>) => void;
  onDelete: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="pa-notes pointer-events-none absolute inset-0 z-30">
      {size.w > 0 &&
        notes.map((n) => {
          const pos = n.position as { x: number; y: number; w?: number; h?: number };
          return (
            <Rnd
              key={n.id}
              style={{ pointerEvents: "auto" }}
              className="!absolute"
              size={{
                width: pos.w ?? Math.min(230, size.w * 0.42),
                height: pos.h ?? 158,
              }}
              position={{ x: pos.x * size.w, y: pos.y * size.h }}
              bounds="parent"
              onDragStop={(_, d) =>
                onPatch(n.id, {
                  position: {
                    ...pos,
                    x: Math.max(0, Math.min(1, d.x / size.w)),
                    y: Math.max(0, Math.min(1, d.y / size.h)),
                  },
                })
              }
              onResizeStop={(_, __, el, ___, p) =>
                onPatch(n.id, {
                  position: {
                    x: Math.max(0, p.x / size.w),
                    y: Math.max(0, p.y / size.h),
                    w: parseInt(el.style.width, 10),
                    h: parseInt(el.style.height, 10),
                  },
                })
              }
              enableResizing={{ bottom: true, right: true, bottomRight: true }}
            >
              <div className="h-full">
                <StickyNote note={n} snippet={snippetFor(n.id)} onPatch={onPatch} onDelete={onDelete} />
              </div>
            </Rnd>
          );
        })}
    </div>
  );
}
