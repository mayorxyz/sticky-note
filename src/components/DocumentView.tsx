import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Rnd } from "react-rnd";
import type {
  AnnotationsState,
  Bookmark,
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
import { copyToClipboard, uid } from "../lib/store";
import { makeThumb, openPdf, renderPages } from "../lib/pdf";
import { extractToc, lexMarkdown, plainTextOfTokens, readingStats } from "../lib/markdown";
import ReflowCanvas, {
  flashRect,
  offsetAtPoint,
  scrollToOffset,
  type ReflowSelection,
} from "./ReflowCanvas";
import LayoutCanvas, { type LayoutSelection } from "./LayoutCanvas";
import StickyNote from "./StickyNote";
import { ConnectorLayer, MarginRail } from "./MarginRail";
import TocRail, { type RailEntry } from "./TocRail";
import SearchBar, { type SearchSource } from "./SearchBar";
import ExportMenu from "./ExportMenu";
import QuickStylePanel from "./QuickStylePanel";
import {
  IconArrowLeft,
  IconBookmark,
  IconBox,
  IconCircle,
  IconDots,
  IconEye,
  IconEyeOff,
  IconFocus,
  IconGear,
  IconHighlighter,
  IconLayout,
  IconList,
  IconMoon,
  IconMove,
  IconNote,
  IconPen,
  IconQuote,
  IconRedo,
  IconRows,
  IconSearch,
  IconSpin,
  IconSquiggle,
  IconStrike,
  IconSun,
  IconTrash,
  IconUnderline,
  IconUpload,
  IconUndo,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "./icons";

type SelPayload = ({ kind: "text" } & ReflowSelection) | ({ kind: "page" } & LayoutSelection);

interface Props {
  doc: DocumentRecord;
  annotations: AnnotationsState;
  bookmarks: Bookmark[];
  settings: Settings;
  onAnnotationsChange: (docId: string, ann: AnnotationsState) => void;
  onDocChange: (doc: DocumentRecord) => void;
  onBookmarkAdd: (bm: Bookmark) => void;
  onBookmarkDelete: (id: string) => void;
  onPatchSettings: (patch: Partial<Settings>) => void;
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
  squiggly: (p) => <IconSquiggle {...p} />,
  box: (p) => <IconBox {...p} />,
  circle: (p) => <IconCircle {...p} />,
};

function railZoneActive(clientX: number): boolean {
  const rail = document.querySelector("[data-margin-rail]");
  if (!rail) return false;
  const r = rail.getBoundingClientRect();
  return r.width > 0 && clientX > r.left - 70;
}

interface LiftState {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  w: number;
  h: number;
}

export default function DocumentView({
  doc,
  annotations,
  bookmarks,
  settings,
  onAnnotationsChange,
  onDocChange,
  onBookmarkAdd,
  onBookmarkDelete,
  onPatchSettings,
  onBack,
  onOpenSettings,
  resolvedTheme,
  onToggleTheme,
  onToast,
}: Props) {
  const hist = useHistory(annotations);
  const { highlights, notes } = hist.present;

  const [clean, setClean] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [hideResolved, setHideResolved] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [mobileMore, setMobileMore] = useState(false);
  const [railDrawer, setRailDrawer] = useState(false);
  const [bookmarkOpen, setBookmarkOpen] = useState(false);
  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [selPayload, setSelPayload] = useState<SelPayload | null>(null);
  const [markMenu, setMarkMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [tool, setTool] = useState<MarkType>("highlight");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [progress, setProgress] = useState(0);
  const [needsAttach, setNeedsAttach] = useState(doc.mode === "layout" && !doc.pages);
  const [attachLabel, setAttachLabel] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [dragOverRail, setDragOverRail] = useState(false);
  const [lift, setLift] = useState<LiftState | null>(null);
  const liftRef = useRef<LiftState | null>(null);
  const lastColor = useRef<MarkColor>("sun");

  const scrollerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const isLayout = doc.mode === "layout" && !!doc.pages?.length;
  const sheetClass = settings.paperStyle === "plain" ? "" : `paper-${settings.paperStyle}`;

  function setLiftBoth(v: LiftState | null) {
    liftRef.current = v;
    setLift(v);
  }

  useEffect(() => {
    onAnnotationsChange(doc.id, hist.present);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist.present, doc.id]);

  /* ————— settings-derived ————— */

  const palette = useMemo(() => {
    const source = settings.activeHighlightColors.length
      ? settings.activeHighlightColors
      : MARK_COLORS.map((c) => c.key);
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

  const readingStyle = useMemo<CSSProperties>(() => {
    const width = settings.readingWidth + (settings.orientation === "landscape" ? 150 : 0);
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
      } else if (payload?.kind === "text" && contentRef.current) {
        const w = contentRef.current.getBoundingClientRect();
        position = {
          x: Math.max(8, Math.min(w.width - 260, payload.rect.left - w.left + payload.rect.width + 14)),
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
      const el = contentRef.current?.querySelector(`[data-note-anchor="${noteId}"] textarea`) as HTMLElement | null;
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
    if (el && contentRef.current) {
      const a = el.getBoundingClientRect();
      const w = contentRef.current.getBoundingClientRect();
      return {
        pos: {
          x: Math.max(8, Math.min(w.width - 260, a.left - w.left + a.width + 14)),
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
    setSelectedIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    setMarkMenu(null);
  }

  function patchMark(id: string, patch: Partial<Highlight>) {
    hist.set((a) => ({
      ...a,
      highlights: a.highlights.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));
  }

  /* ————— multi-select bulk actions ————— */

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function bulkDelete() {
    const ids = selectedIds;
    if (!ids.size) return;
    hist.set((a) => ({
      highlights: a.highlights.filter((h) => !ids.has(h.id)),
      notes: a.notes.filter((n) => !n.highlightId || !ids.has(n.highlightId)),
    }));
    setSelectedIds(new Set());
    onToast(`Tore up ${ids.size} mark${ids.size === 1 ? "" : "s"}.`);
  }

  function bulkRecolor(color: MarkColor) {
    const ids = selectedIds;
    hist.set((a) => ({
      ...a,
      highlights: a.highlights.map((h) => (ids.has(h.id) ? { ...h, color } : h)),
    }));
    lastColor.current = color;
  }

  /* ————— citation ————— */

  async function copyCitation(hl: Highlight) {
    const snippet = hl.anchor.snippet ?? "(selected passage)";
    const where = hl.anchor.kind === "page" ? ` (p. ${hl.anchor.page})` : "";
    const ok = await copyToClipboard(`“${snippet}”\n— ${doc.title}${where}`);
    onToast(ok ? "Citation copied to the clipboard." : "Couldn't reach the clipboard.");
    setMarkMenu(null);
  }

  /* ————— bookmarks ————— */

  function addBookmark() {
    let anchor: Bookmark["anchor"];
    if (isLayout) {
      anchor = { kind: "page", page: activePage };
    } else {
      const s = scrollerRef.current;
      const root = articleRef.current;
      anchor =
        s && root
          ? { kind: "text", offset: offsetAtPoint(root, s.getBoundingClientRect().top + 140) }
          : { kind: "text", offset: 0 };
    }
    const label =
      bookmarkLabel.trim() ||
      (anchor.kind === "page" ? `Page ${anchor.page}` : activeHeading || "Bookmark");
    onBookmarkAdd({ id: uid(), docId: doc.id, label, anchor, createdAt: new Date().toISOString() });
    setBookmarkLabel("");
    setBookmarkOpen(false);
    onToast("Bookmarked this spot.");
  }

  function jumpBookmark(bm: Bookmark) {
    if (bm.anchor.kind === "page") jumpPage(bm.anchor.page);
    else if (articleRef.current) scrollToOffset(articleRef.current, bm.anchor.offset);
    setRailDrawer(false);
  }

  /* ————— margin lift drag (continuous gesture) ————— */

  function onLift(e: ReactPointerEvent, noteId: string) {
    if (isMobile) return;
    const el = contentRef.current?.querySelector(`[data-note-anchor="${noteId}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    e.preventDefault();
    setLiftBoth({
      id: noteId,
      x: e.clientX,
      y: e.clientY,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      w: r.width,
      h: r.height,
    });
  }

  useEffect(() => {
    if (!lift) return;
    const move = (e: PointerEvent) => {
      setLiftBoth({ ...(liftRef.current as LiftState), x: e.clientX, y: e.clientY });
      setDragOverRail(railZoneActive(e.clientX));
    };
    const up = (e: PointerEvent) => {
      const l = liftRef.current;
      setDragOverRail(false);
      setLiftBoth(null);
      if (!l) return;
      const overRail = railZoneActive(e.clientX);
      if (overRail) {
        const note = notes.find((n) => n.id === l.id);
        if (note && note.placement !== "margin") {
          patchNote(l.id, { placement: "margin" });
          onToast("Pinned to the margin rail.");
        }
      } else if (contentRef.current) {
        const cr = contentRef.current.getBoundingClientRect();
        patchNote(l.id, {
          placement: "freeform",
          position: {
            x: Math.max(4, e.clientX - cr.left - l.dx),
            y: Math.max(4, e.clientY - cr.top - l.dy),
            w: l.w,
            h: l.h,
          },
        });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lift !== null]);

  /* live drop-zone preview on the margin rail while dragging */
  useEffect(() => {
    const rail = document.querySelector("[data-margin-rail]");
    if (rail) rail.classList.toggle("rail-hot", dragOverRail);
    return () => {
      if (rail) rail.classList.remove("rail-hot");
    };
  }, [dragOverRail]);

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
        setMobileMore(false);
        setBookmarkOpen(false);
        setSelectedIds(new Set());
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size) {
        e.preventDefault();
        bulkDelete();
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

  /* ————— scroll: progress + spy ————— */
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

  /* ————— focus mode: un-dim EVERY block currently in view ————— */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!focusMode || !scroller) return;
    const targets = Array.from(scroller.querySelectorAll("[data-focus-block]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) en.target.classList.toggle("pa-dim", !en.isIntersecting);
      },
      { root: scroller, threshold: 0.08 }
    );
    targets.forEach((t) => io.observe(t));
    return () => {
      io.disconnect();
      targets.forEach((t) => t.classList.remove("pa-dim"));
    };
  }, [focusMode, doc.id, doc.mode, doc.pages, clean]);

  /* ————— derived ————— */
  const tokens = useMemo(() => lexMarkdown(doc.markdown ?? ""), [doc.markdown]);
  const toc = useMemo(() => extractToc(tokens), [tokens]);
  const stats = useMemo(() => readingStats(doc.markdown ?? ""), [doc.markdown]);
  const plainText = useMemo(() => plainTextOfTokens(tokens), [tokens]);

  const visibleNotes = useMemo(() => {
    let list = notes;
    if (hideResolved) list = list.filter((n) => !n.resolved);
    if (tagFilter.length) list = list.filter((n) => n.tags.some((t) => tagFilter.includes(t)));
    return list;
  }, [notes, tagFilter, hideResolved]);

  function orderKey(n: Note): number {
    if (typeof n.order === "number") return n.order;
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

  const hasResolved = useMemo(() => notes.some((n) => n.resolved), [notes]);

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
      const pages = await renderPages(opened.doc, (d, t) => setAttachLabel(`Rendering pages — ${d} of ${t}`));
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

  /* ————— popover positioning (viewport-clamped) ————— */
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const tbWidth = Math.min(560, vw - 16);
  const tbLeft = selPayload
    ? Math.min(Math.max(8, selPayload.rect.left + selPayload.rect.width / 2 - tbWidth / 2), vw - tbWidth - 8)
    : 0;
  const tbTop = selPayload
    ? selPayload.rect.top > 140
      ? Math.max(8, selPayload.rect.top - 60)
      : Math.min(selPayload.rect.bottom + 12, vh - 110)
    : 0;

  const markMenuHl = markMenu ? highlights.find((h) => h.id === markMenu.id) : undefined;
  const markMenuNote = markMenu ? notes.find((n) => n.highlightId === markMenu.id) : undefined;
  const docPlacement = doc.notePlacement ?? settings.defaultNotePlacement;
  const liftedNote = lift ? notes.find((n) => n.id === lift.id) : undefined;

  /* ————— shared handlers ————— */

  function handleMarkClick(id: string, ev: ReactMouseEvent) {
    if (ev.shiftKey) {
      toggleSelect(id);
      return;
    }
    setSelPayload(null);
    setMarkMenu({
      id,
      x: Math.min(Math.max(8, ev.clientX), vw - 280),
      y: Math.min(Math.max(8, ev.clientY + 6), vh - 280),
    });
  }

  /* ————— render ————— */
  return (
    <div
      className="relative z-10 flex h-dvh flex-col"
      style={{ "--note-size": `${settings.noteFontSize}px` } as CSSProperties}
    >
      {/* toolbar */}
      <header className="no-print relative z-40 border-b border-[rgba(var(--shadow-ink),0.16)] bg-[var(--paper)]/95 px-3 py-2 backdrop-blur-sm sm:px-5">
        <div className="mx-auto flex max-w-[110rem] items-center gap-1.5">
          <button className="icon-btn" onClick={onBack} title="Back to the library" aria-label="Back to library">
            <IconArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-base font-bold leading-tight text-ink sm:text-lg">{doc.title}</h1>
            <p className="hidden text-[0.62rem] font-medium uppercase tracking-[0.16em] text-ink-faint md:block">
              {doc.sourceType === "pdf" ? "PDF" : "Text"} · {doc.mode} · {highlights.length} marks · {notes.length} notes
            </p>
          </div>

          {/* desktop controls */}
          <div className="hidden items-center gap-1.5 md:flex">
            {doc.sourceType === "pdf" && (
              <div className="hidden items-center gap-0.5 rounded-lg border border-line p-0.5 lg:flex" role="group" aria-label="Render mode">
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

            {isLayout && (
              <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5" role="group" aria-label="Page zoom">
                <button
                  className="icon-btn !h-7 !w-7"
                  onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.15) * 100) / 100))}
                  disabled={zoom <= 0.5}
                  title="Zoom pages out"
                  aria-label="Zoom out"
                >
                  <IconZoomOut size={15} />
                </button>
                <span className="w-11 text-center font-display text-xs font-bold text-ink-soft">{Math.round(zoom * 100)}%</span>
                <button
                  className="icon-btn !h-7 !w-7"
                  onClick={() => setZoom((z) => Math.min(1.8, Math.round((z + 0.15) * 100) / 100))}
                  disabled={zoom >= 1.8}
                  title="Zoom pages in"
                  aria-label="Zoom in"
                >
                  <IconZoomIn size={15} />
                </button>
              </div>
            )}

            <button
              className={`icon-btn ${!isMobile && docPlacement === "freeform" ? "on" : ""}`}
              title={`New notes default to ${docPlacement} — click to switch`}
              aria-label="Toggle default note placement"
              onClick={() =>
                onDocChange({ ...doc, notePlacement: docPlacement === "margin" ? "freeform" : "margin" })
              }
            >
              {docPlacement === "margin" ? <IconRows size={17} /> : <IconMove size={17} />}
            </button>

            <div className="relative">
              <button
                className={`icon-btn ${bookmarkOpen ? "on" : ""}`}
                onClick={() => setBookmarkOpen((v) => !v)}
                title="Bookmark the current spot"
                aria-label="Bookmark current position"
                aria-expanded={bookmarkOpen}
              >
                <IconBookmark size={17} />
              </button>
            </div>

            <button
              className={`icon-btn ${focusMode ? "on" : ""}`}
              onClick={() => setFocusMode((v) => !v)}
              title="Focus mode — dim everything not in view"
              aria-pressed={focusMode}
              aria-label="Toggle focus mode"
            >
              <IconFocus size={17} />
            </button>

            <button
              className={`icon-btn ${quickOpen ? "on" : ""}`}
              onClick={() => setQuickOpen((v) => !v)}
              title="Quick style — paper, hand, sizes"
              aria-label="Open quick style panel"
            >
              <IconPen size={17} />
            </button>
          </div>

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

          <span className="mx-0.5 hidden h-5 w-px bg-line md:block" aria-hidden="true" />

          <div className="hidden items-center gap-1.5 md:flex">
            <button className="icon-btn" onClick={hist.undo} disabled={!hist.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
              <IconUndo size={17} />
            </button>
            <button className="icon-btn" onClick={hist.redo} disabled={!hist.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
              <IconRedo size={17} />
            </button>
            <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
            <ExportMenu doc={doc} annotations={hist.present} preferred={settings.defaultExportFormat} onToast={onToast} />
            <button className="icon-btn" onClick={onOpenSettings} title="Desk settings" aria-label="Open settings">
              <IconGear size={17} />
            </button>
            <button className="icon-btn" onClick={onToggleTheme} title="Quick paper-tone switch" aria-label="Toggle dark mode">
              {resolvedTheme === "light" ? <IconMoon size={17} /> : <IconSun size={17} />}
            </button>
          </div>

          {/* mobile overflow */}
          <div className="relative md:hidden">
            <ExportMenu doc={doc} annotations={hist.present} preferred={settings.defaultExportFormat} onToast={onToast} />
          </div>
          <button
            className={`icon-btn md:hidden ${mobileMore ? "on" : ""}`}
            onClick={() => setMobileMore((v) => !v)}
            aria-label="More actions"
            aria-expanded={mobileMore}
          >
            <IconDots size={18} />
          </button>
        </div>

        {/* tag filter strip */}
        {(allTags.length > 0 || hasResolved) && (
          <div className="mx-auto mt-1.5 flex max-w-[110rem] flex-wrap items-center gap-1.5">
            {allTags.length > 0 && (
              <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">Tags</span>
            )}
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
            {hasResolved && (
              <button
                onClick={() => setHideResolved((v) => !v)}
                className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold transition-all ${
                  hideResolved
                    ? "border-accent bg-accent text-[var(--paper)]"
                    : "border-line text-ink-soft hover:border-ink-faint hover:text-ink"
                }`}
                aria-pressed={hideResolved}
                title="Resolved notes stay visible unless hidden here"
              >
                hide resolved
              </button>
            )}
            {(tagFilter.length > 0 || hideResolved) && (
              <button
                className="text-[0.68rem] font-semibold text-accent-deep underline-offset-2 hover:underline"
                onClick={() => {
                  setTagFilter([]);
                  setHideResolved(false);
                }}
              >
                clear
              </button>
            )}
          </div>
        )}
      </header>

      {/* mobile overflow popover */}
      {mobileMore && (
        <>
          <div className="fixed inset-0 z-[64]" onClick={() => setMobileMore(false)} aria-hidden="true" />
          <div className="pop fixed right-2 top-14 z-[70] w-64 rounded-lg border border-line bg-sheet p-2 shadow-[0_18px_40px_-14px_rgba(var(--shadow-ink),0.55)]">
            {doc.sourceType === "pdf" && (
              <div className="mb-1.5 flex gap-1">
                {(["layout", "reflow"] as const).map((m) => (
                  <button
                    key={m}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold ${
                      doc.mode === m ? "bg-ink text-paper" : "text-ink-soft hover:bg-[rgba(var(--shadow-ink),0.06)]"
                    }`}
                    onClick={() => {
                      switchMode(m);
                      setMobileMore(false);
                    }}
                  >
                    {m === "layout" ? <IconLayout size={13} /> : <IconRows size={13} />} {m}
                  </button>
                ))}
              </div>
            )}
            {isLayout && (
              <div className="mb-1.5 flex items-center justify-between rounded-md border border-line px-2 py-1">
                <button className="icon-btn !h-7 !w-7" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.15) * 100) / 100))} aria-label="Zoom out">
                  <IconZoomOut size={15} />
                </button>
                <span className="font-display text-xs font-bold text-ink">{Math.round(zoom * 100)}%</span>
                <button className="icon-btn !h-7 !w-7" onClick={() => setZoom((z) => Math.min(1.8, Math.round((z + 0.15) * 100) / 100))} aria-label="Zoom in">
                  <IconZoomIn size={15} />
                </button>
              </div>
            )}
            {[
              {
                label: docPlacement === "margin" ? "Notes → freeform" : "Notes → margin rail",
                icon: docPlacement === "margin" ? <IconMove size={15} /> : <IconRows size={15} />,
                act: () => onDocChange({ ...doc, notePlacement: docPlacement === "margin" ? "freeform" : "margin" }),
              },
              {
                label: focusMode ? "Focus mode off" : "Focus mode",
                icon: <IconFocus size={15} />,
                act: () => setFocusMode((v) => !v),
              },
              {
                label: "Bookmark this spot",
                icon: <IconBookmark size={15} />,
                act: () => setBookmarkOpen(true),
              },
              { label: "Undo", icon: <IconUndo size={15} />, act: hist.undo, disabled: !hist.canUndo },
              { label: "Redo", icon: <IconRedo size={15} />, act: hist.redo, disabled: !hist.canRedo },
              { label: "Desk settings", icon: <IconGear size={15} />, act: onOpenSettings },
              {
                label: resolvedTheme === "light" ? "Lamplight paper" : "Daylight paper",
                icon: resolvedTheme === "light" ? <IconMoon size={15} /> : <IconSun size={15} />,
                act: onToggleTheme,
              },
            ].map((it) => (
              <button
                key={it.label}
                disabled={it.disabled}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm font-medium text-ink-soft transition-colors hover:bg-[rgba(var(--shadow-ink),0.06)] hover:text-ink disabled:opacity-40"
                onClick={() => {
                  it.act();
                  setMobileMore(false);
                }}
              >
                {it.icon} {it.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* bookmark popover */}
      {bookmarkOpen && (
        <>
          <div className="fixed inset-0 z-[64]" onClick={() => setBookmarkOpen(false)} aria-hidden="true" />
          <div className="pop fixed right-2 top-14 z-[70] w-[min(92vw,18rem)] rounded-lg border border-line bg-sheet p-3 shadow-[0_18px_40px_-14px_rgba(var(--shadow-ink),0.55)]">
            <p className="font-display text-sm font-bold text-ink">Bookmark this spot</p>
            <p className="mt-0.5 text-[0.68rem] text-ink-faint">
              {isLayout ? `Flags page ${activePage}.` : "Flags your current reading position."}
            </p>
            <input
              autoFocus
              value={bookmarkLabel}
              onChange={(e) => setBookmarkLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBookmark()}
              placeholder={isLayout ? `Page ${activePage}` : activeHeading ?? "Label this spot"}
              className="mt-2 h-9 w-full rounded-md border border-line bg-transparent px-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent"
              aria-label="Bookmark label"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setBookmarkOpen(false)}>
                Cancel
              </button>
              <button className="btn-ink !px-3 !py-1.5 text-xs" onClick={addBookmark}>
                <IconBookmark size={13} /> Mark it
              </button>
            </div>
          </div>
        </>
      )}

      <QuickStylePanel open={quickOpen} onClose={() => setQuickOpen(false)} settings={settings} onPatch={onPatchSettings} />

      {/* body */}
      <div className="flex min-h-0 flex-1">
        <TocRail
          entries={railEntries}
          activeId={doc.mode === "reflow" || !doc.pages ? activeHeading : `p${activePage}`}
          progress={doc.mode === "reflow" || !doc.pages ? progress : doc.pages ? activePage / doc.pages.length : 0}
          onJump={(id) => {
            jumpRail(id);
            setRailDrawer(false);
          }}
          heading="Reading progress"
          bookmarks={bookmarks}
          onJumpBookmark={jumpBookmark}
          onDeleteBookmark={onBookmarkDelete}
          meta={
            doc.mode === "reflow" || !doc.pages
              ? { kind: "toc", words: stats.words, minutes: stats.minutes }
              : { kind: "pages", page: activePage, pages: doc.pages?.length ?? 0 }
          }
        />

        <main ref={scrollerRef} data-scroller className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden" onScroll={onScroll}>
          {needsAttach || (doc.mode === "layout" && !doc.pages) ? (
            <div className={`paper-sheet rise mx-auto mt-12 max-w-md rounded-lg p-7 text-center ${sheetClass}`} style={{ rotate: "-0.4deg" }}>
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
              className={`relative mx-auto flex w-full max-w-6xl items-start gap-8 px-4 py-8 sm:px-6 sm:py-10 ${clean ? "pa-clean" : ""} ${focusMode ? "pa-focus" : ""}`}
            >
              <div className="relative min-w-0 flex-1">
                {doc.mode === "reflow" || !doc.pages ? (
                  <ReflowCanvas
                    markdown={doc.markdown ?? ""}
                    marks={highlights}
                    markTitles={markTitles}
                    selectedIds={selectedIds}
                    sheetClass={sheetClass}
                    styleVars={readingStyle}
                    onMarkClick={handleMarkClick}
                    onSelect={(s) => setSelPayload({ ...s, kind: "text" })}
                    articleRef={articleRef}
                  />
                ) : (
                  <div style={{ maxWidth: layoutMaxW }} className="mx-auto w-full">
                    <LayoutCanvas
                      pages={doc.pages}
                      highlights={highlights}
                      clean={clean}
                      markTitles={markTitles}
                      selectedIds={selectedIds}
                      sheetClass={sheetClass}
                      zoom={zoom}
                      onMarkClick={handleMarkClick}
                      onSelect={(s) => setSelPayload({ ...s, kind: "page" })}
                      onPageSeen={setActivePage}
                      pageNotes={(pageNum) => {
                        if (clean) return null;
                        const page = doc.pages?.find((p) => p.pageNum === pageNum);
                        const list = freeformNotes.filter((n) => (n.page ?? 1) === pageNum);
                        if (!page || !list.length) return null;
                        return (
                          <PageNoteHost page={page} notes={list} snippetFor={snippetFor} onPatch={patchNote} onDelete={deleteNote} />
                        );
                      }}
                    />
                  </div>
                )}

                {/* mobile marginalia: margin + freeform notes stacked, no dragging */}
                <section className="pa-notes mt-12 md:hidden" aria-label="Marginalia">
                  <h2 className="mb-4 font-display text-lg font-bold text-ink">Marginalia</h2>
                  <div className="flex flex-col gap-6">
                    {[...marginNotes, ...(isMobile ? freeformNotes : [])].map((n) => (
                      <StickyNote key={n.id} note={n} snippet={snippetFor(n.id)} onPatch={patchNote} onDelete={deleteNote} />
                    ))}
                    {marginNotes.length === 0 && freeformNotes.length === 0 && (
                      <p className="text-sm italic text-ink-faint">No margin notes yet.</p>
                    )}
                  </div>
                </section>
              </div>

              {/* margin rail (desktop) */}
              <div className="hidden md:block">
                <MarginRail
                  notes={marginNotes}
                  snippetFor={snippetFor}
                  onPatch={patchNote}
                  onDelete={deleteNote}
                  onLift={isMobile ? undefined : onLift}
                  hideId={lift?.id}
                />
              </div>

              {/* freeform notes over the reflow container (draggable to the rail) */}
              {doc.mode === "reflow" &&
                !clean &&
                !isMobile &&
                freeformNotes.map((n) => {
                  const pos = n.position as { x: number; y: number; w?: number; h?: number };
                  return (
                    <Rnd
                      key={n.id}
                      className="pa-freenote !absolute z-30"
                      size={{ width: pos.w ?? 236, height: pos.h ?? 176 }}
                      position={{ x: pos.x, y: pos.y }}
                      bounds="parent"
                      onDrag={(e) => setDragOverRail(railZoneActive(e.clientX))}
                      onDragStop={(e, d) => {
                        if (railZoneActive(e.clientX)) {
                          patchNote(n.id, { placement: "margin" });
                          onToast("Pinned to the margin rail.");
                        } else {
                          patchNote(n.id, {
                            position: { ...pos, x: Math.max(0, d.x), y: Math.max(0, d.y) },
                          });
                        }
                        setDragOverRail(false);
                      }}
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

              <ConnectorLayer
                containerRef={contentRef}
                scrollerRef={scrollerRef}
                notes={clean ? [] : visibleNotes}
                revision={highlights.length * 7 + notes.length * 13 + (clean ? 1 : 0) + (dragOverRail ? 1 : 0)}
              />
            </div>
          )}
        </main>
      </div>

      {/* mobile contents drawer */}
      <button
        className="btn-ghost no-print fixed bottom-4 left-4 z-40 !bg-[var(--sheet)] shadow-lg lg:hidden"
        onClick={() => setRailDrawer(true)}
        aria-label="Open contents and bookmarks"
      >
        <IconList size={15} /> Contents
      </button>
      {railDrawer && (
        <div className="no-print fixed inset-0 z-[74] lg:hidden">
          <div className="absolute inset-0 bg-[rgba(var(--shadow-ink),0.4)]" onClick={() => setRailDrawer(false)} />
          <div className="pop absolute bottom-0 left-0 top-0 w-72 max-w-[85vw] overflow-y-auto border-r border-line bg-[var(--sheet)] shadow-2xl">
            <TocRail
              forceVisible
              onClose={() => setRailDrawer(false)}
              entries={railEntries}
              activeId={doc.mode === "reflow" || !doc.pages ? activeHeading : `p${activePage}`}
              progress={progress}
              onJump={(id) => {
                jumpRail(id);
                setRailDrawer(false);
              }}
              heading="Reading progress"
              bookmarks={bookmarks}
              onJumpBookmark={jumpBookmark}
              onDeleteBookmark={onBookmarkDelete}
              meta={
                doc.mode === "reflow" || !doc.pages
                  ? { kind: "toc", words: stats.words, minutes: stats.minutes }
                  : { kind: "pages", page: activePage, pages: doc.pages?.length ?? 0 }
              }
            />
          </div>
        </div>
      )}

      {/* lift-drag ghost */}
      {lift && liftedNote && (
        <div
          className="pa-note pa-ghost"
          style={{
            left: lift.x - lift.dx,
            top: lift.y - lift.dy,
            width: lift.w,
            color: `var(--ink-${liftedNote.ink})`,
          }}
          aria-hidden="true"
        >
          <p className="text-[0.85em] leading-snug">
            {(liftedNote.content.trim() || snippetFor(liftedNote.id) || "…").slice(0, 110)}
          </p>
        </div>
      )}

      {/* selection toolbar */}
      {selPayload && !clean && (
        <div
          className="pop no-print fixed z-[70] flex flex-wrap items-center gap-1 rounded-lg border border-line bg-sheet p-1.5 shadow-[0_14px_34px_-12px_rgba(var(--shadow-ink),0.55)]"
          style={{ left: tbLeft, top: tbTop, maxWidth: tbWidth }}
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

      {/* bulk multi-select bar */}
      {selectedIds.size > 0 && !clean && (
        <div className="pop no-print fixed bottom-6 left-1/2 z-[70] flex max-w-[94vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg border border-line bg-sheet px-3 py-2 shadow-[0_18px_40px_-14px_rgba(var(--shadow-ink),0.55)]">
          <span className="font-display text-sm font-bold text-ink">
            {selectedIds.size} mark{selectedIds.size === 1 ? "" : "s"}
          </span>
          <span className="h-5 w-px bg-line" aria-hidden="true" />
          {palette.map((c) => (
            <button
              key={c.key}
              className="h-6 w-6 rounded-full border border-[rgba(var(--shadow-ink),0.35)] transition-transform hover:scale-110"
              style={{ background: `var(--hl-${c.key})` }}
              title={`Recolor selection ${settings.highlightLabels[c.key] ? `— ${settings.highlightLabels[c.key]}` : ""}`}
              aria-label={`Recolor selection ${c.label}`}
              onClick={() => bulkRecolor(c.key)}
            />
          ))}
          <span className="h-5 w-px bg-line" aria-hidden="true" />
          <button
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-accent-deep transition-colors hover:bg-[var(--hl-rose)]"
            onClick={bulkDelete}
            title="Delete selected marks (Delete key)"
          >
            <IconTrash size={14} /> Tear up
          </button>
          <button className="icon-btn !h-7 !w-7" onClick={() => setSelectedIds(new Set())} aria-label="Clear selection" title="Clear selection (Esc)">
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* existing-mark menu */}
      {markMenu && markMenuHl && (
        <div
          className="pop no-print fixed z-[70] w-64 rounded-lg border border-line bg-sheet p-2.5 shadow-[0_18px_40px_-14px_rgba(var(--shadow-ink),0.55)]"
          style={{ left: markMenu.x, top: markMenu.y }}
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
          <div className="flex flex-wrap items-center gap-1">
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
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1 border-t border-[rgba(var(--shadow-ink),0.12)] pt-2">
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
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-ink-soft transition-colors hover:bg-[rgba(var(--shadow-ink),0.07)] hover:text-ink"
              onClick={() => void copyCitation(markMenuHl)}
              title="Copy the passage as a citation"
            >
              <IconQuote size={14} /> Cite
            </button>
            <button
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-accent-deep transition-colors hover:bg-[var(--hl-rose)]"
              onClick={() => deleteMark(markMenuHl.id)}
            >
              <IconTrash size={14} /> Remove
            </button>
          </div>
        </div>
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
