import { getDocument, GlobalWorkerOptions, Util } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type {
  AnnotationsState,
  DocumentRecord,
  MarkColor,
  Note,
  NoteFont,
  NoteInk,
  PageData,
  RenderMode,
  TextItemF,
} from "../data/types";

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
  if (chars < 40) {
    throw new PdfNoTextError();
  }
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
    type Row = { x: number; y: number; w: number; h: number; str: string; bold: boolean };
    const rows: Row[] = [];
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const tx = Util.transform(vp.transform, it.transform);
      rows.push({
        x: tx[4],
        y: tx[5],
        w: it.width * Math.hypot(tx[0], tx[1]),
        h: Math.hypot(tx[2], tx[3]),
        str: it.str,
        bold: /bold|black|heavy|demi|semibd/i.test(it.fontName ?? ""),
      });
    }
    rows.sort((a, b) => a.y - b.y || a.x - b.x);

    const clusters: Row[][] = [];
    for (const r of rows) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(r.y - last[0].y) <= Math.max(2.5, last[0].h * 0.6)) last.push(r);
      else clusters.push([r]);
    }

    const lines: Line[] = clusters
      .map((items) => {
        items.sort((a, b) => a.x - b.x);
        let text = "";
        let prevEnd = -1e9;
        for (const it of items) {
          if (text && it.x - prevEnd > Math.max(1.5, it.h * 0.22)) text += " ";
          text += it.str;
          prevEnd = it.x + it.w;
        }
        const boldCount = items.filter((i) => i.bold).length;
        return {
          y: items[0].y,
          h: items[0].h,
          text: text.replace(/\s+/g, " ").trim(),
          bold: boldCount > items.length / 2,
        };
      })
      .filter((l) => l.text && !(l.text.length <= 4 && /^\d+$/.test(l.text)));

    const sizes = lines.map((l) => l.h).sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)] ?? 10;

    let para: string[] = [];
    let paraSize = 0;
    let lastY = -1e9;
    const flush = () => {
      if (para.length) {
        out.push(para.join(" "));
        para = [];
      }
    };
    for (const l of lines) {
      const ratio = l.h / median;
      const isList = /^[•●▪◦–—-]\s?/.test(l.text);
      if (ratio > 1.3) {
        flush();
        out.push(`# ${l.text}`);
      } else if (ratio > 1.16) {
        flush();
        out.push(`## ${l.text}`);
      } else if (ratio > 1.06 && l.text.length < 90) {
        flush();
        out.push(`### ${l.text}`);
      } else if (isList) {
        flush();
        out.push(`- ${l.text.replace(/^[•●▪◦–—-]\s?/, "")}`);
      } else {
        if (para.length && (Math.abs(l.h - paraSize) > 1 || l.y - lastY > l.h * 2.1)) flush();
        if (!para.length) paraSize = l.h;
        para.push(l.bold ? `**${l.text}**` : l.text);
      }
      lastY = l.y;
    }
    flush();
    out.push("");
    page.cleanup();
    onProgress?.(p, doc.numPages);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/* ————— Layout: render every page to a JPEG + normalized text items ————— */

export async function renderPages(
  doc: PDFDocumentProxy,
  onProgress?: (done: number, total: number) => void
): Promise<PageData[]> {
  const pages: PageData[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, Math.max(0.75, 1250 / base.width));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    const imageUrl = canvas.toDataURL("image/jpeg", 0.82);

    const tc = await page.getTextContent();
    const textItems: TextItemF[] = [];
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const tx = Util.transform(base.transform, it.transform);
      const h = Math.hypot(tx[2], tx[3]);
      const w = it.width * Math.hypot(tx[0], tx[1]);
      textItems.push({
        str: it.str,
        x: Math.min(1, Math.max(0, tx[4] / base.width)),
        y: Math.min(1, Math.max(0, tx[5] / base.height)),
        w: Math.min(1, w / base.width),
        h: Math.min(1, h / base.height),
      });
    }
    pages.push({ pageNum: p, imageUrl, textItems, w: canvas.width, h: canvas.height });
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
    onProgress?.(p, doc.numPages);
  }
  return pages;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

