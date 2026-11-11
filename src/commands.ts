import { perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import type { Block, Line } from './types.ts';
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

function commandBlock(block: Block): CommandBlock | undefined {
  const { command } = block;
  if (!command || !block.name) return undefined;
  // The clause naming the application: for a bare header the scope stating its id, else the one naming the id it prints.
  const section = command.header_application_id === null ? command.scope : command.stated_in;
  return {
    name: block.name, abbreviation: block.abbreviation ?? null, section: block.section, page: block.page, line: block.line,
    code: command.code, flags: command.flags, header: command.header_application_id, application: command.application_id,
    scope: command.application && section ? { name: command.application, section } : null,
  };
}

function codeRows(block: Block): CommandCodeRow[] {
  if (block.type !== 'Registry' || block.fields.Registry !== 'Command Codes') return [];
  return (block.allocations ?? []).flatMap(row => row.code === null || !row.name ? [] : [{
    code: row.code, name: row.name, abbreviation: row.abbreviation ?? null, section: block.section, page: block.page, line: row.line,
    table: block.fields.Table ?? null, defined: row.documents ?? [],
  }]);
}

/** A file's commands, registry rows and command tables. The first reading marks the tokens naming them, so a command is a name as an AVP is. */
export const commandFacts = perFile(({ lines, blocks }): CommandFacts => {
  const facts: CommandFacts = { blocks: [], rows: [], tables: [] };
  const byBlock = new Map<number, CommandBlock>();
  blocks.forEach((block, index) => {
    const found = commandBlock(block);
    if (found) { facts.blocks.push(found); byBlock.set(index, found); }
    facts.rows.push(...codeRows(block));
  });
  for (const block of blocks) {
    if ((block.type === 'AVP Table' || block.type === 'Reused AVPs') && block.commands?.length) {
      facts.tables.push({ section: block.section, page: block.page, line: block.line, table: block.fields.Table ?? null, columns: block.commands.map(span => span.abbreviation!) });
    }
    for (const span of block.commands ?? []) {
      const found = span.block === null || span.block === undefined ? undefined : byBlock.get(span.block);
      const row = found ? undefined : facts.rows.find(item => item.line === span.line);
      mark(lines[span.line], span.start, span.end, { code: span.code, request: span.request, name: span.name, abbreviation: span.abbreviation ?? null, ...found ? { block: found } : row ? { row } : {} });
    }
  }
  return facts;
});

/** What a set of documents says of their commands, for `commands.json`. */
export function commandIndex(documents: (DadFile & { id: string })[], schemaVersion: number): CommandIndex {
  const index: CommandIndex = { schema_version: schemaVersion, commands: [], registry: [] };
  for (const file of documents) {
    const { id } = file;
    const { blocks, rows } = commandFacts(file);
    index.commands.push(...blocks.map(block => ({ document: id, ...block })));
    index.registry.push(...rows.map(row => ({ document: id, ...row })));
  }
  return index;
}

/** An index with nothing in it, for an export no index was derived from. */
export const emptyIndex = (schemaVersion: number): CommandIndex => ({ schema_version: schemaVersion, commands: [], registry: [] });
