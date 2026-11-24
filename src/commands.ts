import { perFile } from './blocks.ts';
import type { Block, Commands, IndexedCodeRow, IndexedCommand, Line } from './types.ts';
import type { ValueToken } from './values.ts';

/** A `; Type: Message` block: a command as its file prints it, as `commands.json` has it less its document. */
export type CommandBlock = Omit<IndexedCommand, 'document'>;

/** A row of a `Command Codes` registry, at `line`: a code, its request and answer. `defined` is the documents its Defined-In cell links to. */
export type CommandCodeRow = Omit<IndexedCodeRow, 'document'>;

/** An AVP table with a column per command, TS 32.299's ACR to CCA. `line` is its `; Type:` line. */
export interface CommandTable {
  section: string;
  page: number | null;
  line: number;
  table: string | null;
  columns: string[];
}

/** The command a token names: this file's block, or a registry row's half, by its code and which half. */
export interface CommandRef {
  code: number;
  request: boolean;
  name: string;
  abbreviation: string | null;
  block?: CommandBlock;
  row?: CommandCodeRow;
}

export interface CommandFacts {
  blocks: CommandBlock[];
  rows: CommandCodeRow[];
  tables: CommandTable[];
}

export type { IndexedCodeRow, IndexedCommand } from './types.ts';
/** `commands.json`, the export's index of every document's commands, for what one document cannot say of a command. */
export type CommandIndex = Commands;

export const isRequest = (command: Pick<CommandBlock, 'flags'>) => command.flags.includes('REQ');
/** What tells a command's names on a page from another's: `271 answer`. */
export const commandKey = (ref: Pick<CommandRef, 'code' | 'request'>) =>
  `${ref.code} ${ref.request ? 'request' : 'answer'}`;

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
      if (start === at && end === stop) {
        (token as ValueToken).command = command;
        return;
      }
      if (token.target || token.source || token.avp) return;
      const parts: ValueToken[] = [
        { text: token.text.slice(0, start - at) },
        { text: token.text.slice(start - at, end - at), command },
        { text: token.text.slice(end - at) },
      ];
      line.tokens.splice(index, 1, ...parts.filter(part => part.text));
      return;
    }
    at = stop;
  }
}

function commandBlock(block: Block): CommandBlock | undefined {
  const { command } = block;
  if (!command || !block.name) return undefined;
  const { application, application_clause: section } = command;
  return {
    name: block.name,
    abbreviation: block.abbreviation ?? null,
    section: block.section,
    page: block.page,
    line: block.line,
    code: command.code,
    flags: command.flags,
    header: command.header_application_id,
    application: command.application_id,
    scope: application && section ? { name: application, section } : null,
  };
}

/** A Command Codes registry's rows, by index into its allocations: none for an allocation of no code or name. */
function codeRows(block: Block): (CommandCodeRow | undefined)[] {
  if (block.type !== 'Registry' || block.fields.Registry !== 'Command Codes') return [];
  return (block.allocations ?? []).map(row =>
    row.code === null || !row.name
      ? undefined
      : {
          code: row.code,
          name: row.name,
          abbreviation: row.abbreviation ?? null,
          section: block.section,
          page: block.page,
          line: row.line,
          table: block.fields.Table ?? null,
          defined: row.documents ?? [],
        },
  );
}

/** A file's commands, registry rows and command tables. The first reading marks the tokens naming them, so a command is a name as an AVP is. */
export const commandFacts = perFile(({ lines, blocks }): CommandFacts => {
  const facts: CommandFacts = { blocks: [], rows: [], tables: [] };
  const byBlock = new Map<number, CommandBlock>();
  const rowsOf = new Map<Block, (CommandCodeRow | undefined)[]>();
  blocks.forEach((block, index) => {
    const found = commandBlock(block);
    if (found) {
      facts.blocks.push(found);
      byBlock.set(index, found);
    }
    const rows = codeRows(block);
    rowsOf.set(block, rows);
    facts.rows.push(...rows.filter(row => row !== undefined));
  });
  for (const block of blocks) {
    if ((block.type === 'AVP Table' || block.type === 'Reused AVPs') && block.commands?.length) {
      facts.tables.push({
        section: block.section,
        page: block.page,
        line: block.line,
        table: block.fields.Table ?? null,
        columns: block.commands.map(span => span.abbreviation!),
      });
    }
    for (const span of block.commands ?? []) {
      const found = span.block === null || span.block === undefined ? undefined : byBlock.get(span.block);
      const row =
        span.allocation === null || span.allocation === undefined ? undefined : rowsOf.get(block)?.[span.allocation];
      mark(lines[span.line], span.start, span.end, {
        code: span.code,
        request: span.request,
        name: span.name,
        abbreviation: span.abbreviation ?? null,
        ...(found ? { block: found } : row ? { row } : {}),
      });
    }
  }
  return facts;
});

/** An index with nothing in it, for a site whose `commands.json` could not be fetched. */
export const emptyIndex = (schemaVersion: number): CommandIndex => ({
  schema_version: schemaVersion,
  commands: [],
  registry: [],
  applications: {},
});