export async function makeThumb(imageUrl: string): Promise<string> {
  const img = await loadImage(imageUrl);
  const w = 280;
  const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.72);
}

/** Full ingest: always extract Markdown; render pages only for layout mode. */
export async function ingestPdf(
  file: File,
  mode: RenderMode,
  onProgress?: (label: string, frac: number) => void
): Promise<{ markdown: string; pages?: PageData[]; thumb?: string; numPages: number }> {
  const opened = await openPdf(file);
  const { doc } = opened;
  try {
    onProgress?.("Extracting text…", 0.04);
    const markdown = await extractMarkdown(doc, (d, t) =>
      onProgress?.(`Extracting text — page ${d} of ${t}`, 0.04 + 0.36 * (d / t))
    );
    let pages: PageData[] | undefined;
    let thumb: string | undefined;
    if (mode === "layout") {
      pages = await renderPages(doc, (d, t) =>
        onProgress?.(`Rendering pages — ${d} of ${t}`, 0.42 + 0.53 * (d / t))
      );
      onProgress?.("Drying the ink…", 0.97);
      thumb = await makeThumb(pages[0].imageUrl);
    }
    return { markdown, pages, thumb, numPages: opened.numPages };
  } finally {
    await opened.destroy();
  }
}

/* ————— Flattened annotated-PDF export (no pdf-lib needed) ————— */

const HL_FILL: Record<MarkColor, string> = {
  sun: "rgba(241,199,60,0.5)",
  rose: "rgba(238,116,154,0.46)",
  moss: "rgba(112,187,122,0.5)",
  sky: "rgba(94,168,231,0.46)",
  amber: "rgba(243,158,58,0.5)",
};
const HL_SOLID: Record<MarkColor, string> = {
  sun: "#c79a10",
  rose: "#c2416b",
  moss: "#2f7d46",
  sky: "#22649e",
  amber: "#b05e0a",
};
const NOTE_FAMILIES: Record<NoteFont, string> = {
  caveat: "Caveat",
  kalam: "Kalam",
  "patrick-hand": "Patrick Hand",
};
const INK_HEX: Record<NoteInk, string> = { blue: "#27439e", red: "#b02a2a", pencil: "#57534a" };

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = probe;
  }
  if (line) lines.push(line);
  return lines;
}

