import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { Highlight, MarkColor, MarkType, PageData, RectF } from "../data/types";

export interface LayoutSelection {
  page: number;
  rects: RectF[];
  rect: DOMRect;
  snippet: string;
}

interface Props {
  pages: PageData[];
  highlights: Highlight[];
  clean: boolean;
  markTitles?: Record<string, string>;
  selectedIds?: Set<string>;
  sheetClass?: string;
  /** 0.5–1.8 — display zoom, independent of browser zoom */
  zoom: number;
  onMarkClick: (id: string, e: ReactMouseEvent) => void;
  onSelect: (sel: LayoutSelection) => void;
  onPageSeen: (page: number) => void;
  pageNotes?: (pageNum: number) => ReactNode;
}

const HL_FILL: Record<MarkColor, string> = {
  sun: "var(--hl-sun)",
  rose: "var(--hl-rose)",
  moss: "var(--hl-moss)",
  sky: "var(--hl-sky)",
  amber: "var(--hl-amber)",
  violet: "var(--hl-violet)",
  teal: "var(--hl-teal)",
  graphite: "var(--hl-graphite)",
  coral: "var(--hl-coral)",
};
const HL_SOLID: Record<MarkColor, string> = {
  sun: "var(--hl-sun-solid)",
  rose: "var(--hl-rose-solid)",
  moss: "var(--hl-moss-solid)",
  sky: "var(--hl-sky-solid)",
  amber: "var(--hl-amber-solid)",
  violet: "var(--hl-violet-solid)",
  teal: "var(--hl-teal-solid)",
  graphite: "var(--hl-graphite-solid)",
  coral: "var(--hl-coral-solid)",
};

/** one period per 10 units; stretched to rect width via preserveAspectRatio=none */
const WAVE_D = (() => {
  let d = "M0 5 Q 2.5 1, 5 5";
  for (let x = 10; x <= 120; x += 5) d += ` T ${x} 5`;
  return d;
})();

