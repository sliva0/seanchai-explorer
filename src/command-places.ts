import type { Place } from './avp-places.ts';
import { commandFacts, isRequest } from './commands.ts';
import type { CommandBlock, CommandCodeRow, CommandIndex, CommandRef, CommandTable } from './commands.ts';
import type { DadFile } from './blocks.ts';
import type { Document } from './types.ts';

/** A command where some document prints it: a block of the file at hand, or of another as the index has it. */
export interface Command extends CommandBlock { document: string }
export interface CodeRow extends CommandCodeRow { document: string }

/**
 * Where a block is: its clause in the pane at its name, and its `; Type:` line in the view. In another document
 * the pane looks for its clause there, and the view takes the line the index read in its corrected text.
 */
export function blockPlace(command: Command, doc: Pick<Document, 'id'>): Place {
  const target = { document: command.document, section: command.section, name: command.name };
  if (command.document !== doc.id) return { document: command.document, target, line: command.line };
  return { document: doc.id, position: { section: command.section, page: command.page, name: command.name }, target, line: command.line };
}

/** A registry row's line, and in the pane its clause at the row's abbreviations, which no other row prints. */
export function rowPlace(row: CodeRow, doc: Pick<Document, 'id'>): Place {
  const name = row.abbreviation ?? row.name;
  const target = { document: row.document, section: row.section, name };
  if (row.document !== doc.id) return { document: row.document, target, line: row.line };
  return { document: doc.id, position: { section: row.section, page: row.page, name }, target, line: row.line };
}

export function tablePlace(table: CommandTable, doc: Pick<Document, 'id'>): Place {
  return { document: doc.id, position: { section: table.section, page: table.page }, target: { document: doc.id, section: table.section }, line: table.line };
}

/**
 * The command a token names: its block in this file, or for a registry row's half the block of that code and half
 * in the first document its Defined-In cell links to that prints one.
 */
export function commandOf(ref: CommandRef, doc: Pick<Document, 'id'>, index: CommandIndex | undefined): Command | undefined {
  if (ref.block) return { document: doc.id, ...ref.block };
  return ref.row?.defined.flatMap(document => index?.commands.filter(command => command.document === document && command.code === ref.code && isRequest(command) === ref.request) ?? [])[0];
}

/** A command's place to go to: its Definition, the block. A command has no Details, its block's clause being where every document describes it. */
export function commandPlaces(ref: CommandRef, doc: Pick<Document, 'id'>, index: CommandIndex | undefined): { definition?: Place } {
  const command = commandOf(ref, doc, index);
  return command ? { definition: blockPlace(command, doc) } : {};
}

/** Every command the corpus prints: the file at hand's from its own blocks, which the view shows, first; the index's of the others after. */
export function allCommands(file: DadFile, doc: Pick<Document, 'id'>, index: CommandIndex | undefined): Command[] {
  const here = commandFacts(file).blocks.map(block => ({ document: doc.id, ...block }));
  return [...here, ...index?.commands.filter(command => command.document !== doc.id) ?? []];
}

const same = (a: Command, b: Command) => a.document === b.document && a.line === b.line;
const sharedClause = (a: string, b: string) => {
  const [x, y] = [a.split('.'), b.split('.')];
  let at = 0;
  while (at < x.length && x[at] === y[at]) at++;
  return at;
};

/** The other half in the same document: same code and application, the one in the nearest clause, then the nearest line. */
export function partnerOf(command: Command, commands: Command[]): Command | undefined {
  const halves = commands.filter(other => other.document === command.document && other.code === command.code && other.application === command.application && isRequest(other) !== isRequest(command));
  return halves.sort((a, b) => sharedClause(b.section, command.section) - sharedClause(a.section, command.section) || Math.abs(a.line - command.line) - Math.abs(b.line - command.line))[0];
}

/**
 * Where else the command is printed: by code, application and half, under any name. Those of its name that differ
 * in code or application are another command, and come apart.
 */
export function definitionsOf(command: Command, commands: Command[]): { same: Command[]; differing: Command[] } {
  const name = command.name.toLowerCase();
  const others = commands.filter(other => !same(other, command));
  return {
    same: others.filter(other => other.code === command.code && other.application === command.application && isRequest(other) === isRequest(command)),
    differing: others.filter(other => other.name.toLowerCase() === name && (other.code !== command.code || other.application !== command.application)),
  };
}

/** Its rows in a `Command Codes` registry: this file's from its own blocks, the others' from the index. */
export function registryRows(command: Pick<Command, 'code'>, file: DadFile, doc: Pick<Document, 'id'>, index: CommandIndex | undefined): CodeRow[] {
  const here = commandFacts(file).rows.map(row => ({ document: doc.id, ...row }));
  return [...here, ...index?.registry.filter(row => row.document !== doc.id) ?? []].filter(row => row.code === command.code);
}

/** The tables of this file with a column for the block, which a column names by the first block of its abbreviation. */
export function tablesOf(command: Command, file: DadFile, doc: Pick<Document, 'id'>): CommandTable[] {
  if (command.document !== doc.id || !command.abbreviation) return [];
  const { blocks, tables } = commandFacts(file);
  if (blocks.find(block => block.abbreviation === command.abbreviation)?.line !== command.line) return [];
  return tables.filter(table => table.columns.includes(command.abbreviation!));
}
