import type { ClickTarget } from './click-target.ts';
import { commandPlaces } from './command-places.ts';
import type { CommandIndex } from './commands.ts';
import { newestOf } from './data.ts';
import type { Site } from './data.ts';
import { routeFor } from './navigation.ts';
import type { SourcePosition } from './navigation.ts';
import { avpRows, blockAt } from './blocks.ts';
import type { AvpRow, DadFile } from './blocks.ts';
import type { Document, Line, Target } from './types.ts';
import { valueRowAt } from './values.ts';
import type { ValueRow, ValueToken } from './values.ts';

/**
 * Somewhere a token can send the two panels. `position` is where the source pane goes in this document;
 * a place without one is the clause `target` names, in the pane as in the view. `target` and `line` are where
 * the .dad view goes, and a place with no `target` is only in the source.
 */
export interface Place {
  document: string;
  position?: SourcePosition;
  target?: Target;
  line?: number;
  /** Which of a name's two places this is, for a title to say. */
  of?: ClickTarget;
}

/**
 * Where a row of an AVP table says its AVP is described: its Section cell or an origin cell naming a document,
 * or for a table with neither column the clause its name links to. A cell naming another document is not this
 * file's to describe, and leaves the name's own link to it.
 */
function describedAt(
  line: Line,
  name: ValueToken,
  document: string,
): { cell?: ValueToken; place?: Pick<Target, 'document' | 'section' | 'name'> } {
  const cell = line.tokens.find(token => token !== name && !token.avp && (token.source || token.target));
  if (!cell) return { place: name.target ?? undefined };
  return { cell, place: cell.target ?? { document, section: cell.source!.section } };
}

/**
 * Marks the tokens of AVP table rows with their Details: the row in the clause describing the AVP, or the clause
 * itself where it has no such table. A row whose table stands in that clause has only its Definition, its own `source`.
 * A `Reused AVPs` block with no `; Table:` is the origin a clause's prose states: there is no row to find, and its
 * row's place and Details are that clause.
 */
export function markDetails(file: DadFile, doc: Pick<Document, 'id' | 'sections'>) {
  for (const [index, line] of file.lines.entries()) {
    const name: ValueToken | undefined = line.tokens.find(token => token.avp && token.source?.row);
    if (!name) continue;
    const block = blockAt(file, index);
    if (block?.type === 'Reused AVPs' && block.fields.Table === undefined) {
      const clause: SourcePosition = { section: name.source!.section, page: name.source!.page };
      name.source = clause;
      name.details = clause;
      continue;
    }
    const described = describedAt(line, name, doc.id);
    const { cell } = described;
    // A row whose cell names the document defining the AVP, a Reused AVPs row's From, is described where its name
    // links in this document, as TS 29.272's Communication-Pattern-Set row at the Grouped AVP of 7.3.194.
    const place =
      described.place?.document !== doc.id && name.target?.document === doc.id ? name.target : described.place;
    if (!place?.section || place.document !== doc.id || place.section === name.source!.section) continue;
    const page = doc.sections.find(section => section.section === place.section)?.page ?? null;
    const details: SourcePosition = {
      section: place.section,
      page,
      name: place.name ?? name.avp,
      row: true,
      titled: true,
    };
    name.details = details;
    // A cell naming another document is a link there, which it keeps.
    if (cell && (!cell.target || cell.target.document === doc.id)) cell.details = details;
  }
}

/**
 * What a place names a name by in another document, through the documents the build holds: `held` gives one already
 * loaded, `known` says whether the build holds it at all, and `edition` gives the build's edition of a reference, "TS29.336",
 * that the link names another of, the release of the document being read where the build has it, else the newest.
 */
export interface Resolver {
  held(id: string): (DadFile & { id: string }) | undefined;
  known(id: string): boolean;
  edition(reference: string): string | undefined;
}

/**
 * The documents `site` holds, as a name read in `doc` resolves them: a reference's edition of `doc`'s release where the
 * build has one, else its newest.
 */
export function resolverOf(site: Site, doc: Pick<Document, 'release'>): Resolver {
  return {
    held: id => site.held(id),
    known: id => Boolean(site.summary(id)),
    edition: reference => {
      const editions = site.index.documents.filter(other => other.reference === reference);
      return (
        editions.find(other => doc.release !== null && other.release === doc.release) ?? newestOf(editions, reference)
      )?.id;
    },
  };
}

