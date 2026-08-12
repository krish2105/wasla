import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Plain text from a PDF, extracted in the Worker.
 *
 * This runs on every resume call, not only when Gemini is unavailable, and it
 * has two jobs:
 *
 * 1. It is the source of truth for evidence spans. CLAUDE.md invariant 4
 *    requires every claim about a profile to quote a literal substring of the
 *    source. Gemini's native PDF input never exposes that source to us, so
 *    without this the invariant would be unenforceable for the one feature
 *    that most needs it.
 * 2. It is the failover payload. PDF input is Gemini-only among the free
 *    providers, so a text rendition is the only thing the rest of the chain
 *    can accept.
 */
export async function pdfToText(data: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/**
 * Whitespace-insensitive substring test.
 *
 * A model quoting a resume reproduces the words but rarely the exact line
 * breaks and column spacing a PDF extractor emits, so a strict `includes()`
 * would reject spans that are genuinely present. Collapsing runs of whitespace
 * on both sides keeps the check literal about words while tolerating layout.
 */
export function spanIsGrounded(span: string, source: string): boolean {
  const normalise = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const needle = normalise(span);
  return needle.length > 0 && normalise(source).includes(needle);
}
