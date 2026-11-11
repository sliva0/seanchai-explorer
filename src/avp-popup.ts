import {
  avpRows,
  bitMeaning,
  bitRule,
  columnNotes,
  encryptOf,
  flagTable,
  groupedRules,
  otherCells,
  presenceShort,
  presenceText,
  printed,
  rowSaysMore,
  ruleAt,
  useAt,
} from './avp-context.ts';
import type { AvpRow, FlagRule, Rule, Use } from './avp-context.ts';
import { avpIdentities, avpTables } from './avp-facts.ts';
import type { AvpIdentity } from './avp-facts.ts';
import { namePlaces } from './avp-places.ts';
import type { Place } from './avp-places.ts';
import type { DadFile } from './blocks.ts';
import type { Site } from './data.ts';
import { counted, element } from './dom.ts';
import type { PopupRequest, PopupShell } from './popup.ts';
import type { SourcePane } from './source-pane.ts';
import { valueTableTitle } from './values.ts';

/** A rule's members as it prints them, each with how many there may be. */
export function ruleContents(rule: Rule, open: boolean, title: string): HTMLElement {
  const node = element('details', undefined, 'popup-contents');
  node.open = open;
  const summary = element('summary');
  summary.append(...counted(title, rule.members.length));
  const list = element('div', undefined, 'contents-list');
  for (const item of rule.members) {
    const note = [
      presenceShort(item),
      item.name === 'AVP' && 'any other AVP',
      item.bold && 'bold',
      (item.struck || item.strikethrough) && 'struck through',
    ]
      .filter(Boolean)
      .join(' · ');
    const code = element('code', printed(item));
    if (item.struck || item.strikethrough) code.classList.add('struck');
    list.append(code, element('span', note, 'fact-note'));
  }
  node.append(summary, list);
  return node;
}

