import { Fragment } from 'preact';
import type { ComponentChild } from 'preact';
import { useLayoutEffect, useMemo, useState } from 'preact/hooks';
import {
  avpRows,
  bitMeaning,
  bitRule,
  columnNotes,
  commandsBeside,
  encryptOf,
  flagTable,
  groupedRules,
  otherCells,
  presenceText,
  ruleAt,
  sayOnce,
  useAt,
} from '../avp-context.ts';
import type { AvpRow, FlagRule, Rule, Said, Use } from '../avp-context.ts';
import { avpIdentities, avpTables } from '../avp-facts.ts';
import type { AvpIdentity } from '../avp-facts.ts';
import { namePlaces, resolverOf } from '../avp-places.ts';
import type { Place } from '../avp-places.ts';
import { avpRows as rowsOf, blockAt } from '../blocks.ts';
import type { DadFile } from '../blocks.ts';
import type { Site } from '../data.ts';
import { constraintBlocks, referenceText, requestMessage, scopeMessage } from '../constraints.ts';
import type { ConstraintRef } from '../constraints.ts';
import { elementPlace, memberPlaces } from '../element-places.ts';
import { blockRowKey, elementText, memberElements, sameElementRow, tablesFor, tablesOf } from '../elements.ts';
import type { Block } from '../types.ts';
import { valueTableTitle } from '../values.ts';
import { ConstraintFacts } from './constraints.tsx';
import type { PopupProps, PopupRequest } from './root.tsx';
import {
  Counted,
  Entries,
  JumpLink,
  Panel,
  placeRows,
  RuleContents,
  SourceButton,
  Steps,
  TableLink,
} from './shared.tsx';
import { avpPopup as words, flagText, popupShared } from '../text/popup.ts';
import { tableName } from '../text/terms.ts';

/** An identity in a line: "Code 1405 · Vendor-ID 10415 · Unsigned32". IETF's vendor 0 is no vendor to name. */
const identityText = ({ code, vendor, type }: AvpIdentity) =>
  [code === undefined ? '' : words.code(code), vendor ? words.vendor(vendor) : '', type ?? '']
    .filter(Boolean)
    .join(' · ');

/**
 * The files at hand for a name: the one defining it, where a row here lists it as another document's and that one is
 * loaded, or else the one its link names if loaded, then this one.
 */
function filesOf(
  site: Site,
  { token, doc, file }: PopupRequest,
  defining?: string,
): { file: DadFile; name: string; document: string }[] {
  const name = token.avp!;
  const linked = token.target && token.target.document !== doc.id ? token.target.document : undefined;
  const id = defining && defining !== doc.id ? defining : linked;
  const away = id ? site.held(id) : undefined;
  return [
    ...(away ? [{ file: away, name: (id === linked && token.target!.name) || name, document: away.id }] : []),
    { file, name, document: doc.id },
  ];
}

const flagWords: Record<FlagRule, string> = flagText.words;
const flagHeading: Record<FlagRule, string> = flagText.headings;
const tableOf = (row: AvpRow) => [row.type, row.table ?? row.section].filter(Boolean).join(' ');
const ruleName = (rule: Rule) => words.ruleName(rule.kind === 'Message' ? words.command : rule.kind, rule.label);

/**
 * The member line a name an interpreted rule reads is, where the rule's path reaches it: in the grouped AVP before it,
 * the request, the block's command or grouped AVP, or its own AVP. None where the file prints no such member.
 */
function reachedPlace(file: DadFile, document: string, block: Block, ref: ConstraintRef): Place | undefined {
  const name = ref.path[ref.path.length - 1];
  const parent = ref.path.length > 1 ? ref.path[ref.path.length - 2] : undefined;
  const item = constraintBlocks(file).find(found => found.block === block);
  const grouped = (avp: string) => file.blocks.find(found => found.type === 'Grouped AVP' && found.rule?.name === avp);
  const holder = parent
    ? grouped(parent)
    : ref.root === 'request'
      ? requestMessage(file, block)
      : item?.scope.command
        ? scopeMessage(file, item)
        : grouped(item?.scope.within ?? block.name ?? '');
  const member = holder?.rule?.members.find(found => found.name === name);
  if (!holder || !member) return undefined;
  return {
    document,
    position: { section: holder.section, page: holder.page },
    target: { document, section: holder.section, name },
    line: member.line,
  };
}

