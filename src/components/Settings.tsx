import { useState, type ReactNode } from "react";
import type {
  ExportFormat,
  MarkColor,
  NoteFont,
  NoteInk,
  Orientation,
  PaperStyle,
  Settings,
  ThemeChoice,
} from "../data/types";
import { MARK_COLORS, NOTE_FONTS, NOTE_INKS, PAPER_STYLES } from "../data/types";
import { formatBytes, STORAGE_QUOTA } from "../lib/store";
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconCheck,
  IconDownload,
  IconTrash,
} from "./icons";

interface Props {
  settings: Settings;
  sheetClass: string;
  storageBytes: number;
  onPatch: (patch: Partial<Settings>) => void;
  onBack: () => void;
  onExportAll: () => void;
  onClearAll: () => void;
}

function Section({
  title,
  desc,
  children,
  delay = 0,
}: {
  title: string;
  desc: string;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <section
      className="ledger-row rise grid gap-4 py-7 md:grid-cols-[15rem_1fr] md:gap-8"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div>
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-ink-soft">{desc}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className="switch"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    />
  );
}

const THEMES: { key: ThemeChoice; label: string; note: string; bg: string; sheet: string }[] = [
  { key: "light", label: "Light", note: "Kraft paper in daylight", bg: "#f4ecd8", sheet: "#faf4e3" },
  { key: "dark", label: "Dark", note: "Aged brown paper by lamplight", bg: "#3a3226", sheet: "#453b2b" },
  { key: "black", label: "Black", note: "Midnight paper — grain still visible", bg: "#191510", sheet: "#221d15" },
  { key: "system", label: "System", note: "Follows your OS · resolves to Light or Dark", bg: "#f4ecd8", sheet: "#3a3226" },
];

const FONT_SIZES = [15, 16, 17, 18, 20, 22];
const WIDTHS: { px: number; label: string }[] = [
  { px: 640, label: "Narrow" },
  { px: 740, label: "Standard" },
  { px: 860, label: "Wide" },
];

const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ["H"], what: "Highlight the selection" },
  { keys: ["U"], what: "Underline the selection" },
  { keys: ["S"], what: "Strikethrough the selection" },
  { keys: ["N"], what: "Attach a sticky note" },
  { keys: ["Ctrl", "Z"], what: "Undo" },
  { keys: ["Ctrl", "Shift", "Z"], what: "Redo" },
  { keys: ["Esc"], what: "Dismiss selection, menus, search" },
  { keys: ["Enter"], what: "In search — jump to next match" },
];

