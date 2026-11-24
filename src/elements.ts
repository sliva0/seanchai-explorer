import { perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import type { Block, Category, ElementRow, Line, Member } from './types.ts';
import type { ValueToken } from './values.ts';
import { markWords } from './text/document.ts';
import { categoryText, categoryWords as words, oneOf, tableIn, tableName, tablesCount } from './text/terms.ts';

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
 * the command its `; Command:` names, and the block, by its document, clause and name, its `; Type:` line there, and
 * `ordinal`, which of the clause's blocks of that name it is: TS 29.272's 7.2.9 has two, for S6a's and S6d's ids.
 */
export interface ElementTable {
  document: string;
  section: string;
  page: number | null;
  line: number;
  table: string | null;
  command: string;
  message: { document: string; section: string; name: string; line: number; ordinal: number };
  rows: IndexedElementRow[];
}

/**
 * `elements.json`, which prepare derives from the export's documents: every table a Message block's `described_by`
 * lists, once for each block, which may be another document's (TS 29.328's tables of TS 29.329's commands).
 */
export interface ElementIndex {
  schema_version: number;
  tables: ElementTable[];
}

export const categoryWords: Record<Category, string> = words;

/** The table describes a command its block names; one TS 29.338 table spells it in another case. */
const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

const isElements = (block: Block) => block.type === 'Information Elements';

/** A clause's Message blocks of a command, in file order. */
const messageBlocks = (file: DadFile, section: string, name: string): Block[] =>
  file.blocks.filter(block => block.type === 'Message' && block.section === section && sameName(block.name, name));

/** Which of its clause's Message blocks of its name a block is, `-1` for none: a raw mirror's and the corrected file's agree. */
export const messageOrdinal = (file: DadFile, block: Pick<Block, 'section' | 'name' | 'line'>): number =>
  block.name ? messageBlocks(file, block.section, block.name).findIndex(other => other.line === block.line) : -1;

/** The Message block of a command in a clause, the `ordinal`th of that name there. */
export const messageBlock = (file: DadFile, section: string, name: string, ordinal = 0): Block | undefined =>
  messageBlocks(file, section, name)[ordinal];

/** The Information Elements block of a clause for a command and table label: a table, in this file's lines. */
export const elementsBlock = (
  file: DadFile,
  section: string,
  command: string,
  table: string | null = null,
): Block | undefined =>
  file.blocks.find(
    block =>
      isElements(block) &&
      block.section === section &&
      sameName(block.name, command) &&
      (block.fields.Table ?? null) === table,
  );

/**
 * What `elements.json` says of a set of documents: for each Message block, the tables its `described_by` names, with
 * the lines of the members each row maps to. A raw mirror's blocks list none, so it is read over corrected files.
 */
export function elementIndex(documents: (DadFile & { id: string })[], schemaVersion: number): ElementIndex {
  const byId = new Map(documents.map(file => [file.id, file]));
  const tables: ElementTable[] = [];
  for (const file of documents) {
    for (const message of file.blocks) {
      if (message.type !== 'Message' || !message.name || !message.rule) continue;
      const { members } = message.rule;
      for (const at of message.described_by ?? []) {
        const block = byId
          .get(at.document)
          ?.blocks.find(
            other =>
              isElements(other) && other.section === at.section && (other.fields.Table ?? null) === (at.table ?? null),
          );
        if (!block?.name) continue;
        tables.push({
          document: at.document,
          section: block.section,
          page: block.page,
          line: block.line,
          table: block.fields.Table ?? null,
          command: block.name,
          message: {
            document: file.id,
            section: message.section,
            name: message.name,
            line: message.line,
            ordinal: messageOrdinal(file, message),
          },
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

/**
 * The tables describing a Message block of a document: with `file`, the file the block's lines are of, a raw mirror
 * too, by its clause, name and ordinal there; without, a block of the corrected text by its line, as `commands.json`
 * gives another document's.
 */
export function tablesFor(
  index: ElementIndex | undefined,
  document: string,
  block: Pick<Block, 'section' | 'name' | 'line'>,
  file?: DadFile,
): ElementTable[] {
  const ordinal = file ? messageOrdinal(file, block) : undefined;
  return (
    index?.tables.filter(
      ({ message }) =>
        message.document === document &&
        (ordinal === undefined
          ? message.line === block.line
          : message.section === block.section && sameName(message.name, block.name) && message.ordinal === ordinal),
    ) ?? []
  );
}

/** The tables a document's Information Elements block is, one for each Message block it describes. */
export const tablesOf = (index: ElementIndex | undefined, document: string, block: Block): ElementTable[] =>
  index?.tables.filter(
    table =>
      table.document === document &&
      table.section === block.section &&
      table.table === (block.fields.Table ?? null) &&
      sameName(table.command, block.name),
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

/** Whether a member's brackets require it, `{ }` or `< >` at least once, as the corpus's linter reads them. */
const bracketsRequire = (member: Pick<Member, 'presence' | 'min'>) => member.presence !== 'optional' && member.min >= 1;

/**
 * What a member's categories say that its brackets do not, or nothing where the brackets say it already, an M on
 * `{ }` or `< >` and an O on `[ ]`: `conditional` for a C, which no brackets say, and `disagrees` where a row's
 * category contradicts them, an M on `[ ]` (the corpus linter's `element-optional-in-abnf`) or an O or C on `{ }` or
 * `< >` (`element-required-in-abnf`), with a sentence for each such row. A row offering one of several AVPs says
 * nothing of each, so is not compared, as the linter does not compare it.
 */
export function categoryNote(
  member: Pick<Member, 'name' | 'presence' | 'min'>,
  elements: MemberElement[],
): { kind: 'conditional' | 'disagrees'; disagreements: string[] } | undefined {
  const required = bracketsRequire(member);
  const disagreements = elements.flatMap(({ table, row }) => {
    if (row.either || !row.category || (row.category === 'M') === required) return [];
    const where = table.table ? tableName(table.table) : tableIn(table.section);
    return required
      ? markWords.bracketsRequire(member.name, where, categoryText(row.category, categoryWords[row.category]))
      : markWords.bracketsOptional(member.name, where);
  });
  if (disagreements.length) return { kind: 'disagrees', disagreements };
  return elements.some(({ row }) => row.category === 'C') ? { kind: 'conditional', disagreements } : undefined;
}

/** "IMSI · M, mandatory · one of Result-Code, Experimental-Result": what a row says its member is. */
export const elementText = (row: Pick<ElementRow, 'name' | 'category' | 'either' | 'avps'>) =>
  [
    row.name,
    row.category && categoryText(row.category, categoryWords[row.category]),
    row.either && row.avps?.length && oneOf(row.avps),
  ]
    .filter(Boolean)
    .join(' · ');

/** The row at a line of the Information Elements block it is in, if it is in one. */
export function elementRowAt(block: Block | undefined, line: number): ElementRow | undefined {
  if (!block || !isElements(block)) return undefined;
  return block.element_rows?.find(row => row.line === line);
}

/**
 * A file's lines with a member of a Message block that a table describes, the member and what the tables say of it.
 * Read over the file at hand, a raw mirror too, by its blocks' clauses and names.
 */
export function memberMarks(
  file: DadFile,
  document: string,
  index: ElementIndex | undefined,
): Map<number, { member: Member; elements: MemberElement[] }> {
  const marks = new Map<number, { member: Member; elements: MemberElement[] }>();
  if (!index?.tables.length) return marks;
  for (const block of file.blocks) {
    if (block.type !== 'Message' || !block.rule) continue;
    const tables = tablesFor(index, document, block, file);
    if (!tables.length) continue;
    for (const member of block.rule.members) {
      const found = memberElements(tables, member.name);
      if (found.length) marks.set(member.line, { member, elements: found });
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
      ? [tablesCount(unnamed.length)]
      : unnamed.length && unnamed[0].fields.Table
        ? [tableName(unnamed[0].fields.Table)]
        : [];
  const said = [...named, ...rest];
  return said.length ? `${title} ${said.join(', ')}` : title;
}