function MarkShape({
  r,
  type,
  color,
  title,
  id,
  selected,
}: {
  r: RectF;
  type: MarkType;
  color: MarkColor;
  title?: string;
  id: string;
  selected: boolean;
}) {
  const pos: CSSProperties = {
    left: `${r.x * 100}%`,
    width: `${r.w * 100}%`,
  };
  const cls = `pa-lh${selected ? " pa-lh-sel" : ""}`;
  if (type === "highlight") {
    return (
      <div
        data-lh={id}
        className={cls}
        title={title}
        style={{ ...pos, top: `${r.y * 100}%`, height: `${r.h * 100}%`, background: HL_FILL[color] }}
      />
    );
  }
  if (type === "underline") {
    return (
      <div
        data-lh={id}
        className={cls}
        title={title}
        style={{
          ...pos,
          top: `${(r.y + r.h) * 100}%`,
          height: `${Math.max(r.h * 0.14, 0.35)}%`,
          transform: "translateY(-100%)",
          background: HL_SOLID[color],
          opacity: 0.85,
        }}
      />
    );
  }
  if (type === "strikethrough") {
    return (
      <div
        data-lh={id}
        className={cls}
        title={title}
        style={{
          ...pos,
          top: `${(r.y + r.h * 0.52) * 100}%`,
          height: `${Math.max(r.h * 0.12, 0.3)}%`,
          background: HL_SOLID[color],
          opacity: 0.85,
        }}
      />
    );
  }
  if (type === "squiggly") {
    return (
      <svg
        data-lh={id}
        className={cls}
        style={{
          ...pos,
          top: `${(r.y + r.h) * 100}%`,
          height: "7px",
          transform: "translateY(-90%)",
          overflow: "visible",
        }}
        viewBox="0 0 120 8"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <title>{title}</title>
        <path
          d={WAVE_D}
          fill="none"
          stroke={HL_SOLID[color]}
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  // box / circle — outline geometry
  return (
    <div
      data-lh={id}
      className={cls}
      title={title}
      style={{
        ...pos,
        top: `${r.y * 100}%`,
        height: `${r.h * 100}%`,
        border: `2px solid ${HL_SOLID[color]}`,
        borderRadius: type === "circle" ? "50%" : "3px",
        background: "transparent",
        mixBlendMode: "normal",
      }}
    />
  );
}

function PageBlock({
  page,
  highlights,
  clean,
  markTitles,
  selectedIds,
  sheetClass,
  onMarkClick,
  onSelect,
  pageNotes,
}: {
  page: PageData;
  highlights: Highlight[];
  clean: boolean;
  markTitles?: Record<string, string>;
  selectedIds?: Set<string>;
  sheetClass?: string;
  onMarkClick: (id: string, e: ReactMouseEvent) => void;
  onSelect: (sel: LayoutSelection) => void;
  pageNotes?: (pageNum: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = w > 0 ? w * (page.h / page.w) : 0;
  const marks = highlights.filter(
    (hl) => hl.anchor.kind === "page" && hl.anchor.page === page.pageNum
  );

  const rafRef = useRef(0);
  function checkSelection() {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const cont = ref.current;
      const sel = window.getSelection();
      if (!cont || !sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!cont.contains(range.startContainer)) return;
      const cRect = cont.getBoundingClientRect();
      const rects = Array.from(range.getClientRects())
        .map((r) => ({
          x: (r.left - cRect.left) / cRect.width,
          y: (r.top - cRect.top) / cRect.height,
          w: r.width / cRect.width,
          h: r.height / cRect.height,
        }))
        .filter((r) => r.w > 0.002 && r.h > 0.003);
      if (!rects.length) return;
      onSelect({
        page: page.pageNum,
        rects,
        rect: range.getBoundingClientRect(),
        snippet: sel.toString().replace(/\s+/g, " ").slice(0, 140),
      });
    });
  }

  function clickThroughMark(e: ReactMouseEvent) {
    const cont = ref.current;
    if (!cont) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const cRect = cont.getBoundingClientRect();
    const fx = (e.clientX - cRect.left) / cRect.width;
    const fy = (e.clientY - cRect.top) / cRect.height;
    for (const hl of marks) {
      if (hl.anchor.kind !== "page") continue;
      if (hl.anchor.rects.some((r) => fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h)) {
        onMarkClick(hl.id, e);
        return;
      }
    }
  }

  return (
    <figure className="m-0" data-focus-block>
      <div
        ref={ref}
        data-page={page.pageNum}
        className={`paper-sheet relative select-text overflow-hidden rounded-[3px] ${sheetClass ?? ""}`}
        style={{
          aspectRatio: `${page.w} / ${page.h}`,
          contentVisibility: "auto",
          containIntrinsicSize: `${page.w}px ${page.h}px`,
        }}
      >
        <img
          src={page.imageUrl}
          alt={`Page ${page.pageNum} of the original document`}
          className="absolute inset-0 h-full w-full select-none"
          draggable={false}
          loading="lazy"
        />
        <div className="absolute inset-0" aria-hidden="true">
          {marks.flatMap((hl) =>
            hl.anchor.kind === "page"
              ? hl.anchor.rects.map((r, i) => (
                  <MarkShape
                    key={`${hl.id}-${i}`}
                    r={r}
                    type={hl.type}
                    color={hl.color}
                    title={markTitles?.[hl.id]}
                    id={hl.id}
                    selected={selectedIds?.has(hl.id) ?? false}
                  />
                ))
              : []
          )}
        </div>
        {!clean && (
          <div className="pa-textlayer" onMouseUp={checkSelection} onClick={clickThroughMark}>
            {h > 0 &&
              page.textItems.map((it, i) => (
                <span
                  key={i}
                  style={{
                    left: it.x * w,
                    top: it.y * h,
                    fontSize: Math.max(4, it.h * h),
                  }}
                >
                  {it.str}
                </span>
              ))}
          </div>
        )}
        {pageNotes?.(page.pageNum)}
      </div>
      <figcaption className="mt-2 text-center font-display text-xs font-semibold tracking-[0.2em] text-ink-faint">
        — {page.pageNum} —
      </figcaption>
    </figure>
  );
}

export default function LayoutCanvas({
  pages,
  highlights,
  clean,
  markTitles,
  selectedIds,
  sheetClass,
  zoom,
  onMarkClick,
  onSelect,
  onPageSeen,
  pageNotes,
}: Props) {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const p = Number((entry.target as HTMLElement).dataset.page);
            if (p) onPageSeen(p);
          }
        }
      },
      { rootMargin: "-42% 0px -50% 0px", threshold: 0 }
    );
    document.querySelectorAll("[data-page]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages, onPageSeen]);

  return (
    <div className="space-y-9">
      {pages.map((p) => (
        <div
          key={p.pageNum}
          className="mx-auto transition-[width] duration-200 ease-out"
          style={{ width: `${Math.round(zoom * 100)}%` }}
        >
          <PageBlock
            page={p}
            highlights={highlights}
            clean={clean}
            markTitles={markTitles}
            selectedIds={selectedIds}
            sheetClass={sheetClass}
            onMarkClick={onMarkClick}
            onSelect={onSelect}
            pageNotes={pageNotes}
          />
        </div>
      ))}
    </div>
  );
}
