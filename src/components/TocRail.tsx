import { IconClock } from "./icons";

export interface RailEntry {
  id: string;
  label: string;
  level?: number;
}

interface Props {
  entries: RailEntry[];
  activeId: string | null;
  progress: number;
  onJump: (id: string) => void;
  meta:
    | { kind: "toc"; words: number; minutes: number }
    | { kind: "pages"; page: number; pages: number };
  heading: string;
}

/** Left rail: reading progress + table of contents (reflow) or page index (layout). */
export default function TocRail({ entries, activeId, progress, onJump, meta, heading }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <aside
      className="hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto px-5 py-10 lg:flex"
      aria-label="Reading rail"
    >
      <div className="desk-card rounded-lg p-4" style={{ rotate: "-0.4deg" }}>
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {heading}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-deep">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-ink-soft">
          <span className="font-display text-sm font-bold text-ink">{pct}%</span>
          {meta.kind === "toc" ? (
            <span className="inline-flex items-center gap-1">
              <IconClock size={12} /> {meta.minutes} min · {meta.words.toLocaleString()} words
            </span>
          ) : (
            <span>
              p. {meta.page} / {meta.pages}
            </span>
          )}
        </div>
      </div>

      {entries.length > 0 && (
        <nav aria-label={meta.kind === "toc" ? "Table of contents" : "Pages"}>
          <p className="mb-2 px-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {meta.kind === "toc" ? "Contents" : "Pages"}
          </p>
          <ul className="space-y-0.5">
            {entries.map((e) => {
              const active = e.id === activeId;
              return (
                <li key={e.id}>
                  <button
                    onClick={() => onJump(e.id)}
                    className={`group flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[0.8rem] leading-snug transition-colors ${
                      active ? "bg-[rgba(var(--shadow-ink),0.08)] font-semibold text-accent-deep" : "text-ink-soft hover:bg-[rgba(var(--shadow-ink),0.05)] hover:text-ink"
                    }`}
                    style={{ paddingLeft: `${0.5 + ((e.level ?? 2) - 1) * 0.85}rem` }}
                    aria-current={active ? "location" : undefined}
                  >
                    <span
                      className={`mt-0.5 inline-block h-1.5 w-1.5 shrink-0 self-center rounded-full transition-colors ${
                        active ? "bg-accent" : "bg-line group-hover:bg-ink-faint"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="line-clamp-2">{e.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </aside>
  );
}
