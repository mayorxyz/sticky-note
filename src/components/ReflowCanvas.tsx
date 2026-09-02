import {
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { Highlight, MarkColor, MarkType } from "../data/types";
import { lexMarkdown, makeSlugger } from "../lib/markdown";
import type { Token, Tokens } from "marked";

interface TextMark {
  id: string;
  type: MarkType;
  color: MarkColor;
  start: number;
  end: number;
}

export interface ReflowSelection {
  start: number;
  end: number;
  snippet: string;
  rect: DOMRect;
}

interface Props {
  markdown: string;
  marks: Highlight[];
  /** highlightId → user label, surfaced as tooltip on the mark */
  markTitles?: Record<string, string>;
  selectedIds?: Set<string>;
  sheetClass?: string;
  styleVars?: CSSProperties;
  onMarkClick: (id: string, e: ReactMouseEvent) => void;
  onSelect: (sel: ReflowSelection) => void;
  articleRef: RefObject<HTMLElement | null>;
}

interface Ctx {
  marks: TextMark[];
  counter: { n: number };
  slug: (t: string) => string;
  markTitles?: Record<string, string>;
  selectedIds?: Set<string>;
  onMarkClick: (id: string, e: ReactMouseEvent) => void;
}

/* ————— offset-aware token renderer ————— */

function segment(text: string, start: number, ctx: Ctx): ReactNode[] {
  const end = start + text.length;
  const active = ctx.marks.filter((m) => m.end > start && m.start < end);
  if (!active.length) return [text];
  const ptsSet = new Set<number>([start, end]);
  for (const m of active) {
    ptsSet.add(Math.max(m.start, start));
    ptsSet.add(Math.min(m.end, end));
  }
  const pts = Array.from(ptsSet).sort((a, b) => a - b);
  const out: ReactNode[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const s = pts[i];
    const e = pts[i + 1];
    if (s >= e) continue;
    const piece = text.slice(s - start, e - start);
    const covering = active.filter((m) => m.start <= s && m.end >= e);
    if (!covering.length) {
      out.push(piece);
      continue;
    }
    const bg = covering.find((m) => m.type === "highlight");
    const under = covering.find((m) => m.type === "underline");
    const strike = covering.find((m) => m.type === "strikethrough");
    const squig = covering.find((m) => m.type === "squiggly");
    const box = covering.find((m) => m.type === "box");
    const circle = covering.find((m) => m.type === "circle");
    const outlineMark = box ?? circle;
    const decos: string[] = [];
    if (under) decos.push("underline");
    if (strike) decos.push("line-through");
    if (squig && !under) decos.push("underline");
    const decoColor = (under ?? strike ?? squig)?.color;
    const label = ctx.markTitles?.[covering[0].id];
    const selected = covering.some((m) => ctx.selectedIds?.has(m.id));
    out.push(
      <span
        key={`m${s}-${e}`}
        className={`pa-mark${selected ? " pa-mark-sel" : ""}`}
        data-hlid={covering[0].id}
        aria-describedby={`note-${covering[0].id}`}
        title={label || undefined}
        onClick={(ev) => {
          ev.stopPropagation();
          ctx.onMarkClick(covering[0].id, ev);
        }}
        style={{
          backgroundColor: bg ? `var(--hl-${bg.color})` : undefined,
          textDecorationLine: decos.length ? decos.join(" ") : undefined,
          textDecorationStyle: squig && !under ? "wavy" : undefined,
          textDecorationColor: decoColor ? `var(--hl-${decoColor}-solid)` : undefined,
          outline: outlineMark ? `2px solid var(--hl-${outlineMark.color}-solid)` : undefined,
          outlineOffset: outlineMark ? "1.5px" : undefined,
          borderRadius: circle ? "0.7em" : undefined,
        }}
      >
        {piece}
      </span>
    );
  }
  return out;
}

function emitText(str: string, ctx: Ctx): ReactNode[] {
  const parts = str.split("\n");
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) out.push(<br key={`br${ctx.counter.n}-${i}`} />);
    const part = parts[i];
    if (!part) continue;
    const start = ctx.counter.n;
    ctx.counter.n += part.length;
    out.push(...segment(part, start, ctx));
  }
  return out;
}

