import { getDocument, GlobalWorkerOptions, Util } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Highlight, MarkColor, Note, PageData, RectF } from "../data/types";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const PDF_LIMITS = { maxBytes: 20 * 1024 * 1024, maxPages: 300 };

export class PdfNoTextError extends Error {
  constructor() {
    super(
      "This PDF has no extractable text layer — it looks like a scanned document. OCR is out of scope for v1, so please use a text-based PDF."
    );
    this.name = "PdfNoTextError";
  }
}

export interface OpenedPdf {
  doc: PDFDocumentProxy;
  numPages: number;
  destroy: () => Promise<void>;
}

export async function openPdf(file: File): Promise<OpenedPdf> {
  if (file.size > PDF_LIMITS.maxBytes) {
    throw new Error(
      `“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB — the limit is 20 MB per file.`
    );
  }
  const data = await file.arrayBuffer();
  const task = getDocument({ data });
  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (e) {
    throw new Error(`Could not read “${file.name}” as a PDF. ${e instanceof Error ? e.message : ""}`);
  }
  if (doc.numPages > PDF_LIMITS.maxPages) {
    const n = doc.numPages;
    await task.destroy();
    throw new Error(`This PDF has ${n} pages — the limit is ${PDF_LIMITS.maxPages}.`);
  }
  try {
    await assertTextLayer(doc);
  } catch (e) {
    await task.destroy();
    throw e;
  }
  return { doc, numPages: doc.numPages, destroy: () => task.destroy() };
}

async function assertTextLayer(doc: PDFDocumentProxy): Promise<void> {
  const probeCount = Math.min(doc.numPages, 5);
  let chars = 0;
  for (let i = 1; i <= probeCount; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    for (const it of tc.items) if ("str" in it) chars += it.str.trim().length;
    page.cleanup();
  }
  if (chars < 40) throw new PdfNoTextError();
}

/* ————— Reflow: text extraction → clean Markdown ————— */

interface Line {
  y: number;
  h: number;
  text: string;
  bold: boolean;
}

