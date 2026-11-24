import { Fragment } from 'preact';
import type { ComponentChild } from 'preact';
import type { Use } from '../avp-context.ts';
import type { Place } from '../avp-places.ts';
import { blockAt } from '../blocks.ts';
import type { DadFile } from '../blocks.ts';
import {
  blockContext,
  constraintsFor,
  elementEntry,
  elementParts,
  lineText,
  membersParts,
  referenceText,
  ruleNote,
  ruleWords,
  scopeWords,
  textOnly,
  unscoped,
} from '../constraints.ts';
import type { ConstraintBlock, ReadContext } from '../constraints.ts';
import { docName, newestOf } from '../data.ts';
import type { Site } from '../data.ts';
import { routeFor } from '../navigation.ts';
import type { ConstraintRule, Document, ElementEntry, ElementSource } from '../types.ts';
import type { PopupRequest } from './root.tsx';
import { Counted, placeRows, TableLink } from './shared.tsx';
import { constraintsSection, elementDepth, elementText } from '../text/rules.ts';

/** Where a use reads its name: in the command or grouped AVP of its block, or wherever. */
function useContext(file: DadFile, use: Use | undefined): ReadContext {
  if (!use || use.kind === 'head' || use.kind === 'row') return {};
  if (use.kind === 'member') return blockContext(file, blockAt(file, use.rule.line));
  return blockContext(file, use.block);
}

/**
 * The Interpreted Constraints that hold for a name where it is read, with the document they are in: the corrected
 * text's, which a raw view reads too, for its place; and wherever it is read, the document's own, or else those of the
 * document its link names, once loaded, as the corpus takes an AVP's from its origin.
 */
export function constraintsHere(
  site: Site,
  request: PopupRequest,
  use: Use | undefined,
): { doc: Document; item: ConstraintBlock }[] {
  const { doc, token } = request;
  const name = token.avp!;
  const found = constraintsFor(doc, name, useContext(request.file, use)).map(item => ({ doc, item }));
  const away = token.target && token.target.document !== doc.id ? site.held(token.target.document) : undefined;
  if (!away || found.some(({ item }) => unscoped(item))) return found;
  const origin = constraintsFor(away, token.target!.name ?? name, {}).filter(unscoped);
  return [...found, ...origin.map(item => ({ doc: away, item }))];
}

/**
 * "within APN-Configuration · 7.3.35", "in DSR · 5.2.2.2.1 · table 5.2.2.2.1/1", the table a link to its block in the
 * text, which the block's rules were read from.
 */
function ScopeLine({ site, doc, item: { block, scope } }: { site: Site; doc: Document; item: ConstraintBlock }) {
  const short = (name: string) =>
    site.commands()?.commands.find(command => command.name.toLowerCase() === name.toLowerCase() && command.abbreviation)
      ?.abbreviation ?? name;
  return (
    <div class="constraint-scope">
      {[scopeWords({ scope }, short), block.section].filter(Boolean).join(' · ')}
      {block.fields.Table && (
        <>
          {' · '}
          <TableLink site={site} document={doc.id} table={block.fields.Table} />
        </>
      )}
    </div>
  );
}

/**
 * The names a `members` rule lists, each a link to its definition as its token on the rule's line has it, as an AVP's
 * name links in a value's popup, or text where the line links it nowhere.
 */
