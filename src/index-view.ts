import { docTitle } from './data.ts';
import type { Site } from './data.ts';
import { element, link } from './dom.ts';
import type { DocumentSummary } from './types.ts';

export function renderIndex(container: HTMLElement, site: Site) {
  container.replaceChildren();
  const groups = new Map<string, DocumentSummary[]>();
  for (const doc of site.index.documents) {
    const key = `${doc.publisher}${doc.release ? ` · Release ${doc.release}` : ''}`;
    const group = groups.get(key) ?? [];
    group.push(doc);
    groups.set(key, group);
  }
  for (const [name, docs] of [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
    const section = element('section');
    section.append(element('h2', name));
    const list = element('ul');
    for (const doc of docs) {
      const item = element('li');
      item.append(link(docTitle(doc), { document: doc.id }));
      if (doc.pinned) item.append(element('p', doc.pinned));
      list.append(item);
    }
    section.append(list);
    container.append(section);
  }
}
