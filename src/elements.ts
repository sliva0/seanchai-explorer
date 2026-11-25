import { perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import type { Block, Category, ElementRow, Line, Member } from './types.ts';
import type { ValueToken } from './values.ts';
import { markWords } from './text/document.ts';
import { categoryText, categoryWords as words, oneOf, tableIn, tableName, tablesCount } from './text/terms.ts';

/**
 * A row of an Information Elements table as `elements.json` carries it. `name` is null in a table naming its rows by
 * their AVPs alone (TS 32.299's). `parents` are the AVPs of the grouped AVP rows it is set off under, outermost first,
 * `depth` levels; `members` are the members it maps to, by their lines in the described document's corrected text: a
 * row set off under another describes a member of that grouped AVP, not of the command, so has none.
 */
export interface IndexedElementRow {
  line: number;
  name: string | null;
  avps: string[];
  either: boolean;
  printed: string | null;
  category: Category | null;
  depth: number;
  parents: string[];
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

/** "M, mandatory", "OC, conditional where the operator provisions it", "not used": a category in words, a newer one by its letters. */
export const categoryLabel = (category: Category) => categoryText(category, categoryWords[category] ?? category);

/** A row's AVP as a parent of the rows set off under it: the one it maps to, or its cell as printed. */
const rowAvp = (row: Pick<ElementRow, 'avps' | 'printed' | 'cells'>) =>
  row.avps?.[0] ?? row.printed ?? row.cells[0] ?? '';

/**
 * Each row's parents, the AVPs of the grouped AVP rows it is set off under, outermost first: the rows above it of each
 * lower depth, as the table sets them off. A row set deeper than one level under the row above (the linter's
 * `element-misplaced`) is under the nearest rows there are.
 */
export function rowParents(rows: Pick<ElementRow, 'avps' | 'printed' | 'cells' | 'depth'>[]): string[][] {
  const open: { depth: number; avp: string }[] = [];
  return rows.map(row => {
    const depth = row.depth ?? 0;
    while (open.length && open[open.length - 1].depth >= depth) open.pop();
    const parents = open.map(item => item.avp);
    open.push({ depth, avp: rowAvp(row) });
    return parents;
  });
}

/** Whether two rows of one table, a raw mirror's and the corrected one's, are the same row: by name, AVPs and parents. */
export const sameElementRow = (
  a: { name: string | null; avps: string[]; parents: string[] },
  b: { name: string | null; avps: string[]; parents: string[] },
) => a.name === b.name && a.avps.join() === b.avps.join() && a.parents.join() === b.parents.join();

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
          rows: (block.element_rows ?? []).map((row, at, rows) => {
            const parents = rowParents(rows)[at];
            return {
              line: row.line,
              name: row.name ?? null,
              avps: row.avps ?? [],
              either: row.either ?? false,
              printed: row.printed ?? null,
              category: row.category ?? null,
              depth: row.depth ?? 0,
              parents,
              members: parents.length
                ? []
                : members
                    .filter(member => row.avps?.includes(member.name))
                    .map(member => ({ name: member.name, line: member.line })),
            };
          }),
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

/**
 * The rows of the tables naming a member: those of the command's own level, as a row set off under a grouped AVP's
 * describes that AVP's member of the name.
 */
export const memberElements = (tables: ElementTable[], member: string): MemberElement[] =>
  tables.flatMap(table =>
    table.rows.filter(row => !row.parents?.length && row.avps.includes(member)).map(row => ({ table, row })),
  );

/** A member's categories in the tables, each once in table order: `M`, or `M/O` where two tables differ. */
export const categoriesOf = (elements: MemberElement[]) =>
  [...new Set(elements.flatMap(({ row }) => row.category ?? []))].join('/');

/** Whether a member's brackets require it, `{ }` or `< >` at least once, as the corpus's linter reads them. */
const bracketsRequire = (member: Pick<Member, 'presence' | 'min'>) => member.presence !== 'optional' && member.min >= 1;

/** The categories a member's brackets say already where they agree: an M or an O. */
const SAID_BY_BRACKETS: ReadonlySet<string> = new Set(['M', 'O']);

/**
 * What a member's categories say that its brackets do not, or nothing where the brackets say it already, an M on
 * `{ }` or `< >` and an O on `[ ]`: `conditional` for a C, TS 32.299's OM or OC, operator provisionable, or its dash,
 * not used, which no brackets say, and `disagrees` where a row's category contradicts them, as the corpus linter
 * reads them: an M on `[ ]` (`element-optional-in-abnf`), an O, C, OM or OC on `{ }` or `< >`
 * (`element-required-in-abnf`), or a dash on a member the body holds, not struck out, though the table does not use
 * it (`element-unused-in-abnf`), with a sentence for each such row. A row offering one of several AVPs says nothing of
 * each, so is not compared, as the linter does not compare it.
 */
export function categoryNote(
  member: Pick<Member, 'name' | 'presence' | 'min' | 'struck' | 'strikethrough'>,
  elements: MemberElement[],
): { kind: 'conditional' | 'disagrees'; disagreements: string[] } | undefined {
  const required = bracketsRequire(member);
  const disagreements = elements.flatMap(({ table, row }) => {
    if (row.either || !row.category) return [];
    const where = table.table ? tableName(table.table) : tableIn(table.section);
    // A member the body strikes out, as TS 32.299 strikes those its table does not use, agrees with a dash.
    if (row.category === '-')
      return member.struck || member.strikethrough ? [] : markWords.unusedInAbnf(member.name, where);
    if ((row.category === 'M') === required) return [];
    return required
      ? markWords.bracketsRequire(member.name, where, categoryLabel(row.category))
      : markWords.bracketsOptional(member.name, where);
  });
  if (disagreements.length) return { kind: 'disagrees', disagreements };
  // A struck member's line says already that a dash's member is not used.
  const struck = member.struck || member.strikethrough;
  return elements.some(
    ({ row }) => row.category && !SAID_BY_BRACKETS.has(row.category) && !(struck && row.category === '-'),
  )
    ? { kind: 'conditional', disagreements }
    : undefined;
}

/** "IMSI · M, mandatory · one of Result-Code, Experimental-Result": what a row says its member is. */
export const elementText = (row: Pick<ElementRow, 'name' | 'category' | 'either' | 'avps'>) =>
  [row.name, row.category && categoryLabel(row.category), row.either && row.avps?.length && oneOf(row.avps)]
    .filter(Boolean)
    .join(' · ');

/** A block's row as `sameElementRow` compares it: its name, AVPs and parents in the block. */
export function blockRowKey(block: Block, row: ElementRow): { name: string | null; avps: string[]; parents: string[] } {
  const rows = block.element_rows ?? [];
  return { name: row.name ?? null, avps: row.avps ?? [], parents: rowParents(rows)[rows.indexOf(row)] ?? [] };
}

/** The row of a block, of the file at hand, that is a table's row: the same by name, AVPs and parents. */
export const blockRowOf = (block: Block | undefined, row: IndexedElementRow): ElementRow | undefined =>
  block?.element_rows?.find(other => sameElementRow(blockRowKey(block, other), row));

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
 * Splits the number of a block's directive, as `; Command-Section:` or `; Request-Section:`, out of its line into a
 * link to that clause of `document`, the file's own where none is given. A line the export split already is left as
 * it is.
 */
export function markSectionLine(file: DadFile, block: Block, directive: string, document?: string) {
  const section = block.fields[directive];
  if (!section) return;
  const prefix = `; ${directive}: `;
  for (let index = block.line; index <= block.last; index++) {
    const tokens = file.lines[index]?.tokens;
    const first = tokens?.[0];
    if (!tokens || !first || first.target || first.source || first.kind || !first.text.startsWith(prefix + section))
      continue;
    const rest = first.text.slice(prefix.length + section.length);
    if (rest && !/^\s/.test(rest)) return;
    const to = document ?? (file as DadFile & { id?: string }).id;
    if (!to) return;
    tokens.splice(
      0,
      1,
      { text: prefix },
      { text: section, target: { document: to, section } },
      ...(rest ? [{ text: rest }] : []),
    );
    return;
  }
}

/** The document a block's `; Command:` name links to, where the export links it. */
export const commandDocument = (file: DadFile, block: Block) => {
  for (let index = block.line; index <= block.last; index++) {
    const tokens = file.lines[index]?.tokens;
    if (tokens?.[0]?.text === '; Command: ') return tokens[1]?.target?.document ?? undefined;
  }
  return undefined;
};

/**
 * A block's `; Command-Section:` number as a link to that clause: in the document its `; Command:` name links to,
 * which a `; From:` table's is another's, else the one the export found it described in, else the file's own.
 */
function markCommandSection(file: DadFile, block: Block) {
  markSectionLine(file, block, 'Command-Section', commandDocument(file, block) ?? block.described?.[0]?.document);
}

/**
 * Marks the names in an Information Elements row's mapping cell as AVPs where the export left them a plain link, as
 * in a document that only prints the tables (TS 29.328), or plain text, as `Result-Code/Experimental-Result` (TS
 * 29.283), so they open what an AVP's name does. Each is looked for after the row's first cell, in the order it names them.
 * A block's `; Command-Section:` number becomes a link to that clause, where the command its table describes is printed.
 */
export const markElements = perFile(file => {
  const { lines, blocks } = file;
  for (const block of blocks) {
    if (!isElements(block)) continue;
    markCommandSection(file, block);
    for (const row of block.element_rows ?? []) {
      const line = lines[row.line];
      if (!line) continue;
      const text = line.tokens.map(token => token.text).join('');
      // Past the indent of a row set off under a grouped AVP's, and past the element's name where the table names it.
      const indent = text.length - text.trimStart().length;
      const first = row.cells[0] ?? '';
      let from = indent + (row.name != null && text.startsWith(first, indent) ? first.length : 0);
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
