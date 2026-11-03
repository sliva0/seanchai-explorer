import type { DocumentSummary, Mention, SearchEntry } from './types.ts';

export function searchSpecifications(documents: DocumentSummary[], query: string): DocumentSummary[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const compact = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!words.length) return [];
  return documents.filter(doc => {
    const text = `${doc.specification} ${doc.title} ${doc.version ?? ''}`.toLowerCase();
    return words.every(word => text.includes(word)) || Boolean(compact && `${doc.reference} ${doc.specification} ${doc.id}`.toLowerCase().replace(/[^a-z0-9]/g, '').includes(compact));
  });
}

export function searchGroups(entries: SearchEntry[], query: string): SearchEntry[][] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const groups = new Map<string, SearchEntry[]>();
  const pair = needle.match(/^(\d+)\s*[:/]\s*(\d+)$/);
  const code = /^\d+$/.test(needle) ? Number(needle) : null;
  for (const entry of entries) {
    if (entry.kind !== 'avp') continue;
    const identity = entry.identity?.kind === 'avp' ? entry.identity : null;
    const matches = pair ? identity?.vendor_id === Number(pair[1]) && identity?.code === Number(pair[2])
      : code !== null ? identity?.code === code
      : entry.name.toLocaleLowerCase().includes(needle) || entry.wireshark_name?.toLocaleLowerCase().includes(needle);
    if (!matches) continue;
    const key = JSON.stringify([entry.kind, entry.name, entry.identity]);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a[0].name.localeCompare(b[0].name));
}

export function filterMentions(mentions: Mention[], query: string, names: Set<string>): Mention[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return mentions.filter(mention => {
    const text = mention.text.toLowerCase();
    return words.every(word => text.includes(word)) || mention.avps.some(name => names.has(name));
  });
}
