import { h } from 'preact';
import { useLayoutEffect } from 'preact/hooks';
import { originPlace } from '../avp-places.ts';
import { sourceHref } from '../data.ts';
import type { Site } from '../data.ts';
import { routeFor } from '../navigation.ts';
import { valueRowLabel } from '../values.ts';
import type { ValueRow } from '../values.ts';
import type { PopupProps } from './root.ts';
import { counted, Entries, externalLink, Panel, placeRows, Steps } from './shared.ts';

/** The document a result code's row says defines it, as its link names it, else as the row prints it. */
function originLabel(site: Site, { origin }: ValueRow): string {
  const summary = origin?.target && site.summary(origin.target.document);
  return summary ? site.label(summary) : (origin?.reference ?? '');
}

/**
 * A value table's name: what its number is of, the document defining a result code another document defines, and
 * the table around it, whose rows go to the source too. Opening only shows where the row is: the pane moves when a
 * row is chosen, not from under what it was sent to.
 */
export function ValuePopup(props: PopupProps & { row: ValueRow }) {
  const { site, pane, request, row, at, anchor, step } = props;
  const { doc, documentPane, recordJump, jumpTo } = request;
  const { table } = row;
  const active = at ?? table.rows.indexOf(row);
  const nameNode = (index: number) =>
    documentPane.querySelector<HTMLElement>(`[data-line="${table.rows[index].line}"] .value-name`);
  useLayoutEffect(() => {
    for (const node of documentPane.querySelectorAll('.avp-current')) node.classList.remove('avp-current');
    nameNode(active)?.classList.add('avp-current');
  }, [active]);
  const select = (index: number) => {
    recordJump();
    const to = (index + table.rows.length) % table.rows.length;
    if (pane.readsDocument()) pane.show(table.rows[to].position, doc, true);
    const node = nameNode(to);
    if (node) jumpTo(node);
    step(to, node ?? anchor);
  };
  const placeRow = placeRows(site, pane, request);
  const where = `${row.position.section}${row.position.page ? ` · p. ${row.position.page}` : ''}`;
  const href = pane.shows(doc) ? undefined : sourceHref(doc, row.position, site.mode);
  const origin = row.origin ? originPlace(row) : undefined;
  const originRow =
    origin &&
    placeRow('Defined in', 'place-origin', origin, [originLabel(site, row), origin.target!.section].join(' · '));
  return h(
    Panel,
    { ...props, heading: row.name, data: { 'data-value': row.name } },
    h(
      'p',
      null,
      `${valueRowLabel(table.kind)} ${row.value} of `,
      table.avp &&
        (table.avp.target
          ? h('a', { href: routeFor({ ...table.avp.target, name: table.avp.name }) }, table.avp.name)
          : table.avp.name),
      table.featureListId !== null && ` · list ${table.featureListId}`,
      table.application && ` · ${table.application}`,
      row.mark && ` · ${row.mark}`,
    ),
    h(
      'p',
      null,
      'Source: ',
      pane.shows(doc)
        ? h(
            'button',
            {
              class: 'usage-link source-link',
              onClick: () => {
                pane.setVisible(true);
                pane.show(table.rows[active].position, doc, true);
              },
            },
            where,
          )
        : href
          ? externalLink(where, href.href)
          : where,
    ),
    row.origin &&
      (originRow
        ? h('div', { class: 'popup-places' }, originRow)
        : h('p', { class: 'value-origin' }, `Defined in ${row.origin.reference}`)),
    h(Steps, {
      count: `Row ${active + 1}/${table.rows.length}`,
      widest: `Row ${table.rows.length}/${table.rows.length}`,
      select: by => select(active + by),
    }),
    h(
      'div',
      { class: 'usage-details' },
      h('div', null, counted('Table', table.rows.length)),
      h(Entries, {
        entries: table.rows.map(item => ({
          text: [String(item.value), item.name, item.mark, item.origin && `from ${originLabel(site, item)}`]
            .filter(Boolean)
            .join(' · '),
        })),
        active,
        select,
      }),
    ),
  );
}
