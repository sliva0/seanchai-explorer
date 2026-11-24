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
import { Counted, ExternalLink, placeRows } from './shared.tsx';

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

/** "within APN-Configuration · 7.3.35", "in DSR · 5.2.2.2.1 · table 5.2.2.2.1/1". */
function scopeLine(site: Site, { block, scope }: ConstraintBlock): string {
  const short = (name: string) =>
    site.commands()?.commands.find(command => command.name.toLowerCase() === name.toLowerCase() && command.abbreviation)
      ?.abbreviation ?? name;
  return [scopeWords({ scope }, short), block.section, block.fields.Table && `table ${block.fields.Table}`]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A rule in words, an element rule's document a link to its newest edition where the corpus holds it, TS 24.008 text
 * where it does not.
 */
function RuleText({ site, rule, printed }: { site: Site; rule: ConstraintRule; printed: string }) {
  const held = rule.kind === 'encoding' && rule.codec === 'element' && rule.document;
  const doc = held ? newestOf(site.index.documents, rule.document!) : undefined;
  if (!doc) return <>{ruleWords(rule, printed)}</>;
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

const INTERPRETED_NOTE =
  "Interpreted: a reader's reading of the clause's prose, pinned to the sentence quoted. The document prints no such rule as structure: trust it as far as the quote.";

/**
 * What the Interpreted Constraints say of the name where it stands, each block's rules in plain words with the
 * sentences they were read from, where they hold, and the way to the block and its clause. The block is in the
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
        <div class="constraint-scope">{scopeLine(site, item)}</div>
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
                  <span class="constraint-kind" title="A rule no checker can run: the quote says it">
                    text only
                  </span>{' '}
                  {quotes}
                </li>
              );
            const rules = reading.rules.filter(rule => rule.kind !== 'text-only');
            return (
              <li key={index} class="constraint-reading">
                <details>
                  <summary title="The quote it was read from">
                    {rules.map((rule, at) => (
                      <span key={rule.line} class="constraint-rule" title={ruleNote(rule)}>
                        {at > 0 && ' · '}
                        <RuleText site={site} rule={rule} printed={lineText(doc, rule.line)} />
                      </span>
                    ))}
                  </summary>
                  {quotes}
                </details>
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
      <div class="constraints-title" title={INTERPRETED_NOTE}>
        <Counted title="Interpreted" count={found.length} />
        <ExternalLink class="constraints-about" href={CONSTRAINTS_DOC}>
          what these are
        </ExternalLink>
      </div>
      {groups}
    </section>
  );
}
