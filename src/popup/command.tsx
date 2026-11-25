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
import { tablePlace as elementsPlace } from '../element-places.ts';
import { categoriesOf, memberElements, tablesFor } from '../elements.ts';
import { listingsFor } from '../result-codes.ts';
import { CommandConstraintFacts } from './constraints.tsx';
import type { PopupProps } from './root.tsx';
import { Counted, Panel, placeRows, RuleContents } from './shared.tsx';
import { commandPopup as words } from '../text/popup.ts';

/** "Code 271 · Answer · PXY", then its application, and where the id comes from when the header prints none. */
function commandIdentity(command: Pick<Command, 'code' | 'flags' | 'header' | 'application' | 'scope'>): string[] {
  const head = [words.code(command.code), isRequest(command) ? words.request : words.answer, command.flags.join(', ')]
    .filter(Boolean)
    .join(' · ');
  if (command.application === null) return [head, words.noApplicationId];
  const from = command.header === null && command.scope ? words.idFrom(command.scope.section) : '';
  return [
    head,
    [words.applicationId(command.application), command.scope?.name ?? '', from].filter(Boolean).join(' · '),
  ];
}

/** What tells a definition from the one the popup is of: its name where that is another, its code and application where they are. */
function difference(other: Command, command: Command | undefined): string {
  const application =
    other.application === null
      ? words.noOtherApplication
      : words.otherApplication(other.application, other.scope?.name ?? '');
  return [
    other.section,
    !command || other.name !== command.name ? other.name : '',
    command && other.code !== command.code ? words.otherCode(other.code) : '',
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
    <div key={title} class={`popup-group ${className}`} role="group" aria-label={title}>
      {titled && (
        <div class="popup-group-title">
          <Counted title={title} count={kept.length} />
        </div>
      )}
      {kept}
    </div>,
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
  useLayoutEffect(() => {
    if (!props.inline) opener.classList.add('avp-current');
  }, []);
  useLayoutEffect(() => demand(command?.document), [command?.document]);
  const placeRow = placeRows(site, pane, request);
  const name = command?.name ?? ref.name;
  const abbreviation = command ? command.abbreviation : ref.abbreviation;
  const heading = abbreviation ? `${name} (${abbreviation})` : name;
  // This file's as the view shows them: a raw view's rule is the one the raw lines print.
  const blockFile = command && (command.document === doc.id ? file : site.held(command.document));
  const rule = blockFile && ruleAt(blockFile, command.line);
  // Opened in its own block, the text prints its members and is its definition: the popup says neither again.
  const ownBlock =
    !!command &&
    command.document === doc.id &&
    !!rule &&
    ruleAt(file, Number(opener.closest<HTMLElement>('.dad-line')?.dataset.line)) === rule;
  // The corrected document printing it, whose Interpreted Constraints blocks a command's popup lists what its lines cannot show of.
  const constraintDoc = command && (command.document === doc.id ? doc : site.held(command.document));
  const all = allCommands(file, doc, index);
  // The Information Elements tables describing the block, which may be another document's: a block of the file at hand
  // by its place among its clause's, one from the index by its line in the corrected text.
  const elementTables = command ? tablesFor(site.elements(), command.document, command, ref.block && file) : [];
  const categories = new Map(
    (rule?.members ?? []).map(member => [member.name, categoriesOf(memberElements(elementTables, member.name))]),
  );
  const label = (place: Pick<Place, 'document'>) =>
    site.summary(place.document) ? site.label(site.summary(place.document)!) : place.document;
  const rows: (ComponentChild | undefined)[] = [];
  if (command) {
    if (!ownBlock) rows.push(placeRow(words.definition, 'place-definition', blockPlace(command, doc)));
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
      rows.push(placeRow(isRequest(partner) ? words.request : words.answer, 'place-partner', place, where));
    }
    rows.push(
      ...group(
        words.tables,
        'popup-tables',
        tablesOf(command, file, doc).map(table =>
          placeRow(words.avpTable, 'place-table', tablePlace(table, doc), table.section, {
            document: doc.id,
            table: table.table,
          }),
        ),
        false,
      ),
      // The tables of the result codes its answer may carry: this file's and those of the documents loaded.
      ...group(
        words.resultCodes,
        'popup-result-codes',
        [...new Set([doc.id, ...(site.held(command.document) ? [command.document] : [])])].flatMap(id => {
          const listed = id === doc.id ? file : site.held(id)!;
          return listingsFor(listed, command, command.name).map(block =>
            placeRow(
              words.resultCodes,
              'place-result-codes',
              {
                document: id,
                ...(id === doc.id ? { position: { section: block.section, page: block.page } } : {}),
                target: { document: id, section: block.section },
                line: block.line,
              },
              [id === doc.id ? '' : label({ document: id }), block.section].filter(Boolean).join(' · '),
              block.fields.Table ? { document: id, table: block.fields.Table } : undefined,
            ),
          );
        }),
        false,
      ),
      ...group(
        words.informationElements,
        'popup-elements',
        elementTables.map(table =>
          placeRow(
            words.elements,
            'place-elements',
            elementsPlace(table, file, doc),
            [table.document === doc.id ? '' : label({ document: table.document }), table.section]
              .filter(Boolean)
              .join(' · '),
            table,
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
        words.registry,
        'place-registry',
        place,
        [row.document === doc.id ? '' : label(place), row.section].filter(Boolean).join(' · '),
        { document: row.document, table: row.table },
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
        words.otherDefinitions,
        'popup-others',
        same.map(other => otherRow(other, 'place-other')),
      ),
      ...group(
        words.sameName,
        'popup-differing',
        differing.map(other => otherRow(other, 'place-other place-differs', '≠ ')),
      ),
    );
  } else {
    const printed = all.filter(other => other.code === ref.code && isRequest(other) === ref.request);
    rows.push(
      ...group(
        words.definitions,
        'popup-others',
        printed.map(other => otherRow(other, 'place-other')),
      ),
    );
  }
  const kept = rows.filter(row => row !== undefined);
  return (
    <Panel {...props} heading={heading} data={{ 'data-command': commandKey(ref) }}>
      <div class="popup-identity">
        {(command
          ? commandIdentity(command)
          : [`${words.code(ref.code)} · ${ref.request ? words.request : words.answer}`]
        ).map((text, index) => (
          <p key={index}>{text}</p>
        ))}
      </div>
      {rule?.members.length && !ownBlock ? (
        <RuleContents rule={rule} open={false} title={words.avps} categories={categories} />
      ) : null}
      {command && rule && constraintDoc && (
        <CommandConstraintFacts
          site={site}
          pane={pane}
          request={request}
          doc={constraintDoc}
          context={{ command: { name: command.name, application: command.application, section: command.section } }}
          members={new Set(rule.members.map(member => member.name))}
          inline={props.inline}
        />
      )}
      {kept.length > 0 && <div class="popup-places command-places">{kept}</div>}
    </Panel>
  );
}
