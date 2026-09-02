import { useEffect, useMemo, useRef, useState } from "react";
import type { PageData, RectF } from "../data/types";
import { IconSearch, IconX } from "./icons";

export type SearchSource =
  | { kind: "text"; text: string }
  | { kind: "pages"; pages: PageData[] };

interface Match {
  label: string;
  offset?: number;
  page?: number;
  rect?: RectF;
}

interface Props {
  source: SearchSource;
  onJumpText: (offset: number) => void;
  onJumpPage: (page: number, rect?: RectF) => void;
  onClose: () => void;
}

function contextSnippet(hay: string, at: number, len: number): string {
  const start = Math.max(0, at - 32);
  const end = Math.min(hay.length, at + len + 42);
  return `${start > 0 ? "…" : ""}${hay.slice(start, end).replace(/\s+/g, " ")}${end < hay.length ? "…" : ""}`;
}

export default function SearchBar({ source, onJumpText, onJumpPage, onClose }: Props) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo<Match[]>(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    const out: Match[] = [];
    if (source.kind === "text") {
      const hay = source.text.toLowerCase();
      let from = 0;
      while (out.length < 120) {
        const at = hay.indexOf(query, from);
        if (at < 0) break;
        out.push({ label: contextSnippet(source.text, at, query.length), offset: at });
        from = at + Math.max(1, query.length);
      }
    } else {
      for (const p of source.pages) {
        for (const it of p.textItems) {
          if (it.str.toLowerCase().includes(query)) {
            out.push({ label: it.str.trim().slice(0, 84), page: p.pageNum, rect: it });
            if (out.length >= 120) break;
          }
        }
        if (out.length >= 120) break;
      }
    }
    return out;
  }, [q, source]);

  useEffect(() => setIdx(0), [q]);

  function jump(m: Match) {
    if (m.offset !== undefined) onJumpText(m.offset);
    else if (m.page !== undefined) onJumpPage(m.page, m.rect);
  }

  function renderLabel(label: string) {
    const query = q.trim();
    const at = label.toLowerCase().indexOf(query.toLowerCase());
    if (at < 0) return label;
    return (
      <>
        {label.slice(0, at)}
        <mark className="rounded-sm bg-[var(--hl-sun)] px-0.5 text-inherit">
          {label.slice(at, at + query.length)}
        </mark>
        {label.slice(at + query.length)}
      </>
    );
  }

  return (
    <div className="pop absolute right-0 top-full z-50 mt-2 w-[min(92vw,26rem)] rounded-lg border border-line bg-sheet p-2 shadow-[0_18px_40px_-16px_rgba(var(--shadow-ink),0.5)]">
      <div className="flex items-center gap-2">
        <span className="pl-1.5 text-ink-faint">
          <IconSearch size={15} />
        </span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches.length) {
              const m = matches[idx % matches.length];
              jump(m);
              setIdx((i) => i + 1);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          placeholder="Search the full text…"
          className="h-8 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          aria-label="Search within document"
        />
        <button className="icon-btn !h-7 !w-7" onClick={onClose} aria-label="Close search">
          <IconX size={14} />
        </button>
      </div>

      {q.trim().length >= 2 && (
        <p className="px-2 pb-1 pt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          {matches.length === 0
            ? "Nothing found on this desk"
            : `${matches.length} found · Enter cycles through`}
        </p>
      )}

      {matches.length > 0 && (
        <ul className="max-h-72 overflow-y-auto pb-1" role="listbox" aria-label="Search results">
          {matches.map((m, i) => (
            <li key={`${m.offset ?? m.page}-${i}`}>
              <button
                className="block w-full rounded-md px-2 py-1.5 text-left text-[0.8rem] leading-relaxed text-ink-soft transition-colors hover:bg-[rgba(var(--shadow-ink),0.06)] hover:text-ink"
                onClick={() => jump(m)}
              >
                {m.page !== undefined && (
                  <span className="mr-1.5 font-display text-xs font-bold text-accent-deep">p. {m.page}</span>
                )}
                {renderLabel(m.label)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
