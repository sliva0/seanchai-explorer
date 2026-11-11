import { exactName, looseName, namePattern, normalizeName, rowEvidence, takeName, titleNames } from './table-row.ts';
import type { NameMatch, RowFound } from './table-row.ts';

export function rfcPages(text: string) {
  return text.split('\f').map((text, index) => ({
    text,
    page: index + 1,
    lines: text.split(/(?<=\n)/).map(text => {
      const heading = text.match(/^((?:\d+|[A-Z])(?:\.\d+[A-Za-z]*)*)\.?\s+\S/);
      return { text, section: heading && !/\.{3}|…/.test(text) ? heading[1] : null };
    }),
  }));
}

export interface RfcLine {
  text: string;
  section: string | null;
  page: number;
}

/** Reads the name cell at the start of a table line, on from `column`; null if the line does not carry on the name. */
function nameCell(line: string, match: NameMatch, column: string) {
  // A result code can be a list's bullet: "o  DIAMETER_SERVER_SELECTION 2007".
  const text = line.replace(column ? /^[\s|]+/ : /^[\s|]+(?:o\s+)?/, '');
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
export function rowLines(
  lines: RfcLine[],
  name: string,
  section: string,
  page: number,
  match = exactName(name),
): [number, number] | null {
  if (!normalizeName(name)) return null;
  let start = lines.findIndex(line => line.section === section && line.page >= page);
  if (start < 0) start = lines.findIndex(line => line.section === section);
  let end = lines.length;
  if (start < 0)
    start = Math.max(
      0,
      lines.findIndex(line => line.page >= page),
    );
  else {
    const after = lines.findIndex(
      (line, index) =>
        index > start && line.section && line.section !== section && !line.section.startsWith(`${section}.`),
    );
    if (after >= 0) end = after;
  }
  return rowBetween(lines, match, start, end);
}

/** Of every place `at` finds in the document, the one nearest `page`. */
function nearest(
  lines: RfcLine[],
  page: number,
  at: (index: number) => [number, number] | null,
): [number, number] | null {
  let best: [number, number] | null = null;
  let distance = Infinity;
  for (let index = 0; index < lines.length; index++) {
    const found = at(index);
    if (!found) continue;
    const away = Math.abs(lines[index].page - page);
    if (away < distance) {
      distance = away;
      best = found;
    }
    index = found[1];
  }
  return best;
}

/**
 * Where a row link goes when it is followed: the row in its section's table, under the name or the spelling
 * the source prints, misprinted, a result code's own clause, else the nearest table holding it, the clause named
 * after it, or a format naming it.
 */
export function locateRow(
  lines: RfcLine[],
  name: string,
  section: string,
  page: number,
  printed?: string,
  titled = false,
): { lines: [number, number]; found: RowFound } | null {
  if (!normalizeName(name)) return null;
  const inSection = rowLines(lines, name, section, page);
  if (inSection) return { lines: inSection, found: 'row' };
  const asPrinted = printed ? rowLines(lines, printed, section, page) : null;
  if (asPrinted) return { lines: asPrinted, found: 'printed' };
  const loose = rowLines(lines, name, section, page, looseName(name));
  if (loose) return { lines: loose, found: 'loose' };
  // A result code's clause is its place: a table elsewhere mapping the code is not.
  const own = titled ? lines.findIndex(line => line.section === section) : -1;
  if (own >= 0) return { lines: [own, own], found: 'clause' };
  for (const key of printed ? [name, printed] : [name]) {
    const match = exactName(key);
    const other = nearest(lines, page, index => {
      const row = rowBetween(lines, match, index, Math.min(index + 6, lines.length));
      return row?.[0] === index ? row : null;
    });
    if (other) return { lines: other, found: 'other-table' };
  }
  const clause = nearest(lines, page, index =>
    lines[index].section && titleNames(lines[index].text.replace(/^\S+\s+/, ''), name) ? [index, index] : null,
  );
  if (clause) return { lines: clause, found: 'clause' };
  const pattern = namePattern(name);
  const format = nearest(lines, page, index =>
    /^\s*[\d*]*\s*[[<{]/.test(lines[index].text) && pattern.test(lines[index].text) ? [index, index] : null,
  );
  return format && { lines: format, found: 'format' };
}