export default function SettingsPage({
  settings,
  sheetClass,
  storageBytes,
  onPatch,
  onBack,
  onExportAll,
  onClearAll,
}: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const ordered = MARK_COLORS.filter((c) => settings.activeHighlightColors.includes(c.key)).concat(
    MARK_COLORS.filter((c) => !settings.activeHighlightColors.includes(c.key))
  );

  function moveColor(key: MarkColor, dir: -1 | 1) {
    const list = [...settings.activeHighlightColors];
    const i = list.indexOf(key);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    onPatch({ activeHighlightColors: list });
  }

  function toggleColor(key: MarkColor) {
    const on = settings.activeHighlightColors.includes(key);
    if (on && settings.activeHighlightColors.length === 1) return; // keep at least one
    onPatch({
      activeHighlightColors: on
        ? settings.activeHighlightColors.filter((k) => k !== key)
        : [...settings.activeHighlightColors, key],
    });
  }

  const usagePct = Math.min(100, (storageBytes / STORAGE_QUOTA) * 100);

  return (
    <div className="relative z-10 h-dvh overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <header className="mb-8 flex items-center gap-3">
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            <IconArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight text-ink">Desk settings</h1>
            <svg viewBox="0 0 260 10" className="mt-0.5 h-2.5 w-44 text-accent" aria-hidden="true">
              <path d="M3 7C50 2.5 120 2 257 5.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="draw-line" />
            </svg>
          </div>
        </header>

        <div className={`paper-sheet rise rounded-xl px-5 py-2 sm:px-10 ${sheetClass}`}>
          {/* ————— Appearance ————— */}
          <Section
            title="Paper tone"
            desc="Light and Dark are the two papers System may pick. Black is always an explicit choice — midnight paper with the grain still showing through."
            delay={40}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {THEMES.map((t) => {
                const on = settings.theme === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => onPatch({ theme: t.key })}
                    aria-pressed={on}
                    className={`group rounded-lg border p-2 text-left transition-all hover:-translate-y-0.5 ${
                      on ? "border-accent shadow-md" : "border-line hover:border-ink-faint"
                    }`}
                  >
                    <span
                      className="relative block h-12 w-full overflow-hidden rounded-md border border-[rgba(var(--shadow-ink),0.15)]"
                      style={{ background: t.bg }}
                    >
                      {t.key === "system" ? (
                        <>
                          <span className="absolute inset-y-0 left-0 w-1/2" style={{ background: "#f4ecd8" }} />
                          <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: "#3a3226" }} />
                          <span className="absolute left-1.5 top-2 h-[3px] w-6 rounded bg-[#8d8069]" />
                          <span className="absolute right-1.5 top-2 h-[3px] w-6 rounded bg-[#8b8066]" />
                        </>
                      ) : (
                        <>
                          <span
                            className="absolute left-1.5 top-1.5 h-8 w-[70%] rounded-sm"
                            style={{ background: t.sheet, boxShadow: "0 1px 3px rgba(0,0,0,.25)" }}
                          />
                          <span className="absolute left-3 top-3.5 h-[3px] w-8 rounded bg-[rgba(0,0,0,0.18)]" />
                          <span className="absolute left-3 top-6 h-[3px] w-6 rounded bg-[rgba(0,0,0,0.13)]" />
                        </>
                      )}
                      {on && (
                        <span className="absolute bottom-1 right-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-[var(--paper)]">
                          <IconCheck size={10} />
                        </span>
                      )}
                    </span>
                    <span className="mt-1.5 block text-sm font-semibold text-ink">{t.label}</span>
                    <span className="block text-[0.62rem] leading-snug text-ink-faint">{t.note}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4">
              <div>
                <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">Orientation</p>
                <div className="seg" role="group" aria-label="Orientation">
                  {(["portrait", "landscape"] as Orientation[]).map((o) => (
                    <button key={o} aria-pressed={settings.orientation === o} onClick={() => onPatch({ orientation: o })}>
                      {o === "portrait" ? "Portrait" : "Landscape"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">Reduce motion</p>
                  <p className="text-[0.7rem] text-ink-soft">Still the tilts and wiggles, app-wide.</p>
                </div>
                <Switch on={settings.reduceMotion} onChange={(v) => onPatch({ reduceMotion: v })} label="Reduce motion" />
              </div>
            </div>
          </Section>

          {/* ————— Paper style ————— */}
          <Section
            title="Paper style"
            desc="A texture laid over every sheet and card, independent of the tone. Aged and Blueprint bring their own ink."
            delay={90}
          >
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {PAPER_STYLES.map((p) => {
                const on = settings.paperStyle === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => onPatch({ paperStyle: p.key as PaperStyle })}
                    aria-pressed={on}
                    className={`rounded-lg border p-1.5 transition-all hover:-translate-y-0.5 ${
                      on ? "border-accent shadow-md" : "border-line hover:border-ink-faint"
                    }`}
                  >
                    <span
                      className={`relative block h-12 w-full overflow-hidden rounded-md border border-[rgba(var(--shadow-ink),0.15)] ${
                        p.key === "plain" ? "" : `paper-${p.key}`
                      }`}
                      style={{ background: "var(--sheet)" }}
                    >
                      <span className="absolute left-2 top-2.5 h-[3px] w-9 rounded bg-[rgba(var(--shadow-ink),0.22)]" />
                      <span className="absolute left-2 top-[22px] h-[3px] w-7 rounded bg-[rgba(var(--shadow-ink),0.16)]" />
                      {on && (
                        <span className="absolute bottom-1 right-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-[var(--paper)]">
                          <IconCheck size={10} />
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-center text-[0.68rem] font-semibold text-ink">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ————— Highlight inks ————— */}
          <Section
            title="Highlight inks"
            desc="Choose which colors sit in the picker, in what order, and pin a meaning to each — it shows as a tooltip on the swatch and on every mark that wears it."
            delay={140}
          >
            <ul className="max-w-xl divide-y divide-dashed divide-[var(--line)]">
              {ordered.map((c) => {
                const active = settings.activeHighlightColors.includes(c.key);
                const idx = settings.activeHighlightColors.indexOf(c.key);
                const label = settings.highlightLabels[c.key] ?? "";
                return (
                  <li key={c.key} className={`flex items-center gap-2.5 py-2 transition-opacity ${active ? "" : "opacity-50"}`}>
                    <span
                      className="h-6 w-6 shrink-0 rounded-full border border-[rgba(var(--shadow-ink),0.35)]"
                      style={{ background: `var(--hl-${c.key})`, boxShadow: `inset 0 -2px 0 var(--hl-${c.key}-solid)` }}
                      aria-hidden="true"
                    />
                    <span className="w-20 shrink-0 text-sm font-semibold text-ink">{c.label}</span>
                    <input
                      value={label}
                      onChange={(e) =>
                        onPatch({
                          highlightLabels: { ...settings.highlightLabels, [c.key]: e.target.value.trim() },
                        })
                      }
                      placeholder="e.g. = important"
                      aria-label={`Label for ${c.label}`}
                      className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint hover:border-line focus:border-line focus:bg-[rgba(var(--shadow-ink),0.04)]"
                    />
                    {active && (
                      <span className="flex shrink-0 items-center">
                        <button
                          className="icon-btn !h-7 !w-7"
                          aria-label={`Move ${c.label} up`}
                          onClick={() => moveColor(c.key, -1)}
                          disabled={idx === 0}
                        >
                          <IconArrowUp size={13} />
                        </button>
                        <button
                          className="icon-btn !h-7 !w-7"
                          aria-label={`Move ${c.label} down`}
                          onClick={() => moveColor(c.key, 1)}
                          disabled={idx === settings.activeHighlightColors.length - 1}
                        >
                          <IconArrowDown size={13} />
                        </button>
                      </span>
                    )}
                    <Switch on={active} onChange={() => toggleColor(c.key)} label={`${c.label} in picker`} />
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* ————— Notes ————— */}
          <Section
            title="Sticky notes"
            desc="Defaults for every fresh note. Each note can still switch its own hand, ink and placement afterwards."
            delay={190}
          >
            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">Placement</p>
                <div className="seg" role="group" aria-label="Default note placement">
                  {(["margin", "freeform"] as const).map((p) => (
                    <button
                      key={p}
                      aria-pressed={settings.defaultNotePlacement === p}
                      onClick={() => onPatch({ defaultNotePlacement: p })}
                    >
                      {p === "margin" ? "Margin rail" : "Freeform"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">Handwriting</p>
                <div className="flex flex-wrap gap-2.5">
                  {NOTE_FONTS.map((f) => {
                    const on = settings.defaultNoteFont === (f.key as NoteFont);
                    return (
                      <button
                        key={f.key}
                        aria-pressed={on}
                        onClick={() => onPatch({ defaultNoteFont: f.key as NoteFont })}
                        className={`rounded-lg border px-4 py-2 transition-all hover:-translate-y-0.5 ${
                          on ? "border-accent bg-[rgba(var(--shadow-ink),0.05)] shadow-sm" : "border-line hover:border-ink-faint"
                        }`}
                      >
                        <span className="block text-2xl leading-none text-ink" style={{ fontFamily: f.css }}>
                          Aa Bb
                        </span>
                        <span className="mt-1 block text-[0.62rem] font-semibold uppercase tracking-wide text-ink-faint">
                          {f.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">Ink</p>
                <div className="flex gap-2.5">
                  {NOTE_INKS.map((i) => {
                    const on = settings.defaultNoteInk === (i.key as NoteInk);
                    return (
                      <button
                        key={i.key}
                        aria-pressed={on}
                        onClick={() => onPatch({ defaultNoteInk: i.key as NoteInk })}
                        className={`flex items-center gap-2 rounded-full border py-1.5 pl-2 pr-3.5 transition-all ${
                          on ? "border-accent bg-[rgba(var(--shadow-ink),0.05)]" : "border-line hover:border-ink-faint"
                        }`}
                      >
                        <span className="h-4 w-4 rounded-full border border-[rgba(var(--shadow-ink),0.3)]" style={{ background: i.css }} />
                        <span className="text-xs font-semibold text-ink">{i.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Section>

          {/* ————— Reading ————— */}
          <Section
            title="Reading"
            desc="Body size and column width for reflow documents. Landscape orientation quietly adds room to the column."
            delay={240}
          >
            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">Type size</p>
                <div className="flex flex-wrap items-end gap-1.5">
                  {FONT_SIZES.map((px) => {
                    const on = settings.readingFontSize === px;
                    return (
                      <button
                        key={px}
                        aria-pressed={on}
                        onClick={() => onPatch({ readingFontSize: px })}
                        className={`rounded-lg border px-3 pb-1.5 pt-2 transition-all hover:-translate-y-0.5 ${
                          on ? "border-accent bg-[rgba(var(--shadow-ink),0.05)]" : "border-line hover:border-ink-faint"
                        }`}
                      >
                        <span className="font-display font-bold leading-none text-ink" style={{ fontSize: `${10 + (px - 15) * 1.1}px` }}>
                          Aa
                        </span>
                        <span className="mt-1 block text-[0.6rem] font-semibold text-ink-faint">{px}px</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">Column width</p>
                <div className="seg" role="group" aria-label="Reading width">
                  {WIDTHS.map((w) => (
                    <button key={w.px} aria-pressed={settings.readingWidth === w.px} onClick={() => onPatch({ readingWidth: w.px })}>
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* ————— Export ————— */}
          <Section
            title="Export"
            desc="Your preferred format floats to the top of the Export menu and wears the “default” tag."
            delay={290}
          >
            <div className="flex flex-col gap-2 max-w-xl">
              {(
                [
                  { key: "pdf", name: "Annotated PDF", hint: "Flattened pages with marks baked in (needs layout pages)" },
                  { key: "markdown", name: "Markdown + appendix", hint: "The reflow text plus a list of every mark and note" },
                  { key: "json", name: "Backup (.json)", hint: "Document and annotations, ready to restore" },
                ] as { key: ExportFormat; name: string; hint: string }[]
              ).map((f) => {
                const on = settings.defaultExportFormat === f.key;
                return (
                  <button
                    key={f.key}
                    aria-pressed={on}
                    onClick={() => onPatch({ defaultExportFormat: f.key })}
                    className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-all ${
                      on ? "border-accent bg-[rgba(var(--shadow-ink),0.05)]" : "border-line hover:border-ink-faint"
                    }`}
                  >
                    <span
                      className={`grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full border-2 ${
                        on ? "border-accent" : "border-ink-faint"
                      }`}
                    >
                      {on && <span className="h-2 w-2 rounded-full bg-accent" />}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">{f.name}</span>
                      <span className="block text-[0.68rem] text-ink-faint">{f.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ————— Data ————— */}
          <Section
            title="Data & storage"
            desc="Everything lives in this browser under one versioned key. Take the whole desk with you as a single JSON, or burn it all down."
            delay={340}
          >
            <div className="max-w-xl">
              <div className="flex items-baseline justify-between">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">Local storage used</p>
                <p className="font-display text-sm font-bold text-ink">
                  {formatBytes(storageBytes)} <span className="font-body text-[0.68rem] font-medium text-ink-faint">of ~5 MB</span>
                </p>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-paper-deep shadow-inner">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${Math.max(1.5, usagePct)}%`,
                    background: usagePct > 80 ? "var(--hl-rose-solid)" : "var(--accent)",
                  }}
                />
              </div>
              {usagePct > 80 && (
                <p className="mt-1.5 text-[0.7rem] font-medium text-accent-deep">
                  Getting full — large layout PDFs eat most of it. Export a backup, then tear up what you don't need.
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <button className="btn-ink" onClick={onExportAll}>
                  <IconDownload size={15} /> Export all as backup
                </button>
                {!confirmOpen ? (
                  <button className="btn-ghost !text-accent-deep" onClick={() => setConfirmOpen(true)}>
                    <IconTrash size={14} /> Clear all data…
                  </button>
                ) : (
                  <span className="pop flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-[var(--hl-rose)] px-3 py-2">
                    <span className="text-xs font-semibold text-ink">
                      Type <code className="font-bold">erase</code> to wipe the whole desk:
                    </span>
                    <input
                      autoFocus
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      className="h-7 w-20 rounded-md border border-line bg-[var(--sheet)] px-2 text-sm text-ink outline-none focus:border-accent"
                      aria-label="Type erase to confirm"
                    />
                    <button
                      className="rounded-md bg-accent px-2.5 py-1 text-xs font-bold text-[var(--paper)] transition-transform enabled:hover:scale-105 disabled:opacity-40"
                      disabled={confirmText.trim().toLowerCase() !== "erase"}
                      onClick={() => {
                        onClearAll();
                        setConfirmOpen(false);
                        setConfirmText("");
                      }}
                    >
                      Tear it all up
                    </button>
                    <button
                      className="text-xs font-semibold text-ink-soft underline-offset-2 hover:underline"
                      onClick={() => {
                        setConfirmOpen(false);
                        setConfirmText("");
                      }}
                    >
                      Keep it
                    </button>
                  </span>
                )}
              </div>
            </div>
          </Section>

          {/* ————— Shortcuts ————— */}
          <Section
            title="Keyboard"
            desc="Mark tools work while a text selection is open. Undo covers every mark, note, move, resize and tear."
            delay={390}
          >
            <ul className="grid max-w-xl gap-x-8 gap-y-2 sm:grid-cols-2">
              {SHORTCUTS.map((s) => (
                <li key={s.what} className="flex items-center justify-between gap-3 border-b border-dashed border-[var(--line)] py-1.5">
                  <span className="text-[0.8rem] text-ink-soft">{s.what}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <p className="mt-6 pb-10 text-center text-xs text-ink-faint">
          Settings travel with the desk — saved under <code className="font-semibold">paper-annotate.docs.v1</code>.
        </p>
      </div>
    </div>
  );
}
