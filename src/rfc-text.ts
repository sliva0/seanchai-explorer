import { exactName, normalizeName, rowEvidence, takeName } from './table-row.ts';
import type { NameMatch } from './table-row.ts';

export function rfcPages(text: string) {
  return text.split('\f').map((text, index) => ({
    text, page: index + 1,
    lines: text.split(/(?<=\n)/).map(text => {
      const heading = text.match(/^((?:\d+|[A-Z])(?:\.\d+[A-Za-z]*)*)\.?\s+\S/);
      return { text, section: heading && !/\.{3}|…/.test(text) ? heading[1] : null };
    }),
  }));
}

export interface RfcLine { text: string; section: string | null; page: number }

/** Reads the name cell at the start of a table line, on from `column`; null if the line does not carry on the name. */
function nameCell(line: string, match: NameMatch, column: string) {
  const text = line.replace(/^[\s|]+/, '');
  // Diagrams' "+ Name" and message formats' "[ Name ]" are not rows; a wrapped name may carry on from its hyphen.
  if (!(column ? /^-?[\p{L}\p{N}]/u : /^[\p{L}\p{N}]/u).test(text)) return null;
  const cell = takeName(text, match, column);
  // "Basic-Location-" goes on below it: that is not Basic-Location.
  if (!cell || (match.whole(cell.column) && cell.open)) return null;
  return { column: cell.column, evidence: cell.rest.startsWith('|') || rowEvidence.test(cell.rest) };
}

/** The first row between two lines. */
function rowBetween(lines: RfcLine[], match: NameMatch, start: number, end: number): [number, number] | null {
  for (let first = start; first < end; first++) {
    let column = '';
    let evidence = false;
    for (let last = first; last < end; last++) {
      const cell = nameCell(lines[last].text, match, column);
      if (!cell) break;
      column = cell.column;
      evidence ||= cell.evidence;
      if (match.whole(column)) {
        if (evidence) return [first, last];
        break;
      }
    }
  }
  return null;
}

/**
 * The lines of the table row named `name` in a section, as first and last index, however the ASCII table wraps the name.
 * Only the section is searched: the same name in another table is not its row.
 */
export function rowLines(lines: RfcLine[], name: string, section: string, page: number): [number, number] | null {
  if (!normalizeName(name)) return null;
  let start = lines.findIndex(line => line.section === section && line.page >= page);
  if (start < 0) start = lines.findIndex(line => line.section === section);
  let end = lines.length;
  if (start < 0) start = Math.max(0, lines.findIndex(line => line.page >= page));
  else {
    const after = lines.findIndex((line, index) => index > start && line.section && line.section !== section && !line.section.startsWith(`${section}.`));
    if (after >= 0) end = after;
  }
  return rowBetween(lines, exactName(name), start, end);
}
