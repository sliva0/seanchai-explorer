import { perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import type { SourcePosition } from './navigation.ts';
import type { Block, Target } from './types.ts';
import { valueTables } from './values.ts';
import type { ValueRow, ValueTable, ValueToken } from './values.ts';

// A Command Result Codes block is a procedure's table of the result codes its answer may carry, each code a name the
// table prints with no number, which the export finds in the result-code tables of the corpus. Each row is read as a
// value row of the kind result-codes, of Result-Code where its vendor is 0 and Experimental-Result-Code otherwise, so
// that its name links, finds its row in the source and has a popup as a value table's row does; the popup goes on to
// the row of the document defining the code, once it is loaded.

/** A table a Command Result Codes block is, as a value table: the answer it lists codes of, and where that is printed. */
export interface ListingTable extends ValueTable {
  listing: { command: string | null; described: Target[]; from: string | null };
}

const isListing = (block: Block) => block.type === 'Command Result Codes';

/** Whether a value row is one a Command Result Codes block lists, and the table it is in. */
export const listingOf = (row: ValueRow): ListingTable | undefined =>
  'listing' in row.table ? (row.table as ListingTable) : undefined;

/**
 * The Command Result Codes blocks of a file, each as a table of value rows, with the tokens of its rows marked so: the
 * first reading of a file splits each row's name into a token of its own, linking to the row's clause.
 */
export const resultCodeTables = perFile(file => {
  const tables: ListingTable[] = [];
  for (const block of file.blocks) {
    if (!isListing(block)) continue;
    const { section, page } = block;
    const table: ListingTable = {
      kind: 'result-codes',
      avp: null,
      featureListId: null,
      application: null,
      section,
      page,
      line: block.line,
      rows: [],
      listing: { command: block.name ?? null, described: block.described ?? [], from: block.fields.From ?? null },
    };
    for (const code of block.result_codes ?? []) {
      const line = file.lines[code.line];
      const first = line?.tokens[0];
      if (!first || first.target || first.source || first.kind || !first.text.startsWith(code.name)) continue;
      const position: SourcePosition = {
        section,
        page,
        name: code.name,
        row: true,
        ...(code.value === null || code.value === undefined ? {} : { value: code.value }),
      };
      const avp = code.vendor_id ? 'Experimental-Result-Code' : 'Result-Code';
      const row: ValueRow = {
        name: code.name,
        value: code.value ?? Number.NaN,
        mark: null,
        origin: null,
        line: code.line,
        target: { document: documentOf(file), section },
        position,
        // Its own view of the table, naming the AVP its code is a value of; the rows are the table's.
        table: { ...table, avp: { name: avp, target: null } },
      };
      table.rows.push(row);
      const rest = first.text.slice(code.name.length);
      const token: ValueToken = {
        text: code.name,
        valueRow: row,
        source: position as NonNullable<ValueToken['source']>,
        target: { document: documentOf(file), section, name: code.name },
      };
      line.tokens.splice(0, 1, token, ...(rest ? [{ text: rest }] : []));
    }
    tables.push(table);
  }
  return tables;
});

/** The file's document, which a Document or a raw mirror names. */
const documentOf = (file: DadFile) => (file as DadFile & { id?: string }).id ?? '';

/** The row of a result-code value table of `file` giving a listed code its number: the one defining it. */
export function definingRow(file: DadFile, row: ValueRow): ValueRow | undefined {
  return valueTables(file)
    .filter(table => table.kind === 'result-codes')
    .flatMap(table => table.rows)
    .find(other => other.name === row.name && (Number.isNaN(row.value) || other.value === row.value) && !other.origin);
}

/** The Command Result Codes blocks of a file that list codes of a command printed at a place, its answer's block. */
export const listingsFor = (file: DadFile, at: { document: string; section: string }, name: string): Block[] =>
  file.blocks.filter(
    block =>
      isListing(block) &&
      ((block.described ?? []).some(target => target.document === at.document && target.section === at.section) ||
        (!(block.described ?? []).length && block.name?.toLowerCase() === name.toLowerCase())),
  );
