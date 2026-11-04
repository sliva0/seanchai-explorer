import type { SourcePosition } from './navigation.ts';
import type { Line, Target, Token, ValueKind } from './types.ts';

export interface ValueRow {
  name: string;
  value: number;
  /** A feature's M or O. */
  mark: string | null;
  /** Index into the lines. */
  line: number;
  target: Target | null;
  /** Where the source prints the row: its result code's clause, or the table's. */
  position: SourcePosition;
  table: ValueTable;
}

export interface ValueTable {
  kind: ValueKind;
  avp: Token | null;
  featureListId: number | null;
  application: string | null;
  section: string;
  page: number | null;
  rows: ValueRow[];
}

/**
 * A token of a value table's row: `valueRow` on its name, and what a row's clause links to says the row too.
 * `details` is on an AVP table row's name and Section cell, where the clause describing the AVP is another than the table's.
 */
export interface ValueToken extends Token { valueRow?: ValueRow; details?: SourcePosition }

const lineText = (line: Line) => line.tokens.filter(token => !token.correction && token.kind !== 'comment').map(token => token.text).join('').trimEnd();
const rowText = /^("?)(.+?)\1\s*=\s*(\d+)\s*(?:;\s*([^;]*?))?\s*(?:;;.*)?$/;
const header = /^; ([\w-]+): (.*)$/;

function readTables(lines: Line[]): ValueTable[] {
  const tables: ValueTable[] = [];
  let table: ValueTable | undefined;
  let inBody = false;
  lines.forEach((line, index) => {
    const text = lineText(line);
    if (text.startsWith('; Type:')) {
      table = text === '; Type: Value Table' ? { kind: 'bits', avp: null, featureListId: null, application: null, section: line.section ?? '', page: null, rows: [] } : undefined;
      inBody = false;
      if (table) tables.push(table);
      return;
    }
    if (!table) return;
    const field = text.match(header);
    if (field) {
      const [, key, value] = field;
      if (key === 'AVP') table.avp = line.tokens.find(token => token.avp) ?? null;
      else if (key === 'Kind') table.kind = value as ValueKind;
      else if (key === 'Feature-List-ID') table.featureListId = Number(value);
      else if (key === 'Application') table.application = value;
      else if (key === 'Section') table.section = value;
      else if (key === 'Page') table.page = Number(value);
      return;
    }
    const row = text.match(rowText);
    if (!row) {
      // A blank line ends the block, a `;;` comment or a corrected-away row stays inside it.
      if (inBody && !text) table = undefined;
      return;
    }
    inBody = true;
    const name = row[2].replace(/\\(["\\])/g, '$1');
    const clause = line.tokens.find(token => token.source) as ValueToken | undefined;
    const value = Number(row[3]);
    const position: SourcePosition = { section: clause?.source?.section ?? table.section, page: clause?.source?.page ?? table.page, name, row: true, value, ...(table.kind === 'result-codes' ? { titled: true } : {}) };
    const nameToken = line.tokens.find(token => token.target && !token.avp) as ValueToken | undefined;
    const current: ValueRow = { name, value, mark: row[4] && !clause ? row[4] : null, line: index, target: nameToken?.target ?? null, position, table };
    table.rows.push(current);
    if (clause) clause.source = position;
    if (nameToken) {
      nameToken.valueRow = current;
      // What finds a corrected row's printed spelling in the raw mirror, as a table row's own citation does.
      nameToken.source = position;
    }
  });
  return tables;
}

const known = new WeakMap<Line[], ValueTable[]>();

/** The value tables of a file's lines. The first reading marks the rows' tokens, so a row links as any table row does. */
export function valueTables(lines: Line[]): ValueTable[] {
  let tables = known.get(lines);
  if (!tables) { tables = readTables(lines); known.set(lines, tables); }
  return tables;
}

/** A link's row: the one named so at its target or in its table. */
export function valueRowAt(lines: Line[], section: string, name: string): ValueRow | undefined {
  const rows = valueTables(lines).flatMap(table => table.rows).filter(row => row.name === name);
  return rows.find(row => row.target?.section === section) ?? rows.find(row => row.table.section === section);
}

export const valueKinds: { kind: ValueKind; title: string; row: string }[] = [
  { kind: 'result-codes', title: 'Result codes', row: 'Result code' },
  { kind: 'bits', title: 'Bits', row: 'Bit' },
  { kind: 'features', title: 'Features', row: 'Feature bit' },
];
export const valueKindTitle = (kind: ValueKind) => valueKinds.find(entry => entry.kind === kind)!.title;
export const valueRowLabel = (kind: ValueKind) => valueKinds.find(entry => entry.kind === kind)!.row;
