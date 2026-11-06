import type { Line } from './types.ts';
import { lineText } from './values.ts';
import type { ValueToken } from './values.ts';

/** A `; Type: Message` block: a command as its file prints it. `line` is its `; Type:` line. */
export interface CommandBlock {
  name: string;
  abbreviation: string | null;
  section: string;
  page: number | null;
  line: number;
  code: number;
  /** The header's flags as it prints them: `REQ`, `PXY`, `ERR`. */
  flags: string[];
  /** The Application-ID the header prints, null for a bare one. */
  header: number | null;
  /** The command's own: the header's, or for a bare header the one the first Application Scope block covering its clause states. */
  application: number | null;
  /** The Application Scope block naming the application, and for a bare header the one stating its id. */
  scope: { name: string; section: string } | null;
}

/** A row of a `Command Codes` registry, at `line`: a code, its request and answer. `defined` is the documents its Defined-In cell links to. */
export interface CommandCodeRow {
  code: number;
  name: string;
  abbreviation: string | null;
  section: string;
  page: number | null;
  line: number;
  table: string | null;
  defined: string[];
}

/** An AVP table with a column per command, TS 32.299's ACR to CCA. `line` is its `; Type:` line. */
export interface CommandTable { section: string; page: number | null; line: number; table: string | null; columns: string[] }

/** The command a token names: this file's block, or a registry row's half, by its code and which half. */
export interface CommandRef {
  code: number;
  request: boolean;
  name: string;
  abbreviation: string | null;
  block?: CommandBlock;
  row?: CommandCodeRow;
}

export interface CommandFacts { blocks: CommandBlock[]; rows: CommandCodeRow[]; tables: CommandTable[] }

/** A command as the corpus index has it: a block and its document. */
export interface IndexedCommand extends CommandBlock { document: string }
export interface IndexedCodeRow extends CommandCodeRow { document: string }
/** `commands.json`, which prepare derives from the export's documents for what one document cannot say of a command. */
export interface CommandIndex { schema_version: number; commands: IndexedCommand[]; registry: IndexedCodeRow[] }

export const isRequest = (command: Pick<CommandBlock, 'flags'>) => command.flags.includes('REQ');
/** What tells a command's names on a page from another's: `271 answer`. */
export const commandKey = (ref: Pick<CommandRef, 'code' | 'request'>) => `${ref.code} ${ref.request ? 'request' : 'answer'}`;

const directive = /^; ([\w-]+): (.*?)\s*(?:;;.*)?$/;
const head = /^<([^>]+)>\s*::=\s*<\s*Diameter Header:\s*(\d+)((?:\s*,\s*[A-Z]{3})*)(?:\s*,\s*(\d+))?\s*,?\s*>/;
const nameLine = /^; Name: ([^,]+?)(?:, ([A-Z0-9]{2,6}))?$/;
// A table's cells as the parser splits them: runs of non-space, a quoted run keeping its spaces.
const cells = /(?:"(?:[^"\\]|\\.)*"|[^\s"])+/g;
const number = (text: string | undefined) => text && /^\d+$/.test(text) ? Number(text) : null;
const fullText = (line: Line) => line.tokens.map(token => token.text).join('');

