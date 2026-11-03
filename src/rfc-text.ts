import { normalizeName, rowEvidence } from './table-row.ts';

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
function nameCell(line: string, wanted: string, column: string) {
  let rest = line.replace(/^[\s|]+/, '');
  // Diagrams' "+ Name" and message formats' "[ Name ]" are not rows; a wrapped name may carry on from its hyphen.
  if (!(column ? /^-?[\p{L}\p{N}]/u : /^[\p{L}\p{N}]/u).test(rest)) return null;
  const before = column;
  for (let token = rest.match(/^[^\s|]+/); token; token = rest.match(/^[^\s|]+/)) {
    const text = normalizeName(token[0]);
    if (!text || !wanted.startsWith(column + text)) break;
    column += text;
    rest = rest.slice(token[0].length).trimStart();
    // "Basic-Location-" goes on below it: that is not Basic-Location.
    if (column === wanted && token[0].endsWith('-')) return null;
    if (column === wanted) break;
  }
  return column === before ? null : { column, evidence: rest.startsWith('|') || rowEvidence.test(rest) };
}

/**
 * The lines of the table row named `name` in a section, as first and last index, however the ASCII table wraps the name.
 * Only the section is searched: the same name in another table is not its row.
 */
export function rowLines(lines: RfcLine[], name: string, section: string, page: number): [number, number] | null {
  const wanted = normalizeName(name);
  if (!wanted) return null;
  let start = lines.findIndex(line => line.section === section && line.page >= page);
  if (start < 0) start = lines.findIndex(line => line.section === section);
  let end = lines.length;
  if (start < 0) start = Math.max(0, lines.findIndex(line => line.page >= page));
  else {
    const after = lines.findIndex((line, index) => index > start && line.section && line.section !== section && !line.section.startsWith(`${section}.`));
    if (after >= 0) end = after;
  }
  for (let first = start; first < end; first++) {
    let column = '';
    let evidence = false;
    for (let last = first; last < end; last++) {
      const cell = nameCell(lines[last].text, wanted, column);
      if (!cell) break;
      column = cell.column;
      evidence ||= cell.evidence;
      if (column === wanted) {
        if (evidence) return [first, last];
        break;
      }
    }
  }
  return null;
}
