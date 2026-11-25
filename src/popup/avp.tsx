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
  rowSaysMore,
  ruleAt,
  useAt,
} from '../avp-context.ts';
import type { AvpRow, FlagRule, Rule, Use } from '../avp-context.ts';
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
import type { ElementTable } from '../elements.ts';
import type { Block } from '../types.ts';
import { valueTableTitle } from '../values.ts';
import { ConstraintFacts } from './constraints.tsx';
import type { PopupProps, PopupRequest } from './root.tsx';
import { Counted, Entries, Panel, placeRows, RuleContents, Steps, TableLink } from './shared.tsx';
import { avpPopup as words, flagText, popupShared } from '../text/popup.ts';

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

/**
 * What the line opened on says of the name: the rule it is a member of and how, the rule it heads, the row it is, and
 * what the Information Elements tables say of it, `elements`.
 */
function UseContext({ site, document, use, elements }: { site: Site; document: string; use: Use; elements: string[] }) {
  const lines: ComponentChild[] = [];
  if (use.kind === 'member') {
    const { rule, member } = use;
    lines.push(<p>{words.inRule(ruleName(rule), rule.section)}</p>);
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
  for (const text of elements) lines.push(<p class="popup-element">{text}</p>);
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

/**
 * A row's flags, then its other cells: From, its marks. Its title says which table it is of, but not for the row
 * opened on, which the "Here:" line names. `keyButton`, the "?" button, goes after its flags, or after its first cell.
 */
function RowFacts({
  title,
  applies,
  row,
  keyButton,
}: {
  title: string | undefined;
  applies: boolean;
  row: AvpRow;
  keyButton?: ComponentChild;
}) {
  const columns = flagTable(row);
  const cells = otherCells(row);
  return (
    <div class={applies ? 'popup-row popup-row-here' : 'popup-row'}>
      {title !== undefined && (
        <div class="popup-row-title">
          {title}
          {applies && <span class="popup-row-applies">{words.appliesHere}</span>}
        </div>
      )}
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
    </div>
  );
}

/**
 * The row the popup was opened on, which the text prints beside it: its flags in words, in one line, and the "?" with
 * what its columns mean, rather than its cells again.
 */
function RowLine({ row, keyButton }: { row: AvpRow; keyButton?: ComponentChild }) {
  const said = flagTable(row).map(([rule, bits]) => words.flagLine(bits.join(', '), flagWords[rule]));
  if (!said.length && !keyButton) return null;
  return (
    <p class="popup-row-line">
      {said.join(' · ')}
      {keyButton && [said.length ? ' ' : '', keyButton]}
    </p>
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

/**
 * The rows the files at hand give a name, each said once, and the Grouped rule they give it. The row opened on comes
 * first, then those of a table that applies to the command opened in: one whose commands it is among, or in another
 * document one for its application. Each row has the applications its table's commands are of, as their document or
 * the registry names them.
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
      return { row, document, applications, applies };
    }),
  );
  all.sort((a, b) => Number(b.applies) - Number(a.applies));
  if (use?.kind === 'row') all.sort((a, b) => Number(b.row === use.row) - Number(a.row === use.row));
  const seen = new Set<string>();
  const rows = all
    .filter(({ row }) => {
      const key = JSON.stringify([row.type, row.cells.filter(([column]) => column !== 'Name')]);
      if (!rowSaysMore(row) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
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
): { notes: string[]; places: ComponentChild[] } {
  const { doc, file } = request;
  const name = request.token.avp!;
  const index = site.elements();
  const label = (document: string) =>
    document === doc.id ? '' : site.summary(document) ? site.label(site.summary(document)!) : document;
  const tableWhere = (table: ElementTable) => [label(table.document), table.section].filter(Boolean).join(' · ');
  if (use?.kind === 'member') {
    const block = blockAt(file, use.rule.line);
    const found = block ? memberElements(tablesFor(index, doc.id, block, file), use.member.name) : [];
    return {
      notes: found.map(({ row }) => words.elementLine(elementText(row))),
      places: found
        .map(({ table, row }) =>
          placeRow(
            words.elementPlace,
            'place-element',
            elementPlace(table, row, name, file, doc),
            tableWhere(table),
            table,
          ),
        )
        .filter(row => row !== undefined),
    };
  }
  if (use?.kind !== 'element') return { notes: [], places: [] };
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
  return { notes: [words.elementLine(elementText(row)), unplaced].filter(Boolean), places };
}

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
  const keyed = definitionRows.find(({ row }) => flagTable(row).length) ?? definitionRows[0];
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
  // A name an interpreted rule reads: the member it is where the rule's path reaches it, in this file.
  const reached =
    use?.kind === 'constraint' && use.ref ? reachedPlace(request.file, doc.id, use.block, use.ref) : undefined;
  // Every place it is declared, but the one opened on, which the "Here:" line names.
  const openedRow = use?.kind === 'row' ? use.row.line : undefined;
  const onRow = (place: Place | undefined) => place?.document === doc.id && place.line === openedRow;
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
      {use && <UseContext site={site} document={doc.id} use={use} elements={elements.notes} />}
      <ConstraintFacts site={site} pane={pane} request={request} use={use} inline={props.inline} />
      {definitionRows.map((item, index) =>
        use?.kind === 'row' && item.row === use.row ? (
          <RowLine key={index} row={item.row} keyButton={item === keyed ? keyButton : undefined} />
        ) : (
          <RowFacts
            key={index}
            title={
              use?.kind === 'row' && item.row === use.row
                ? undefined
                : [
                    tableOf(item.row),
                    item.applications.join(', '),
                    item.document !== doc.id && site.summary(item.document)
                      ? site.label(site.summary(item.document)!)
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
            }
            row={item.row}
            applies={item.applies && definitionRows.length > 1}
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
