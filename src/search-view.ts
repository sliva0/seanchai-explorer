import { docLabel, docTitle } from './data.ts';
import type { Site } from './data.ts';
import { element, link } from './dom.ts';
import { routeFor } from './navigation.ts';
import { filterMentions, identityLabel, searchEntries, searchSpecifications, sortMentions } from './search.ts';
import type { NameGroup } from './search.ts';
import type { Mention, SearchEntry } from './types.ts';
import { valueKinds } from './values.ts';

const pageSize = 20;
const sections: { kind: SearchEntry['kind']; title: string }[] = [
  { kind: 'avp', title: 'AVPs' },
  { kind: 'command', title: 'Commands' },
  { kind: 'application', title: 'Applications' },
  { kind: 'registry', title: 'Registry rows' },
];

function renderGroup(group: NameGroup, site: Site): HTMLElement {
  const first = group.entries[0];
  const panel = element('details');
  const summary = element('summary');
  const detail = [identityLabel(first), first.data_type].filter(Boolean).join(' · ');
  summary.append(element('strong', first.abbreviation ? `${first.name} (${first.abbreviation})` : first.name), element('span', detail));
  panel.append(summary);
  if (first.wireshark_name && first.wireshark_name !== first.name) panel.append(element('p', `Wireshark: ${first.wireshark_name}`));
  const list = element('ul');
  const seen = new Set<string>();
  for (const entry of group.entries) {
    const key = JSON.stringify([entry.document, entry.target]);
    if (seen.has(key)) continue;
    seen.add(key);
    const item = element('li');
    const doc = site.summary(entry.document);
    const label = doc ? docLabel(doc) : entry.document;
    if (entry.kind === 'value' && entry.target) {
      // The name is a row of the document's table: the link says which, and the page marks it.
      item.append(link(`${label} · ${entry.target.section}`, { ...entry.target, name: entry.name }));
    } else if (entry.target?.document === entry.document) {
      // Mentioned and defined in one document: one link, to the definition.
      item.append(link(label, entry.target));
    } else {
      item.append(link(label, { document: entry.document }));
      if (entry.target) {
        const definer = site.summary(entry.target.document);
        item.append(' → ', link(definer ? docLabel(definer) : entry.defined_in.join(', ') || entry.name, entry.target));
      }
    }
    if (entry.across_releases) {
      const crossing = entry.across_releases;
      item.append(` · ${crossing.cited} V${crossing.version} · ${crossing.rule}`);
    }
    list.append(item);
  }
  panel.append(list);
  return panel;
}

function renderMention(mention: Mention, needle: string, site: Site): HTMLElement {
  const item = element('li');
  const doc = site.summary(mention.document);
  const anchor = element('a', `${doc ? docLabel(doc) : mention.document}${mention.section ? ` · ${mention.section}` : ''}`, 'mention-link');
  anchor.href = routeFor({ document: mention.document, section: mention.section }, { line: mention.line });
  const snippet = element('code');
  const start = mention.text.toLowerCase().indexOf(needle.toLowerCase());
  if (start >= 0) snippet.append(mention.text.slice(0, start), element('mark', mention.text.slice(start, start + needle.length)), mention.text.slice(start + needle.length));
  else snippet.textContent = mention.text;
  item.append(anchor, snippet);
  return item;
}

export function renderSearch(container: HTMLElement, site: Site, query: string, isCurrent: () => boolean) {
  const form = element('form', undefined, 'search-form');
  const label = element('label', 'Search ');
  const input = element('input');
  input.type = 'search';
  input.value = query;
  input.placeholder = '29.214, Callee-Information, CCR, DIAMETER_SUCCESS, or 505';
  label.append(input);
  form.append(label, element('button', 'Search'));
  const results = element('section');
  results.id = 'search-results';
  results.setAttribute('aria-live', 'polite');
  const heading = element('h1', 'Search');
  heading.tabIndex = -1;
  container.replaceChildren(heading, element('p', 'Find specifications by title or number; AVPs, commands, applications, registry rows and result codes by name or code; bits and features by name; and mentions in document text.'), form, results);

  const expanded = new Set<string>();
  let data: { entries: SearchEntry[]; mentions: Mention[] } | undefined;
  let failed: string | undefined;

  function update() {
    results.replaceChildren();
    const text = input.value;
    if (!text.trim()) return;
    function section<T>(key: string, title: string, items: T[], render: (item: T) => HTMLElement, wrap = false) {
      if (!items.length) return;
      const node = element('section', undefined, `search-section search-${key}`);
      node.append(element('h2', `${title} (${items.length})`));
      results.append(node);
      const parent = wrap ? element('ul') : node;
      if (wrap) node.append(parent);
      const shown = expanded.has(key) ? items.length : pageSize;
      for (const item of items.slice(0, shown)) parent.append(render(item));
      if (items.length > shown) {
        const button = element('button', 'More');
        button.onclick = () => {
          expanded.add(key);
          button.remove();
          for (const item of items.slice(shown)) parent.append(render(item));
        };
        node.append(button);
      }
    }
    section('specifications', 'Specifications', searchSpecifications(site.index.documents, text), doc => {
      const item = element('li');
      item.append(link(docTitle(doc), { document: doc.id }));
      return item;
    }, true);
    if (failed) { results.append(element('p', failed)); return; }
    if (!data) {
      const status = element('p', 'Loading search data…');
      status.setAttribute('role', 'status');
      results.append(status);
      return;
    }
    const found = searchEntries(data.entries, text, site.summary);
    const render = (group: NameGroup) => renderGroup(group, site);
    for (const { kind, title } of sections) section(kind, title, found[kind], render);
    for (const { kind, title } of valueKinds) {
      section(kind, title, found.value.filter(group => group.entries[0].identity?.kind === 'value' && group.entries[0].identity.value_kind === kind), render);
    }
    const names = new Set(found.avp.map(group => group.name));
    const needle = text.trim();
    section('mentions', 'Mentions', filterMentions(data.mentions, text, names), mention => renderMention(mention, needle, site), true);
    if (!results.childElementCount) results.append(element('p', 'No matches.'));
  }

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
    data = { entries: loaded.entries, mentions: sortMentions(loaded.mentions, site.summary) };
  }).catch(error => { failed = String(error); }).finally(() => { if (isCurrent()) update(); });
}
