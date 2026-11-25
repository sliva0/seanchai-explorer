import { normalizeName } from './table-row.ts';

/**
 * What of a quote an interpreted rule was read from is looked for in the source: its words up to an ellipsis, where a
 * .dadx file cut the sentence, at most `words` of them, with no quotation marks around them; nothing where fewer than
 * three words, or a dozen letters, are left to tell it from any other sentence.
 */
export function quoteNeedle(quote: string, words = 12): string | undefined {
  const text = quote
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“”'‘’]+/, '')
    .split(/\s*(?:\[\s*(?:\.\.\.|…)\s*\]|\.\.\.|…)/)[0];
  const taken = text.split(' ').filter(Boolean).slice(0, words);
  if (taken.length < 3 || normalizeName(taken.join('')).length < 12) return undefined;
  return taken.join(' ').replace(/["“”'‘’]+$/, '');
}

/** The needles a quote is looked for by, the longer first: a page break or a misprint can end the longer one early. */
export function quoteNeedles(quote: string): string[] {
  return [
    ...new Set([quoteNeedle(quote), quoteNeedle(quote, 6)].filter((needle): needle is string => Boolean(needle))),
  ];
}

/** A running header or footer of an RFC's page, which a paragraph running on over the break has between its lines. */
export const runningLine = (text: string) =>
  /\[Page \d+\]\s*$/.test(text) || /^RFC \d+\s{2,}\S.*\s{2,}\S.*\b\d{4}\s*$/.test(text);

/**
 * The first and last of `lines` that `needle` runs over, from line `from` on, compared on their letters and digits
 * alone, so that whatever wraps, hyphenates, spaces or quotes them differently, "out-of-" over "order" and curly quotes
 * among them, still matches; null where no line from `from` on starts it.
 */
export function findQuote(lines: readonly string[], needle: string, from = 0): [number, number] | null {
  const wanted = normalizeName(needle);
  if (!wanted) return null;
  const starts: number[] = [];
  let text = '';
  for (const line of lines) {
    starts.push(text.length);
    text += normalizeName(line);
  }
  const at = text.indexOf(wanted, starts[from] ?? text.length);
  if (at < 0) return null;
  // The line holding an offset: the last one starting at or before it that has any letters there.
  const lineAt = (offset: number) => {
    let index = starts.length - 1;
    while (index > 0 && (starts[index] > offset || normalizeName(lines[index]).length === 0)) index--;
    return index;
  };
  return [lineAt(at), lineAt(at + wanted.length - 1)];
}
