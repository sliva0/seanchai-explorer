import { Fragment } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChild } from 'preact';
import type { Use } from '../avp-context.ts';
import type { Place } from '../avp-places.ts';
import { blockAt } from '../blocks.ts';
import type { DadFile } from '../blocks.ts';
import {
  blockContext,
  commandConstraints,
  constraintBlocks,
  commandShort,
  constraintsFor,
  elementEntry,
  elementParts,
  lineText,
  membersParts,
  readersFor,
  readsRequest,
  referenceContext,
  referenceText,
  requestMessage,
  ruleNote,
  ruleWhere,
  ruleWords,
  scopeWords,
  textOnly,
  unscoped,
  elementRowContext,
} from '../constraints.ts';
import type { ConstraintBlock, ReadContext, RuleWhere } from '../constraints.ts';
import { docName, newestOf } from '../data.ts';
import type { Site } from '../data.ts';
import { routeFor } from '../navigation.ts';
import type { ConstraintRule, Document, ElementEntry, ElementSource } from '../types.ts';
import type { PopupRequest } from './root.tsx';
import { quoteNeedle } from '../quote-text.ts';
import { Counted, placeRows, TableLink } from './shared.tsx';
import { constraintsSection, elementDepth, elementText } from '../text/rules.ts';

/**
 * Where a use reads its name: in the command or grouped AVP of its block, or wherever; a name an interpreted rule reads
 * where its path reaches it, a member of the grouped AVP before it or of the request.
 */
