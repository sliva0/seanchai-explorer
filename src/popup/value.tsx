import { useLayoutEffect } from 'preact/hooks';
import { originPlace } from '../avp-places.ts';
import { sourceHref } from '../data.ts';
import type { Site } from '../data.ts';
import { routeFor } from '../navigation.ts';
import { valueRowLabel } from '../values.ts';
import type { ValueRow } from '../values.ts';
import type { PopupProps } from './root.tsx';
import { ExternalLink, Panel, placeRows } from './shared.tsx';
import { strip } from '../text/document.ts';
import { valuePopup as words } from '../text/popup.ts';

/** The document a result code's row says defines it, as its link names it, else as the row prints it. */
function originLabel(site: Site, { origin }: ValueRow): string {
  const summary = origin?.target && site.summary(origin.target.document);
  return summary ? site.label(summary) : (origin?.reference ?? '');
}

/**
 * A value table's row: what its number is of, where the source prints it, and the document defining a result code
 * another document defines. The table itself is there in the text, so the popup is of this row alone. Opening only
 * shows where the row is: the pane moves when its source is asked for, not from under what it was sent to.
 */
export function ValuePopup(props: PopupProps & { row: ValueRow }) {
  const { site, pane, request, row } = props;
  const { doc, documentPane } = request;
  const { table } = row;
  useLayoutEffect(() => {
    if (props.inline) return;
    for (const node of documentPane.querySelectorAll('.avp-current')) node.classList.remove('avp-current');
    documentPane.querySelector(`[data-line="${row.line}"] .value-name`)?.classList.add('avp-current');
  }, []);
  const placeRow = placeRows(site, pane, request);
  const where = `${row.position.section}${row.position.page ? ` · ${strip.page(row.position.page)}` : ''}`;
  const href = pane.shows(doc) ? undefined : sourceHref(doc, row.position, site.mode);
  const origin = row.origin ? originPlace(row) : undefined;
  const originRow =
    origin &&
    placeRow(words.definedIn, 'place-origin', origin, [originLabel(site, row), origin.target!.section].join(' · '));
  return (
    <Panel {...props} heading={row.name} data={{ 'data-value': row.name }}>
      <p>
        {words.of(valueRowLabel(table.kind), row.value)}
        {table.avp &&
          (table.avp.target ? (
            <a href={routeFor({ ...table.avp.target, name: table.avp.name })}>{table.avp.name}</a>
          ) : (
            table.avp.name
          ))}
        {table.featureListId !== null && words.list(table.featureListId)}
        {table.application && ` · ${table.application}`}
        {row.mark && ` · ${row.mark}`}
      </p>
      <p>
        {words.source}
        {pane.shows(doc) ? (
          <button
            class="usage-link source-link"
            onClick={() => {
              pane.setVisible(true);
              pane.show(row.position, doc, true);
            }}
          >
            {where}
          </button>
        ) : href ? (
          <ExternalLink href={href.href}>{where}</ExternalLink>
        ) : (
          where
        )}
      </p>
      {row.origin &&
        (originRow ? (
          <div class="popup-places">{originRow}</div>
        ) : (
          <p class="value-origin">{words.definedInReference(row.origin.reference)}</p>
        ))}
    </Panel>
  );
}