/** An AVP's popup: what the files at hand say it is, what the line opened on says of it, its rows and rule, its places and its uses. */
export function createAvpPopup(shell: PopupShell, site: Site, pane: SourcePane) {
  /** An identity in a line: "Code 1405 · Vendor-ID 10415 · Unsigned32". IETF's vendor 0 is no vendor to name. */
  const identityText = ({ code, vendor, type }: AvpIdentity) =>
    [code === undefined ? '' : `Code ${code}`, vendor ? `Vendor-ID ${vendor}` : '', type ?? '']
      .filter(Boolean)
      .join(' · ');

  /** The files at hand for a name: the one its link names if that has been loaded, then this one. */
  function filesOf({ token, doc, file }: PopupRequest): { file: DadFile; name: string; document: string }[] {
    const name = token.avp!;
    const away = token.target && token.target.document !== doc.id ? site.held(token.target.document) : undefined;
    return [
      ...(away ? [{ file: away, name: token.target!.name ?? name, document: away.id }] : []),
      { file, name, document: doc.id },
    ];
  }

  /**
   * What the files at hand say a name is, and the tables of its numbers: this one's, and the one its link names if
   * that has been loaded already. A table here is gone to in the pane at its first row, a result code's at its clause,
   * an `Enumerated AVP` block as Details are; one in another document at its clause there.
   */
  function facts(request: PopupRequest) {
    const { doc } = request;
    const files = filesOf(request);
    const identities = avpIdentities(files).map(identityText).filter(Boolean);
    const tables = files.toReversed().flatMap(({ file, name, document }) =>
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
        return shell.placeRow('rows' in table ? valueTableTitle(table) : 'Enumerated', 'place-table', place, request);
      }),
    );
    return { identities, tables: tables.filter(row => row !== undefined) };
  }

  let keys = 0;
  const flagWords: Record<FlagRule, string> = {
    must: 'must be set',
    may: 'may be set',
    'should not': 'should not be set',
    'must not': 'must not be set',
  };
  const ruleName = (rule: Rule) => `${rule.kind === 'Message' ? 'command' : rule.kind} ${rule.label}`;

  /** What the line opened on says of the name: the rule it is a member of and how, the rule it heads, the row it is. */
  function useContext(use: Use | undefined): HTMLElement | undefined {
    if (!use) return undefined;
    const node = element('div', undefined, 'popup-context');
    if (use.kind === 'member') {
      const { rule, member } = use;
      node.append(element('p', `Here: in ${ruleName(rule)}${rule.section ? ` · ${rule.section}` : ''}`));
      node.append(element('p', presenceText(member), 'presence'));
      if (member.bold)
        node.append(element('p', 'Bold in the source: the document defines or modifies it here', 'fact-note'));
      if (member.struck)
        node.append(element('p', 'Struck through in the source, and left out of the rule', 'fact-note'));
      else if (member.strikethrough) node.append(element('p', 'Struck through in the source', 'fact-note'));
    } else if (use.kind === 'head') {
      node.append(
        element('p', `Here: the rule of ${ruleName(use.rule)}${use.rule.section ? ` · ${use.rule.section}` : ''}`),
      );
    } else {
      const { row } = use;
      node.append(element('p', `Here: a row of ${[row.type, row.table ?? row.section].filter(Boolean).join(' ')}`));
    }
    return node;
  }

  const flagHeading: Record<FlagRule, string> = {
    must: 'Must',
    may: 'May',
    'should not': 'Should not',
    'must not': 'Must not',
  };
  /** Whether the flags' key is open: it stays as it was left from one popup to the next. */
  let keyOpen = false;

  /** A row's M and V bits as its table prints them, only the columns that hold one, each cell's meaning its tip. */
  function flagsOf(row: AvpRow): HTMLElement | undefined {
    const columns = flagTable(row);
    if (!columns.length) return undefined;
    const table = element('table', undefined, 'popup-flags');
    const head = element('tr');
    const body = element('tr');
    for (const [rule, bits] of columns) {
      const th = element('th', flagHeading[rule]);
      th.scope = 'col';
      const td = element('td', bits.join(', '), `flag-${rule.replace(' ', '-')}`);
      td.title = bits.map(bit => `${bit} ${flagWords[rule]}. ${bitMeaning[bit]}`).join('\n');
      head.append(th);
      body.append(td);
    }
    const thead = element('thead');
    const tbody = element('tbody');
    thead.append(head);
    tbody.append(body);
    table.append(thead, tbody);
    return table;
  }

  /**
   * A row's flags, then its other cells: From, its marks. Its title says which table it is of, but not for the row
   * opened on, which the "Here:" line names. `key`, the "?" button, goes after its flags, or after its first cell.
   */
  function rowFacts(
    row: AvpRow,
    document: string,
    request: PopupRequest,
    opened: boolean,
    key?: HTMLElement,
  ): HTMLElement {
    const node = element('div', undefined, 'popup-row');
    const summary = site.summary(document);
    if (!opened) {
      const where = [
        [row.type, row.table ?? row.section].filter(Boolean).join(' '),
        document !== request.doc.id && summary ? site.label(summary) : '',
      ]
        .filter(Boolean)
        .join(' · ');
      node.append(element('div', where, 'popup-row-title'));
    }
    const flags = flagsOf(row);
    if (flags) {
      const line = element('div', undefined, 'popup-flags-line');
      line.append(flags);
      if (key) line.append(key);
      node.append(line);
    }
    const cells = otherCells(row);
    if (cells.length) {
      const grid = element('dl', undefined, 'popup-facts');
      cells.forEach(([column, text], index) => {
        const term = element('dt', column);
        const value = element('dd', text);
        if (columnNotes[column]) term.title = columnNotes[column];
        if (key && !flags && !index) value.append(' ', key);
        grid.append(term, value);
      });
      node.append(grid);
    }
    return node;
  }

  /** The "?" button and what it opens: what the flags' bits and the rows' columns mean, said for every AVP alike. */
  function factsKey(rows: AvpRow[]): { button: HTMLButtonElement; key: HTMLElement } {
    const key = element('dl', undefined, 'popup-key');
    key.id = `popup-key-${++keys}`;
    const add = (term: string, text: string, value?: string) => {
      const dd = element('dd');
      if (value) dd.append(element('b', value), ' · ');
      dd.append(text);
      key.append(element('dt', term), dd);
    };
    /** What the rows say of something the popup leaves out: once if they agree, else each with its table. */
    const said = (value: (row: AvpRow) => string | undefined) => {
      const found = rows.flatMap(row => {
        const text = value(row);
        return text ? [[text, [row.type, row.table ?? row.section].filter(Boolean).join(' ')]] : [];
      });
      if (!found.length) return undefined;
      return new Set(found.map(([text]) => text)).size === 1
        ? found[0][0]
        : found.map(([text, where]) => `${text} (${where})`).join(', ');
    };
    const flagged = rows.some(row => flagTable(row).length);
    if (flagged) for (const [bit, meaning] of Object.entries(bitMeaning)) add(bit, meaning);
    const columns = [...new Set(rows.flatMap(row => otherCells(row).map(([column]) => column)))];
    for (const column of columns) if (columnNotes[column]) add(column, columnNotes[column]);
    const p = said(row => bitRule(row, 'P') && flagWords[bitRule(row, 'P')!]);
    if (p)
      add(
        'P',
        'Protected, not shown: it was for end-to-end security, which RFC 6733 dropped; it says to leave the bit clear.',
        p,
      );
    const encrypt = said(encryptOf);
    if (encrypt)
      add(
        'Encrypt',
        'Not shown: whether the AVP may be encrypted with RFC 3588 end-to-end security, which RFC 6733 dropped.',
        encrypt,
      );
    key.hidden = !keyOpen;
    const button = element('button', '?', 'control popup-key-button');
    button.type = 'button';
    button.title = 'What these mean';
    button.setAttribute('aria-label', 'What these mean');
    button.setAttribute('aria-controls', key.id);
    button.setAttribute('aria-expanded', String(keyOpen));
    button.onclick = () => {
      keyOpen = !keyOpen;
      key.hidden = !keyOpen;
      button.setAttribute('aria-expanded', String(keyOpen));
    };
    return { button, key };
  }

  /** The rows the files at hand give a name, the one opened on first, each said once, and the Grouped rule they give it. */
  function definitionFacts(request: PopupRequest, use: Use | undefined) {
    const files = filesOf(request);
    const all = files.flatMap(({ file, name, document }) => avpRows(file, name).map(row => ({ row, document })));
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

  /** `at` is the use a redraw was stepped to. */
  function show(request: PopupRequest, at?: number) {
    const { token, doc, lines, opener, documentPane, recordJump, jumpTo } = request;
    const name = token.avp!;
    const { panel, closeButton } = shell.open(name, opener);
    const lineOf = (node: Element) => node.closest<HTMLElement>('.dad-line')!;
    const seen = new Set<Element>();
    const uses = [...documentPane.querySelectorAll<HTMLElement>('[data-avp]')].filter(node => {
      if (node.dataset.avp !== name || seen.has(lineOf(node))) return false;
      seen.add(lineOf(node));
      return true;
    });
    let active =
      at !== undefined && at < uses.length
        ? at
        : Math.max(
            0,
            uses.findIndex(node => lineOf(node) === lineOf(opener)),
          );
    if (at !== undefined) uses[active]?.classList.add('avp-current');
    panel.dataset.avp = name;
    shell.loadThenRedraw(token.target?.document, request, active => show(request, active));
    const { identities, tables } = facts(request);
    if (identities.length) {
      const identity = element('div', undefined, 'popup-identity');
      identity.append(...identities.map(text => element('p', text)));
      panel.append(identity);
    }
    const openedOn = Number(lineOf(opener).dataset.line);
    const use = useAt(request.file, openedOn, name);
    const here = useContext(use);
    if (here) panel.append(here);
    const { rows: definitionRows, rule } = definitionFacts(request, use);
    if (definitionRows.length) {
      const { button, key } = factsKey(definitionRows.map(({ row }) => row));
      const keyed = definitionRows.find(({ row }) => flagTable(row).length) ?? definitionRows[0];
      for (const item of definitionRows)
        panel.append(
          rowFacts(
            item.row,
            item.document,
            request,
            use?.kind === 'row' && item.row === use.row,
            item === keyed ? button : undefined,
          ),
        );
      if (key.childElementCount) panel.append(key);
      else button.remove();
    }
    if (rule?.members.length) panel.append(ruleContents(rule, use?.kind === 'head', 'Contents'));
    const { definition, details } = namePlaces(token, lines, doc);
    const places = element('div', undefined, 'popup-places');
    const rows = [
      definition && shell.placeRow('Definition', 'place-definition', definition, request),
      details && shell.placeRow('Details', 'place-details', details, request),
    ];
    places.append(...rows.filter(row => row !== undefined));
    // In the targets' grid, for their columns to line up.
    if (tables.length) {
      const values = element('div', undefined, 'popup-tables');
      values.setAttribute('role', 'group');
      values.setAttribute('aria-label', 'Value tables');
      values.append(...tables);
      places.append(values);
    }
    if (places.childElementCount) panel.append(places);
    // Labels as wide in the facts as in the places below them, for their values to start in one column.
    const labels = [...panel.querySelectorAll('.popup-facts dt, .popup-places .popup-place > span:first-child')].map(
      node => node.textContent!.length,
    );
    if (labels.length) panel.style.setProperty('--popup-label', `${Math.max(...labels)}ch`);
    const actions = element('div', undefined, 'popup-actions');
    const count = element('span', `.dad ${active + 1}/${uses.length}`);
    count.style.minWidth = `${`.dad ${uses.length}/${uses.length}`.length}ch`;
    const previous = element('button', 'Previous', 'control');
    const next = element('button', 'Next', 'control');
    actions.append(count, previous, next);
    panel.append(actions);
    const list = element('div', undefined, 'usage-list');
    const buttons: HTMLButtonElement[] = [];
    const select = (index: number) => {
      if (!uses.length) return;
      recordJump();
      active = (index + uses.length) % uses.length;
      count.textContent = `.dad ${active + 1}/${uses.length}`;
      for (const node of uses) node.classList.remove('avp-current');
      for (const button of buttons) button.removeAttribute('aria-current');
      const node = uses[active];
      node.classList.add('avp-current');
      buttons[active].setAttribute('aria-current', 'location');
      buttons[active].scrollIntoView?.({ block: 'nearest' });
      jumpTo(node);
      const line = lineOf(node);
      const position = doc.sections.find(section => section.section === line.dataset.section);
      const row = lines[Number(line.dataset.line)].tokens.find(
        token => token.avp === name && token.source?.row,
      )?.source;
      if (position && pane.readsDocument())
        pane.show(row ?? { ...position, name, exact: true, occurrence: true }, doc, true);
    };
    previous.onclick = () => select(active - 1);
    next.onclick = () => select(active + 1);
    uses.forEach((node, index) => {
      const line = lineOf(node);
      // The spacing only aligns the line with its neighbours in the file.
      const text = lines[Number(line.dataset.line)].tokens
        .filter(token => !token.kind)
        .map(token => token.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      // The rule a member line is in, as a command is abbreviated: a bare `[ TMGI ]` says nothing of which.
      const rule = ruleAt(request.file, Number(line.dataset.line));
      const inRule = rule && rule.line !== Number(line.dataset.line) ? `${rule.short} · ` : '';
      const button = element('button', `${line.dataset.section ?? ''} · ${inRule}${text}`, 'usage-link');
      button.title = button.textContent!;
      button.onclick = () => select(index);
      if (index === active) button.setAttribute('aria-current', 'location');
      buttons.push(button);
      list.append(button);
    });
    // Closed, as a Grouped AVP's contents are: Previous and Next above step through the uses without it.
    const usages = element('details', undefined, 'usage-details popup-uses');
    const usagesTitle = element('summary');
    usagesTitle.append(...counted('Uses', uses.length));
    usages.append(usagesTitle, list);
    usages.ontoggle = () => {
      if (usages.open) buttons[active]?.scrollIntoView?.({ block: 'nearest' });
    };
    panel.append(usages);
    shell.place(panel, closeButton, opener);
    buttons[active]?.scrollIntoView?.({ block: 'nearest' });
  }

  return show;
}
