import { docTitle } from './data.ts';
import type { Site } from './data.ts';
import { element, link } from './dom.ts';
import type { DocumentSummary } from './types.ts';

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
  container.replaceChildren();
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
  const { corpus_version: corpus, seanchai_version: seanchai } = site.index;
  container.append(element('footer', [corpus && `Corpus ${corpus}`, seanchai && `seanchai ${seanchai}`, `${site.mode} build`].filter(Boolean).join(' · '), 'versions'));
}
