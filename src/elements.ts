import { perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import type { Block, Category, ElementRow, Line } from './types.ts';
import type { ValueToken } from './values.ts';

/** A row of an Information Elements table as `elements.json` carries it. `members` are the members it maps to, by their lines in the described document's corrected text. */
export interface IndexedElementRow {
  line: number;
  name: string;
  avps: string[];
  either: boolean;
  printed: string | null;
  category: Category | null;
  members: { name: string; line: number }[];
}

/**
 * An Information Elements table describing one Message block: where the table is, its `; Type:` line and `; Table:`,
 * the command its `; Command:` names, and the block, by its document, clause and name, and its `; Type:` line there.
 */
export interface ElementTable {
  document: string;
  section: string;
  page: number | null;
  line: number;
  table: string | null;
  command: string;
  message: { document: string; section: string; name: string; line: number };
  rows: IndexedElementRow[];
}

/**
 * `elements.json`, which prepare derives from the export's documents: every table the export finds its command for,
 * once for each Message block it describes, which may be another document's (TS 29.328's of TS 29.329's commands).
 */
export interface ElementIndex {
  schema_version: number;
  tables: ElementTable[];
}

export const categoryWords: Record<Category, string> = { M: 'mandatory', C: 'conditional', O: 'optional' };

/** The table describes a command its block names; one TS 29.338 table spells it in another case. */
const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

const isElements = (block: Block) => block.type === 'Information Elements';

/** The Message block of a command in a clause. */
export const messageBlock = (file: DadFile, section: string, name: string): Block | undefined =>
  file.blocks.find(block => block.type === 'Message' && block.section === section && sameName(block.name, name));

/** The Information Elements block of a clause for a command: a table, in this file's lines. */
export const elementsBlock = (file: DadFile, section: string, command: string): Block | undefined =>
  file.blocks.find(block => isElements(block) && block.section === section && sameName(block.name, command));

/** What `elements.json` says of a set of documents. */
export function elementIndex(documents: (DadFile & { id: string })[], schemaVersion: number): ElementIndex {
  const byId = new Map(documents.map(file => [file.id, file]));
  const tables: ElementTable[] = [];
  for (const file of documents) {
    for (const block of file.blocks) {
      if (!isElements(block) || !block.name) continue;
      for (const at of block.described ?? []) {
        const described = byId.get(at.document);
        const message = described && at.section ? messageBlock(described, at.section, block.name) : undefined;
        if (!message?.rule) continue;
        const { members } = message.rule;
        tables.push({
          document: file.id,
          section: block.section,
          page: block.page,
          line: block.line,
          table: block.fields.Table ?? null,
          command: block.name,
          message: { document: at.document, section: message.section, name: message.name!, line: message.line },
          rows: (block.element_rows ?? []).map(row => ({
            line: row.line,
            name: row.name,
            avps: row.avps ?? [],
            either: row.either ?? false,
            printed: row.printed ?? null,
            category: row.category ?? null,
            members: members
              .filter(member => row.avps?.includes(member.name))
              .map(member => ({ name: member.name, line: member.line })),
          })),
        });
      }
    }
  }
  return { schema_version: schemaVersion, tables };
}

export const emptyElements = (schemaVersion: number): ElementIndex => ({ schema_version: schemaVersion, tables: [] });

/** The tables describing a Message block of a document, or a command the index lists. */
export const tablesFor = (
  index: ElementIndex | undefined,
  document: string,
  block: Pick<Block, 'section' | 'name'>,
): ElementTable[] =>
  index?.tables.filter(
    table =>
      table.message.document === document &&
      table.message.section === block.section &&
      sameName(table.message.name, block.name),
  ) ?? [];

/** The tables a document's Information Elements block is, one for each Message block it describes. */
export const tablesOf = (index: ElementIndex | undefined, document: string, block: Block): ElementTable[] =>
  index?.tables.filter(
    table => table.document === document && table.section === block.section && sameName(table.command, block.name),
  ) ?? [];

/** A table's row naming a member, and the table: what the stage-3 text calls the member and how it categorises it. */
export interface MemberElement {
  table: ElementTable;
  row: IndexedElementRow;
}

/** The rows of the tables naming a member. */
export const memberElements = (tables: ElementTable[], member: string): MemberElement[] =>
  tables.flatMap(table => table.rows.filter(row => row.avps.includes(member)).map(row => ({ table, row })));

/** A member's categories in the tables, each once in table order: `M`, or `M/O` where two tables differ. */
export const categoriesOf = (elements: MemberElement[]) =>
  [...new Set(elements.flatMap(({ row }) => row.category ?? []))].join('/');

/** "IMSI · M, mandatory · one of Result-Code, Experimental-Result": what a row says its member is. */
export const elementText = (row: Pick<ElementRow, 'name' | 'category' | 'either' | 'avps'>) =>
  [
    row.name,
    row.category && `${row.category}, ${categoryWords[row.category]}`,
    row.either && row.avps?.length && `one of ${row.avps.join(', ')}`,
  ]
    .filter(Boolean)
    .join(' · ');

/** The row at a line of the Information Elements block it is in, if it is in one. */
export function elementRowAt(block: Block | undefined, line: number): ElementRow | undefined {
  if (!block || !isElements(block)) return undefined;
  return block.element_rows?.find(row => row.line === line);
}

/**
 * A file's lines with a member of a Message block that a table describes, and what the tables say of it: the quiet
 * mark beside the line. Read over the file at hand, a raw mirror too, by its blocks' clauses and names.
 */
export function memberMarks(
  file: DadFile,
  document: string,
  index: ElementIndex | undefined,
): Map<number, MemberElement[]> {
  const marks = new Map<number, MemberElement[]>();
  if (!index?.tables.length) return marks;
  for (const block of file.blocks) {
    if (block.type !== 'Message' || !block.rule) continue;
    const tables = tablesFor(index, document, block);
    if (!tables.length) continue;
    for (const member of block.rule.members) {
      const found = memberElements(tables, member.name);
      if (found.length) marks.set(member.line, found);
    }
  }
  return marks;
}

/**
 * Marks `start` to `end` of a line as naming an AVP: the token spelling just that, or a plain token holding it, split
 * around it. A span reaching over a token's edge, or inside a comment or another name, is left as it is.
 */
function markAvp(line: Line, start: number, end: number, avp: string) {
  let at = 0;
  for (const [index, token] of (line.tokens as ValueToken[]).entries()) {
    const stop = at + token.text.length;
    if (start >= at && end <= stop) {
      if (token.kind || token.correction || token.avp || token.command) return;
      if (start === at && end === stop) {
        token.avp = avp;
        return;
      }
      if (token.target || token.source) return;
      const parts: ValueToken[] = [
        { text: token.text.slice(0, start - at) },
        { text: token.text.slice(start - at, end - at), avp },
        { text: token.text.slice(end - at) },
      ];
      line.tokens.splice(index, 1, ...parts.filter(part => part.text));
      return;
    }
    at = stop;
  }
}

/**
 * Marks the names in an Information Elements row's mapping cell as AVPs where the export left them a plain link, as
 * in a document that only prints the tables (TS 29.328), or plain text, as `Result-Code/Experimental-Result` (TS
 * 29.283), so they open what an AVP's name does. Each is looked for after the row's first cell, in the order it names them.
 */
export const markElements = perFile(({ lines, blocks }) => {
  for (const block of blocks) {
    if (!isElements(block)) continue;
    for (const row of block.element_rows ?? []) {
      const line = lines[row.line];
      if (!line) continue;
      const text = line.tokens.map(token => token.text).join('');
      let from = text.startsWith(row.cells[0] ?? '') ? (row.cells[0] ?? '').length : 0;
      for (const avp of row.avps ?? []) {
        const start = text.indexOf(avp, from);
        if (start < 0) continue;
        markAvp(line, start, start + avp.length, avp);
        from = start + avp.length;
      }
    }
  }
  return true;
});

/** The lines of a file's Information Elements rows. */
export const elementRowLines = perFile(
  ({ blocks }) =>
    new Set(blocks.flatMap(block => (isElements(block) ? (block.element_rows ?? []).map(row => row.line) : []))),
);

/**
 * "Information Elements ULR, ULA": a clause's title where the export's names only the type, with what its tables
 * describe, each command by `short`, and the tables naming none by their number, "table 4.1.2.1/1", or count.
 */
export function elementsTitle(file: DadFile, section: string, title: string, short: (name: string) => string): string {
  if (title !== 'Information Elements') return title;
  const tables = file.blocks.filter(block => isElements(block) && block.section === section);
  const named = [...new Set(tables.flatMap(block => (block.name ? [short(block.name)] : [])))];
  const unnamed = tables.filter(block => !block.name);
  const rest =
    unnamed.length > 1
      ? [`${unnamed.length} tables`]
      : unnamed.length && unnamed[0].fields.Table
        ? [`table ${unnamed[0].fields.Table}`]
        : [];
  const said = [...named, ...rest];
  return said.length ? `${title} ${said.join(', ')}` : title;
}
