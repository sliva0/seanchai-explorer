import { originPlace } from './avp-places.ts';
import { sourceHref } from './data.ts';
import type { Site } from './data.ts';
import { counted, element, externalLink, link } from './dom.ts';
import type { PopupRequest, PopupShell } from './popup.ts';
import type { SourcePane } from './source-pane.ts';
import { valueRowLabel } from './values.ts';
import type { ValueRow } from './values.ts';

/** A value's popup: what its number is of, where the source prints it, and the table it is a row of. */
export function createValuePopup(shell: PopupShell, site: Site, pane: SourcePane) {
  /** The document a result code's row says defines it, as its link names it, else as the row prints it. */
  function originLabel({ origin }: ValueRow): string {
    const summary = origin?.target && site.summary(origin.target.document);
    return summary ? site.label(summary) : (origin?.reference ?? '');
  }

  /**
   * A value table's name: what its number is of, the document defining a result code another document defines, and
   * the table around it, whose rows go to the source too.
   */
  function showValue(row: ValueRow, request: PopupRequest) {
    const { doc, opener, documentPane, recordJump, jumpTo } = request;
    const inPane = pane.shows(doc);
    const { panel, closeButton } = shell.open(row.name, opener);
    panel.dataset.value = row.name;
    const { table } = row;
    const of = element('p', `${valueRowLabel(table.kind)} ${row.value} of `);
    if (table.avp) {
      if (table.avp.target) of.append(link(table.avp.name, { ...table.avp.target, name: table.avp.name }));
      else of.append(table.avp.name);
    }
    if (table.featureListId !== null) of.append(` · list ${table.featureListId}`);
    if (table.application) of.append(` · ${table.application}`);
    if (row.mark) of.append(` · ${row.mark}`);
    panel.append(of);
    const source = element('p', 'Source: ');
    const where = `${row.position.section}${row.position.page ? ` · p. ${row.position.page}` : ''}`;
    if (inPane) {
      const button = element('button', where, 'usage-link source-link');
      button.onclick = () => {
        pane.setVisible(true);
        pane.show(table.rows[active].position, doc, true);
      };
      source.append(button);
    } else {
      const href = sourceHref(doc, row.position, site.mode);
      if (href) source.append(externalLink(where, href.href));
      else source.append(where);
    }
    panel.append(source);
    if (row.origin) {
      const origin = originPlace(row);
      const found =
        origin &&
        shell.placeRow(
          'Defined in',
          'place-origin',
          origin,
          request,
          [originLabel(row), origin.target!.section].join(' · '),
        );
      if (found) {
        const places = element('div', undefined, 'popup-places');
        places.append(found);
        panel.append(places);
      } else panel.append(element('p', `Defined in ${row.origin.reference}`, 'value-origin'));
    }
    const actions = element('div', undefined, 'popup-actions');
    const count = element('span');
    count.style.minWidth = `${`Row ${table.rows.length}/${table.rows.length}`.length}ch`;
    const previous = element('button', 'Previous', 'control');
    const next = element('button', 'Next', 'control');
    actions.append(count, previous, next);
    panel.append(actions);
    const list = element('div', undefined, 'usage-list');
    const buttons: HTMLButtonElement[] = [];
    let active = table.rows.indexOf(row);
    const nameNode = (index: number) =>
      documentPane.querySelector<HTMLElement>(`[data-line="${table.rows[index].line}"] .value-name`);
    // Opening only shows where the row is: the pane moves when a row is chosen, not from under what it was sent to.
    const mark = (index: number, follow = true) => {
      active = index;
      count.textContent = `Row ${active + 1}/${table.rows.length}`;
      for (const node of documentPane.querySelectorAll('.avp-current')) node.classList.remove('avp-current');
      nameNode(active)?.classList.add('avp-current');
      for (const button of buttons) button.removeAttribute('aria-current');
      buttons[active].setAttribute('aria-current', 'location');
      buttons[active].scrollIntoView?.({ block: 'nearest' });
      if (follow && pane.readsDocument()) pane.show(table.rows[active].position, doc, true);
    };
    const select = (index: number) => {
      recordJump();
      mark((index + table.rows.length) % table.rows.length);
      const node = nameNode(active);
      if (!node) return;
      jumpTo(node);
      shell.anchorTo(node);
    };
    previous.onclick = () => select(active - 1);
    next.onclick = () => select(active + 1);
    table.rows.forEach((item, index) => {
      const button = element(
        'button',
        [String(item.value), item.name, item.mark, item.origin && `from ${originLabel(item)}`]
          .filter(Boolean)
          .join(' · '),
        'usage-link',
      );
      button.onclick = () => select(index);
      buttons.push(button);
      list.append(button);
    });
    const rows = element('div', undefined, 'usage-details');
    const rowsTitle = element('div');
    rowsTitle.append(...counted('Table', table.rows.length));
    rows.append(rowsTitle, list);
    panel.append(rows);
    mark(active, false);
    shell.place(panel, closeButton, opener, documentPane);
    buttons[active].scrollIntoView?.({ block: 'nearest' });
  }

  return showValue;
}