export async function exportAnnotatedPdf(
  doc: DocumentRecord,
  ann: AnnotationsState
): Promise<Blob> {
  if (!doc.pages?.length) throw new Error("This document has no rendered pages.");
  await document.fonts.ready.catch(() => undefined);

  const rendered: { jpeg: Uint8Array; w: number; h: number }[] = [];
  for (const page of doc.pages) {
    const img = await loadImage(page.imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable.");
    ctx.drawImage(img, 0, 0);
    const W = canvas.width;
    const H = canvas.height;

    for (const hl of ann.highlights) {
      if (hl.anchor.kind !== "page" || hl.anchor.page !== page.pageNum) continue;
      for (const r of hl.anchor.rects) {
        const x = r.x * W;
        const y = r.y * H;
        const w = r.w * W;
        const h = r.h * H;
        if (hl.type === "highlight") {
          ctx.fillStyle = HL_FILL[hl.color];
          ctx.fillRect(x, y, w, h);
        } else {
          ctx.strokeStyle = HL_SOLID[hl.color];
          ctx.lineWidth = Math.max(2, h * 0.09);
          ctx.lineCap = "round";
          const yy = hl.type === "underline" ? y + h - 1 : y + h * 0.55;
          ctx.beginPath();
          ctx.moveTo(x, yy);
          ctx.lineTo(x + w, yy);
          ctx.stroke();
        }
      }
    }

    const notes = ann.notes.filter((nt) =>
      nt.placement === "freeform"
        ? nt.page === page.pageNum
        : ann.highlights.some(
            (h) => h.id === nt.highlightId && h.anchor.kind === "page" && h.anchor.page === page.pageNum
          )
    );
    for (const nt of notes) {
      drawNoteOnCanvas(ctx, nt, ann, W, H);
    }

    const url = canvas.toDataURL("image/jpeg", 0.86);
    const bin = atob(url.split(",")[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    rendered.push({ jpeg: bytes, w: W, h: H });
  }
  const pdf = buildPdfFromJpegs(rendered);
  return new Blob([pdf], { type: "application/pdf" });
}

function drawNoteOnCanvas(
  ctx: CanvasRenderingContext2D,
  nt: Note,
  ann: AnnotationsState,
  W: number,
  H: number
): void {
  const fontSize = Math.max(15, W * 0.021);
  ctx.font = `500 ${fontSize}px "${NOTE_FAMILIES[nt.font]}", cursive`;
  const padX = fontSize * 0.55;
  const boxW = Math.min(W * 0.26, 340);
  const text = nt.content || "(empty note)";
  const lines = wrapText(ctx, text, boxW - padX * 2).slice(0, 8);
  const boxH = lines.length * fontSize * 1.22 + padX * 1.6;

  let x: number;
  let y: number;
  if (nt.placement === "freeform" && "x" in nt.position) {
    x = nt.position.x * W;
    y = nt.position.y * H;
  } else {
    const hl = ann.highlights.find((h) => h.id === nt.highlightId);
    const r =
      hl && hl.anchor.kind === "page" && hl.anchor.rects.length
        ? hl.anchor.rects[0]
        : { x: 0.62, y: 0.06, w: 0, h: 0 };
    x = (r.x + r.w + 0.015) * W;
    if (x + boxW > W * 0.985) x = Math.max(W * 0.01, r.x * W - boxW - W * 0.01);
    y = r.y * H - boxH / 2;
    y = Math.max(H * 0.008, Math.min(H - boxH - H * 0.008, y));
  }
  x = Math.max(4, Math.min(W - boxW - 4, x));

  ctx.save();
  ctx.translate(x + boxW / 2, y + boxH / 2);
  ctx.rotate(-0.015 + (nt.id.length % 5) * 0.008);
  ctx.translate(-boxW / 2, -boxH / 2);
  ctx.shadowColor = "rgba(30,25,15,0.35)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#fdf6a9";
  ctx.fillRect(0, 0, boxW, boxH);
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "rgba(30,25,15,0.14)";
  ctx.beginPath();
  ctx.moveTo(boxW - 16, boxH);
  ctx.lineTo(boxW, boxH - 16);
  ctx.lineTo(boxW, boxH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK_HEX[nt.ink];
  ctx.textBaseline = "top";
  lines.forEach((ln, i) => ctx.fillText(ln, padX, padX * 0.8 + i * fontSize * 1.22));
  ctx.restore();
}

function buildPdfFromJpegs(
  items: { jpeg: Uint8Array; w: number; h: number }[]
): Uint8Array<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (data: string | Uint8Array) => {
    const b = typeof data === "string" ? new TextEncoder().encode(data) : data;
    chunks.push(b);
    offset += b.length;
  };
  const n = items.length;
  const offsets: number[] = [];
  const obj = (body: () => void) => {
    offsets.push(offset);
    body();
  };

  push("%PDF-1.4\n%âãÏÓ\n");

  obj(() => push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`));
  const kids = items.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  obj(() => push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`));

  items.forEach((item, i) => {
    const pageId = 3 + i * 3;
    const imgId = 4 + i * 3;
    const contentId = 5 + i * 3;
    const stream = `q ${item.w} 0 0 ${item.h} 0 0 cm /Im${i} Do Q`;
    obj(() =>
      push(
        `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${item.w} ${item.h}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${contentId} 0 R >>\nendobj\n`
      )
    );
    obj(() => {
      push(
        `${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${item.w} /Height ${item.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${item.jpeg.length} >>\nstream\n`
      );
      push(item.jpeg);
      push(`\nendstream\nendobj\n`);
    });
    obj(() =>
      push(
        `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
      )
    );
  });

  const xrefAt = offset;
  const total = 2 + n * 3 + 1;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);

  const out = new Uint8Array(offset);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
