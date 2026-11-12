import { h } from 'preact';
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
import { namePlaces } from '../avp-places.ts';
import type { Place } from '../avp-places.ts';
import { blockAt } from '../blocks.ts';
import type { DadFile } from '../blocks.ts';
import type { Site } from '../data.ts';
import { valueTableTitle } from '../values.ts';
import type { PopupProps, PopupRequest } from './root.ts';
import { counted, Entries, Panel, placeRows, RuleContents, Steps } from './shared.ts';

/** An identity in a line: "Code 1405 · Vendor-ID 10415 · Unsigned32". IETF's vendor 0 is no vendor to name. */
const identityText = ({ code, vendor, type }: AvpIdentity) =>
  [code === undefined ? '' : `Code ${code}`, vendor ? `Vendor-ID ${vendor}` : '', type ?? '']
    .filter(Boolean)
    .join(' · ');

/** The files at hand for a name: the one its link names if that has been loaded, then this one. */
function filesOf(site: Site, { token, doc, file }: PopupRequest): { file: DadFile; name: string; document: string }[] {
  const name = token.avp!;
  const away = token.target && token.target.document !== doc.id ? site.held(token.target.document) : undefined;
  return [
    ...(away ? [{ file: away, name: token.target!.name ?? name, document: away.id }] : []),
    { file, name, document: doc.id },
  ];
}

const flagWords: Record<FlagRule, string> = {
  must: 'must be set',
  may: 'may be set',
  'should not': 'should not be set',
  'must not': 'must not be set',
};
const flagHeading: Record<FlagRule, string> = {
  must: 'Must',
  may: 'May',
  'should not': 'Should not',
  'must not': 'Must not',
};
const ruleName = (rule: Rule) => `${rule.kind === 'Message' ? 'command' : rule.kind} ${rule.label}`;
const tableOf = (row: AvpRow) => [row.type, row.table ?? row.section].filter(Boolean).join(' ');

/** What the line opened on says of the name: the rule it is a member of and how, the rule it heads, the row it is. */
function UseContext({ use }: { use: Use }) {
  const lines: ComponentChild[] = [];
  if (use.kind === 'member') {
    const { rule, member } = use;
    lines.push(h('p', null, `Here: in ${ruleName(rule)}${rule.section ? ` · ${rule.section}` : ''}`));
    lines.push(h('p', { class: 'presence' }, presenceText(member)));
    if (member.bold)
      lines.push(h('p', { class: 'fact-note' }, 'Bold in the source: the document defines or modifies it here'));
    if (member.struck)
      lines.push(h('p', { class: 'fact-note' }, 'Struck through in the source, and left out of the rule'));
    else if (member.strikethrough) lines.push(h('p', { class: 'fact-note' }, 'Struck through in the source'));
  } else if (use.kind === 'head') {
    lines.push(
      h('p', null, `Here: the rule of ${ruleName(use.rule)}${use.rule.section ? ` · ${use.rule.section}` : ''}`),
    );
  } else lines.push(h('p', null, `Here: a row of ${tableOf(use.row)}`));
  return h('div', { class: 'popup-context' }, lines);
}

