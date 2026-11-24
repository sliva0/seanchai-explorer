import { Fragment } from 'preact';
import type { ComponentChild } from 'preact';
import type { Use } from '../avp-context.ts';
import type { Place } from '../avp-places.ts';
import { blockAt } from '../blocks.ts';
import type { DadFile } from '../blocks.ts';
import {
  blockContext,
  CONSTRAINTS_DOC,
  constraintsFor,
  elementParts,
  lineText,
  membersParts,
  ruleNote,
  ruleWords,
  scopeWords,
  textOnly,
  unscoped,
} from '../constraints.ts';
import type { ConstraintBlock, ReadContext } from '../constraints.ts';
import { newestOf } from '../data.ts';
import type { Site } from '../data.ts';
import { routeFor } from '../navigation.ts';
import type { ConstraintRule, Document } from '../types.ts';
import type { PopupRequest } from './root.tsx';
import { Counted, ExternalLink, placeRows, TableLink } from './shared.tsx';

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
 * bit "Trace Data Withdrawal"`.
 */
function Printed({ text }: { text: string }) {
  const [, kind = '', rest = ''] = text.trim().match(/^(\S+)(.*)$/) ?? [];
  return (
    <code class="constraint-printed">
      <span class="constraint-keyword">{kind}</span>
      {rest}
    </code>
  );
}

/** What the section is, in two sentences: the title of its link to the corpus's account of them. */
export const INTERPRETED_NOTE =
  'Rules a reader of the specification took from its prose, each beside the sentence it was read from. The specification prints none of them as a table or ABNF rule, so each is as sure as its quote.';

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
                  <span
                    class="constraint-rule"
                    title="No checker can run it on one message: the quote is the whole of it, as the text prints text-only"
                  >
                    <span class="constraint-words">Not checkable from one message</span>
                  </span>
                  {quotes}
                </li>
              );
            const rules = reading.rules.filter(rule => rule.kind !== 'text-only');
            return (
              <li key={index} class="constraint-reading">
                {rules.map(rule => {
                  const printed = lineText(doc, rule.line);
                  return (
                    <span key={rule.line} class="constraint-rule" title={ruleNote(rule)}>
                      <span class="constraint-words">
                        <RuleText site={site} doc={doc} rule={rule} printed={printed} within={item.scope.within} />
                      </span>
                      <Printed text={printed} />
                    </span>
                  );
                })}
                {quotes}
              </li>
            );
          })}
        </ul>
        <div class="popup-places constraint-places">
          {placeRow('Read in', 'place-constraint', place, [label, block.section].filter(Boolean).join(' · '))}
        </div>
      </div>
    );
  });
  return (
    <section class="popup-constraints" aria-label="Interpreted constraints">
      <div class="constraints-title">
        <Counted title="Interpreted" count={found.length} />
        <ExternalLink class="constraints-about" href={CONSTRAINTS_DOC} title={INTERPRETED_NOTE}>
          what these are
        </ExternalLink>
      </div>
      {groups}
    </section>
  );
}
