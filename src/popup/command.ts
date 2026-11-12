import { h } from 'preact';
import type { ComponentChild } from 'preact';
import { useLayoutEffect } from 'preact/hooks';
import { ruleAt } from '../avp-context.ts';
import type { Place } from '../avp-places.ts';
import {
  allCommands,
  blockPlace,
  commandOf,
  definitionsOf,
  partnerOf,
  registryRows,
  rowPlace,
  tablePlace,
  tablesOf,
} from '../command-places.ts';
import type { Command } from '../command-places.ts';
import { commandKey, isRequest } from '../commands.ts';
import type { CommandRef } from '../commands.ts';
import type { PopupProps } from './root.ts';
import { counted, Panel, placeRows, RuleContents } from './shared.ts';

/** "Code 271 · Answer · PXY", then its application, and where the id comes from when the header prints none. */
function commandIdentity(command: Pick<Command, 'code' | 'flags' | 'header' | 'application' | 'scope'>): string[] {
  const head = [`Code ${command.code}`, isRequest(command) ? 'Request' : 'Answer', command.flags.join(', ')]
    .filter(Boolean)
    .join(' · ');
  if (command.application === null) return [head, 'No Application-ID: the header prints none'];
  const from = command.header === null && command.scope ? `from ${command.scope.section}, not the header` : '';
  return [head, [`Application-ID ${command.application}`, command.scope?.name ?? '', from].filter(Boolean).join(' · ')];
}

/** What tells a definition from the one the popup is of: its name where that is another, its code and application where they are. */
function difference(other: Command, command: Command | undefined): string {
  const application =
    other.application === null
      ? 'no Application-ID'
      : `Application-ID ${other.application}${other.scope?.name ? ` ${other.scope.name}` : ''}`;
  return [
    other.section,
    !command || other.name !== command.name ? other.name : '',
    command && other.code !== command.code ? `code ${other.code}` : '',
    command && other.application !== command.application ? application : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A run of rows in the targets' grid, under its title and count if `titled`, left out when it has none. */
function group(
  title: string,
  className: string,
  rows: (ComponentChild | undefined)[],
  titled = true,
): ComponentChild[] {
  const kept = rows.filter(row => row !== undefined);
  if (!kept.length) return [];
  return [
    h(
      'div',
      { class: `popup-group ${className}`, role: 'group', 'aria-label': title },
      titled && h('div', { class: 'popup-group-title' }, counted(title, kept.length)),
      kept,
    ),
  ];
}

/**
 * A command's popup: what its header says, its block, the other half, its tables and registry row, and every other
 * document printing it, then those printing its name for another command. The corpus's are the index's, which the
 * document's view has waited for; what is in this file is read from the lines the view shows.
 */
export function CommandPopup(props: PopupProps & { command: CommandRef }) {
  const { site, pane, request, command: ref, demand } = props;
  const { doc, file, opener } = request;
  const index = site.commands();
  const command = commandOf(ref, doc, index);
  useLayoutEffect(() => opener.classList.add('avp-current'), []);
  useLayoutEffect(() => demand(command?.document), [command?.document]);
  const placeRow = placeRows(site, pane, request);
  const name = command?.name ?? ref.name;
  const abbreviation = command ? command.abbreviation : ref.abbreviation;
  const heading = abbreviation ? `${name} (${abbreviation})` : name;
  // This file's as the view shows them: a raw view's rule is the one the raw lines print.
  const blockFile = command && (command.document === doc.id ? file : site.held(command.document));
  const rule = blockFile && ruleAt(blockFile, command.line);
  const all = allCommands(file, doc, index);
  const label = (place: Place) =>
    site.summary(place.document) ? site.label(site.summary(place.document)!) : place.document;
  const rows: (ComponentChild | undefined)[] = [];
  if (command) {
    rows.push(placeRow('Definition', 'place-definition', blockPlace(command, doc)));
    const partner = partnerOf(command, all);
    if (partner) {
      const place = blockPlace(partner, doc);
      const where = [
        partner.document === doc.id ? '' : label(place),
        partner.section,
        partner.abbreviation ?? partner.name,
      ]
        .filter(Boolean)
        .join(' · ');
      rows.push(placeRow(isRequest(partner) ? 'Request' : 'Answer', 'place-partner', place, where));
    }
    rows.push(
      ...group(
        'Tables',
        'popup-tables',
        tablesOf(command, file, doc).map(table =>
          placeRow(
            'AVP table',
            'place-table',
            tablePlace(table, doc),
            [table.section, table.table && `table ${table.table}`].filter(Boolean).join(' · '),
          ),
        ),
        false,
      ),
    );
  }
  rows.push(
    ...registryRows(ref, file, doc, index).map(row => {
      const place = rowPlace(row, doc);
      return placeRow(
        'Registry',
        'place-registry',
        place,
        [row.document === doc.id ? '' : label(place), row.section, row.table && `table ${row.table}`]
          .filter(Boolean)
          .join(' · '),
      );
    }),
  );
  const otherRow = (other: Command, className: string, mark = '') => {
    const place = blockPlace(other, doc);
    return placeRow(`${mark}${label(place)}`, className, place, difference(other, command));
  };
  if (command) {
    const { same, differing } = definitionsOf(command, all);
    rows.push(
      ...group(
        'Other definitions',
        'popup-others',
        same.map(other => otherRow(other, 'place-other')),
      ),
      ...group(
        'Same name, other command',
        'popup-differing',
        differing.map(other => otherRow(other, 'place-other place-differs', '≠ ')),
      ),
    );
  } else {
    const printed = all.filter(other => other.code === ref.code && isRequest(other) === ref.request);
    rows.push(
      ...group(
        'Definitions',
        'popup-others',
        printed.map(other => otherRow(other, 'place-other')),
      ),
    );
  }
  const kept = rows.filter(row => row !== undefined);
  return h(
    Panel,
    { ...props, heading, data: { 'data-command': commandKey(ref) } },
    h(
      'div',
      { class: 'popup-identity' },
      (command ? commandIdentity(command) : [`Code ${ref.code} · ${ref.request ? 'Request' : 'Answer'}`]).map(text =>
        h('p', null, text),
      ),
    ),
    rule?.members.length ? h(RuleContents, { rule, open: false, title: 'AVPs' }) : null,
    kept.length > 0 && h('div', { class: 'popup-places command-places' }, kept),
  );
}