/** What one Information Elements row says of a member, and the row saying it, which may be in another document. */
interface ElementClaim {
  text: string;
  place: Place;
  /** The row's document, clause and table, as the link to it says them. */
  where: string;
}

/** A claim on a line of its own, with the way to the place stating it right after it. */
function Claim({
  site,
  pane,
  request,
  claim,
}: {
  site: Site;
  pane: PopupProps['pane'];
  request: PopupRequest;
  claim: ElementClaim;
}) {
  return (
    <div class="popup-element popup-claim">
      <span class="claim-text">{claim.text}</span>
      <span class="claim-source">
        <JumpLink site={site} pane={pane} request={request} place={claim.place}>
          {claim.where}
        </JumpLink>
        <SourceButton site={site} pane={pane} request={request} place={claim.place} />
      </span>
    </div>
  );
}

/**
 * What the line opened on says of the name: the rule it is a member of and how, with the way to the line in the
 * source, which says its brackets and its bold, the rule it heads, the row it is, and what the Information Elements
 * tables say of it: `notes` said of the row opened on, and `claims` of a member, each with the row saying it.
 */
function UseContext({
  site,
  pane,
  request,
  use,
  elements: { notes, claims },
}: {
  site: Site;
  pane: PopupProps['pane'];
  request: PopupRequest;
  use: Use;
  elements: { notes: string[]; claims: ElementClaim[] };
}) {
  const document = request.doc.id;
  const lines: ComponentChild[] = [];
  if (use.kind === 'member') {
    const { rule, member } = use;
    const line: Place = {
      document,
      position: {
        section: rule.section,
        page: blockAt(request.file, rule.line)?.page ?? null,
        name: member.name,
        exact: true,
        occurrence: true,
      },
      target: { document, section: rule.section, name: member.name },
      line: member.line,
    };
    lines.push(
      <p class="popup-here">
        {words.inRule(ruleName(rule), rule.section)}{' '}
        <SourceButton site={site} pane={pane} request={request} place={line} />
      </p>,
    );
    lines.push(<p class="presence">{presenceText(member)}</p>);
    if (member.bold) lines.push(<p class="fact-note">{words.bold}</p>);
    if (member.struck) lines.push(<p class="fact-note">{words.struckLeftOut}</p>);
    else if (member.strikethrough) lines.push(<p class="fact-note">{words.struck}</p>);
  } else if (use.kind === 'head') {
    lines.push(<p>{words.ruleOf(ruleName(use.rule), use.rule.section)}</p>);
  } else if (use.kind === 'constraint') {
    const { block, role } = use;
    const on = block.name ?? block.fields.AVP;
    const scope = block.fields.Within
      ? words.within(block.fields.Within)
      : block.fields.Command
        ? words.in(block.fields.Command)
        : '';
    const { ref } = use;
    const parents = ref?.path.slice(0, -1).join(words.pathJoin);
    const holder = ref && (parents ? (ref.root ? words.requests(parents) : parents) : ref.root ? words.theRequest : '');
    const what =
      role === 'subject'
        ? words.constraintSubject(scope)
        : role === 'scope'
          ? words.constraintScope(on!)
          : role === 'member'
            ? words.constraintMember(on!, scope)
            : holder
              ? words.constraintReached(holder, on!, scope)
              : words.constraintCondition(on!, scope);
    lines.push(<p>{words.here(what, block.section)}</p>);
  } else if (use.kind === 'element') {
    const { block } = use;
    const of = block.name ? words.elementOf(block.name) : words.element;
    lines.push(
      <p>
        {words.hereElement(of)}
        {block.fields.Table ? (
          <TableLink site={site} document={document} table={block.fields.Table} />
        ) : (
          words.informationElements
        )}
        {block.section ? ` · ${block.section}` : ''}
      </p>,
    );
  } else
    lines.push(
      <p>
        {words.hereRow(use.row.type)}
        {use.row.table ? (
          <TableLink site={site} document={document} table={use.row.table} text={use.row.table} />
        ) : (
          use.row.section
        )}
      </p>,
    );
  for (const text of notes) lines.push(<p class="popup-element">{text}</p>);
  for (const claim of claims) lines.push(<Claim site={site} pane={pane} request={request} claim={claim} />);
  return <div class="popup-context">{lines}</div>;
}