/**
 * Where a name's definition is, past the rows that list it as another document's: a Reused AVPs row's From, or another
 * table's Defined-In, names the document defining it. `place` is the clause that link names, as a link's own is, or
 * where that document only reuses the AVP in turn, the clause its row links to there, as far as the documents loaded go;
 * `pending` the document to load to go further; `missing` the document as the row prints it where the build does not
 * hold it.
 */
export interface Origin {
  place?: Place;
  pending?: string;
  missing?: string;
}

/** A row's cell naming another document than its own, with the place it links to, if any: none where it names no document the corpus has. */
function originCell(line: Line, name: ValueToken, document: string): ValueToken | undefined {
  return line.tokens.find(
    token => token !== name && !token.avp && token.target && token.target.document !== document,
  ) as ValueToken | undefined;
}

/** The cell a row prints for the document defining its AVP, Reused AVPs' From or a table's Defined-In: what the row says where no link does. */
const originText = (row: AvpRow) => row.cells.find(([column]) => column === 'From' || column === 'Defined-In')?.[1];

/** The row of a file defining a name: one giving its code in an AVP table, else the first listing it. */
const definingRow = (file: DadFile, name: string): AvpRow | undefined => {
  const rows = avpRows(file, name);
  return rows.find(row => row.type === 'AVP Table' && row.code !== null) ?? rows[0];
};

/** Follows a link to the document defining a name to its row there, and on through documents reusing it in turn. */
export function followOrigin(
  target: Target,
  name: string,
  resolve: Resolver,
  printed?: string,
  seen: Set<string> = new Set(),
): Origin {
  let document = target.document;
  if (!resolve.known(document)) {
    const other = printed ? resolve.edition(printed) : undefined;
    if (!other) return { missing: printed ?? document };
    document = other;
  }
  const clause: Place = { document, target: { document, section: target.section, name } };
  if (seen.has(document)) return { place: clause };
  seen.add(document);
  const file = resolve.held(document);
  if (!file) return { place: clause, pending: document };
  // The clause the link names is the definition, as a link's is, unless that document only reuses the AVP in turn.
  const row = definingRow(file, name);
  if (!row || (row.type === 'AVP Table' && row.code !== null)) return { place: clause };
  const nameToken = file.lines[row.line]?.tokens.find(token => token.avp === name) as ValueToken | undefined;
  const next = nameToken && originCell(file.lines[row.line], nameToken, document);
  if (!next?.target) return { place: clause };
  const further = followOrigin(next.target, next.target.name ?? name, resolve, next.text, seen);
  return further.place || further.missing ? further : { place: clause };
}

interface Row {
  token: ValueToken;
  line: number;
}
interface FileIndex {
  rows: Map<string, Row[]>;
  anchors: Set<string>;
}

const indexes = new WeakMap<Line[], FileIndex>();

/**
 * A file's AVP table rows by name, a clause's stated origins among them, and the clauses it has a line for.
 * Read once, since a pointer passing over a name asks again.
 */
function fileIndex(lines: Line[]): FileIndex {
  let index = indexes.get(lines);
  if (index) return index;
  index = { rows: new Map(), anchors: new Set() };
  for (const [line, { tokens, anchor }] of lines.entries()) {
    if (anchor) index.anchors.add(anchor);
    for (const token of tokens as ValueToken[]) {
      if (!token.avp || !(token.source?.row || token.details)) continue;
      const rows = index.rows.get(token.avp);
      if (rows) rows.push({ token, line });
      else index.rows.set(token.avp, [{ token, line }]);
    }
  }
  indexes.set(lines, index);
  return index;
}

const sameTarget = (a: ValueToken, b: ValueToken) =>
  a.target?.document === b.target?.document && a.target?.section === b.target?.section;

/**
 * What an AVP's name can jump to, the same wherever in the file it is asked. Its Definition is the clause its link
 * names if that is another document's, else the first row listing it, which is the line the view goes to as well;
 * with no row, the clause its link names. Its Details are that row's, and the view goes there if it has that clause.
 * Where that row lists the AVP as another document's, a Reused AVPs row naming the document it is From, the row is
 * where it is `listed`, and with a `resolve` of the documents the build holds its Definition is its row there
 * (`followOrigin`), `pending` the document to load to say more, or `missing` the document the build does not hold.
 */
