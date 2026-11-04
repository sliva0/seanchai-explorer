import { docNumber, docSubject, publisherRank } from './data.ts';
import type { Site } from './data.ts';
import { element, link } from './dom.ts';
import { interfacesOf } from './interfaces.ts';
import type { DocumentSummary } from './types.ts';

/** A longer list of interfaces wraps, rather than push every title in its group across. */
const MAX_INTERFACES_WIDTH = 24;

const FOOTER_HELP = 'Right-click any AVP name to see where it is used. Alt-click goes to its definition, click to its details.';

function byName(a: DocumentSummary, b: DocumentSummary) {
  return a.specification.localeCompare(b.specification, undefined, { numeric: true }) || a.id.localeCompare(b.id);
}

/** The heading above says the publisher and any release, so a row has only to tell an edition with no release. */
function rowNumber(doc: DocumentSummary, site: Site): string {
  return [docNumber(doc), doc.release ? '' : site.edition(doc)].filter(Boolean).join(' ');
}

function documentRow(doc: DocumentSummary, site: Site): HTMLTableRowElement {
  const row = element('tr');
  const number = element('td', undefined, 'doc-number');
  number.append(link(rowNumber(doc, site), { document: doc.id }));
  const title = element('td', undefined, 'doc-title');
  const subject = docSubject(doc);
  if (subject) {
    // A wider target for the mouse: the number is this row's one stop for the keyboard.
    const anchor = link(subject, { document: doc.id });
    anchor.tabIndex = -1;
    title.append(anchor);
  }
  if (doc.pinned) title.append(element('p', doc.pinned));
  row.append(number, element('td', interfacesOf(doc), 'doc-interfaces'), title);
  return row;
}

function documentTable(docs: DocumentSummary[], site: Site): HTMLTableElement {
  const table = element('table', undefined, 'document-table');
  const columns = element('colgroup');
  for (const name of ['number', 'interfaces', 'title']) columns.append(element('col', undefined, `${name}-column`));
  const head = element('thead', undefined, 'sr-only');
  const names = element('tr');
  for (const name of ['Specification', 'Interfaces', 'Title']) names.append(element('th', name));
  head.append(names);
  const body = element('tbody');
  body.append(...docs.toSorted(byName).map(doc => documentRow(doc, site)));
  table.append(columns, head, body);
  return table;
}

function foldPinned(docs: DocumentSummary[], name: string, site: Site): HTMLDetailsElement {
  const fold = element('details', undefined, 'pinned-release');
  fold.append(element('summary', `${name}: ${docs.length} held for later citations`), documentTable(docs, site));
  return fold;
}

/** Documents by publisher, newest release first, with the pinned older ones folded with their reasons. */
function renderRelease(name: string, docs: DocumentSummary[], site: Site): HTMLElement {
  const section = element('section');
  const pinned = docs.filter(doc => doc.pinned);
  const current = docs.filter(doc => !doc.pinned);
  if (current.length) section.append(element('h2', name), documentTable(current, site));
  if (pinned.length) section.append(foldPinned(pinned, name, site));
  return section;
}

/** A publisher's tables, separate by release and fold, with their columns one width: the two narrow ones are monospace. */
function renderPublisher(publisher: string, releases: Map<number | null, DocumentSummary[]>, site: Site): HTMLElement {
  const group = element('div', undefined, 'publisher-group');
  const docs = [...releases.values()].flat();
  const widest = (text: (doc: DocumentSummary) => string) => Math.max(...docs.map(doc => text(doc).length));
  group.style.setProperty('--number-width', `${widest(doc => rowNumber(doc, site))}ch`);
  group.style.setProperty('--interfaces-width', `${Math.min(MAX_INTERFACES_WIDTH, widest(interfacesOf))}ch`);
  for (const [release, docs] of [...releases].sort(([a], [b]) => (b ?? -1) - (a ?? -1))) {
    group.append(renderRelease(`${publisher}${release ? ` · Release ${release}` : ''}`, docs, site));
  }
  return group;
}

export function renderIndex(container: HTMLElement, site: Site) {
  container.replaceChildren();
  const publishers = new Map<string, Map<number | null, DocumentSummary[]>>();
  for (const doc of site.index.documents) {
    const releases = publishers.get(doc.publisher) ?? new Map<number | null, DocumentSummary[]>();
    releases.set(doc.release, [...releases.get(doc.release) ?? [], doc]);
    publishers.set(doc.publisher, releases);
  }
  for (const [publisher, releases] of [...publishers].sort(([a], [b]) => publisherRank(a) - publisherRank(b))) {
    container.append(renderPublisher(publisher, releases, site));
  }
  container.append(element('p', FOOTER_HELP, 'versions'));
  const { corpus_version: corpus, seanchai_version: seanchai } = site.index;
  container.append(element('footer', [corpus && `Corpus ${corpus}`, seanchai && `seanchai ${seanchai}`, `${site.mode} build`].filter(Boolean).join(' · '), 'versions'));
}