function useContext(file: DadFile, use: Use | undefined): ReadContext {
  if (!use || use.kind === 'head' || use.kind === 'row') return {};
  if (use.kind === 'member') return blockContext(file, blockAt(file, use.rule.line));
  if (use.kind === 'element') return elementRowContext(use.block, use.row, blockContext(file, use.block));
  if (use.ref) return referenceContext(file, use.block, use.ref);
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

/** Whether two blocks hold in the same place: the same grouped AVP, or the same print of the same command. */
const sameScope = ({ scope: a }: ConstraintBlock, { scope: b }: ConstraintBlock) =>
  (a.within ?? '') === (b.within ?? '') &&
  (a.command ?? '').toLowerCase() === (b.command ?? '').toLowerCase() &&
  a.application === b.application &&
  a.commandSection === b.commandSection;

/**
 * The blocks of the document on other AVPs whose rules read the name where it is read, through a path or the request.
 * Opened on a rule's path through a grouped AVP, those in the rule's own command or grouped AVP: the grouped AVP alone
 * does not say which command's.
 */
export function readersHere(request: PopupRequest, use: Use | undefined): ConstraintBlock[] {
  const { doc, token } = request;
  const found = readersFor(doc, token.avp!, useContext(request.file, use));
  if (use?.kind !== 'constraint' || !use.ref || use.ref.path.length < 2) return found;
  const opened = constraintBlocks(doc).find(item => item.block.line === use.block.line);
  return opened ? found.filter(item => sameScope(item, opened)) : found;
}

/** A command's short name: its abbreviation, as the corpus's index or else the file names it. */
const shortName = (site: Site, doc: Document, name: string) =>
  site.commands()?.commands.find(command => command.name.toLowerCase() === name.toLowerCase() && command.abbreviation)
    ?.abbreviation ?? commandShort(doc, name);

/**
 * "within APN-Configuration · 7.3.35", "in DSR · 5.2.2.2.1 · table 5.2.2.2.1/1", the table a link to its block in the
 * text, which the block's rules were read from; `on` a block on another AVP, "rule on Subscription-Data · in ULA ·
 * 5.2.1.1.1", and `bare` one in its command's popup, the AVP alone, "Auth-Session-State · 5.2.4".
 */
function ScopeLine({
  site,
  doc,
  item: { block, scope, avp },
  on,
  bare,
}: {
  site: Site;
  doc: Document;
  item: ConstraintBlock;
  on?: boolean;
  bare?: boolean;
}) {
  const short = (name: string) => shortName(site, doc, name);
  const words = bare ? [avp] : [on && constraintsSection.ruleOn(avp), scopeWords({ scope }, short)];
  return (
    <div class="constraint-scope">
      {[...words, block.section].filter(Boolean).join(' · ')}
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
 * where it does not, and a `members` rule's names links to their AVPs. A `unique` or `absent` rule is said of `where`.
 */
function RuleText({
  site,
  doc: file,
  rule,
  printed,
  where,
}: {
  site: Site;
  doc: Document;
  rule: ConstraintRule;
  printed: string;
  where: RuleWhere;
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
  if (!doc) return <>{ruleWords(rule, printed, where)}</>;
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
function Printed({ doc, line, title }: { doc: Document; line: number; title?: string }) {
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
  return (
    <code class="constraint-printed" title={title}>
      {parts}
    </code>
  );
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
 * says: the element, what is checked and how far, what is not and why (or, checked in full, what is left open), and
 * the editions its layout was read from. Only the inspector shows it, under a closed Checking.
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
 * What an element's layout means for the value, where it says it in a few words: the first part of what the plugin
 * checks, "1 to 8 octets", "an integer 0 to 255", "at least 2 octets", and nothing for a longer account or one checking
 * nothing.
 */
export function shortCheck(entry: ElementEntry): string | undefined {
  if (entry.depth === 'none') return undefined;
  const first = entry.check.split(';')[0].trim();
  return first.length <= 40 && /^(an integer |at least |at most |\d)/.test(first) ? first : undefined;
}

/** A terse tag after a rule on what the Wireshark plugin makes of it, its tooltip saying more. */
const Tag = ({ text, title }: { text: string; title: string }) => (
  <span class="constraint-tag" title={title}>
    {text}
  </span>
);

/** The tags after an element rule checked partly or not at all, and after a rule reading the request. */
function checkTags(rule: ConstraintRule, entry: ElementEntry | undefined): ComponentChild[] {
  const tags: ComponentChild[] = [];
  if (entry && entry.depth !== 'full') {
    const how =
      entry.depth === 'none' ? elementDepth('none') : elementText.checks(elementDepth(entry.depth), entry.check);
    tags.push(
      <Tag
        key="element"
        text={entry.depth === 'none' ? constraintsSection.notChecked : constraintsSection.partlyChecked}
        title={constraintsSection.elementTitle(how)}
      />,
    );
  }
  if (readsRequest(rule))
    tags.push(<Tag key="request" text={constraintsSection.needsRequestTag} title={constraintsSection.needsRequest} />);
  return tags;
}

/**
 * A sentence a rule was read from, which the rule's words say already: one line, ending in an ellipsis, where it is
 * longer, its whole text its title, opening whole on a click, Enter or Space and closing again the same way; whole
 * where it fits, and where `whole`, a text-only reading's, whose quote is all it says. Nothing keeps it open.
 */
function Quote({ text, whole }: { text: string; whole?: boolean }) {
  const node = useRef<HTMLQuoteElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  // Measured folded, again as its width changes: drawn in a closed section it has none until the section opens.
  useLayoutEffect(() => {
    const quote = node.current;
    if (!quote || whole || open) return;
    const measure = () => setLong(quote.scrollWidth > quote.clientWidth + 1);
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    observer.observe(quote);
    return () => observer.disconnect();
  }, [whole, open]);
  if (whole) return <q class="constraint-quote">{text}</q>;
  const toggle = () => setOpen(shown => !shown);
  return (
    <q
      ref={node}
      class={`constraint-quote${open ? '' : ' constraint-quote-folded'}`}
      title={long ? text : undefined}
      {...(long || open
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-expanded': open,
            onClick: () => {
              // A reader selecting the sentence's words is not asking for it to fold.
              if (open && String(node.current?.ownerDocument.getSelection?.() ?? '')) return;
              toggle();
            },
            onKeyDown: (event: KeyboardEvent) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              toggle();
            },
          }
        : {})}
    >
      {text}
    </q>
  );
}

/** A block as a popup lists it, with the document it is in; `on` a block on another AVP, `bare` in its command's popup. */
interface Listed {
  doc: Document;
  item: ConstraintBlock;
  on?: boolean;
  bare?: boolean;
}

/**
 * A block's rules in a popup: where they hold, each reading's rules once, in plain words, the rule as the text prints it
 * their tooltip, or as printed alone where the words could not say it; what an element's layout means for the value
 * where that is short; a terse tag where the plugin checks a rule partly, not at all or only with the request; the
 * sentences they were read from, each folded to a line, and the way to the block, its clause and the request its rules
 * read. `here`, opened in the block itself, it says only its rules in words, as the text prints the
 * rest right there. `inline`, in the inspector, an element rule has what the registry says of its checking under a
 * closed Checking.
 */
function ConstraintGroup({
  site,
  placeRow,
  request,
  listed: { doc, item, on, bare },
  here,
  inline,
  pane,
}: {
  site: Site;
  placeRow: ReturnType<typeof placeRows>;
  request: PopupRequest;
  listed: Listed;
  here: boolean;
  inline?: boolean;
  pane: Parameters<typeof placeRows>[1];
}) {
  const { block } = item;
  // Where the pane shows the document, each quote is a way to its sentence there, the first the block's place's.
  const inPane = pane.shows(site.summary(doc.id));
  const quoted = (text: string | undefined) => {
    const quote = text && quoteNeedle(text);
    return quote ? { quote } : {};
  };
  const quoteSource = (text: string) =>
    inPane && quoteNeedle(text) ? (
      <button
        class="control quote-source"
        type="button"
        title={constraintsSection.quoteSourceTitle}
        onClick={() =>
          pane.openPlace(
            {
              document: doc.id,
              position: { section: block.section, page: block.page, ...quoted(text) },
              target: { document: doc.id, section: block.section },
              line: block.line,
            },
            request.doc,
          )
        }
      >
        {constraintsSection.quoteSource}
      </button>
    ) : null;
  const label = doc.id === request.doc.id ? '' : site.summary(doc.id) ? site.label(site.summary(doc.id)!) : doc.id;
  const where = ruleWhere(item, name => shortName(site, doc, name));
  const place: Place = {
    document: doc.id,
    position: {
      section: block.section,
      page: block.page,
      ...quoted((block.readings ?? []).flatMap(reading => reading.quotes)[0]?.text),
    },
    target: { document: doc.id, section: block.section },
    line: block.line,
  };
  // The request the block's rules read: its Message block, where the document printing it is at hand.
  const target = block.request_target;
  const requestDoc = target && (target.document === doc.id ? doc : site.held(target.document));
  const requestBlock = requestDoc && requestMessage(requestDoc, block);
  const requestPlace: Place | undefined = target?.section
    ? {
        document: target.document,
        position: { section: target.section!, page: requestBlock?.page ?? null },
        target: { document: target.document, section: target.section },
        ...(requestBlock ? { line: requestBlock.line } : {}),
      }
    : undefined;
  const requestLabel = [
    target && target.document !== request.doc.id && site.summary(target.document)
      ? site.label(site.summary(target.document)!)
      : '',
    requestBlock ? (requestBlock.abbreviation ?? requestBlock.name) : '',
    target?.section,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div class={`constraint-group${on ? ' constraint-reader' : ''}`}>
      {!here && <ScopeLine site={site} doc={doc} item={item} on={on} bare={bare} />}
      <ul class="constraint-readings">
        {(block.readings ?? []).map((reading, index) => {
          const only = textOnly(reading.rules);
          const quotes = (here ? [] : reading.quotes).map(quote => (
            <span key={quote.line} class="constraint-quote-line">
              <Quote text={quote.text} whole={only} />
              {quoteSource(quote.text)}
            </span>
          ));
          if (only)
            return (
              <li key={index} class="constraint-reading constraint-text-only">
                <span class="constraint-rule">
                  <Tag text={constraintsSection.notChecked} title={constraintsSection.textOnlyTitle} />
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
                const note = ruleNote(rule);
                // Where the words cannot say the rule, they are the line as printed: that alone, as the text prints it.
                const fallback = ruleWords(rule, printed, where) === printed.trim();
                const value = entry && shortCheck(entry);
                const tags = checkTags(rule, entry);
                return (
                  <span key={rule.line} class="constraint-rule">
                    {fallback ? (
                      <Printed doc={doc} line={rule.line} title={note} />
                    ) : (
                      <span
                        class="constraint-words"
                        title={
                          [here ? '' : constraintsSection.printedTitle(printed.trim()), note]
                            .filter(Boolean)
                            .join('\n') || undefined
                        }
                      >
                        <RuleText site={site} doc={doc} rule={rule} printed={printed} where={where} />
                      </span>
                    )}
                    {(value || tags.length > 0) && (
                      <span class="constraint-meta">
                        {value && <span class="constraint-value">{value}</span>}
                        {tags}
                      </span>
                    )}
                    {entry && inline && (
                      <details class="constraint-checking">
                        <summary>{constraintsSection.checking}</summary>
                        <ElementRows site={site} entry={entry} />
                      </details>
                    )}
                  </span>
                );
              })}
              {quotes}
            </li>
          );
        })}
      </ul>
      {!here && (
        <div class="popup-places constraint-places">
          {placeRow(
            constraintsSection.readIn,
            'place-constraint',
            place,
            [label, block.section].filter(Boolean).join(' · '),
          )}
          {requestPlace && placeRow(constraintsSection.request, 'place-request', requestPlace, requestLabel)}
        </div>
      )}
    </div>
  );
}

/**
 * The section of a popup listing blocks, folded under its heading as Uses is, the heading counting them and saying in
 * `gist` what they are, with its button opening the help at them. A ¶ or anything else sending the reader to them opens
 * it (`unfoldConstraints`); nothing keeps it open from one popup to the next.
 */
function ConstraintSection({
  count,
  gist,
  children,
  className = '',
}: {
  count: number;
  gist?: string;
  children: ComponentChild;
  className?: string;
}) {
  return (
    <section class={`popup-constraints ${className}`.trim()} aria-label={constraintsSection.label}>
      <details class="constraints-fold">
        <summary class="constraints-title">
          <Counted title={constraintsSection.heading} count={count} />
          {gist && <span class="constraints-gist"> {gist}</span>}
        </summary>
        <button type="button" class="constraints-about" title={INTERPRETED_NOTE} onClick={showConstraintsHelp}>
          {constraintsSection.about}
        </button>
        {children}
      </details>
    </section>
  );
}

/** Opens a popup's or the inspector's Interpreted section, folded until the reader is sent to it. */
export function unfoldConstraints(section: Element) {
  const fold = section.querySelector<HTMLDetailsElement>(':scope > .constraints-fold');
  if (fold) fold.open = true;
}

/**
 * What the Interpreted Constraints say of the name where it stands, each block's rules in plain words, the text's line
 * their tooltip, with the sentences they were read from, where they hold, and the way to the block and its
 * clause; then the blocks on other AVPs whose rules read it there. The block is in the corrected text, which a raw
 * view's way goes to.
 */
export function ConstraintFacts({
  site,
  pane,
  request,
  use,
  inline,
}: {
  site: Site;
  pane: Parameters<typeof placeRows>[1];
  request: PopupRequest;
  use: Use | undefined;
  inline?: boolean;
}) {
  const found: Listed[] = constraintsHere(site, request, use);
  // Opened in a block of them, the text prints its scope, rules and quotes right there: of that block the popup says
  // only what the text does not, its rules in words and an element rule's registry entry.
  const opened = (doc: Document, item: ConstraintBlock) =>
    use?.kind === 'constraint' && doc.id === request.doc.id && item.block.line === use.block.line;
  const listed = new Set(found.map(({ item }) => item));
  const readers: Listed[] = readersHere(request, use)
    .filter(item => !listed.has(item) && !opened(request.doc, item))
    .map(item => ({ doc: request.doc, item, on: true }));
  const all = [...found, ...readers];
  if (!all.length) return null;
  const placeRow = placeRows(site, pane, { ...request, raw: false });
  return (
    <ConstraintSection count={all.length} gist={constraintsSection.gist(found.length, readers.length)}>
      {all.map(item => (
        <ConstraintGroup
          key={`${item.doc.id}:${item.item.block.line}`}
          site={site}
          placeRow={placeRow}
          request={request}
          listed={item}
          here={opened(item.doc, item.item)}
          inline={inline}
          pane={pane}
        />
      ))}
    </ConstraintSection>
  );
}

/**
 * What the Interpreted Constraints say of a command that its body's lines cannot show: the blocks scoped to it on an
 * AVP its rule does not print, which only its `* [ AVP ]` admits, and those saying an AVP is never sent in it, each
 * named by its AVP. `doc` is the corrected document printing the command, `context` where it is read and `members`
 * the names its rule prints.
 */
export function CommandConstraintFacts({
  site,
  pane,
  request,
  doc,
  context,
  members,
  inline,
}: {
  site: Site;
  pane: Parameters<typeof placeRows>[1];
  request: PopupRequest;
  doc: Document;
  context: ReadContext;
  members: Set<string>;
  inline?: boolean;
}) {
  const found = commandConstraints(doc, context, members);
  if (!found.length) return null;
  const placeRow = placeRows(site, pane, { ...request, raw: false });
  return (
    <ConstraintSection count={found.length} className="command-constraints">
      {found.map(item => (
        <ConstraintGroup
          key={`${doc.id}:${item.block.line}`}
          site={site}
          placeRow={placeRow}
          request={request}
          listed={{ doc, item, bare: true }}
          here={false}
          inline={inline}
          pane={pane}
        />
      ))}
    </ConstraintSection>
  );
}
