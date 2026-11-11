import { ruleAt } from './avp-context.ts';
import type { Place } from './avp-places.ts';
import { ruleContents } from './avp-popup.ts';
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
} from './command-places.ts';
import type { Command } from './command-places.ts';
import { commandKey, isRequest } from './commands.ts';
import type { CommandRef } from './commands.ts';
import type { Site } from './data.ts';
import { counted, element } from './dom.ts';
import type { PopupRequest, PopupShell } from './popup.ts';

/** A command's popup: what its header says, its rule, and every place printing it. */
export function createCommandPopup(shell: PopupShell, site: Site) {
  /** "Code 271 · Answer · PXY", then its application, and where the id comes from when the header prints none. */
  function commandIdentity(command: Pick<Command, 'code' | 'flags' | 'header' | 'application' | 'scope'>): string[] {
    const head = [`Code ${command.code}`, isRequest(command) ? 'Request' : 'Answer', command.flags.join(', ')]
      .filter(Boolean)
      .join(' · ');
    if (command.application === null) return [head, 'No Application-ID: the header prints none'];
    const from = command.header === null && command.scope ? `from ${command.scope.section}, not the header` : '';
    return [
      head,
      [`Application-ID ${command.application}`, command.scope?.name ?? '', from].filter(Boolean).join(' · '),
    ];
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
  function group(title: string, className: string, rows: (HTMLElement | undefined)[], titled = true) {
    const kept = rows.filter(row => row !== undefined);
    if (!kept.length) return [];
    const node = element('div', undefined, `popup-group ${className}`);
    node.setAttribute('role', 'group');
    node.setAttribute('aria-label', title);
    if (titled) {
      const heading = element('div', undefined, 'popup-group-title');
      heading.append(...counted(title, kept.length));
      node.append(heading);
    }
    node.append(...kept);
    return [node];
  }

  /**
   * A command's popup: what its header says, its block, the other half, its tables and registry row, and every other
   * document printing it, then those printing its name for another command. The corpus's are the index's, which the
   * document's view has waited for; what is in this file is read from the lines the view shows.
   */
  function showCommand(ref: CommandRef, request: PopupRequest) {
    const { doc, file, opener, documentPane } = request;
    const index = site.commands();
    const command = commandOf(ref, doc, index);
    const name = command?.name ?? ref.name;
    const abbreviation = command ? command.abbreviation : ref.abbreviation;
    const heading = abbreviation ? `${name} (${abbreviation})` : name;
    const { panel, closeButton } = shell.open(heading, opener);
    panel.dataset.command = commandKey(ref);
    opener.classList.add('avp-current');
    const identity = element('div', undefined, 'popup-identity');
    identity.append(
      ...(command ? commandIdentity(command) : [`Code ${ref.code} · ${ref.request ? 'Request' : 'Answer'}`]).map(text =>
        element('p', text),
      ),
    );
    panel.append(identity);
    // This file's as the view shows them: a raw view's rule is the one the raw lines print.
    const blockFile = command && (command.document === doc.id ? file : site.held(command.document));
    shell.loadThenRedraw(command?.document, request, () => showCommand(ref, request));
    const rule = blockFile && ruleAt(blockFile, command.line);
    if (rule?.members.length) panel.append(ruleContents(rule, false, 'AVPs'));
    const all = allCommands(file, doc, index);
    const label = (place: Place) =>
      site.summary(place.document) ? site.label(site.summary(place.document)!) : place.document;
    const rows: HTMLElement[] = [];
    const add = (...found: (HTMLElement | undefined)[]) => rows.push(...found.filter(row => row !== undefined));
    if (command) {
      add(shell.placeRow('Definition', 'place-definition', blockPlace(command, doc), request));
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
        add(shell.placeRow(isRequest(partner) ? 'Request' : 'Answer', 'place-partner', place, request, where));
      }
      add(
        ...group(
          'Tables',
          'popup-tables',
          tablesOf(command, file, doc).map(table =>
            shell.placeRow(
              'AVP table',
              'place-table',
              tablePlace(table, doc),
              request,
              [table.section, table.table && `table ${table.table}`].filter(Boolean).join(' · '),
            ),
          ),
          false,
        ),
      );
    }
    add(
      ...registryRows(ref, file, doc, index).map(row => {
        const place = rowPlace(row, doc);
        return shell.placeRow(
          'Registry',
          'place-registry',
          place,
          request,
          [row.document === doc.id ? '' : label(place), row.section, row.table && `table ${row.table}`]
            .filter(Boolean)
            .join(' · '),
        );
      }),
    );
    const otherRow = (other: Command, className: string, mark = '') => {
      const place = blockPlace(other, doc);
      return shell.placeRow(`${mark}${label(place)}`, className, place, request, difference(other, command));
    };
    if (command) {
      const { same, differing } = definitionsOf(command, all);
      add(
        ...group(
          'Other definitions',
          'popup-others',
          same.map(other => otherRow(other, 'place-other')),
        ),
      );
      add(
        ...group(
          'Same name, other command',
          'popup-differing',
          differing.map(other => otherRow(other, 'place-other place-differs', '≠ ')),
        ),
      );
    } else {
      const printed = all.filter(other => other.code === ref.code && isRequest(other) === ref.request);
      add(
        ...group(
          'Definitions',
          'popup-others',
          printed.map(other => otherRow(other, 'place-other')),
        ),
      );
    }
    if (rows.length) {
      const places = element('div', undefined, 'popup-places command-places');
      places.append(...rows);
      panel.append(places);
    }
    shell.place(panel, closeButton, opener, documentPane);
  }

  return showCommand;
}