function inline(tokens: Token[] | undefined, ctx: Ctx, keyPrefix: string): ReactNode[] {
  if (!tokens) return [];
  const out: ReactNode[] = [];
  tokens.forEach((t, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (t.type) {
      case "text":
      case "escape": {
        const tt = t as Tokens.Text;
        if (tt.tokens?.length) out.push(...inline(tt.tokens as Token[], ctx, key));
        else if (tt.text) out.push(...emitText(tt.text, ctx));
        break;
      }
      case "codespan": {
        const tt = t as Tokens.Codespan;
        out.push(<code key={key}>{emitText(tt.text, ctx)}</code>);
        break;
      }
      case "br":
        out.push(<br key={key} />);
        break;
      case "strong":
        out.push(<strong key={key}>{inline((t as Tokens.Strong).tokens, ctx, key)}</strong>);
        break;
      case "em":
        out.push(<em key={key}>{inline((t as Tokens.Em).tokens, ctx, key)}</em>);
        break;
      case "del":
        out.push(<del key={key}>{inline((t as Tokens.Del).tokens, ctx, key)}</del>);
        break;
      case "link": {
        const lt = t as Tokens.Link;
        out.push(
          <a key={key} href={lt.href} target="_blank" rel="noreferrer">
            {inline(lt.tokens, ctx, key)}
          </a>
        );
        break;
      }
      default:
        break; // html, image → not counted, not rendered as text
    }
  });
  return out;
}

function blocks(tokens: Token[], ctx: Ctx, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  tokens.forEach((t, i) => {
    const key = `${keyPrefix}.${i}`;
    switch (t.type) {
      case "heading": {
        const h = t as Tokens.Heading;
        const id = ctx.slug(h.text);
        const Tag = `h${Math.min(6, h.depth)}` as "h1";
        out.push(
          <Tag key={key} id={id} data-focus-block>
            {inline(h.tokens, ctx, key)}
          </Tag>
        );
        break;
      }
      case "paragraph":
        out.push(<p key={key} data-focus-block>{inline((t as Tokens.Paragraph).tokens, ctx, key)}</p>);
        break;
      case "text": {
        const tt = t as Tokens.Text;
        if (tt.tokens?.length)
          out.push(<p key={key} data-focus-block>{inline(tt.tokens as Token[], ctx, key)}</p>);
        else if (tt.text) out.push(<p key={key} data-focus-block>{emitText(tt.text, ctx)}</p>);
        break;
      }
      case "blockquote":
        out.push(
          <blockquote key={key} data-focus-block>
            {blocks((t as Tokens.Blockquote).tokens, ctx, key)}
          </blockquote>
        );
        break;
      case "code": {
        const ct = t as Tokens.Code;
        ctx.counter.n += ct.text.length; // counted verbatim, like the DOM <pre> text
        out.push(
          <pre key={key} data-focus-block>
            <code>{ct.text}</code>
          </pre>
        );
        break;
      }
      case "list": {
        const lt = t as Tokens.List;
        const items = lt.items.map((item, j) => (
          <li key={`${key}-${j}`}>{blocks(item.tokens, ctx, `${key}-${j}`)}</li>
        ));
        out.push(
          lt.ordered ? (
            <ol key={key} data-focus-block start={lt.start === "" ? 1 : Number(lt.start)}>
              {items}
            </ol>
          ) : (
            <ul key={key} data-focus-block>{items}</ul>
          )
        );
        break;
      }
      case "hr":
        out.push(<hr key={key} data-focus-block />);
        break;
      case "table": {
        const tb = t as Tokens.Table;
        out.push(
          <table key={key} data-focus-block>
            <thead>
              <tr>
                {tb.header.map((c, j) => (
                  <th key={`h${j}`}>{inline(c.tokens, ctx, `${key}-h${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((row, r) => (
                <tr key={`r${r}`}>
                  {row.map((c, j) => (
                    <td key={`c${j}`}>{inline(c.tokens, ctx, `${key}-r${r}c${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
        break;
      }
      default:
        break; // space, html → skipped (matches the plain-text walker)
    }
  });
  return out;
}

/* ————— DOM ↔ offset helpers ————— */

export function selectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let count = 0;
  let start = -1;
  let end = -1;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    if (start < 0 && node === range.startContainer) start = count + range.startOffset;
    if (node === range.endContainer) {
      end = count + range.endOffset;
      break;
    }
    count += len;
  }
  if (start < 0 || end < 0 || end <= start) return null;
  return { start, end };
}

export function flashRect(rect: { left: number; top: number; width: number; height: number }): void {
  const el = document.createElement("div");
  el.className = "pa-flash";
  el.style.left = `${rect.left - 3}px`;
  el.style.top = `${rect.top - 2}px`;
  el.style.width = `${rect.width + 6}px`;
  el.style.height = `${rect.height + 4}px`;
  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
  window.setTimeout(() => el.remove(), 1600);
}

export function scrollToOffset(root: HTMLElement, offset: number): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      const at = Math.min(remaining, Math.max(0, len - 1));
      range.setStart(node, at);
      range.setEnd(node, Math.min(at + 1, len));
      const rect = range.getBoundingClientRect();
      const scroller = root.closest("[data-scroller]") as HTMLElement | null;
      if (scroller) {
        const sRect = scroller.getBoundingClientRect();
        scroller.scrollTo({
          top: scroller.scrollTop + rect.top - sRect.top - scroller.clientHeight * 0.4,
          behavior: "smooth",
        });
      }
      window.setTimeout(() => flashRect(rect), 250);
      return true;
    }
    remaining -= len;
  }
  return false;
}

/** Text offset of the first text node crossing `targetY` (viewport px) — used for bookmarks. */
export function offsetAtPoint(root: HTMLElement, targetY: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let count = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.bottom >= targetY) return count;
    count += len;
  }
  return count;
}

