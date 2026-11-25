import { perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import type { CommandRef } from './commands.ts';
import type { SourcePosition } from './navigation.ts';
import type { Target, Token, ValueKind } from './types.ts';
import { valueKindWords, valueTableWords } from './text/terms.ts';

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
export interface ValueToken extends Token {
  valueRow?: ValueRow;
  originOf?: ValueRow;
  details?: SourcePosition;
  command?: CommandRef;
  /**
   * On an Interpreted Constraints rule's line, the path a name ends, from the block's scope or the request (`root`),
   * through the grouped AVPs it names.
   */
  constraintRef?: { root: 'request' | null; path: string[] };
  /** On an Interpreted Constraints rule's line, a value of this AVP that another document defines, its `target` the row there. */
  elsewhereOf?: string;
}

/** The value tables of a file. The first reading marks the rows' tokens, so a row links as any table row does. */
export const valueTables = perFile(({ lines, blocks }) =>
  blocks
    .filter(block => block.type === 'Value Table')
    .map(block => {
      const { section, page } = block;
      // A Value Table block always has its kind.
      const kind = block.value_kind!;
      const avp = block.name ? { name: block.name, target: block.avp_target ?? null } : null;
      const table: ValueTable = {
        kind,
        avp,
        featureListId: block.feature_list_id ?? null,
        application: block.application ?? null,
        section,
        page,
        line: block.line,
        rows: [],
      };
      for (const row of block.value_rows ?? []) {
        const { name, value, line } = row;
        const tokens: ValueToken[] = lines[line].tokens;
        const position: SourcePosition = {
          section: row.section ?? section,
          page,
          name,
          row: true,
          value,
          ...(kind === 'result-codes' ? { titled: true } : {}),
        };
        const nameToken = tokens.find(token => token.target && !token.avp);
        const originToken = row.origin
          ? tokens.find(token => token !== nameToken && token.target && token.text === row.origin)
          : undefined;
        const origin = row.origin
          ? { reference: row.origin, target: originToken?.target ?? row.origin_target ?? null }
          : null;
        const current: ValueRow = {
          name,
          value,
          mark: row.mark ?? null,
          origin,
          line,
          target: nameToken?.target ?? null,
          position,
          table,
        };
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
    }),
);

/**
 * The names an `Enumerated AVP` block gives its AVP's numbers, each read as a row of a value table of the kind values,
 * the block its table: what an interpreted rule naming one links to, and the place its popup and the source find. The
 * block's own lines are left as they are, its values being its AVP's lines. A range of numbers is no row.
 */
export const enumeratedTables = perFile(file => {
  const document = (file as DadFile & { id?: string }).id ?? '';
  return file.blocks
    .filter(block => block.type === 'Enumerated AVP' && block.name)
    .map(block => {
      const { section, page } = block;
      const target: Target = { document, section };
      const table: ValueTable = {
        kind: 'values',
        avp: { name: block.name!, target },
        featureListId: null,
        application: null,
        section,
        page,
        line: block.line,
        rows: [],
      };
      for (const value of block.values ?? []) {
        if (value.kind !== 'value' || value.first !== value.last || !value.name) continue;
        table.rows.push({
          name: value.name,
          value: value.first,
          mark: null,
          origin: null,
          line: value.line,
          target,
          position: { section, page, name: value.name, row: true, value: value.first },
          table,
        });
      }
      return table;
    });
});

/** A link's row: the one named so at its target or in its table, a value table's before an Enumerated AVP block's. */
export function valueRowAt(file: DadFile, section: string, name: string): ValueRow | undefined {
  const find = (tables: ValueTable[]) => {
    const rows = tables.flatMap(table => table.rows).filter(row => row.name === name);
    return rows.find(row => row.target?.section === section) ?? rows.find(row => row.table.section === section);
  };
  return find(valueTables(file)) ?? find(enumeratedTables(file));
}

/**
 * The row giving a value of AVP `avp` the name `name` in a file: of its bit table where `bit`, else of its value
 * tables, result codes among them, or its `Enumerated AVP` block. None where the file names no such value, as for a
 * Result-Code value RFC 6733 defines.
 */
export function namedValueRow(file: DadFile, avp: string, name: string, bit: boolean): ValueRow | undefined {
  const rows = [...valueTables(file), ...enumeratedTables(file)]
    .filter(table => table.avp?.name === avp && (table.kind === 'bits') === bit)
    .flatMap(table => table.rows.filter(row => row.name === name));
  // A result code's row defining it before one saying another document does.
  return rows.find(row => !row.origin) ?? rows[0];
}

/** Every kind of value table, in the order search lists them, each with its words. */
export const valueKinds: { kind: ValueKind; title: string; row: string }[] = (
  Object.keys(valueKindWords) as ValueKind[]
).map(kind => ({ kind, ...valueKindWords[kind] }));
/** A kind's words; a kind this build does not know, of a newer export, is called by its own name. */
const kindWords = (kind: ValueKind) =>
  valueKinds.find(entry => entry.kind === kind) ?? { kind, title: kind, row: kind };
export const valueKindTitle = (kind: ValueKind) => kindWords(kind).title;
/** What a table lists, told from the others of its clause: "Bits", "Features list 1 (S6a/S6d)". */
export const valueTableTitle = (table: ValueTable) =>
  `${valueKindTitle(table.kind)}${table.featureListId === null ? '' : valueTableWords.list(table.featureListId)}${table.application ? valueTableWords.application(table.application) : ''}`;
export const valueRowLabel = (kind: ValueKind) => kindWords(kind).row;