export async function extractMarkdown(
  doc: PDFDocumentProxy,
  onProgress?: (done: number, total: number) => void
): Promise<string> {
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    const lines = new Map<number, Line>();
    for (const item of tc.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const tr = item.transform;
      const y = Math.round(vp.height - tr[5]);
      const h = Math.hypot(tr[2], tr[3]) || Math.abs(tr[0]) * 0.8 || 10;
      const bucket = nearestBucket(lines, y, Math.max(3, h * 0.55));
      const fs = Math.hypot(tr[2], tr[3]) || 10;
      const bold = /bold|black|heavy|semi/i.test(item.fontName);
      const existing = bucket !== null ? lines.get(bucket) : undefined;
      if (existing) {
        existing.text += (needsSpace(existing.text, item.str) ? " " : "") + item.str;
        existing.bold = existing.bold && bold;
        existing.h = Math.max(existing.h, h);
      } else {
        lines.set(y, { y, h, text: item.str, bold });
      }
    }

    const sorted = Array.from(lines.values()).sort((a, b) => a.y - b.y);
    const heights = sorted.map((l) => l.h).sort((a, b) => a - b);
    const medianH = heights[Math.floor(heights.length / 2)] || 10;

    let prev: Line | null = null;
    let para: string[] = [];
    const flush = () => {
      if (para.length) {
        out.push(para.join(" "));
        out.push("");
        para = [];
      }
    };
    for (const line of sorted) {
      let text = line.text.replace(/\s+/g, " ").trim();
      if (line.bold && line.h > medianH * 1.25 && text.length < 90) text = `## ${text}`;
      if (!prev) {
        para.push(text);
      } else {
        const gap = line.y - prev.y;
        const newPara = gap > Math.max(prev.h, line.h) * 1.6 || /^## /.test(text);
        if (newPara) flush();
        para.push(text);
      }
      prev = line;
    }
    flush();
    page.cleanup();
    onProgress?.(p, doc.numPages);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function nearestBucket(lines: Map<number, Line>, y: number, tol: number): number | null {
  let best: number | null = null;
  let bestD = tol;
  for (const key of lines.keys()) {
    const d = Math.abs(key - y);
    if (d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return best;
}

function needsSpace(a: string, b: string): boolean {
  if (!a || !b) return false;
  const last = a[a.length - 1];
  const first = b[0];
  if (/[\s\-—–(/[]$/.test(last)) return false;
  if (/^[,.:;!?)\]%"'”’]/.test(first)) return false;
  if (/[。、，！？；：）】」』]$/.test(last) || /^[。、，！？；：（【「『]/.test(first)) return false;
  return true;
}

/* ————— Layout: page rendering ————— */

export async function renderPages(
  doc: PDFDocumentProxy,
  onProgress?: (done: number, total: number) => void,
  scale = 1.5
): Promise<PageData[]> {
  const pages: PageData[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;

    const tc = await page.getTextContent();
    const textItems = tc.items.flatMap((item) => {
      if (!("str" in item) || !item.str.trim()) return [];
      const r = Util.normalizeRect(Util.applyTransform(item.transform, vp));
      const w = r[2] - r[0];
      const h = r[3] - r[1];
      if (w <= 0 || h <= 0) return [];
      return [
        {
          str: item.str,
          x: r[0] / vp.width,
          y: r[1] / vp.height,
          w: w / vp.width,
          h: h / vp.height,
        },
      ];
    });

    pages.push({
      pageNum: p,
      imageUrl: canvas.toDataURL("image/jpeg", 0.85),
      textItems,
      w: canvas.width,
      h: canvas.height,
    });
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
    onProgress?.(p, doc.numPages);
  }
  return pages;
}

export async function makeThumb(imageUrl: string, maxW = 420): Promise<string> {
  const img = await loadImage(imageUrl);
  const s = Math.min(1, maxW / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * s);
  canvas.height = Math.round(img.height * s);
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the rendered page."));
    img.src = src;
  });
}

/* ————— Ingest ————— */

export async function ingestPdf(
  file: File,
  mode: "reflow" | "layout",
  onProgress?: (label: string, frac: number) => void
): Promise<{ markdown: string; pages?: PageData[]; thumb?: string; numPages: number }> {
  const opened = await openPdf(file);
  const { doc } = opened;
  try {
    onProgress?.("Lifting the text layer…", 0.02);
    const markdown = await extractMarkdown(doc, (d, t) =>
      onProgress?.(`Reading the type — page ${d} of ${t}`, 0.02 + 0.4 * (d / t))
    );
    let pages: PageData[] | undefined;
    let thumb: string | undefined;
    if (mode === "layout") {
      pages = await renderPages(doc, (d, t) =>
        onProgress?.(`Pressing pages — ${d} of ${t}`, 0.44 + 0.52 * (d / t))
      );
      onProgress?.("Drying the ink…", 0.98);
      thumb = await makeThumb(pages[0].imageUrl);
    }
    onProgress?.("Done", 1);
    return { markdown, pages, thumb, numPages: opened.numPages };
  } finally {
    await opened.destroy();
  }
}

/* ————— Flattened annotated PDF export (hand-rolled writer) —————
 * Emits one JPEG XObject per source page, bakes highlight/underline/strike
 * rects underneath the image and draws sticky-note boxes in a base-14 font on
 * top. No compression, classic xref — deliberately boring and robust.
 */

const HL_RGB: Record<MarkColor, [number, number, number]> = {
  sun: [0.98, 0.83, 0.28],
  rose: [0.96, 0.55, 0.68],
  moss: [0.45, 0.78, 0.5],
  sky: [0.47, 0.72, 0.95],
  amber: [0.98, 0.68, 0.28],
  violet: [0.7, 0.55, 0.93],
  teal: [0.3, 0.75, 0.7],
  graphite: [0.55, 0.55, 0.6],
  coral: [0.97, 0.55, 0.42],
};

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pdfEscape(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function dataUrlToBytes(url: string): Uint8Array<ArrayBuffer> {
  return b64ToBytes(url.slice(url.indexOf(",") + 1));
}

function wrapLines(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (trial.length > width && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function buildPdfFromJpegs(
  items: { jpeg: Uint8Array<ArrayBuffer>; w: number; h: number }[]
): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const chunks: (Uint8Array<ArrayBuffer> | Uint8Array<ArrayBufferLike>)[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const pushStr = (s: string) => {
    const b = enc.encode(s);
    chunks.push(b);
    pos += b.length;
  };
  const pushBin = (b: Uint8Array<ArrayBuffer>) => {
    chunks.push(b);
    pos += b.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = pos;
    pushStr(`${n} 0 obj\n${body}\nendobj\n`);
  };

  const n = items.length;
  const fontObj = 3 + 2 * n;
  const pagesObj = 2;
  const kids = items.map((_, i) => `${4 + 2 * i} 0 R`).join(" ");

  pushStr("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
  obj(1, `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  items.forEach((it, i) => {
    const pageN = 4 + 2 * i;
    const imgN = 5 + 2 * i;
    obj(
      pageN,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${it.w} ${it.h}] /Resources << /XObject << /Im${i} ${imgN} 0 R >> /Font << /F1 ${fontObj} 0 R >> >> /Contents ${pageN + 1} 0 R >>`
    );
    const stream = `q ${it.w} 0 0 ${it.h} 0 0 cm /Im${i} Do Q`;
    obj(pageN + 1, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    offsets[imgN] = pos;
    pushStr(
      `${imgN} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${it.w} /Height ${it.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${it.jpeg.length} >>\nstream\n`
    );
    pushBin(it.jpeg);
    pushStr("\nendstream\nendobj\n");
  });
  obj(fontObj, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  const xrefPos = pos;
  const total = fontObj + 1;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  pushStr(xref);

  const out = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export async function exportAnnotatedPdf(
  doc: { title: string; pages?: PageData[] },
  ann: { highlights: Highlight[]; notes: Note[] }
): Promise<Blob> {
  if (!doc.pages?.length) {
    throw new Error("Layout pages are needed for a flattened PDF export.");
  }
  const items: { jpeg: Uint8Array<ArrayBuffer>; w: number; h: number }[] = [];
  for (const p of doc.pages) {
    const img = await loadImage(p.imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
    ctx.drawImage(img, 0, 0);

    for (const h of ann.highlights) {
      if (h.anchor.kind !== "page" || h.anchor.page !== p.pageNum) continue;
      const [r, g, b] = HL_RGB[h.color] ?? HL_RGB.sun;
      for (const rect of h.anchor.rects) {
        const x = rect.x * canvas.width;
        const y = rect.y * canvas.height;
        const w = rect.w * canvas.width;
        const hh = rect.h * canvas.height;
        if (h.type === "highlight") {
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
          ctx.fillRect(x, y, w, hh);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = `rgb(${Math.round(r * 200)}, ${Math.round(g * 200)}, ${Math.round(b * 200)})`;
          const t = Math.max(2, hh * 0.13);
          if (h.type === "underline") ctx.fillRect(x, y + hh - t, w, t);
          else ctx.fillRect(x, y + hh * 0.45, w, t);
        }
      }
    }

    const notes = ann.notes.filter((nt) => nt.page === p.pageNum || (!nt.page && p.pageNum === 1));
    notes.forEach((nt, i) => {
      const pos = nt.position as { x?: number; y?: number; w?: number };
      const fx = typeof pos.x === "number" ? pos.x : 0.62;
      const fy = typeof pos.y === "number" ? pos.y : 0.08 + i * 0.16;
      const bw = (pos.w ?? 0.3) * canvas.width;
      const text = nt.content.trim() || "(empty note)";
      const lines = wrapLines(text, Math.max(10, Math.floor(bw / 9)));
      const fs = Math.max(12, canvas.width * 0.021);
      const bh = lines.length * fs * 1.35 + fs * 1.4;
      const bx = Math.min(fx * canvas.width, canvas.width - bw - 6);
      const by = Math.min(fy * canvas.height, canvas.height - bh - 6);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = fs * 0.7;
      ctx.shadowOffsetY = fs * 0.25;
      ctx.fillStyle = "#fdf6a9";
      ctx.fillRect(bx, by, bw, bh);
      ctx.restore();
      ctx.fillStyle = nt.ink === "red" ? "#b02a2a" : nt.ink === "blue" ? "#27439e" : "#57534a";
      ctx.font = `${fs}px Helvetica, Arial, sans-serif`;
      lines.forEach((ln, j) => {
        ctx.fillText(pdfEscapePlain(ln), bx + fs * 0.6, by + fs * 1.5 + j * fs * 1.35);
      });
    });

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG encoding failed."))), "image/jpeg", 0.88)
    );
    items.push({
      jpeg: new Uint8Array(await blob.arrayBuffer()),
      w: Math.round(img.width * 0.75),
      h: Math.round(img.height * 0.75),
    });
    canvas.width = 0;
    canvas.height = 0;
  }
  const bytes = buildPdfFromJpegs(items);
  return new Blob([bytes], { type: "application/pdf" });
}

function pdfEscapePlain(s: string): string {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7e]/g, "");
}

export { pdfEscape };
