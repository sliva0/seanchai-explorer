import { docLabel, docTitle } from './data.ts';
import type { Site } from './data.ts';
import { element, link } from './dom.ts';
import { routeFor } from './navigation.ts';
import { filterMentions, searchGroups, searchSpecifications } from './search.ts';
import type { AvpIdentity, Search } from './types.ts';

export function renderSearch(container: HTMLElement, site: Site, query: string, isCurrent: () => boolean) {
  const form = element('form', undefined, 'search-form');
  const label = element('label', 'Search ');
  const input = element('input');
  input.type = 'search';
  input.value = query;
  input.placeholder = '29.214, Callee-Information, or 505';
  label.append(input);
  form.append(label, element('button', 'Search'));
  const results = element('section');
  results.id = 'search-results';
  results.setAttribute('aria-live', 'polite');
  container.replaceChildren(element('h2', 'Search'), element('p', 'Find specifications by title or number, AVPs by name or code, and mentions in document text.'), form, results);
  const limits = { specifications: 12, avps: 20, mentions: 20 };
  let data: Search | undefined;
  const nameOf = (id: string) => docLabel(site.summary(id)!);

  function update() {
    results.replaceChildren();
    const text = input.value;
    if (!text.trim()) return;
    function section(title: string, count: number, key: keyof typeof limits) {
      const node = element('section', undefined, `search-section search-${key}`);
      node.append(element('h2', `${title} (${count})`));
      results.append(node);
      if (!count) node.append(element('p', `No matching ${title.toLowerCase()}.`));
      return node;
    }
    function more(node: HTMLElement, count: number, key: keyof typeof limits) {
      if (count <= limits[key]) return;
      const button = element('button', 'More');
      button.onclick = () => { limits[key] += 20; update(); };
      node.append(button);
    }
    const specifications = searchSpecifications(site.index.documents, text);
    const specs = section('Specifications', specifications.length, 'specifications');
    const specList = element('ul');
    for (const doc of specifications.slice(0, limits.specifications)) {
      const item = element('li');
      item.append(link(docTitle(doc), { document: doc.id }));
      specList.append(item);
    }
    specs.append(specList);
    more(specs, specifications.length, 'specifications');
    if (!data) { results.append(element('p', 'Loading search data…')); return; }
    const groups = searchGroups(data.entries, text);
    const mentions = filterMentions(data.mentions, text, new Set(groups.map(group => group[0].name)));
    const avps = section('AVPs', groups.length, 'avps');
    for (const group of groups.slice(0, limits.avps)) {
      const first = group[0];
      const identity = first.identity as AvpIdentity | null;
      const panel = element('details');
      const summary = element('summary');
      summary.append(element('strong', first.name), element('span', `${identity ? `${identity.vendor_id}:${identity.code}` : ''}${first.data_type ? ` · ${first.data_type}` : ''}`));
      panel.append(summary);
      if (first.wireshark_name && first.wireshark_name !== first.name) panel.append(element('p', `Wireshark: ${first.wireshark_name}`));
      const list = element('ul');
      const seen = new Set<string>();
      for (const entry of group) {
        const key = JSON.stringify([entry.document, entry.target]);
        if (seen.has(key)) continue;
        seen.add(key);
        const item = element('li');
        item.append(link(nameOf(entry.document), { document: entry.document }));
        if (entry.target) item.append(' → ', link(entry.defined_in.join(', ') || entry.name, entry.target));
        if (entry.across_releases) {
          const crossing = entry.across_releases;
          item.append(` · ${crossing.cited} V${crossing.version} · ${crossing.rule}`);
        }
        list.append(item);
      }
      panel.append(list);
      avps.append(panel);
    }
    more(avps, groups.length, 'avps');
    const found = section('Mentions', mentions.length, 'mentions');
    const mentionList = element('ul');
    const needle = text.trim();
    for (const mention of mentions.slice(0, limits.mentions)) {
      const item = element('li');
      const anchor = element('a', `${nameOf(mention.document)}${mention.section ? ` · ${mention.section}` : ''}`, 'mention-link');
      anchor.href = routeFor({ document: mention.document, section: mention.section }, { line: mention.line });
      const snippet = element('code');
      const start = mention.text.toLowerCase().indexOf(needle.toLowerCase());
      if (start >= 0) snippet.append(mention.text.slice(0, start), element('mark', mention.text.slice(start, start + needle.length)), mention.text.slice(start + needle.length));
      else snippet.textContent = mention.text;
      item.append(anchor, snippet);
      mentionList.append(item);
    }
    found.append(mentionList);
    more(found, mentions.length, 'mentions');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  input.oninput = () => {
    history.replaceState(null, '', `#search?q=${encodeURIComponent(input.value)}`);
    limits.specifications = 12;
    limits.avps = limits.mentions = 20;
    clearTimeout(timer);
    timer = setTimeout(update, 120);
  };
  form.onsubmit = event => { event.preventDefault(); clearTimeout(timer); update(); };
  update();
  site.loadSearch().then(loaded => {
    data = loaded;
    if (isCurrent()) update();
  }).catch(error => { if (isCurrent()) results.replaceChildren(element('p', String(error))); });
}