/* ————— component ————— */

export default function ReflowCanvas({
  markdown,
  marks,
  markTitles,
  selectedIds,
  sheetClass,
  styleVars,
  onMarkClick,
  onSelect,
  articleRef,
}: Props) {
  const textMarks: TextMark[] = marks
    .filter(
      (m): m is Highlight & { anchor: { kind: "text"; start: number; end: number } } =>
        m.anchor.kind === "text"
    )
    .map((m) => ({
      id: m.id,
      type: m.type,
      color: m.color,
      start: m.anchor.start,
      end: m.anchor.end,
    }))
    .sort((a, b) => a.start - b.start);

  const counterRef = useRef({ n: 0 });
  counterRef.current.n = 0;
  const slug = makeSlugger(); // fresh per render — no accumulated state
  const ctx: Ctx = { marks: textMarks, counter: counterRef.current, slug, markTitles, selectedIds, onMarkClick };
  const rendered = blocks(lexMarkdown(markdown), ctx, "b");

  const rafRef = useRef(0);
  function scheduleSelectionCheck() {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const root = articleRef.current;
      if (!root) return;
      const offs = selectionOffsets(root);
      if (!offs) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width < 2 && rect.height < 2) return;
      onSelect({
        start: offs.start,
        end: offs.end,
        snippet: sel.toString().replace(/\s+/g, " ").slice(0, 140),
        rect,
      });
    });
  }

  return (
    <article
      ref={articleRef as RefObject<HTMLElement>}
      data-doc
      className={`prose-paper paper-sheet relative rounded-[3px] px-6 py-10 sm:px-12 sm:py-14 ${sheetClass ?? ""}`}
      style={styleVars}
      onMouseUp={scheduleSelectionCheck}
      onKeyUp={(e) => {
        if (e.shiftKey) scheduleSelectionCheck();
      }}
      aria-label="Document text"
    >
      {rendered}
    </article>
  );
}
