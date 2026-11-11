import type { ClickTarget } from './click-target.ts';
import { commandPlaces } from './command-places.ts';
import type { CommandIndex } from './commands.ts';
import { routeFor } from './navigation.ts';
import type { SourcePosition } from './navigation.ts';
import { blockAt } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import type { Document, Line, Target } from './types.ts';
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
    const { cell, place } = describedAt(line, name, doc.id);
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
    if (cell) cell.details = details;
  }
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
 */
export function namePlaces(
  token: ValueToken,
  lines: Line[],
  doc: Pick<Document, 'id'>,
): { definition?: Place; details?: Place } {
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
  if (token.target && (token.target.document !== doc.id || !row))
    definition = { document: token.target.document, target: { ...token.target, name } };
  else if (row)
    definition = here(row.token.source!, {
      target: { document: doc.id, section: row.token.source!.section, name },
      line: row.line,
    });
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
): Place[] {
  const places: { definition?: Place; details?: Place } = token.command
    ? commandPlaces(token.command, doc, commands)
    : namePlaces(token, lines, doc);
  return [prefer, other(prefer)].flatMap(of => (places[of] ? [{ ...places[of], of }] : []));
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
): Place | undefined {
  if (token.valueRow)
    return { document: doc.id, position: token.source!, target: { ...token.target!, name: token.valueRow.name } };
  if (token.originOf) return originPlace(token.originOf);
  if (token.command) return nameOrder(token, lines, doc, prefer, commands)[0];
  if (token.avp) {
    return (
      nameOrder(token, lines, doc, prefer)[0] ??
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
): Place | undefined {
  return token.avp || token.command ? nameOrder(token, lines, doc, prefer, commands)[1] : undefined;
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