function MemberNames({ doc, rule, names }: { doc: Document; rule: ConstraintRule; names: string[] }) {
  const tokens = doc.lines[rule.line]?.tokens ?? [];
  return (
    <>
      {names.map((name, index) => {
        const target = tokens.find(token => token.avp === name)?.target;
        return (
          <Fragment key={name}>
            {index > 0 && ', '}
            {target ? (
              <a class="constraint-avp" href={routeFor({ ...target, name })}>
                {name}
              </a>
            ) : (
              name
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * A rule in words, an element rule's document a link to its newest edition where the corpus holds it, TS 24.008 text
 * where it does not, and a `members` rule's names links to their AVPs. A `unique` rule is said of `within`.
 */
function RuleText({
  site,
  doc: file,
  rule,
  printed,
  within,
}: {
  site: Site;
  doc: Document;
  rule: ConstraintRule;
  printed: string;
  within?: string;
}) {
  const members = rule.kind === 'members' ? membersParts(rule) : undefined;
  if (members)
    return (
      <>
        {members.before && `${members.before} `}
        <MemberNames doc={file} rule={rule} names={members.names} />
        {members.after && ` ${members.after}`}
      </>
    );
  const held = rule.kind === 'encoding' && rule.codec === 'element' && rule.document;
  const doc = held ? newestOf(site.index.documents, rule.document!) : undefined;
  if (!doc) return <>{ruleWords(rule, printed, within)}</>;
  const { before, after } = elementParts(rule);
  return (
    <>
      {`${before} `}
      <a class="constraint-document" href={routeFor({ document: doc.id })}>
        {site.label(doc)}
      </a>
      {after && ` ${after}`}
    </>
  );
}

/**
 * A rule as the text prints it, its kind the keyword, as the block's line has it, less its indent: `requires DSR-Flags
 * bit "Trace Data Withdrawal"`. A name the line links wraps whole, never at its hyphens, as in the document view.
 */
function Printed({ doc, line }: { doc: Document; line: number }) {
  const parts: ComponentChild[] = [];
  let started = false;
  for (const [index, token] of (doc.lines[line]?.tokens ?? []).entries()) {
    let text = token.text.replace(/\n$/, '');
    if (!started) {
      text = text.trimStart();
      if (!text) continue;
      started = true;
      const [, kind = '', rest = ''] = text.match(/^(\S+)([\s\S]*)$/) ?? [];
      parts.push(
        <span key="kind" class="constraint-keyword">
          {kind}
        </span>,
      );
      text = rest;
      if (!text) continue;
    }
    parts.push(
      token.avp ? (
        <span key={index} class="constraint-name">
          {text}
        </span>
      ) : (
        text
      ),
    );
  }
  return <code class="constraint-printed">{parts}</code>;
}

/**
 * A source an element's layout was read from: the document, a link to the edition read where the corpus holds it, or
 * else to its newest, as an element rule's document links, and text where it holds none; then the edition and clause,
 * and what in the clause as its title.
 */
function SourceText({ site, source }: { site: Site; source: ElementSource }) {
  const editions = site.index.documents.filter(doc => doc.reference === source.document);
  const doc =
    editions.find(edition => edition.version && `V${edition.version}` === source.edition) ??
    newestOf(site.index.documents, source.document);
  const tail = elementText.source(source.edition, source.clause);
  return (
    <span class="element-source" title={source.where}>
      {doc ? (
        <a class="constraint-document" href={routeFor({ document: doc.id })}>
          {docName(doc)}
        </a>
      ) : (
        referenceText(source.document)
      )}
      {tail}
    </span>
  );
}

/**
 * What an element rule's element is and how far the Wireshark plugin checks it, as the corpus's element registry
 * says, under the rule: the element, what is checked and how far, what is not and why (or, checked in full, what is
 * left open), and the editions its layout was read from.
 */
function ElementRows({ site, entry }: { site: Site; entry: ElementEntry }) {
  const row = (label: string, value: ComponentChild, kind: string) => (
    <span class={`element-row element-${kind}`}>
      <span class="element-label">{label}: </span>
      {value}
    </span>
  );
  return (
    <span class={`constraint-element element-depth-${entry.depth}`}>
      {row(elementText.is, entry.title, 'title')}
      {entry.depth !== 'none' &&
        row(elementText.checked, elementText.checks(elementDepth(entry.depth), entry.check), 'check')}
      {entry.unchecked &&
        row(entry.depth === 'full' ? elementText.open : elementText.unchecked, entry.unchecked, 'unchecked')}
      {entry.sources.length > 0 &&
        row(
          elementText.sources,
          entry.sources.map((source, index) => (
            <Fragment key={index}>
              {index > 0 && elementText.between}
              <SourceText site={site} source={source} />
            </Fragment>
          )),
          'sources',
        )}
    </span>
  );
}

/** The help, open at its section on interpreted constraints, which says what they are and how they are read. */
function showConstraintsHelp() {
  const help = document.getElementById('help');
  if (help?.hidden) document.querySelector<HTMLButtonElement>('.help-toggle')?.click();
  document.querySelector('#help .help-constraints')?.scrollIntoView({ block: 'start' });
}

/** What the section is, in two sentences: the title of its button opening the help there. */
export const INTERPRETED_NOTE = constraintsSection.aboutTitle;

/**
 * What the Interpreted Constraints say of the name where it stands, each block's rules in plain words and under them
 * as the text prints them, with the sentences they were read from, where they hold, and the way to the block and its clause. The block is in the
 * corrected text, which a raw view's way goes to.
 */
export function ConstraintFacts({
  site,
  pane,
  request,
  use,
}: {
  site: Site;
  pane: Parameters<typeof placeRows>[1];
  request: PopupRequest;
  use: Use | undefined;
}) {
  const found = constraintsHere(site, request, use);
  if (!found.length) return null;
  const placeRow = placeRows(site, pane, { ...request, raw: false });
  const groups: ComponentChild[] = found.map(({ doc, item }) => {
    const { block } = item;
    const label = doc.id === request.doc.id ? '' : site.summary(doc.id) ? site.label(site.summary(doc.id)!) : doc.id;
    const place: Place = {
      document: doc.id,
      position: { section: block.section, page: block.page },
      target: { document: doc.id, section: block.section },
      line: block.line,
    };
    return (
      <div key={`${doc.id}:${block.line}`} class="constraint-group">
        <ScopeLine site={site} doc={doc} item={item} />
        <ul class="constraint-readings">
          {(block.readings ?? []).map((reading, index) => {
            const quotes = reading.quotes.map(quote => (
              <q key={quote.line} class="constraint-quote">
                {quote.text}
              </q>
            ));
            if (textOnly(reading.rules))
              return (
                <li key={index} class="constraint-reading constraint-text-only">
                  <span class="constraint-rule" title={constraintsSection.textOnlyTitle}>
                    <span class="constraint-words">{constraintsSection.textOnly}</span>
                  </span>
                  {quotes}
                </li>
              );
            const rules = reading.rules.filter(rule => rule.kind !== 'text-only');
            return (
              <li key={index} class="constraint-reading">
                {rules.map(rule => {
                  const printed = lineText(doc, rule.line);
                  const entry = elementEntry(rule);
                  return (
                    <span key={rule.line} class="constraint-rule" title={ruleNote(rule)}>
                      <span class="constraint-words">
                        <RuleText site={site} doc={doc} rule={rule} printed={printed} within={item.scope.within} />
                      </span>
                      <Printed doc={doc} line={rule.line} />
                      {entry && <ElementRows site={site} entry={entry} />}
                    </span>
                  );
                })}
                {quotes}
              </li>
            );
          })}
        </ul>
        <div class="popup-places constraint-places">
          {placeRow(
            constraintsSection.readIn,
            'place-constraint',
            place,
            [label, block.section].filter(Boolean).join(' · '),
          )}
        </div>
      </div>
    );
  });
  return (
    <section class="popup-constraints" aria-label={constraintsSection.label}>
      <div class="constraints-title">
        <Counted title={constraintsSection.heading} count={found.length} />
        <button type="button" class="constraints-about" title={INTERPRETED_NOTE} onClick={showConstraintsHelp}>
          {constraintsSection.about}
        </button>
      </div>
      {groups}
    </section>
  );
}