interface Cell { text: string; start: number; end: number }
function cellsOf(text: string): Cell[] {
  return [...text.matchAll(cells)].map(match => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
}

/**
 * Marks `start` to `end` of a line as naming a command: the token spelling just that, or a plain token holding it,
 * split around it. A span reaching over a token's edge, or inside a link or a comment, is left as it is.
 */
function mark(line: Line, start: number, end: number, command: CommandRef) {
  let at = 0;
  for (const [index, token] of line.tokens.entries()) {
    const stop = at + token.text.length;
    if (start >= at && end <= stop) {
      if (token.kind || token.correction) return;
      if (start === at && end === stop) { (token as ValueToken).command = command; return; }
      if (token.target || token.source || token.avp) return;
      const parts: ValueToken[] = [{ text: token.text.slice(0, start - at) }, { text: token.text.slice(start - at, end - at), command }, { text: token.text.slice(end - at) }];
      line.tokens.splice(index, 1, ...parts.filter(part => part.text));
      return;
    }
    at = stop;
  }
}

/** The clause that scopes one interface's commands: `5a` of `5a.6.2`, `A.7` of `A.7.6.2`. */
const interfaceClause = (section: string) => {
  const parts = section.split('.');
  return /^[A-Za-z]+$/.test(parts[0]) ? parts.slice(0, 2).join('.') : parts[0];
};

const covers = (appliesTo: string[], section: string) => appliesTo.some(entry => {
  const clause = entry.replace(/\.\*$/, '');
  return section === clause || section.startsWith(`${clause}.`);
});

/**
 * A registry name cell's two halves, `User-Authorization-Request/-Answer` or a quoted `"Insert Subscriber
 * Data-Request/Answer"`, as spans of the line and the names they stand for. A cell with no slash is one half,
 * whichever its name ends in.
 */
function halves(cell: Cell): { start: number; end: number; name: string; request: boolean }[] {
  const quoted = cell.text.startsWith('"') ? 1 : 0;
  const start = cell.start + quoted;
  const text = cell.text.slice(quoted, cell.text.length - quoted);
  const slash = text.indexOf('/');
  if (slash < 0) {
    const request = /-Request$/.test(text) ? true : /-Answer$/.test(text) ? false : undefined;
    return request === undefined ? [] : [{ start, end: start + text.length, name: text, request }];
  }
  const first = text.slice(0, slash);
  const second = text.slice(slash + 1).replace(/^-/, '');
  const skipped = text.length - slash - 1 - second.length;
  return [
    { start, end: start + slash, name: first, request: true },
    { start: start + slash + 1 + skipped, end: start + text.length, name: /Request$/.test(first) ? `${first.replace(/Request$/, '')}${second}` : second, request: false },
  ];
}

function readCommands(lines: Line[]): CommandFacts {
  const facts: CommandFacts = { blocks: [], rows: [], tables: [] };
  const scopes: { name: string; id: number; section: string; appliesTo: string[] }[] = [];
  // Marked once every block is read, for a scope or a block after the line to count.
  const marks: (() => void)[] = [];
  const columnLines: { line: number; table: CommandTable }[] = [];
  let block: { type: string; fields: Map<string, string>; line: number; nameLine?: number; body: boolean } | undefined;
  const finish = () => {
    if (block?.type !== 'Application Scope') return;
    const id = number(block.fields.get('Application-ID'));
    const section = block.fields.get('Section') ?? lines[block.line].section;
    if (id !== null && section) scopes.push({ name: block.fields.get('Name') ?? '', id, section, appliesTo: block.fields.get('Applies-To')?.split(/[\s,]+/).filter(Boolean) ?? [] });
  };
  lines.forEach((line, index) => {
    const text = lineText(line);
    const field = text.match(directive);
    if (field?.[1] === 'Type') {
      finish();
      block = { type: field[2], fields: new Map(), line: index, body: false };
      return;
    }
    if (!block) return;
    if (!text.trim()) {
      if (block.body) { finish(); block = undefined; }
      return;
    }
    if (field && !block.body) {
      block.fields.set(field[1], field[2]);
      if (field[1] === 'Name') block.nameLine = index;
      if (field[1] === 'Columns' && (block.type === 'AVP Table' || block.type === 'Reused AVPs')) {
        const { fields } = block;
        columnLines.push({ line: index, table: { section: fields.get('Section') ?? line.section ?? '', page: number(fields.get('Page')), line: block.line, table: fields.get('Table') ?? null, columns: [] } });
      }
      return;
    }
    if (text.trimStart().startsWith(';')) return;
    const first = !block.body;
    block.body = true;
    const { type, fields } = block;
    if (type === 'Message' && first) {
      const printed = fullText(line);
      const header = printed.match(head);
      const named = block.nameLine === undefined ? null : lineText(lines[block.nameLine]).match(nameLine);
      if (!header || !named) return;
      const flags = header[3].split(',').map(flag => flag.trim()).filter(Boolean);
      const found: CommandBlock = {
        name: named[1], abbreviation: named[2] ?? null, section: fields.get('Section') ?? line.section ?? '', page: number(fields.get('Page')), line: block.line,
        code: Number(header[2]), flags, header: number(header[4]), application: null, scope: null,
      };
      facts.blocks.push(found);
      const ref: CommandRef = { code: found.code, request: isRequest(found), name: found.name, abbreviation: found.abbreviation, block: found };
      const nameRow = lines[block.nameLine!];
      marks.push(() => {
        const start = '; Name: '.length;
        mark(nameRow, start, start + found.name.length, ref);
        if (found.abbreviation) {
          const at = fullText(nameRow).indexOf(`, ${found.abbreviation}`, start + found.name.length);
          if (at >= 0) mark(nameRow, at + 2, at + 2 + found.abbreviation.length, ref);
        }
        if (header[1] === found.name) mark(line, 1, 1 + found.name.length, ref);
      });
      return;
    }
    if (type === 'Registry' && fields.get('Registry') === 'Command Codes') {
      const columns = fields.get('Columns')?.split(/\s+/) ?? [];
      const row = cellsOf(fullText(line).replace(/\s*;.*$/s, ''));
      if (row.length !== columns.length) return;
      const cell = (column: string) => { const at = columns.indexOf(column); return at < 0 ? undefined : row[at]; };
      const code = number(cell('Code')?.text);
      const nameCell = cell('Name');
      if (code === null || !nameCell || nameCell.text === '-') return;
      const abbreviationCell = cell('Abbreviation');
      const abbreviation = abbreviationCell && abbreviationCell.text !== '-' ? abbreviationCell.text.replace(/^"(.*)"$/, '$1') : null;
      const found: CommandCodeRow = {
        code, name: nameCell.text.replace(/^"(.*)"$/, '$1'), abbreviation, section: fields.get('Section') ?? line.section ?? '', page: number(fields.get('Page')), line: index,
        table: fields.get('Table') ?? null, defined: [...new Set(line.tokens.flatMap(token => token.target && !token.avp ? [token.target.document] : []))],
      };
      facts.rows.push(found);
      const shortNames = abbreviation?.split('/') ?? [];
      const named = halves(nameCell);
      marks.push(() => named.forEach((half, at) => {
        const short = named.length === shortNames.length ? shortNames[at] : null;
        const ref: CommandRef = { code, request: half.request, name: half.name, abbreviation: short ?? null, row: found };
        mark(line, half.start, half.end, ref);
        if (short && abbreviationCell) {
          const offset = abbreviationCell.text.indexOf(short, at ? abbreviationCell.text.indexOf('/') : 0);
          if (offset >= 0) mark(line, abbreviationCell.start + offset, abbreviationCell.start + offset + short.length, ref);
        }
      }));
    }
  });
  finish();
  // The application is named as the model names it: by the first block of the commands of its id under one
  // interface's clause whose covering scope states that id. Where the header prints none, its own scope says it.
  const covering = new Map(facts.blocks.map(found => [found, scopes.find(scope => covers(scope.appliesTo, found.section))]));
  const stating = new Map<string, (typeof scopes)[number]>();
  const groupOf = (found: CommandBlock) => `${found.application} ${interfaceClause(found.section)}`;
  for (const found of facts.blocks) {
    const scope = covering.get(found);
    found.application = found.header ?? scope?.id ?? null;
    if (scope && scope.id === found.application && !stating.has(groupOf(found))) stating.set(groupOf(found), scope);
  }
  for (const found of facts.blocks) {
    const named = stating.get(groupOf(found));
    if (named) found.scope = { name: named.name, section: (found.header === null ? covering.get(found)! : named).section };
  }
  // A column is a command's where it is one of the file's by abbreviation, the first of that name.
  const byAbbreviation = new Map<string, CommandBlock>();
  for (const found of facts.blocks) if (found.abbreviation && !byAbbreviation.has(found.abbreviation)) byAbbreviation.set(found.abbreviation, found);
  for (const { line, table } of columnLines) {
    const printed = fullText(lines[line]);
    const start = printed.indexOf(':') + 1;
    for (const cell of cellsOf(printed.slice(start).replace(/\s*;.*$/s, ''))) {
      const found = byAbbreviation.get(cell.text);
      if (!found) continue;
      table.columns.push(cell.text);
      const ref: CommandRef = { code: found.code, request: isRequest(found), name: found.name, abbreviation: found.abbreviation, block: found };
      marks.push(() => mark(lines[line], start + cell.start, start + cell.end, ref));
    }
    if (table.columns.length) facts.tables.push(table);
  }
  for (const apply of marks) apply();
  return facts;
}

const known = new WeakMap<Line[], CommandFacts>();

/** A file's commands, registry rows and command tables. The first reading marks the tokens naming them, so a command is a name as an AVP is. */
export function commandFacts(lines: Line[]): CommandFacts {
  let facts = known.get(lines);
  if (!facts) { facts = readCommands(lines); known.set(lines, facts); }
  return facts;
}

/** What a set of documents says of their commands, for `commands.json`. */
export function commandIndex(documents: { id: string; lines: Line[] }[], schemaVersion: number): CommandIndex {
  const index: CommandIndex = { schema_version: schemaVersion, commands: [], registry: [] };
  for (const { id, lines } of documents) {
    const { blocks, rows } = commandFacts(lines);
    index.commands.push(...blocks.map(block => ({ document: id, ...block })));
    index.registry.push(...rows.map(row => ({ document: id, ...row })));
  }
  return index;
}

/** An index with nothing in it, for an export no index was derived from. */
export const emptyIndex = (schemaVersion: number): CommandIndex => ({ schema_version: schemaVersion, commands: [], registry: [] });