export function namePlaces(
  token: ValueToken,
  lines: Line[],
  doc: Pick<Document, 'id'>,
  resolve?: Resolver,
  file?: DadFile,
): { definition?: Place; details?: Place; listed?: Place; pending?: string; missing?: string } {
  const { rows, anchors } = fileIndex(lines);
  const listed = rows.get(token.avp ?? '')?.filter(row => sameTarget(row.token, token)) ?? [];
  const row = listed.find(other => other.token.details) ?? listed[0];
  const name = token.target?.name ?? token.avp;
  const here = (position: SourcePosition, extra: Partial<Place> = {}): Place => ({
    document: doc.id,
    position,
    ...extra,
  });
  const details = row?.token.details;
  const detailsPlace =
    details &&
    here(details, anchors.has(details.section) ? { target: { document: doc.id, section: details.section, name } } : {});
  let definition: Place | undefined;
  const rowPlace =
    row &&
    here(row.token.source!, {
      target: { document: doc.id, section: row.token.source!.section, name },
      line: row.line,
    });
  const fromCell = row && originCell(lines[row.line], row.token, doc.id);
  // The row a file prints for an AVP another document defines, by what it prints where it links nowhere.
  const fromText =
    row && !fromCell && file && token.avp
      ? avpRows(file, token.avp)
          .filter(other => other.line === row.line && other.type === 'Reused AVPs')
          .map(originText)
          .find(text => text && text !== '-')
      : undefined;
  if (rowPlace && (fromCell?.target || fromText) && resolve) {
    const origin = fromCell?.target
      ? followOrigin(fromCell.target, fromCell.target.name ?? name ?? '', resolve, fromCell.text)
      : { missing: fromText };
    return {
      ...(origin.place ? { definition: origin.place } : {}),
      ...(detailsPlace ? { details: detailsPlace } : {}),
      listed: rowPlace,
      ...(origin.pending ? { pending: origin.pending } : {}),
      ...(origin.missing ? { missing: origin.missing } : {}),
    };
  }
  if (token.target && (token.target.document !== doc.id || !row)) {
    const target = { ...token.target, name };
    // A link to a document the build does not hold goes there as it is, which the page then says.
    const origin =
      resolve && token.target.document !== doc.id && resolve.known(token.target.document)
        ? followOrigin(target, name ?? '', resolve)
        : { place: { document: token.target.document, target } };
    return {
      ...(origin.place ? { definition: origin.place } : {}),
      ...(detailsPlace ? { details: detailsPlace } : {}),
      ...(origin.pending ? { pending: origin.pending } : {}),
      ...(origin.missing ? { missing: origin.missing } : {}),
    };
  }
  definition = rowPlace;
  return { ...(definition ? { definition } : {}), ...(detailsPlace ? { details: detailsPlace } : {}) };
}

const other = (target: ClickTarget): ClickTarget => (target === 'details' ? 'definition' : 'details');

/** A name's places in the order a click tries them: the one chosen, then the other. A command has its block alone. */
function nameOrder(
  token: ValueToken,
  lines: Line[],
  doc: Pick<Document, 'id'>,
  prefer: ClickTarget,
  commands?: CommandIndex,
  names: NameSources = {},
): Place[] {
  const places: { definition?: Place; details?: Place; listed?: Place } = token.command
    ? commandPlaces(token.command, doc, commands)
    : namePlaces(token, lines, doc, names.resolve, names.file);
  // A reused AVP read in the clause of its Details, as on the Grouped rule a document prints for it, goes to its
  // Definition in the document defining it first; its row in this document is where a click goes where neither is.
  const first =
    places.listed &&
    places.definition &&
    names.section !== undefined &&
    places.details?.target?.section === names.section
      ? 'definition'
      : prefer;
  const order: ('definition' | 'details' | 'listed')[] = [first, other(first), 'listed'];
  return order.flatMap(of => (places[of] ? [{ ...places[of], of: of === 'listed' ? 'definition' : of } as Place] : []));
}

/**
 * What resolves a name's places beyond this file: the documents the build holds, the file its rows are read from, and
 * the section of the line it is read on.
 */
export interface NameSources {
  resolve?: Resolver;
  file?: DadFile;
  section?: string;
}

/** Where a result code's origin lists it: its row in the clause its `from` links to, in the pane as in the view. */
export function originPlace(row: ValueRow): Place | undefined {
  const target = row.origin?.target;
  if (!target?.section) return undefined;
  return {
    document: target.document,
    position: { section: target.section, page: null, name: row.name, row: true, value: row.value, titled: true },
    target: { ...target, name: row.name },
  };
}