/** A row's M and V bits as its table prints them, only the columns that hold one, each cell's meaning its tip. */
function FlagsTable({ columns }: { columns: ReturnType<typeof flagTable> }) {
  return h(
    'table',
    { class: 'popup-flags' },
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        columns.map(([rule]) => h('th', { scope: 'col' }, flagHeading[rule])),
      ),
    ),
    h(
      'tbody',
      null,
      h(
        'tr',
        null,
        columns.map(([rule, bits]) =>
          h(
            'td',
            {
              class: `flag-${rule.replace(' ', '-')}`,
              title: bits.map(bit => `${bit} ${flagWords[rule]}. ${bitMeaning[bit]}`).join('\n'),
            },
            bits.join(', '),
          ),
        ),
      ),
    ),
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
  return h(
    'div',
    { class: applies ? 'popup-row popup-row-here' : 'popup-row' },
    title !== undefined &&
      h(
        'div',
        { class: 'popup-row-title' },
        title,
        applies && h('span', { class: 'popup-row-applies' }, ' · applies here'),
      ),
    columns.length > 0 && h('div', { class: 'popup-flags-line' }, h(FlagsTable, { columns }), keyButton),
    cells.length > 0 &&
      h(
        'dl',
        { class: 'popup-facts' },
        cells.map(([column, text], index) => [
          h('dt', { title: columnNotes[column] || undefined }, column),
          h('dd', null, text, keyButton && !columns.length && !index && [' ', keyButton]),
        ]),
      ),
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
      : found.map(([text, where]) => `${text} (${where})`).join(', ');
  };
  if (rows.some(row => flagTable(row).length))
    for (const [bit, meaning] of Object.entries(bitMeaning)) entries.push([bit, meaning]);
  const columns = [...new Set(rows.flatMap(row => otherCells(row).map(([column]) => column)))];
  for (const column of columns) if (columnNotes[column]) entries.push([column, columnNotes[column]]);
  const p = said(row => bitRule(row, 'P') && flagWords[bitRule(row, 'P')!]);
  if (p)
    entries.push([
      'P',
      'Protected, not shown: it was for end-to-end security, which RFC 6733 dropped; it says to leave the bit clear.',
      p,
    ]);
  const encrypt = said(encryptOf);
  if (encrypt)
    entries.push([
      'Encrypt',
      'Not shown: whether the AVP may be encrypted with RFC 3588 end-to-end security, which RFC 6733 dropped.',
      encrypt,
    ]);
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
function definitionFacts(site: Site, request: PopupRequest, use: Use | undefined) {
  const files = filesOf(site, request);
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
                `Application-ID ${id}`,
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
  useLayoutEffect(() => {
    if (!stepped) return;
    for (const node of document.querySelectorAll('.avp-current')) node.classList.remove('avp-current');
    stepped.classList.add('avp-current');
  }, [stepped]);

  // What the files at hand say a name is, and the tables of its numbers: this one's, and the one its link names if
  // that has been loaded already. A table here is gone to in the pane at its first row, a result code's at its clause,
  // an `Enumerated AVP` block as Details are; one in another document at its clause there.
  const files = filesOf(site, request);
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
        return placeRow('rows' in table ? valueTableTitle(table) : 'Enumerated', 'place-table', place);
      }),
    )
    .filter(row => row !== undefined);
  const use = useAt(request.file, Number(lineOf(here).dataset.line), name);
  const { rows: definitionRows, rule } = definitionFacts(site, request, use);
  const key = definitionRows.length ? keyEntries(definitionRows.map(({ row }) => row)) : [];
  const keyed = definitionRows.find(({ row }) => flagTable(row).length) ?? definitionRows[0];
  const keyButton =
    key.length > 0
      ? h(
          'button',
          {
            class: 'control popup-key-button',
            type: 'button',
            title: 'What these mean',
            'aria-label': 'What these mean',
            'aria-controls': keyId,
            'aria-expanded': String(keyOpen),
            onClick: toggleKey,
          },
          '?',
        )
      : undefined;
  const { definition, details } = namePlaces(token, lines, doc);
  const placed = [
    definition && placeRow('Definition', 'place-definition', definition),
    details && placeRow('Details', 'place-details', details),
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

  return h(
    Panel,
    { ...props, heading: name, data: { 'data-avp': name }, alignLabels: true },
    identities.length > 0 &&
      h(
        'div',
        { class: 'popup-identity' },
        identities.map(text => h('p', null, text)),
      ),
    use && h(UseContext, { use }),
    definitionRows.map(item =>
      h(RowFacts, {
        title:
          use?.kind === 'row' && item.row === use.row
            ? undefined
            : [
                tableOf(item.row),
                item.applications.join(', '),
                item.document !== doc.id && site.summary(item.document) ? site.label(site.summary(item.document)!) : '',
              ]
                .filter(Boolean)
                .join(' · '),
        row: item.row,
        applies: item.applies && definitionRows.length > 1,
        keyButton: item === keyed ? keyButton : undefined,
      }),
    ),
    key.length > 0 &&
      h(
        'dl',
        { class: 'popup-key', id: keyId, hidden: !keyOpen },
        key.map(([term, text, value]) => [
          h('dt', null, term),
          h('dd', null, value && [h('b', null, value), ' · '], text),
        ]),
      ),
    rule?.members.length ? h(RuleContents, { rule, open: use?.kind === 'head', title: 'Contents' }) : null,
    hasPlaces &&
      h(
        'div',
        { class: 'popup-places' },
        placed,
        // In the targets' grid, for their columns to line up.
        tables.length > 0 && h('div', { class: 'popup-tables', role: 'group', 'aria-label': 'Value tables' }, tables),
      ),
    h(Steps, {
      count: `.dad ${active + 1}/${uses.length}`,
      widest: `.dad ${uses.length}/${uses.length}`,
      select: by => select(active + by),
    }),
    // Closed, as a Grouped AVP's contents are: Previous and Next above step through the uses without it.
    h(
      'details',
      {
        class: 'usage-details popup-uses',
        onToggle: (event: Event) => {
          const node = event.currentTarget as HTMLDetailsElement;
          if (node.open) node.querySelector('[aria-current]')?.scrollIntoView?.({ block: 'nearest' });
        },
      },
      h('summary', null, counted('Uses', uses.length)),
      h(Entries, { entries, active, select }),
    ),
  );
}
