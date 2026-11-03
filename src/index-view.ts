import { docTitle } from './data.ts';
import type { Site } from './data.ts';
import { element, externalLink, link } from './dom.ts';
import type { DocumentSummary } from './types.ts';

export const REPOSITORY = 'https://github.com/sliva0/senchai';

function renderAbout(site: Site): HTMLElement {
  const about = element('section', undefined, 'about');
  const heading = element('h1', 'Seanchaí');
  heading.tabIndex = -1;
  const what = element('p', 'Diameter dictionaries read from 3GPP specifications, RFCs and a few other documents, one page per document. Every AVP name links to its definition, and every section and page number to the source.');
  const terms = element('p', 'An unofficial, independent project, not affiliated with or endorsed by 3GPP, ETSI, oneM2M, 3GPP2 or the IETF. The specifications are their publishers\' work and remain under their publishers\' terms');
  terms.append(site.mode === 'public' ? '; this site links to the publishers\' copies and does not redistribute their PDFs.' : '.');
  const project = element('p', 'Source, corrections and tools: ');
  project.append(externalLink('the Seanchaí repository', REPOSITORY), '.');
  const { corpus_version: corpus, seanchai_version: seanchai } = site.index;
  const versions = element('p', [corpus && `Corpus ${corpus}`, seanchai && `seanchai ${seanchai}`, `${site.mode} build`].filter(Boolean).join(' · '), 'versions');
  about.append(heading, what, terms, project, versions);
  return about;
}

function byName(a: DocumentSummary, b: DocumentSummary) {
  return a.specification.localeCompare(b.specification, undefined, { numeric: true }) || a.id.localeCompare(b.id);
}

function documentList(docs: DocumentSummary[]): HTMLUListElement {
  const list = element('ul');
  for (const doc of docs.toSorted(byName)) {
    const item = element('li');
    item.append(link(docTitle(doc), { document: doc.id }));
    if (doc.pinned) item.append(element('p', doc.pinned));
    list.append(item);
  }
  return list;
}

function foldPinned(docs: DocumentSummary[], name: string): HTMLDetailsElement {
  const fold = element('details', undefined, 'pinned-release');
  fold.append(element('summary', `${name}: ${docs.length} held for later citations`), documentList(docs));
  return fold;
}

/** Documents by publisher, newest release first, with the pinned older ones folded with their reasons. */
function renderRelease(name: string, docs: DocumentSummary[]): HTMLElement {
  const section = element('section');
  const pinned = docs.filter(doc => doc.pinned);
  const current = docs.filter(doc => !doc.pinned);
  if (current.length) section.append(element('h2', name), documentList(current));
  if (pinned.length) section.append(foldPinned(pinned, name));
  return section;
}

export function renderIndex(container: HTMLElement, site: Site) {
  container.replaceChildren(renderAbout(site));
  const publishers = new Map<string, Map<number | null, DocumentSummary[]>>();
  for (const doc of site.index.documents) {
    const releases = publishers.get(doc.publisher) ?? new Map<number | null, DocumentSummary[]>();
    releases.set(doc.release, [...releases.get(doc.release) ?? [], doc]);
    publishers.set(doc.publisher, releases);
  }
  for (const [publisher, releases] of [...publishers].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [release, docs] of [...releases].sort(([a], [b]) => (b ?? -1) - (a ?? -1))) {
      container.append(renderRelease(`${publisher}${release ? ` · Release ${release}` : ''}`, docs));
    }
  }
}
