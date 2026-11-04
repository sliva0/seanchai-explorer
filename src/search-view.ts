import { docAbout, docInFamily, docName, publisherRank } from './data.ts';
import type { Site } from './data.ts';
import { counted, element, link } from './dom.ts';
import { interfacesOf } from './interfaces.ts';
import { routeFor } from './navigation.ts';
import { filterMentions, foldMentions, groupFacts, identityLabel, indexEntries, interfaceSpans, isApproximate, matchSpans, mentionSpans, searchEntries, searchSpecifications, sortMentions, usualDefinition } from './search.ts';
import type { EntryIndex, FoldedMention, NameGroup } from './search.ts';
import type { Span } from './fuzzy.ts';
import type { DocumentSummary, SearchEntry } from './types.ts';
import { valueKinds } from './values.ts';

const pageSize = 20;
const sections: { kind: SearchEntry['kind']; title: string }[] = [
  { kind: 'avp', title: 'AVPs' },
  { kind: 'command', title: 'Commands' },
  { kind: 'application', title: 'Applications' },
  { kind: 'registry', title: 'Registry rows' },
];

/** Text with its spans in `mark`s. */
function marked(text: string, spans: Span[]): (string | HTMLElement)[] {
  const parts: (string | HTMLElement)[] = [];
  let at = 0;
  for (const [start, end] of spans) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(element('mark', text.slice(start, end)));
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/** A document's link with what tells it from the entry's others, muted and in the link. */
function withDetail(anchor: HTMLAnchorElement, detail: (string | HTMLElement)[][]): HTMLAnchorElement {
  if (!detail.length) return anchor;
  const note = element('span', ' (', 'doc-detail');
  detail.forEach((part, index) => note.append(...(index ? [', '] : []), ...part));
  note.append(')');
  anchor.append(note);
  return anchor;
}

interface ListedDocument { doc: DocumentSummary | undefined; node: HTMLElement }

/** A line per publisher, in the index's order, keeping a specification's editions together. */
function renderFamilies(documents: ListedDocument[]): HTMLElement {
  const families = new Map<string, Map<string, HTMLElement[]>>();
  for (const { doc, node } of documents) {
    const family = families.get(doc?.publisher ?? 'Other') ?? new Map<string, HTMLElement[]>();
    const specification = doc?.specification ?? '';
    family.set(specification, [...family.get(specification) ?? [], node]);
    families.set(doc?.publisher ?? 'Other', family);
  }
  const list = element('ul', undefined, 'entry-families');
  for (const [publisher, family] of [...families].sort(([a], [b]) => publisherRank(a) - publisherRank(b))) {
    const item = element('li');
    const links = element('span', undefined, 'family-documents');
    [...family.values()].flat().forEach((node, index) => links.append(...(index ? [' · '] : []), node));
    item.append(element('span', `${publisher}:`, 'family'), links);
    list.append(item);
  }
  return list;
}

/** One name: what its entries agree on, on its line, and its documents under it by publisher. */
function renderGroup(group: NameGroup, site: Site, query: string): HTMLElement {
  const mark = (name: string) => marked(name, matchSpans(name, query));
  const labelOf = (id: string) => {
    const doc = site.summary(id);
    return doc ? site.label(doc) : id;
  };
  const { entries } = group;
  const facts = groupFacts(entries);
  const panel = element('article', undefined, isApproximate(group) ? 'search-entry approximate' : 'search-entry');
  const line = element('div', undefined, 'entry-line');
  const title = element('strong');
  title.append(...mark(group.name));
  const abbreviations = [...new Set(entries.map(entry => entry.abbreviation).filter(name => name != null))];
  if (abbreviations.length) {
    title.append(' (');
    abbreviations.forEach((name, index) => title.append(...(index ? [', '] : []), ...mark(name)));
    title.append(')');
  }
  line.append(title);
  const said = element('span', facts.shared.map(fact => `· ${fact}`).join(' '), 'entry-facts');
  // Where the documents using it find it is said once; a document says so only where it differs.
  const usual = usualDefinition(entries);
  if (usual) said.append(`${facts.shared.length ? ' ' : ''}· defined in `, link(labelOf(usual.document), usual));
  if (said.textContent) line.append(said);
  if (isApproximate(group)) line.append(element('em', 'approximate'));
  panel.append(line);
  const wireshark = [...new Set(entries.map(entry => entry.wireshark_name).filter(name => name != null && name !== group.name))] as string[];
  if (wireshark.length) {
    const note = element('p', 'Wireshark: ', 'entry-wireshark');
    wireshark.forEach((name, index) => note.append(...(index ? [', '] : []), ...mark(name)));
    panel.append(note);
  }
  const listed = new Map(entries.map(entry => [JSON.stringify([entry.document, entry.target, facts.differing(entry), entry.name]), entry]));
  const perDocument = new Map<string, number>();
  for (const { document } of listed.values()) perDocument.set(document, (perDocument.get(document) ?? 0) + 1);
  panel.append(renderFamilies([...listed.values()].map(entry => {
    const item = element('span', undefined, 'entry-document');
    const doc = site.summary(entry.document);
    const label = doc ? docInFamily(site.label(doc), doc) : entry.document;
    const { target } = entry;
    const own = target?.document === entry.document;
    const detail: (string | HTMLElement)[][] = facts.differing(entry).map(fact => [fact]);
    if (entry.name !== group.name) detail.unshift(['as ', ...mark(entry.name)]);
    // Twice in one document, only its clause tells which.
    if (target?.section && entry.kind !== 'value' && perDocument.get(entry.document)! > 1) detail.push([target.section]);
    if (usual && own && target.document !== usual.document) detail.push(['defines it']);
    if (entry.across_releases) {
      // Which edition stands in for a citation is the point here, so its version stays.
      const crossing = entry.across_releases;
      const cited = site.index.documents.find(doc => doc.reference === crossing.cited);
      detail.push([`${cited ? docName(cited) : crossing.cited} V${crossing.version}, ${crossing.rule}`]);
    }
    // A row of the document's table: the link says which, and the page marks it.
    const anchor = entry.kind === 'value' && target ? link(`${label} · ${target.section}`, { ...target, name: entry.name })
      : link(label, own ? target : { document: entry.document });
    anchor.title = [identityLabel(entry), entry.data_type, target?.section && `${labelOf(target.document)} ${target.section}`].filter(Boolean).join(' · ');
    item.append(withDetail(anchor, detail));
    if (target && !own && target.document !== usual?.document) item.append(' → ', link(labelOf(target.document), target));
    return { doc, node: item };
  })));
  return panel;
}

/** One specification: what its newest edition is about, and its editions, each saying only where it differs. */
function renderSpecification(docs: DocumentSummary[], site: Site, query: string): HTMLElement {
  const panel = element('article', undefined, 'search-entry');
  const line = element('div', undefined, 'entry-line');
  // A title naming its interfaces leaves them unsaid, unless the query found the document by one.
  const interfacesFor = (doc: DocumentSummary) => {
    const all = interfacesOf(doc);
    return interfaceSpans(all, query).length ? all : docAbout(doc).interfaces;
  };
  const markInterfaces = (interfaces: string) => marked(interfaces, interfaceSpans(interfaces, query));
  const about = { interfaces: interfacesFor(docs[0]), subject: docAbout(docs[0]).subject };
  line.append(element('strong', docName(docs[0])));
  if (about.interfaces || about.subject) {
    const facts = element('span', '· ', 'entry-facts');
    facts.append(...markInterfaces(about.interfaces), about.interfaces && about.subject ? ' — ' : '', about.subject);
    line.append(facts);
  }
  panel.append(line, renderFamilies(docs.map(doc => {
    const interfaces = interfacesFor(doc);
    const { subject } = docAbout(doc);
    const detail: (string | HTMLElement)[][] = [];
    if (interfaces && interfaces !== about.interfaces) detail.push(markInterfaces(interfaces));
    if (subject && subject !== about.subject) detail.push([subject]);
    const node = element('span', undefined, 'entry-document');
    node.append(withDetail(link(docInFamily(site.label(doc), doc), { document: doc.id }), detail));
    return { doc, node };
  })));
  return panel;
}

/** A mention's line under its document's heading, added to a group as it comes: a page may end inside one. */
function mentionRenderer(site: Site, query: string, names: Set<string>) {
  const groups = new Map<string, HTMLElement>();
  return (mention: FoldedMention): HTMLElement | null => {
    let list = groups.get(mention.document);
    let added: HTMLElement | null = null;
    if (!list) {
      list = element('ul');
      groups.set(mention.document, list);
      const doc = site.summary(mention.document);
      const heading = element('h3');
      heading.append(link(doc ? site.label(doc) : mention.document, { document: mention.document }));
      added = element('div', undefined, 'mention-document');
      added.append(heading, list);
    }
    const item = element('li');
    const anchor = element('a', `· ${mention.section ?? `line ${mention.line + 1}`}`, 'mention-link');
    anchor.href = routeFor({ document: mention.document, section: mention.section }, { line: mention.line });
    const snippet = element('code');
    snippet.append(...marked(mention.text, mentionSpans(mention, query, names)));
    item.append(anchor, snippet);
    list.append(item);
    return added;
  };
}

export function renderSearch(container: HTMLElement, site: Site, query: string, isCurrent: () => boolean) {
  const form = element('form', undefined, 'search-form');
  const input = element('input', undefined, 'control');
  input.setAttribute('aria-label', 'Search');
  input.type = 'search';
  input.value = query;
  input.placeholder = '29.214, Callee-Information, CCR, vsai, DIAMETER_SUCCESS, or 505';
  form.append(input, element('button', 'Search', 'control'));
  const results = element('section');
  results.id = 'search-results';
  results.setAttribute('aria-live', 'polite');
  const heading = element('h1', 'Search', 'sr-only');
  heading.tabIndex = -1;
  container.replaceChildren(heading, form, results);

  const expanded = new Set<string>();
  let data: { index: EntryIndex; mentions: FoldedMention[] } | undefined;
  let failed: string | undefined;

  function update() {
    results.replaceChildren();
    const text = input.value;
    if (!text.trim()) return;
    function section<T>(key: string, title: string, items: T[], render: (item: T) => HTMLElement | null, { approximate = 0 } = {}) {
      if (!items.length) return;
      const node = element('section', undefined, `search-section search-${key}`);
      const heading = element('h2');
      const precise = items.length - approximate;
      heading.append(...counted(title, precise || items.length));
      if (approximate) heading.append(element('span', precise ? `+${approximate} approximate` : 'approximate', 'count'));
      node.append(heading);
      results.append(node);
      const add = (item: T) => {
        const rendered = render(item);
        if (rendered) node.append(rendered);
      };
      const shown = expanded.has(key) ? items.length : pageSize;
      items.slice(0, shown).forEach(add);
      if (items.length > shown) {
        const button = element('button', 'More', 'control');
        button.onclick = () => {
          expanded.add(key);
          button.remove();
          items.slice(shown).forEach(add);
        };
        node.append(button);
      }
    }
    const groupSection = (key: string, title: string, groups: NameGroup[]) => section(key, title, groups, group => renderGroup(group, site, text), { approximate: groups.filter(isApproximate).length });
    const specifications = new Map<string, DocumentSummary[]>();
    for (const doc of searchSpecifications(site.index.documents, text)) specifications.set(doc.specification, [...specifications.get(doc.specification) ?? [], doc]);
    section('specifications', 'Specifications', [...specifications.values()], docs => renderSpecification(docs, site, text));
    if (failed) { results.append(element('p', failed)); return; }
    if (!data) {
      const status = element('p', 'Loading search data…');
      status.setAttribute('role', 'status');
      results.append(status);
      return;
    }
    const found = searchEntries(data.index, text, site.summary);
    for (const { kind, title } of sections) groupSection(kind, title, found[kind]);
    for (const { kind, title } of valueKinds) {
      groupSection(kind, title, found.value.filter(group => group.entries[0].identity?.kind === 'value' && group.entries[0].identity.value_kind === kind));
    }
    // An approximate name brings no lines: the page would fill with what was not asked for.
    const names = new Set(found.avp.filter(group => !isApproximate(group)).map(group => group.name));
    section('mentions', 'Mentions', filterMentions(data.mentions, text, names), mentionRenderer(site, text, names));
    if (!results.childElementCount) results.append(element('p', 'No matches.'));
  }

  /** Arrows walk the input and what is on screen; Enter is then the browser's, opening a link. */
  function walk(event: KeyboardEvent) {
    if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const route = [input, ...results.querySelectorAll<HTMLElement>('a[href], button')];
    const next = route[route.indexOf(document.activeElement as HTMLElement) + (event.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
  }
  input.onkeydown = walk;
  results.onkeydown = walk;

  let timer: ReturnType<typeof setTimeout> | undefined;
  input.oninput = () => {
    history.replaceState(null, '', `#search?q=${encodeURIComponent(input.value)}`);
    expanded.clear();
    clearTimeout(timer);
    timer = setTimeout(update, 120);
  };
  form.onsubmit = event => { event.preventDefault(); clearTimeout(timer); update(); };
  update();
  input.focus();
  site.loadSearch().then(loaded => {
    data = { index: indexEntries(loaded.entries), mentions: foldMentions(sortMentions(loaded.mentions, site.summary)) };
  }).catch(error => { failed = String(error); }).finally(() => { if (isCurrent()) update(); });
}
