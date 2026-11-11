import { perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import type { CommandRef } from './commands.ts';
import type { SourcePosition } from './navigation.ts';
import type { Target, Token, ValueKind } from './types.ts';

export interface ValueRow {
  name: string;
  value: number;
  /** A feature's M or O. */
  mark: string | null;
  /** The document a result code's row says defines it, and the clause listing the code there. */
  origin: { reference: string; target: Target | null } | null;
  /** Index into the lines. */
  line: number;
  target: Target | null;
  /** Where the source prints the row: its result code's clause, or the table's. */
  position: SourcePosition;
  table: ValueTable;
}

export interface ValueTable {
  kind: ValueKind;
  /** The AVP whose numbers it names, and where its `; AVP:` line links. */
  avp: { name: string; target: Target | null } | null;
  featureListId: number | null;
  application: string | null;
  section: string;
  page: number | null;
  /** Index into the lines of its `; Type:` line. */
  line: number;
  rows: ValueRow[];
}

/**
 * A token of a value table's row: `valueRow` on its name, `originOf` on its `from` document, and what a row's clause
 * links to says the row too.
 * `details` is on an AVP table row's name and Section cell, where the clause describing the AVP is another than the table's,
 * and on the name of a row a clause's prose states.
 * `command` is on a command's name or abbreviation, and on a table's column for it.
 */
export interface ValueToken extends Token { valueRow?: ValueRow; originOf?: ValueRow; details?: SourcePosition; command?: CommandRef }

/** The value tables of a file. The first reading marks the rows' tokens, so a row links as any table row does. */
export const valueTables = perFile(({ lines, blocks }) => blocks.filter(block => block.type === 'Value Table').map(block => {
  const { fields, section, page } = block;
  const kind = (fields.Kind ?? 'bits') as ValueKind;
  const head = lines.slice(block.line, block.value_rows?.[0]?.line ?? block.last + 1).flatMap(line => line.tokens);
  const avp = block.name ? { name: block.name, target: head.find(token => token.avp === block.name)?.target ?? null } : null;
  const table: ValueTable = {
    kind, avp, featureListId: fields['Feature-List-ID'] === undefined ? null : Number(fields['Feature-List-ID']), application: fields.Application ?? null,
    section, page, line: block.line, rows: [],
  };
  for (const row of block.value_rows ?? []) {
    const { name, value, line } = row;
    const tokens: ValueToken[] = lines[line].tokens;
    const position: SourcePosition = { section: row.section ?? section, page, name, row: true, value, ...(kind === 'result-codes' ? { titled: true } : {}) };
    const nameToken = tokens.find(token => token.target && !token.avp);
    const originToken = row.origin ? tokens.find(token => token !== nameToken && token.target && token.text === row.origin) : undefined;
    const origin = row.origin ? { reference: row.origin, target: originToken?.target ?? row.origin_target ?? null } : null;
    const current: ValueRow = { name, value, mark: row.mark ?? null, origin, line, target: nameToken?.target ?? null, position, table };
    table.rows.push(current);
    if (originToken) originToken.originOf = current;
    const clause = tokens.find(token => token.source);
    if (clause) clause.source = position;
    if (nameToken) {
      nameToken.valueRow = current;
      // What finds a corrected row's printed spelling in the raw mirror, as a table row's own citation does.
      nameToken.source = position;
    }
  }
  return table;
}));

/** A link's row: the one named so at its target or in its table. */
export function valueRowAt(file: DadFile, section: string, name: string): ValueRow | undefined {
  const rows = valueTables(file).flatMap(table => table.rows).filter(row => row.name === name);
  return rows.find(row => row.target?.section === section) ?? rows.find(row => row.table.section === section);
}

export const valueKinds: { kind: ValueKind; title: string; row: string }[] = [
  { kind: 'result-codes', title: 'Result codes', row: 'Result code' },
  { kind: 'bits', title: 'Bits', row: 'Bit' },
  { kind: 'features', title: 'Features', row: 'Feature bit' },
];
export const valueKindTitle = (kind: ValueKind) => valueKinds.find(entry => entry.kind === kind)!.title;
/** What a table lists, told from the others of its clause: "Bits", "Features list 1 (S6a/S6d)". */
export const valueTableTitle = (table: ValueTable) => `${valueKindTitle(table.kind)}${table.featureListId === null ? '' : ` list ${table.featureListId}`}${table.application ? ` (${table.application})` : ''}`;
export const valueRowLabel = (kind: ValueKind) => valueKinds.find(entry => entry.kind === kind)!.row;