/**
 * Where a click on a token goes: a name to the place chosen for it, its Details or its Definition, else to the other;
 * a value's name to its row, its origin to the row there, a command's to its block, any other link to its Details
 * or its own place.
 */
export function tokenPlace(
  token: ValueToken,
  lines: Line[],
  doc: Pick<Document, 'id'>,
  section: string | undefined,
  prefer: ClickTarget = 'details',
  commands?: CommandIndex,
  names: NameSources = {},
): Place | undefined {
  if (token.valueRow)
    return { document: doc.id, position: token.source!, target: { ...token.target!, name: token.valueRow.name } };
  if (token.originOf) return originPlace(token.originOf);
  if (token.command) return nameOrder(token, lines, doc, prefer, commands)[0];
  if (token.avp) {
    return (
      nameOrder(token, lines, doc, prefer, undefined, { ...names, section })[0] ??
      (section
        ? { document: doc.id, position: { section, page: null, name: token.avp, exact: true, occurrence: true } }
        : undefined)
    );
  }
  const position = token.details ?? token.source ?? undefined;
  if (token.target)
    return position
      ? { document: doc.id, position, target: token.target }
      : { document: token.target.document, target: token.target };
  if (!position) return undefined;
  return {
    document: doc.id,
    position,
    ...(fileIndex(lines).anchors.has(position.section)
      ? { target: { document: doc.id, section: position.section } }
      : {}),
  };
}

/** A name's other place, where it has both: what a click falls back on where it cannot go to the one chosen. */
export function fallbackPlace(
  token: ValueToken,
  lines: Line[],
  doc: Pick<Document, 'id'>,
  prefer: ClickTarget = 'details',
  commands?: CommandIndex,
  names: NameSources = {},
): Place | undefined {
  return token.avp || token.command ? nameOrder(token, lines, doc, prefer, commands, names)[1] : undefined;
}

/** The route that moves the view to a place and the pane with it, a switched-off pane only in what it will show when switched on. Only this document has this view's raw text. */
export function placeRoute(place: Place, doc: Pick<Document, 'id'>, raw: boolean, paneHidden = false): string {
  const target = place.target!;
  return routeFor(target, {
    ...(raw && target.document === doc.id ? { raw } : {}),
    ...(paneHidden ? { paneHidden } : {}),
    ...(place.line === undefined ? {} : { line: place.line }),
    ...(place.position ? { source: { document: place.document, position: place.position } } : {}),
  });
}

/**
 * Where the source prints line `line` of a file, where that line is a row or a member naming `name`, or anything where
 * no name is asked: a row of an Information Elements or AVP table as the row naming it, from its table's page; a value
 * table's row by its name beside its number; a member of a rule as its name's first mention on the block's page.
 * Nothing for any other line, or one naming another name, whose clause is all that is known of it.
 */
export function linePosition(file: DadFile, line: number, name?: string | null): SourcePosition | undefined {
  const block = blockAt(file, line);
  if (!block) return undefined;
  const at = { section: block.section, page: block.page };
  const names = (found: string | null | undefined) => Boolean(found) && (!name || found === name);
  const elementRow = block.element_rows?.find(row => row.line === line);
  const avp = elementRow?.avps?.find(names);
  if (avp) return { ...at, name: avp, row: true };
  const tableRow = block.rows?.find(row => row.line === line);
  if (tableRow && names(tableRow.name)) return { ...at, name: tableRow.name, row: true };
  const valueRow = block.value_rows?.find(row => row.line === line);
  if (valueRow && names(valueRow.name)) return { ...at, name: valueRow.name, row: true, value: valueRow.value };
  const member = block.rule?.members.find(member => member.line === line);
  if (!member || !names(member.name)) return undefined;
  // On its block's page, the name's first mention there; with no page, the clause and the name.
  return block.page ? { ...at, name: member.name, exact: true, occurrence: true } : { ...at, name: member.name };
}

/**
 * Where the source prints a place of another document once that document is loaded: a line known by its line alone,
 * as `linePosition` reads it, or a value's row known by its clause and name, as an interpreted rule links a value that
 * document defines. Nothing where neither says more than the clause.
 */
export function heldPosition(
  file: DadFile,
  { line, target }: Pick<Place, 'line' | 'target'>,
): SourcePosition | undefined {
  if (line !== undefined) return linePosition(file, line, target?.name);
  return target?.name && target.section ? valueRowAt(file, target.section, target.name)?.position : undefined;
}
