import { perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import type { SourcePosition } from './navigation.ts';
import type { Block } from './types.ts';

// A block's `; Table:` line names the table it was read from: a clause can hold several, so the number is a link to the
// source at that table, as `; Section:` and `; Page:` are to its clause and page. Text elsewhere naming a table, "table
// 5.2.2.2.1/1", links to the block in the text, in whatever document it is, through `tables.json`.

/** Where a document's table is in its text: the first block printing its `; Table:`, by its `; Type:` line. */
export interface TablePlace {
  line: number;
  section: string;
}

/** `tables.json`, which prepare derives from the export's documents: each document's tables by number. */
export interface TableIndex {
  schema_version: number;
  tables: Record<string, Record<string, TablePlace>>;
}

export const emptyTables = (schemaVersion: number): TableIndex => ({ schema_version: schemaVersion, tables: {} });

/**
 * A file's tables by number. An Interpreted Constraints block names the table its rules were read from, which another
 * block of the file prints, so it is no table of its own.
 */
export const fileTables = perFile(({ blocks }) => {
  const tables: Record<string, TablePlace> = {};
  for (const block of blocks) {
    const table = block.fields.Table;
    if (table && !(table in tables) && block.type !== 'Interpreted Constraints')
      tables[table] = { line: block.line, section: block.section };
  }
  return tables;
});

/** What `tables.json` says of a set of documents. */
export function tableIndex(documents: (DadFile & { id: string })[], schemaVersion: number): TableIndex {
  return {
    schema_version: schemaVersion,
    tables: Object.fromEntries(
      documents.map(doc => [doc.id, fileTables(doc)] as const).filter(([, tables]) => Object.keys(tables).length),
    ),
  };
}

/** Where a block's `; Table:` number takes the source: its page, and the table's caption on or near it. */
function tablePosition(block: Block, table: string): SourcePosition | undefined {
  if (!block.page && !block.section) return undefined;
  return { section: block.section, page: block.page ?? null, table };
}

/**
 * Splits each block's `; Table:` number out of its line's text into a token of its own, a link to the source at that
 * table, as a `; Page:` number's is to its page. A line the export already split is left as it is. Run once per file,
 * as a reader of a block type.
 */
export const markTables = perFile(file => {
  for (const block of file.blocks) {
    const table = block.fields.Table;
    if (!table) continue;
    const position = tablePosition(block, table);
    if (!position) continue;
    for (let index = block.line; index <= (block.last ?? block.line); index++) {
      const tokens = file.lines[index]?.tokens;
      const first = tokens?.[0];
      const prefix = '; Table: ';
      if (!first || first.source || first.target || first.kind || !first.text.startsWith(`${prefix}${table}`)) continue;
      const rest = first.text.slice(prefix.length + table.length);
      if (rest && !/^\s/.test(rest)) break;
      tokens.splice(
        0,
        1,
        { text: prefix },
        { text: table, source: position as NonNullable<typeof first.source> },
        ...(rest ? [{ text: rest }] : []),
      );
      break;
    }
  }
});

/** Where a document's table is: from the document if it is loaded, else from `tables.json`. */
export function tablePlace(
  held: DadFile | undefined,
  index: TableIndex | undefined,
  document: string,
  table: string,
): TablePlace | undefined {
  return (held ? fileTables(held) : index?.tables[document])?.[table];
}
