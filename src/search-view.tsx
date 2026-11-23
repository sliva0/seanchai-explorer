import { Fragment } from 'preact';
import type { ComponentChild, ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { docAbout, docInFamily, docName, interfacesOf, publisherRank } from './data.ts';
import type { Site } from './data.ts';
import { routeFor } from './navigation.ts';
import {
  definitions,
  filterMentions,
  foldMentions,
  groupFacts,
  identityLabel,
  indexEntries,
  interfaceSpans,
  isApproximate,
  matchSpans,
  mentionSpans,
  searchEntries,
  searchSpecifications,
  sortMentions,
  usualDefinition,
} from './search.ts';
import type { EntryIndex, FoldedMention, NameGroup } from './search.ts';
import type { Span } from './fuzzy.ts';
import type { DocumentSummary, SearchEntry, Target } from './types.ts';
import { valueKinds } from './values.ts';

const pageSize = 20;
const sections: { kind: SearchEntry['kind']; title: string }[] = [
  { kind: 'avp', title: 'AVPs' },
  { kind: 'command', title: 'Commands' },
  { kind: 'application', title: 'Applications' },
  { kind: 'registry', title: 'Registry rows' },
];

/** Text with its spans in `mark`s. */
function marked(text: string, spans: Span[]): ComponentChild[] {
  const parts: ComponentChild[] = [];
  let at = 0;
  for (const [start, end] of spans) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark>{text.slice(start, end)}</mark>);
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/** Parts said one after another, with `, ` between. */
const listed = (parts: ComponentChildren[]) =>
  parts.map((part, index) => (
    <Fragment key={index}>
      {index ? ', ' : ''}
      {part}
    </Fragment>
  ));

const href = (target: Target) => routeFor(target);

/** A document's link with what tells it from the entry's others, muted and in the link. */
function DetailedLink({
  text,
  target,
  title,
  detail,
}: {
  text: string;
  target: Target;
  title?: string;
  detail: ComponentChildren[];
}) {
  return (
    <a href={href(target)} title={title}>
      {text}
      {detail.length > 0 && <span class="doc-detail"> ({listed(detail)})</span>}
    </a>
  );
}

interface ListedDocument {
  doc: DocumentSummary | undefined;
  node: ComponentChild;
}

/** A row per publisher, in the index's order, with a line per document, keeping a specification's editions together. */
function Families({ documents }: { documents: ListedDocument[] }) {
  const families = new Map<string, Map<string, ComponentChild[]>>();
  for (const { doc, node } of documents) {
    const family = families.get(doc?.publisher ?? 'Other') ?? new Map<string, ComponentChild[]>();
    const specification = doc?.specification ?? '';
    family.set(specification, [...(family.get(specification) ?? []), node]);
    families.set(doc?.publisher ?? 'Other', family);
  }
  return (
    <ul class="entry-families">
      {[...families]
        .toSorted(([a], [b]) => publisherRank(a) - publisherRank(b))
        .map(([publisher, family]) => (
          <li key={publisher}>
            <span class="family">{`${publisher}:`}</span>
            <span class="family-documents">{[...family.values()].flat()}</span>
          </li>
        ))}
    </ul>
  );
}

/** Where an entry's link goes: a value's row, its own definition, or else its document. */
function entryTarget({ kind, name, document, target }: SearchEntry): Target {
  if (kind === 'value' && target) return { ...target, name };
  return target?.document === document ? target : { document };
}

/** One name: what its entries agree on, on its line, and its documents under it by publisher. */
function Group({ group, site, query }: { group: NameGroup; site: Site; query: string }) {
  const mark = (name: string) => marked(name, matchSpans(name, query));
  const labelOf = (id: string) => {
    const doc = site.summary(id);
    return doc ? site.label(doc) : id;
  };
  const { entries } = group;
  const facts = groupFacts(entries);
  // Where the documents using it find it is said once; a document says so only where it differs.
  const defined = definitions(entries, id => site.summary(id), site.index.documents);
  const usual = usualDefinition(entries, defined);
  const abbreviations = [...new Set(entries.map(entry => entry.abbreviation).filter(name => name != null))];
  const shared = facts.shared.map(fact => `· ${fact}`).join(' ');
  const wireshark = [
    ...new Set(entries.map(entry => entry.wireshark_name).filter(name => name != null && name !== group.name)),
  ] as string[];
  const unique = new Map(
    entries.map(entry => [JSON.stringify([entry.document, entry.target, facts.differing(entry), entry.name]), entry]),
  );
  const perDocument = new Map<string, number>();
  for (const { document } of unique.values()) perDocument.set(document, (perDocument.get(document) ?? 0) + 1);
  const documents = [...unique.values()].map((entry, index): ListedDocument => {
    const doc = site.summary(entry.document);
    const label = doc ? docInFamily(site.label(doc), doc) : entry.document;
    const { target } = entry;
    // A value another document defines has its row here, and its definition there.
    const definition = defined.get(entry);
    const own = definition?.document === entry.document;
    const detail: ComponentChildren[] = facts.differing(entry).map(fact => fact);
    if (entry.name !== group.name) detail.unshift(<>as {mark(entry.name)}</>);
    // Twice in one document, only its clause tells which.
    if (target?.section && entry.kind !== 'value' && perDocument.get(entry.document)! > 1) detail.push(target.section);
    if (usual && own && definition.document !== usual.document) detail.push('defines it');
    if (entry.across_releases) {
      // Which edition stands in for a citation is the point here, so its version stays.
      const crossing = entry.across_releases;
      const cited = site.index.documents.find(doc => doc.reference === crossing.cited);
      detail.push(`${cited ? docName(cited) : crossing.cited} V${crossing.version}, ${crossing.rule}`);
    }
    const title = [
      identityLabel(entry),
      entry.data_type,
      target?.section && `${labelOf(target.document)} ${target.section}`,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      doc,
      node: (
        <span key={index} class="entry-document">
          {/* A row of the document's table: the link says which, and the page marks it. */}
          <DetailedLink
            text={entry.kind === 'value' && target ? `${label} · ${target.section}` : label}
            target={entryTarget(entry)}
            title={title}
            detail={detail}
          />
          {definition && !own && definition.document !== usual?.document && (
            <>
              {' → '}
              <a href={href(definition)}>{labelOf(definition.document)}</a>
            </>
          )}
        </span>
      ),
    };
  });
  return (
    <article class={isApproximate(group) ? 'search-entry approximate' : 'search-entry'}>
      <div class="entry-line">
        <strong>
          <a href={href(usual ?? entryTarget(entries[0]))}>{mark(group.name)}</a>
          {abbreviations.length > 0 && <> ({listed(abbreviations.map(mark))})</>}
        </strong>
        {(shared || usual) && (
          <span class="entry-facts">
            {shared}
            {usual && (
              <>
                {`${shared ? ' ' : ''}· defined in `}
                <a href={href(usual)}>{labelOf(usual.document)}</a>
              </>
            )}
          </span>
        )}
        {isApproximate(group) && <em>approximate</em>}
      </div>
      {wireshark.length > 0 && <p class="entry-wireshark">Wireshark: {listed(wireshark.map(mark))}</p>}
      <Families documents={documents} />
    </article>
  );
}

/** One specification: what its newest edition is about, and its editions, each saying only where it differs. */
function Specification({ docs, site, query }: { docs: DocumentSummary[]; site: Site; query: string }) {
  // A title naming its interfaces leaves them unsaid, unless the query found the document by one.
  const interfacesFor = (doc: DocumentSummary) => {
    const all = interfacesOf(doc);
    return interfaceSpans(all, query).length ? all : docAbout(doc).interfaces;
  };
  const markInterfaces = (interfaces: string) => marked(interfaces, interfaceSpans(interfaces, query));
  const about = { interfaces: interfacesFor(docs[0]), subject: docAbout(docs[0]).subject };
  return (
    <article class="search-entry">
      <div class="entry-line">
        <strong>
          <a href={href({ document: docs[0].id })}>{docName(docs[0])}</a>
        </strong>
        {(about.interfaces || about.subject) && (
          <span class="entry-facts">
            {'· '}
            {markInterfaces(about.interfaces)}
            {about.interfaces && about.subject ? ' — ' : ''}
            {about.subject}
          </span>
        )}
      </div>
      <Families
        documents={docs.map(doc => {
          const interfaces = interfacesFor(doc);
          const { subject } = docAbout(doc);
          const detail: ComponentChildren[] = [];
          if (interfaces && interfaces !== about.interfaces) detail.push(markInterfaces(interfaces));
          if (subject && subject !== about.subject) detail.push(subject);
          return {
            doc,
            node: (
              <span key={doc.id} class="entry-document">
                <DetailedLink text={docInFamily(site.label(doc), doc)} target={{ document: doc.id }} detail={detail} />
              </span>
            ),
          };
        })}
      />
    </article>
  );
}

/** Mentions under their documents' headings, in the order the documents first come, as a page of them may end inside one. */
function Mentions({
  mentions,
  site,
  query,
  names,
}: {
  mentions: FoldedMention[];
  site: Site;
  query: string;
  names: Set<string>;
}) {
  const groups = new Map<string, FoldedMention[]>();
  for (const mention of mentions) groups.set(mention.document, [...(groups.get(mention.document) ?? []), mention]);
  return (
    <>
      {[...groups].map(([document, mentions]) => {
        const doc = site.summary(document);
        return (
          <div key={document} class="mention-document">
            <h3>
              <a href={href({ document })}>{doc ? site.label(doc) : document}</a>
            </h3>
            <ul>
              {mentions.map((mention, index) => (
                <li key={index}>
                  <a
                    class="mention-link"
                    href={routeFor({ document, section: mention.section }, { line: mention.line })}
                  >
                    {`· ${mention.section ?? `line ${mention.line + 1}`}`}
                  </a>
                  <code>{marked(mention.text, mentionSpans(mention, query, names))}</code>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

/** A section of results under its heading and count, `pageSize` of them until More shows the rest. */
function Section<T>({
  name,
  title,
  items,
  approximate = 0,
  expanded,
  expand,
  render,
}: {
  name: string;
  title: string;
  items: T[];
  approximate?: number;
  expanded: boolean;
  expand(): void;
  render(shown: T[]): ComponentChildren;
}) {
  const precise = items.length - approximate;
  const shown = expanded ? items.length : pageSize;
  return (
    <section class={`search-section search-${name}`}>
      <h2>
        {`${title} `}
        <span class="count">{String(precise || items.length)}</span>
        {approximate > 0 && <span class="count">{precise ? `+${approximate} approximate` : 'approximate'}</span>}
      </h2>
      {render(items.slice(0, shown))}
      {items.length > shown && (
        <button class="control" onClick={expand}>
          More
        </button>
      )}
    </section>
  );
}

interface Loaded {
  index: EntryIndex;
  mentions: FoldedMention[];
}

function Results({
  site,
  query,
  data,
  failed,
  expanded,
  expand,
}: {
  site: Site;
  query: string;
  data: Loaded | undefined;
  failed: string | undefined;
  expanded: Set<string>;
  expand(name: string): void;
}) {
  if (!query.trim()) return null;
  const sectionProps = (name: string) => ({ name, expanded: expanded.has(name), expand: () => expand(name) });
  const groupSection = (name: string, title: string, groups: NameGroup[]) =>
    groups.length > 0 && (
      <Section
        key={name}
        {...sectionProps(name)}
        title={title}
        items={groups}
        approximate={groups.filter(isApproximate).length}
        render={shown => shown.map((group, index) => <Group key={index} group={group} site={site} query={query} />)}
      />
    );
  const specifications = new Map<string, DocumentSummary[]>();
  for (const doc of searchSpecifications(site.index.documents, query))
    specifications.set(doc.specification, [...(specifications.get(doc.specification) ?? []), doc]);
  const specificationSection = specifications.size > 0 && (
    <Section
      key="specifications"
      {...sectionProps('specifications')}
      title="Specifications"
      items={[...specifications.values()]}
      render={shown =>
        shown.map(docs => <Specification key={docs[0].specification} docs={docs} site={site} query={query} />)
      }
    />
  );
  if (failed)
    return (
      <>
        {specificationSection}
        <p>{failed}</p>
      </>
    );
  if (!data)
    return (
      <>
        {specificationSection}
        <p role="status">Loading search data…</p>
      </>
    );
  const found = searchEntries(data.index, query, site.summary);
  // An approximate name brings no lines: the page would fill with what was not asked for.
  const names = new Set(found.avp.filter(group => !isApproximate(group)).map(group => group.name));
  const mentions = filterMentions(data.mentions, query, names);
  const parts = [
    specificationSection,
    ...sections.map(({ kind, title }) => groupSection(kind, title, found[kind])),
    ...valueKinds.map(({ kind, title }) =>
      groupSection(
        kind,
        title,
        found.value.filter(
          group => group.entries[0].identity?.kind === 'value' && group.entries[0].identity.value_kind === kind,
        ),
      ),
    ),
    mentions.length > 0 && (
      <Section
        key="mentions"
        {...sectionProps('mentions')}
        title="Mentions"
        items={mentions}
        render={shown => <Mentions mentions={shown} site={site} query={query} names={names} />}
      />
    ),
  ].filter(Boolean);
  return parts.length ? <>{parts}</> : <p>No matches.</p>;
}

/**
 * Up and down step from entry to entry, landing on an entry's name; left and right step within one, and in the
 * input stay the caret's. Whatever is outside an entry, as a mention's line, is a stop of its own.
 * Enter is then the browser's, opening a link.
 */
function walk(event: KeyboardEvent, input: HTMLInputElement, results: HTMLElement) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp';
  if (!vertical && event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  const active = document.activeElement as HTMLElement;
  if (!vertical && active === input) return;
  const stops = [input, ...results.querySelectorAll<HTMLElement>('a[href], button')];
  const entryOf = (node: HTMLElement): HTMLElement => node.closest<HTMLElement>('.search-entry') ?? node;
  const peers = vertical ? [...new Set(stops.map(entryOf))] : stops.filter(stop => entryOf(stop) === entryOf(active));
  const next =
    peers[
      peers.indexOf(vertical ? entryOf(active) : active) +
        (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1)
    ];
  if (!next) return;
  event.preventDefault();
  (vertical ? stops.find(stop => entryOf(stop) === next)! : next).focus();
}

/**
 * The search page for `query`. `returning` is a walk back to a search already made: the keys stay the walk's, not the
 * input's, and `onReady` puts its results back where they were once the search data has come.
 */
export function SearchView({
  site,
  query: initial,
  returning = false,
  onReady,
}: {
  site: Site;
  query: string;
  returning?: boolean;
  onReady?: () => void;
}) {
  const [text, setText] = useState(initial);
  const [query, setQuery] = useState(initial);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [data, setData] = useState<Loaded | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useLayoutEffect(() => {
    if (!returning) input.current!.focus();
  }, []);
  useEffect(() => {
    let live = true;
    site
      .loadSearch()
      .then(loaded => {
        if (live)
          setData({
            index: indexEntries(loaded.entries),
            mentions: foldMentions(sortMentions(loaded.mentions, site.summary)),
          });
      })
      .catch((error: unknown) => {
        if (live) setFailed(String(error));
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
      clearTimeout(timer.current);
    };
  }, []);
  // Once the results the data brings are drawn.
  useLayoutEffect(() => {
    if (ready) onReady?.();
  }, [ready]);

  const search = (value: string) => {
    clearTimeout(timer.current);
    setQuery(value);
  };
  const onKeyDown = (event: KeyboardEvent) => walk(event, input.current!, results.current!);
  return (
    <>
      <h1 class="sr-only" tabIndex={-1}>
        Search
      </h1>
      <form
        class="search-form"
        onSubmit={event => {
          event.preventDefault();
          search(text);
        }}
      >
        <input
          ref={input}
          class="control"
          aria-label="Search"
          type="search"
          value={text}
          placeholder="29.214, Callee-Information, CCR, vsai, DIAMETER_SUCCESS, or 505"
          onKeyDown={onKeyDown}
          onInput={event => {
            const value = event.currentTarget.value;
            history.replaceState(null, '', `#search?q=${encodeURIComponent(value)}`);
            setText(value);
            setExpanded(new Set());
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setQuery(value), 120);
          }}
        />
        <button class="control">Search</button>
      </form>
      <section id="search-results" ref={results} aria-live="polite" onKeyDown={onKeyDown}>
        <Results
          site={site}
          query={query}
          data={data}
          failed={failed}
          expanded={expanded}
          expand={name => setExpanded(names => new Set(names).add(name))}
        />
      </section>
    </>
  );
}
