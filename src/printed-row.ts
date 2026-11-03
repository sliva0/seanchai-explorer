import { normalizeName } from './table-row.ts';
import type { Citation } from './types.ts';
import type { Document, Line, RawDocument } from './types.ts';

const rowOf = (line: Line, section: string) => line.tokens.find(token => token.source?.row && token.source.section === section && token.source.name)?.source?.name;

/** Whether the file's line for a row notes that the corpus changed it rather than inserted it: only then can the source print it otherwise. */
export function correctedRow(doc: Document, { section, name }: Pick<Citation, 'section' | 'name'>) {
  return doc.lines.some(line => rowOf(line, section) === name
    && line.tokens.some(token => token.correction && doc.corrections[token.correction]?.kind !== 'insert'));
}

/**
 * The spelling the source prints a row under, from the raw mirror: the section's rows of both files
 * are walked side by side, and a row only the corrected file holds pairs with the row only the raw
 * mirror holds at that place. Null when it has none, as an inserted row has not.
 */
export function printedRow(doc: Document, raw: RawDocument, { section, name }: Pick<Citation, 'section' | 'name'>): string | null {
  const rows = (lines: Line[]) => lines.flatMap(line => { const row = rowOf(line, section); return row ? [{ name: row, key: normalizeName(row), line }] : []; });
  const corrected = rows(doc.lines);
  const original = rows(raw.lines);
  const inCorrected = new Set(corrected.map(row => row.key));
  const inOriginal = new Set(original.map(row => row.key));
  const inserted = (line: Line) => line.tokens.some(token => token.correction && doc.corrections[token.correction]?.kind === 'insert');
  let other = 0;
  for (const row of corrected) {
    if (inserted(row.line)) continue;
    // Rows the corpus dropped have no place in the corrected file.
    while (other < original.length && !inCorrected.has(original[other].key) && inOriginal.has(row.key)) other++;
    const peer = original[other];
    if (!peer) return null;
    if (peer.key === row.key) { other++; continue; }
    // Rows in another order pair with nothing.
    if (inOriginal.has(row.key) || inCorrected.has(peer.key)) continue;
    if (row.name === name) return peer.name;
    other++;
  }
  return null;
}
