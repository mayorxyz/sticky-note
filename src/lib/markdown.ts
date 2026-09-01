import { marked, type Token, type Tokens } from "marked";

marked.use({ gfm: true, breaks: true });

export function lexMarkdown(md: string): Token[] {
  return marked.lexer(md);
}

/**
 * The single shared Markdown → HTML pipeline. Anything in the app that shows
 * Markdown (library previews, exports) goes through this one function; the
 * annotated document view walks the same lexer tokens so offsets stay aligned.
 */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

export function makeSlugger(): (text: string) => string {
  const used = new Map<string, number>();
  return (text: string) => {
    let id =
      text
        .toLowerCase()
        .trim()
        .replace(/[^\w\u00c0-\uFFFF]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "section";
    const n = used.get(id) ?? 0;
    used.set(id, n + 1);
    if (n) id = `${id}-${n}`;
    return id;
  };
}

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

/** ToC from H1–H3 headings (spec rail focuses on H2/H3; H1 kept when present). */
export function extractToc(tokens: Token[]): TocEntry[] {
  const slug = makeSlugger();
  const toc: TocEntry[] = [];
  for (const t of tokens) {
    if (t.type !== "heading") continue;
    const h = t as Tokens.Heading;
    if (h.depth > 3) continue;
    toc.push({ id: slug(h.text), text: h.text, level: h.depth });
  }
  return toc;
}

export function readingStats(md: string): { words: number; minutes: number } {
  const words = md.split(/\s+/).filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.round(words / 220)) };
}

/* ————— Plain-text walker —————
 * MUST emit leaf text in exactly the same order (and with the same counting
 * rules) as the annotated renderer in ReflowCanvas: newlines inside inline
 * text are rendered as <br> and count as zero characters; code block text is
 * counted verbatim; html tokens are skipped everywhere.
 */

function inlinePlain(tokens: Token[] | undefined, out: string[]): void {
  if (!tokens) return;
  for (const t of tokens) {
    if (t.type === "br" || t.type === "image") continue;
    if (t.type === "text" || t.type === "escape" || t.type === "codespan") {
      const tt = t as Tokens.Text;
      if (tt.tokens?.length) inlinePlain(tt.tokens as Token[], out);
      else if (tt.text) out.push(tt.text.replace(/\n/g, ""));
      continue;
    }
    const nested = (t as { tokens?: Token[] }).tokens;
    if (nested?.length) inlinePlain(nested, out);
  }
}

export function plainTextOfTokens(tokens: Token[]): string {
  const out: string[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "heading":
        inlinePlain((t as Tokens.Heading).tokens, out);
        break;
      case "paragraph":
        inlinePlain((t as Tokens.Paragraph).tokens, out);
        break;
      case "text": {
        const tt = t as Tokens.Text;
        if (tt.tokens?.length) inlinePlain(tt.tokens as Token[], out);
        else if (tt.text) out.push(tt.text.replace(/\n/g, ""));
        break;
      }
      case "code":
        out.push((t as Tokens.Code).text);
        break;
      case "blockquote":
        out.push(plainTextOfTokens((t as Tokens.Blockquote).tokens));
        break;
      case "list":
        for (const item of (t as Tokens.List).items) {
          out.push(plainTextOfTokens(item.tokens));
        }
        break;
      case "table": {
        const tb = t as Tokens.Table;
        for (const cell of tb.header) inlinePlain(cell.tokens, out);
        for (const row of tb.rows) for (const cell of row) inlinePlain(cell.tokens, out);
        break;
      }
      default:
        break; // hr, space, html, image → no counted text
    }
  }
  return out.join("");
}