/** A row's M and V bits as its table prints them, only the columns that hold one, each cell's meaning its tip. */
function FlagsTable({ columns }: { columns: ReturnType<typeof flagTable> }) {
  return (
    <table class="popup-flags">
      <thead>
        <tr>
          {columns.map(([rule]) => (
            <th key={rule} scope="col">
              {flagHeading[rule]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {columns.map(([rule, bits]) => (
            <td
              key={rule}
              class={`flag-${rule.replace(' ', '-')}`}
              title={bits.map(bit => flagText.cell(bit, flagWords[rule], bitMeaning[bit])).join('\n')}
            >
              {bits.join(', ')}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** A row as the lines under another name it: its table, and its document where that is another. */
function rowLabel(site: Site, request: PopupRequest, { row, document }: DefinitionRow) {
  const summary = document !== request.doc.id ? site.summary(document) : undefined;
  return [tableOf(row), summary ? site.label(summary) : ''].filter(Boolean).join(' · ');
}

/** What the popup shares with the lines it draws under a row, to link to the rows they name. */
interface RowContext {
  site: Site;
  pane: PopupProps['pane'];
  request: PopupRequest;
}

/**
 * Under a row, the rows it says all that, or the flags that, other tables' rows say, `prefix` before them, each a link
 * to its row: "Also in AVP Table 6.3.0.1 · TS 29.229".
 */
function AlsoLine({ context, rows, prefix }: { context: RowContext; rows: DefinitionRow[]; prefix: string }) {
  if (!rows.length) return null;
  const { site, pane, request } = context;
  return (
    <p class="popup-also">
      {prefix}
      {rows.map((other, index) => (
        <Fragment key={index}>
          {index > 0 && words.alsoBetween}
          <JumpLink site={site} pane={pane} request={request} place={other.place}>
            {rowLabel(site, request, other)}
          </JumpLink>
        </Fragment>
      ))}
    </p>
  );
}

/** How a row's flags differ from those of the row above giving flags, bit by bit. */
function FlagsDiffer({ context, item }: { context: RowContext; item: DefinitionRow }) {
  if (!item.differs) return null;
  const { from, bits } = item.differs;
  const rule = (said?: FlagRule) => (said ? flagWords[said] : words.notStated);
  return (
    <p class="popup-row-note flags-differ">
      {words.flagsDiffer(
        rowLabel(context.site, context.request, from),
        from.applies,
        bits.map(([bit, ours, theirs]) => words.bitDiffers(bit, rule(ours), rule(theirs))).join(words.bitsBetween),
      )}
    </p>
  );
}

/**
 * A row's flags, then its other cells: From, its marks. Its title says which table it is of, a link to the row, with
 * Show in source; its flags are left out where a row above gives the same. `keyButton`, the "?" button, goes after its
 * flags, or after its first cell. Under it, the other rows saying the same.
 */
function RowFacts({
  context,
  item,
  applies,
  role,
  keyButton,
}: {
  context: RowContext;
  item: DefinitionRow;
  applies: boolean;
  /** What the row is among the places the AVP is declared at, which its title then says, as no place repeats it. */
  role?: string;
  keyButton?: ComponentChild;
}) {
  const { site, pane, request } = context;
  const { row } = item;
  const columns = item.flagsShown ? [] : flagTable(row);
  const cells = otherCells(row);
  const summary = item.document !== request.doc.id ? site.summary(item.document) : undefined;
  const rest = [item.applications.join(', '), summary ? site.label(summary) : ''].filter(Boolean).join(' · ');
  return (
    <div class={applies ? 'popup-row popup-row-here' : 'popup-row'}>
      <div class="popup-row-title">
        <JumpLink site={site} pane={pane} request={request} place={item.place}>
          {tableOf(row)}
        </JumpLink>
        {rest && ` · ${rest}`}
        {role && <span class="popup-row-role">{words.rowRole(role)}</span>}
        {applies && <span class="popup-row-applies">{words.appliesHere}</span>}{' '}
        <SourceButton site={site} pane={pane} request={request} place={item.place} />
      </div>
      <FlagsDiffer context={context} item={item} />
      {columns.length > 0 && (
        <div class="popup-flags-line">
          <FlagsTable columns={columns} />
          {keyButton}
        </div>
      )}
      {cells.length > 0 && (
        <dl class="popup-facts">
          {cells.map(([column, text], index) => (
            <Fragment key={column}>
              <dt title={columnNotes[column] || undefined}>{column}</dt>
              <dd>
                {text}
                {keyButton && !columns.length && !index && [' ', keyButton]}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      <AlsoLine context={context} rows={item.also} prefix={words.alsoIn} />
      <AlsoLine context={context} rows={item.sameFlagsIn} prefix={words.sameFlagsIn} />
    </div>
  );
}

/**
 * The row the popup was opened on, which the text prints beside it: its flags in words, in one line, and the "?" with
 * what its columns mean, rather than its cells again; under it, the other rows saying the same.
 */
function RowLine({
  context,
  item,
  keyButton,
}: {
  context: RowContext;
  item: DefinitionRow;
  keyButton?: ComponentChild;
}) {
  const said = flagTable(item.row).map(([rule, bits]) => words.flagLine(bits.join(', '), flagWords[rule]));
  return (
    <>
      {(said.length > 0 || keyButton) && (
        <p class="popup-row-line">
          {said.join(' · ')}
          {keyButton && [said.length ? ' ' : '', keyButton]}
        </p>
      )}
      <AlsoLine context={context} rows={item.also} prefix={words.alsoIn} />
      <AlsoLine context={context} rows={item.sameFlagsIn} prefix={words.sameFlagsIn} />
    </>
  );
}

/** What the "?" button opens: what the flags' bits and the rows' columns mean, said for every AVP alike. */
function keyEntries(rows: AvpRow[]): [string, string, string?][] {
  const entries: [string, string, string?][] = [];
  /** What the rows say of something the popup leaves out: once if they agree, else each with its table. */
  const said = (value: (row: AvpRow) => string | undefined) => {
    const found = rows.flatMap(row => {
      const text = value(row);
      return text ? [[text, tableOf(row)]] : [];
    });
    if (!found.length) return undefined;
    return new Set(found.map(([text]) => text)).size === 1
      ? found[0][0]
      : found.map(([said, where]) => flagText.each(said, where)).join(', ');
  };
  if (rows.some(row => flagTable(row).length))
    for (const [bit, meaning] of Object.entries(bitMeaning)) entries.push([bit, meaning]);
  const columns = [...new Set(rows.flatMap(row => otherCells(row).map(([column]) => column)))];
  for (const column of columns) if (columnNotes[column]) entries.push([column, columnNotes[column]]);
  const p = said(row => bitRule(row, 'P') && flagWords[bitRule(row, 'P')!]);
  if (p) entries.push(['P', flagText.protectedBit, p]);
  const encrypt = said(encryptOf);
  if (encrypt) entries.push(['Encrypt', flagText.encrypt, encrypt]);
  return entries;
}

/** At most this many applications are named for a table; one for more says nothing of which. */
const NAMED_APPLICATIONS = 3;

/** A row of an AVP table the popup shows, with where it is, and what it shares with the others shown (`sayOnce`). */
type DefinitionRow = Said<{
  row: AvpRow;
  document: string;
  /** The applications its table's commands are of, as their document or the registry names them. */
  applications: string[];
  /** Its table applies to the command the name is read in. */
  applies: boolean;
  /** Where the row is: its line in the text, and its clause and page in the source. */
  place: Place;
}>;

/**
 * The rows the files at hand give a name, and the Grouped rule they give it. The row opened on comes first, then those
 * of a table that applies to the command opened in: one whose commands it is among, or in another document one for its
 * application; then this document's before another's. What several rows say alike is said once: a row saying all
 * another above it says is left out and named under it, "Also in", and the flags of a row that are those of the first
 * row giving flags are left out and the row named under that one, "Same flags in"; flags that differ from those say
 * how. Each row has the applications its table's commands are of, as their document or the registry names them.
 */
function definitionFacts(site: Site, request: PopupRequest, use: Use | undefined, defining?: string) {
  const files = filesOf(site, request, defining);
  const here = use?.kind === 'member' ? blockAt(request.file, use.rule.line) : undefined;
  const all = files.flatMap(({ file, name, document }) =>
    avpRows(file, name).map(row => {
      const commands = commandsBeside(file, row.section);
      const ids = [...new Set(commands.flatMap(block => block.command!.application_id ?? []))];
      const applications =
        ids.length > NAMED_APPLICATIONS
          ? []
          : ids.map(
              id =>
                commands.find(block => block.command!.application_id === id && block.command!.application)?.command!
                  .application ??
                site.commands()?.applications[id] ??
                words.applicationId(id),
            );
      const applies =
        !!here?.command &&
        (file === request.file
          ? commands.includes(here)
          : here.command.application_id !== null && ids.includes(here.command.application_id));
      const place: Place = {
        document,
        position: { section: row.section, page: blockAt(file, row.line)?.page ?? null, name: row.name, row: true },
        target: { document, section: row.section, name: row.name },
        line: row.line,
      };
      return { row, document, applications, applies, place };
    }),
  );
  all.sort((a, b) => Number(b.document === request.doc.id) - Number(a.document === request.doc.id));
  all.sort((a, b) => Number(b.applies) - Number(a.applies));
  if (use?.kind === 'row') all.sort((a, b) => Number(b.row === use.row) - Number(a.row === use.row));
  const rows: DefinitionRow[] = sayOnce(all).slice(0, 3);
  const rule = use?.kind === 'head' ? use.rule : files.flatMap(({ file, name }) => groupedRules(file, name))[0];
  return { rows, rule };
}

/**
 * What the Information Elements tables say of the name where it stands, and the places they offer: for a member of a
 * command, the rows naming it, each its element and category, and the way to the row; for a table's row, its element
 * and the way to the members it maps to, which may be another document's (TS 29.328's rows, TS 29.329's members).
 */
function elementFacts(
  site: Site,
  request: PopupRequest,
  use: Use | undefined,
  placeRow: ReturnType<typeof placeRows>,
): { notes: string[]; claims: ElementClaim[]; places: ComponentChild[] } {
  const { doc, file } = request;
  const name = request.token.avp!;
  const index = site.elements();
  const label = (document: string) =>
    document === doc.id ? '' : site.summary(document) ? site.label(site.summary(document)!) : document;
  if (use?.kind === 'member') {
    const block = blockAt(file, use.rule.line);
    const found = block ? memberElements(tablesFor(index, doc.id, block, file), use.member.name) : [];
    // Each row stating the member's element and category, with the way to that row: in its table, which may be
    // another document's, and in the source at the table's page.
    return {
      notes: [],
      claims: found.map(({ table, row }) => ({
        text: words.elementLine(elementText(row)),
        place: elementPlace(table, row, name, file, doc),
        where: [label(table.document), table.section, table.table ? tableName(table.table) : '']
          .filter(Boolean)
          .join(' · '),
      })),
      places: [],
    };
  }
  if (use?.kind !== 'element') return { notes: [], claims: [], places: [] };
  const { block, row } = use;
  const key = blockRowKey(block, row);
  // A row set off under a grouped AVP's row describes that AVP's member: it goes to the row it is set off under.
  if (key.parents.length) {
    const rows = block.element_rows ?? [];
    const parent = rows.slice(0, rows.indexOf(row)).findLast(other => (other.depth ?? 0) < (row.depth ?? 0));
    const avp = key.parents[key.parents.length - 1];
    const place = parent && {
      document: doc.id,
      position: { section: block.section, page: block.page, name: avp, row: true },
      target: { document: doc.id, section: block.section, name: avp },
      line: parent.line,
    };
    return {
      notes: [words.elementLine(elementText(row)), words.setOffUnder(key.parents.join(words.parentsBetween))],
      claims: [],
      places: place ? [placeRow(words.underRow, 'place-element', place, avp)].filter(item => item !== undefined) : [],
    };
  }
  const tables = tablesOf(index, doc.id, block);
  const places = tables.flatMap(table => {
    const indexed = table.rows.find(other => sameElementRow(other, key) && other.avps.includes(name));
    const { message } = table;
    return indexed
      ? memberPlaces(table, indexed, file, doc)
          .filter(({ member }) => member === name)
          .map(({ place }) =>
            placeRow(
              words.member,
              'place-member',
              place,
              [label(message.document), message.section, message.name].filter(Boolean).join(' · '),
            ),
          )
          .filter(row => row !== undefined)
      : [];
  });
  // A table naming no command, or one the corpus prints for several applications, describes no one rule.
  const unplaced = !block.name
    ? words.noCommand
    : !tables.length
      ? words.noRule(block.name)
      : !places.length
        ? words.notMember(block.name)
        : '';
  return { notes: [words.elementLine(elementText(row)), unplaced].filter(Boolean), claims: [], places };
}

/** A place as the row it is: its document and line. */
const placeKey = (place: Place) => `${place.document}:${place.line}`;

let keys = 0;
const lineOf = (node: Element) => node.closest<HTMLElement>('.dad-line')!;

/**
 * An AVP's popup: what the files at hand say it is, what the line it stands on says of it, its rows and rule, its
 * places and its uses. A walk to a use draws it as if opened there: that line's "Here:", rows and Contents, its places,
 * and placed by it. Close and Escape still give the focus back to the name opened on.
 */
export function AvpPopup(props: PopupProps) {
  const { site, pane, request: opened, at, step, keyOpen, toggleKey, demand } = props;
  const { doc, lines, opener, documentPane, recordJump, jumpTo } = opened;
  const name = opened.token.avp!;
  const [keyId] = useState(() => `popup-key-${++keys}`);
  // The uses in the text, one a line, and how the list says each: they stay as they were while the popup is open.
  const { uses, entries } = useMemo(() => {
    const seen = new Set<Element>();
    const uses = [...documentPane.querySelectorAll<HTMLElement>('[data-avp]')].filter(node => {
      if (node.dataset.avp !== name || seen.has(lineOf(node))) return false;
      seen.add(lineOf(node));
      return true;
    });
    const entries = uses.map(node => {
      const line = lineOf(node);
      // The spacing only aligns the line with its neighbours in the file.
      const text = lines[Number(line.dataset.line)].tokens
        .filter(token => !token.kind)
        .map(token => token.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      // The rule a member line is in, as a command is abbreviated: a bare `[ TMGI ]` says nothing of which.
      const rule = ruleAt(opened.file, Number(line.dataset.line));
      const inRule = rule && rule.line !== Number(line.dataset.line) ? `${rule.short} · ` : '';
      const label = `${line.dataset.section ?? ''} · ${inRule}${text}`;
      return { text: label, title: label };
    });
    return { uses, entries };
  }, []);
  const active =
    at !== undefined && at < uses.length
      ? at
      : Math.max(
          0,
          uses.findIndex(node => lineOf(node) === lineOf(opener)),
        );
  const stepped = at !== undefined ? uses[active] : undefined;
  const here = stepped ?? opener;
  const token =
    (here !== opener && lines[Number(lineOf(here).dataset.line)].tokens[Number(here.dataset.token)]) || opened.token;
  const request: PopupRequest = { ...opened, token };
  const placeRow = placeRows(site, pane, request);
  const away = token.target?.document;
  useLayoutEffect(() => demand(away), [away]);
  // Where it is declared: its definition, through the documents reusing it, its row here, its rule and its Details.
  const declared = namePlaces(token, lines, doc, resolverOf(site, doc), request.file);
  const defining = declared.definition?.document;
  // Each document the way to the definition passes through, loaded as it is reached.
  useLayoutEffect(() => demand(declared.pending), [declared.pending]);
  useLayoutEffect(() => {
    // The inspector marks no name: a popup's mark goes when it closes, which the inspector never does.
    if (!stepped || props.inline) return;
    for (const node of document.querySelectorAll('.avp-current')) node.classList.remove('avp-current');
    stepped.classList.add('avp-current');
  }, [stepped]);

  // What the files at hand say a name is, and the tables of its numbers: this one's, and the one its link names if
  // that has been loaded already. A table here is gone to in the pane at its first row, a result code's at its clause,
  // an `Enumerated AVP` block as Details are; one in another document at its clause there.
  const files = filesOf(site, request, defining);
  const identities = avpIdentities(files).map(identityText).filter(Boolean);
  const tables = files
    .toReversed()
    .flatMap(({ file, name, document }) =>
      avpTables(file, name).map(table => {
        const { section, page, line } = table;
        const position = !('rows' in table)
          ? { section, page, name, row: true, titled: true }
          : table.kind === 'result-codes'
            ? { section, page }
            : table.rows[0].position;
        const place: Place = {
          document,
          ...(document === doc.id ? { position } : {}),
          target: { document, section },
          line,
        };
        return placeRow('rows' in table ? valueTableTitle(table) : words.enumerated, 'place-table', place);
      }),
    )
    .filter(row => row !== undefined);
  const use = useAt(request.file, Number(lineOf(here).dataset.line), name, request.token);
  const { rows: definitionRows, rule } = definitionFacts(site, request, use, defining);
  const key = definitionRows.length ? keyEntries(definitionRows.map(({ row }) => row)) : [];
  const keyed = definitionRows.find(item => flagTable(item.row).length && !item.flagsShown) ?? definitionRows[0];
  const keyButton =
    key.length > 0 ? (
      <button
        class="control popup-key-button"
        type="button"
        title={flagText.key}
        aria-label={flagText.key}
        aria-controls={keyId}
        aria-expanded={keyOpen}
        onClick={toggleKey}
      >
        ?
      </button>
    ) : undefined;
  const { definition, details, listed, missing } = declared;
  const elements = elementFacts(site, request, use, placeRow);
  const rowContext: RowContext = { site, pane, request };
  // A name an interpreted rule reads: the member it is where the rule's path reaches it, in this file.
  const reached =
    use?.kind === 'constraint' && use.ref ? reachedPlace(request.file, doc.id, use.block, use.ref) : undefined;
  // Every place it is declared, but the one opened on, which the "Here:" line names.
  const openedRow = use?.kind === 'row' ? use.row.line : undefined;
  // A row whose title links to it, or one named under such a row, is a way there already: no place says it again.
  const linked = new Set(
    definitionRows.flatMap(item => [item, ...item.also, ...item.sameFlagsIn]).map(item => placeKey(item.place)),
  );
  const onRow = (place: Place | undefined) =>
    (place?.document === doc.id && place.line === openedRow) ||
    (place?.line !== undefined && linked.has(placeKey(place)));
  const ownRule = groupedRules(request.file, name)[0];
  const rulePlace: Place | undefined = ownRule && {
    document: doc.id,
    position: { section: ownRule.section, page: blockAt(request.file, ownRule.line)?.page ?? null },
    target: { document: doc.id, section: ownRule.section, name },
    line: ownRule.line,
  };
  const listedTable = listed && rowsOf(request.file, name).find(row => row.line === listed.line)?.table;
  const definitionLabel = (place: Place) => {
    const summary = site.summary(place.document);
    const section = place.target?.section ?? place.position?.section ?? '';
    return place.document === doc.id || !summary ? undefined : [site.label(summary), section].join(' · ');
  };
  const placed = [
    definition && !onRow(definition)
      ? placeRow(words.definition, 'place-definition', definition, definitionLabel(definition))
      : missing && (
          <div key="missing" class="popup-place place-definition place-missing">
            <span>{popupShared.placeLabel(words.definition)}</span>
            <span class="place-cell">{words.notHeld(referenceText(missing))}</span>
          </div>
        ),
    listed &&
      !onRow(listed) &&
      placeRow(
        words.reused,
        'place-reused',
        listed,
        undefined,
        listedTable ? { document: doc.id, table: listedTable } : undefined,
      ),
    rulePlace && use?.kind !== 'head' && placeRow(words.rule, 'place-rule', rulePlace),
    // A clause the rule is in, or the one opened on, says no more than the rule's own place.
    details &&
      details.position?.section !== rulePlace?.position?.section &&
      !(use?.kind === 'head' && details.position?.section === use.rule.section) &&
      placeRow(words.details, 'place-details', details),
    ...elements.places,
    reached && placeRow(words.member, 'place-member', reached),
  ];
  const hasPlaces = placed.some(Boolean) || tables.length > 0;
  // A row shown whose place is left out above says what that place was.
  const roleOf = (item: DefinitionRow) => {
    const key = placeKey(item.place);
    if (definition?.line !== undefined && placeKey(definition) === key) return words.definition;
    if (listed?.line !== undefined && placeKey(listed) === key) return words.reused;
    return undefined;
  };

  // The text goes to the use, and the popup is drawn for it, as the reader left it.
  const select = (index: number) => {
    if (!uses.length) return;
    recordJump();
    const to = (index + uses.length) % uses.length;
    const node = uses[to];
    jumpTo(node);
    const line = lineOf(node);
    const position = doc.sections.find(section => section.section === line.dataset.section);
    const row = lines[Number(line.dataset.line)].tokens.find(token => token.avp === name && token.source?.row)?.source;
    if (position && pane.readsDocument())
      pane.show(row ?? { ...position, name, exact: true, occurrence: true }, doc, true);
    step(to, node);
  };

  return (
    <Panel {...props} heading={name} data={{ 'data-avp': name }} alignLabels>
      {identities.length > 0 && (
        <div class="popup-identity">
          {identities.map((text, index) => (
            <p key={index}>{text}</p>
          ))}
        </div>
      )}
      {use && <UseContext site={site} pane={pane} request={request} use={use} elements={elements} />}
      <ConstraintFacts site={site} pane={pane} request={request} use={use} inline={props.inline} />
      {definitionRows.map((item, index) =>
        use?.kind === 'row' && item.row === use.row ? (
          <RowLine key={index} context={rowContext} item={item} keyButton={item === keyed ? keyButton : undefined} />
        ) : (
          <RowFacts
            key={index}
            context={rowContext}
            item={item}
            applies={item.applies && definitionRows.length > 1}
            role={roleOf(item)}
            keyButton={item === keyed ? keyButton : undefined}
          />
        ),
      )}
      {key.length > 0 && (
        <dl class="popup-key" id={keyId} hidden={!keyOpen}>
          {key.map(([term, text, value]) => (
            <Fragment key={term}>
              <dt>{term}</dt>
              <dd>
                {value && (
                  <>
                    <b>{value}</b>
                    {' · '}
                  </>
                )}
                {text}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      {/* Opened on the rule's own head, the text prints its members right there. */}
      {rule?.members.length && use?.kind !== 'head' ? (
        <RuleContents rule={rule} open={false} title={words.contents} />
      ) : null}
      {hasPlaces && (
        <div class="popup-places">
          {placed}
          {/* In the targets' grid, for their columns to line up. */}
          {tables.length > 0 && (
            <div class="popup-tables" role="group" aria-label={words.valueTables}>
              {tables}
            </div>
          )}
        </div>
      )}
      <Steps
        count={words.useCount(active + 1, uses.length)}
        widest={words.useCount(uses.length, uses.length)}
        select={by => select(active + by)}
      />
      {/* Closed, as a Grouped AVP's contents are: Previous and Next above step through the uses without it. */}
      <details
        class="usage-details popup-uses"
        onToggle={event => {
          const node = event.currentTarget as HTMLDetailsElement;
          if (node.open) node.querySelector('[aria-current]')?.scrollIntoView?.({ block: 'nearest' });
        }}
      >
        <summary>
          <Counted title={words.uses} count={uses.length} />
        </summary>
        <Entries entries={entries} active={active} select={select} />
      </details>
    </Panel>
  );
}
