import type { Allocation, Block, DataType, Document, TableRow } from './types.ts';

/** A file's lines and the `; Type:` blocks the export reads over them: a document, or its raw mirror. */
export type DadFile = Pick<Document, 'lines' | 'blocks'>;

/** What `read` makes of a file, made once per file: a pointer passing over a name asks again. */
export function perFile<T>(read: (file: DadFile) => T): (file: DadFile) => T {
  const known = new WeakMap<DadFile, T>();
  return file => {
    if (!known.has(file)) known.set(file, read(file));
    return known.get(file)!;
  };
}

/** Groups items by a name, in the order they come. */
export function byName<T>(items: [string, T][]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const [name, item] of items) {
    const list = map.get(name);
    if (list) list.push(item);
    else map.set(name, [item]);
  }
  return map;
}

const lineBlocks = perFile(({ blocks }) => {
  const at: (Block | undefined)[] = [];
  for (const block of blocks) for (let line = block.line; line <= block.last; line++) at[line] = block;
  return at;
});

/** The block a line is in, its `; Type:` line to its last. */
export const blockAt = (file: DadFile, line: number): Block | undefined => lineBlocks(file)[line];

/** A row of an AVP table, a `Reused AVPs` block or an AVP Codes registry, its cells under its own columns. */
export interface AvpRow {
  type: string;
  name: string;
  section: string;
  table: string | null;
  cells: [column: string, value: string][];
  line: number;
  /** Its Code cell, or its registry row's code. */
  code: number | null;
  /** The Diameter data type its Type cell prints. */
  dataType: DataType | null;
  /** The vendor space it places the AVP in, as the export reads its Vendor-ID cell, its V flag or the file's vendor. */
  vendor: number | null;
}

/** A row's cell under a column, as printed. */
export const cell = (row: Pick<AvpRow, 'cells'>, column: string) => row.cells.find(([name]) => name === column)?.[1];

function avpRow(block: Block, row: TableRow | Allocation, name: string): AvpRow {
  const columns = block.columns ?? [];
  const cells = columns.map((column, at): [string, string] => [column, row.cells[at]]);
  return {
    type: block.type, name, section: block.section, table: block.fields.Table ?? null, cells, line: row.line,
    code: row.code ?? null, dataType: row.type ?? null, vendor: row.vendor ?? null,
  };
}

/** Every row of a file's AVP tables, `Reused AVPs` blocks and AVP Codes registries, in file order. */
export const allAvpRows = perFile(({ blocks }) => blocks.flatMap(block => {
  if (block.type === 'AVP Table' || block.type === 'Reused AVPs') return (block.rows ?? []).map(row => avpRow(block, row, row.name));
  if (block.type === 'Registry' && block.fields.Registry === 'AVP Codes') return (block.allocations ?? []).flatMap(row => row.name ? [avpRow(block, row, row.name)] : []);
  return [];
}));

const avpRowsByName = perFile(file => byName(allAvpRows(file).map(row => [row.name, row])));

/** The table rows a file gives a name, in file order. */
export const avpRows = (file: DadFile, name: string): AvpRow[] => avpRowsByName(file).get(name) ?? [];
