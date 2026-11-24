import { useLayoutEffect } from 'preact/hooks';
import { originPlace } from '../avp-places.ts';
import type { Place } from '../avp-places.ts';
import { newestOf } from '../data.ts';
import { sourceHref } from '../data.ts';
import type { Site } from '../data.ts';
import { routeFor } from '../navigation.ts';
import { definingRow, listingOf } from '../result-codes.ts';
import { valueRowLabel } from '../values.ts';
import type { ValueRow } from '../values.ts';
import type { PopupProps } from './root.tsx';
import { ExternalLink, Panel, placeRows } from './shared.tsx';
import { strip } from '../text/document.ts';
import { valuePopup as words } from '../text/popup.ts';

/** A command as the text abbreviates it, "PPA", or its name. */
const commandShort = (site: Site, name: string) =>
  site.commands()?.commands.find(command => command.name.toLowerCase() === name.toLowerCase() && command.abbreviation)
    ?.abbreviation ?? name;

/** The document a result code's row says defines it, as its link names it, else as the row prints it. */
function originLabel(site: Site, { origin }: ValueRow): string {
  const summary = origin?.target && site.summary(origin.target.document);
  return summary ? site.label(summary) : (origin?.reference ?? '');
}

/**
 * Where a code a Command Result Codes block lists is defined: its row in the result-code table of the document printing
 * the answer, the one the block says it is `; From:`, this one, or for a Result-Code value RFC 6733, the first of those
 * loaded that has it. `pending` are the ones still to load.
 */
function listedOrigin(site: Site, docId: string, row: ValueRow): { place?: Place; pending: string[] } {
  const listing = listingOf(row)!.listing;
  const base = row.table.avp?.name === 'Result-Code' ? newestOf(site.index.documents, 'RFC6733')?.id : undefined;
  const candidates = [...new Set([...listing.described.map(target => target.document), docId, base])].filter(
    (id): id is string => Boolean(id && site.summary(id)),
  );
  const pending: string[] = [];
  for (const id of candidates) {
    const file = site.held(id);
    if (!file) {
      pending.push(id);
      continue;
    }
    const found = definingRow(file, row);
    if (found)
      return {
        place: {
          document: id,
          ...(id === docId ? { position: found.position } : {}),
          target: { document: id, section: found.target?.section ?? found.table.section, name: found.name },
          line: found.line,
        },
        pending,
      };
  }
  return { pending };
}

/**
 * A value table's row: what its number is of, where the source prints it, and the document defining a result code
 * another document defines. The table itself is there in the text, so the popup is of this row alone. Opening only
 * shows where the row is: the pane moves when its source is asked for, not from under what it was sent to.
 */
export function ValuePopup(props: PopupProps & { row: ValueRow }) {
  const { site, pane, request, row, demand } = props;
  const { doc, documentPane } = request;
  const { table } = row;
  const listing = listingOf(row);
  const listed = listing ? listedOrigin(site, doc.id, row) : undefined;
  // The documents that may define a listed code, loaded one by one until one has it.
  const next = listed && !listed.place ? listed.pending[0] : undefined;
  useLayoutEffect(() => demand(next), [next]);
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
        {Number.isNaN(row.value) ? words.noNumber : words.of(valueRowLabel(table.kind), row.value)}
        {table.avp &&
          (table.avp.target ? (
            <a href={routeFor({ ...table.avp.target, name: table.avp.name })}>{table.avp.name}</a>
          ) : (
            table.avp.name
          ))}
        {table.featureListId !== null && words.list(table.featureListId)}
        {table.application && ` · ${table.application}`}
        {row.mark && ` · ${row.mark}`}
        {listing?.listing.command && words.listedFor(commandShort(site, listing.listing.command))}
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
      {listed &&
        (listed.place ? (
          <div class="popup-places">
            {placeRow(
              words.definedIn,
              'place-origin',
              listed.place,
              listed.place.document === doc.id
                ? (listed.place.target!.section ?? undefined)
                : [site.label(site.summary(listed.place.document)!), listed.place.target!.section].join(' · '),
            )}
          </div>
        ) : (
          listed.pending.length > 0 && <p class="value-origin">{words.finding}</p>
        ))}
      {row.origin &&
        (originRow ? (
          <div class="popup-places">{originRow}</div>
        ) : (
          <p class="value-origin">{words.definedInReference(row.origin.reference)}</p>
        ))}
    </Panel>
  );
}
