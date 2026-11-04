import type { SourcePosition } from './navigation.ts';
import type { Document, Line, Target } from './types.ts';
import type { ValueToken } from './values.ts';

/**
 * Where a row of an AVP table says its AVP is described: its Section cell or an origin cell naming a document,
 * or for a table with neither column the clause its name links to. A cell naming another document is not this
 * file's to describe, and leaves the name's own link to it.
 */
function describedAt(line: Line, name: ValueToken, document: string): { cell?: ValueToken; place?: Pick<Target, 'document' | 'section' | 'name'> } {
  const cell = line.tokens.find(token => token !== name && !token.avp && (token.source || token.target));
  if (!cell) return { place: name.target ?? undefined };
  return { cell, place: cell.target ?? { document, section: cell.source!.section } };
}

/**
 * Marks the tokens of AVP table rows with their Details: the row in the clause describing the AVP, or the clause
 * itself where it has no such table. A row whose table stands in that clause has only its Definition, its own `source`.
 */
export function markDetails(lines: Line[], doc: Pick<Document, 'id' | 'sections'>) {
  for (const line of lines) {
    const name: ValueToken | undefined = line.tokens.find(token => token.avp && token.source?.row);
    if (!name) continue;
    const { cell, place } = describedAt(line, name, doc.id);
    if (!place?.section || place.document !== doc.id || place.section === name.source!.section) continue;
    const page = doc.sections.find(section => section.section === place.section)?.page ?? null;
    const details: SourcePosition = { section: place.section, page, name: place.name ?? name.avp, row: true, titled: true };
    name.details = details;
    if (cell) cell.details = details;
  }
}

/** What an AVP's name can jump to in this file: its Definition and Details, read off the name's row or else the AVP's first row. */
export function avpPlaces(token: ValueToken, lines: Line[]): { definition?: SourcePosition; details?: SourcePosition } {
  const rows: ValueToken[] = token.source?.row ? [token] : lines.flatMap(line => line.tokens).filter(other => other.avp === token.avp && other.source?.row);
  const row = rows.find(other => other.details) ?? rows[0];
  return { definition: row?.source ?? undefined, details: row?.details };
}
