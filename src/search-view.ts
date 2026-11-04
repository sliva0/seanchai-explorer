import { docHeading, docName } from './data.ts';
import type { Site } from './data.ts';
import { counted, element, link } from './dom.ts';
import { routeFor } from './navigation.ts';
import { filterMentions, foldMentions, identityLabel, indexEntries, isApproximate, matchSpans, mentionSpans, searchEntries, searchSpecifications, sortMentions } from './search.ts';
import type { EntryIndex, FoldedMention, NameGroup } from './search.ts';
import type { Span } from './fuzzy.ts';
import type { SearchEntry } from './types.ts';
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

function renderGroup(group: NameGroup, site: Site, query: string): HTMLElement {
  const first = group.entries[0];
  const panel = element('details');
  const summary = element('summary');
  const detail = [identityLabel(first), first.data_type].filter(Boolean).join(' · ');
  const mark = (name: string) => marked(name, matchSpans(name, query));
  const title = element('strong');
  title.append(...mark(first.name));
  if (first.abbreviation) title.append(' (', ...mark(first.abbreviation), ')');
  summary.append(title);
  if (isApproximate(group)) {
    panel.className = 'approximate';
    summary.append(element('em', 'approximate'));
  }
  summary.append(element('span', detail));
  panel.append(summary);
  if (first.wireshark_name && first.wireshark_name !== first.name) {
    const wireshark = element('p', 'Wireshark: ');
    wireshark.append(...mark(first.wireshark_name));
    panel.append(wireshark);
  }
  const list = element('ul');
  const seen = new Set<string>();
  for (const entry of group.entries) {
    const key = JSON.stringify([entry.document, entry.target]);
    if (seen.has(key)) continue;
    seen.add(key);
    const item = element('li');
    const doc = site.summary(entry.document);
    const label = doc ? site.label(doc) : entry.document;
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
        item.append(' → ', link(definer ? site.label(definer) : entry.defined_in.join(', ') || entry.name, entry.target));
      }
    }
    if (entry.across_releases) {
      // Which edition stands in for a citation is the point here, so its version stays.
      const crossing = entry.across_releases;
      const cited = site.index.documents.find(doc => doc.reference === crossing.cited);
      item.append(` · ${cited ? docName(cited) : crossing.cited} V${crossing.version} · ${crossing.rule}`);
    }
    list.append(item);
  }
  panel.append(list);
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
    function section<T>(key: string, title: string, items: T[], render: (item: T) => HTMLElement | null, { wrap = false, approximate = 0 } = {}) {
      if (!items.length) return;
      const node = element('section', undefined, `search-section search-${key}`);
      const heading = element('h2');
      const precise = items.length - approximate;
      heading.append(...counted(title, precise || items.length));
      if (approximate) heading.append(element('span', precise ? `+${approximate} approximate` : 'approximate', 'count'));
      node.append(heading);
      results.append(node);
      const parent = wrap ? element('ul') : node;
      if (wrap) node.append(parent);
      const add = (item: T) => {
        const rendered = render(item);
        if (rendered) parent.append(rendered);
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
    section('specifications', 'Specifications', searchSpecifications(site.index.documents, text), doc => {
      const item = element('li');
      item.append(link(docHeading(site.label(doc), doc), { document: doc.id }));
      return item;
    }, { wrap: true });
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

  /** Arrows walk the input and what is on screen; Enter is then the browser's, opening a link or a summary. */
  function walk(event: KeyboardEvent) {
    if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const stops = [...results.querySelectorAll<HTMLElement>('summary, a[href], button')].filter(node => node.tagName === 'SUMMARY' || !node.closest('details:not([open])'));
    const route = [input, ...stops];
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
