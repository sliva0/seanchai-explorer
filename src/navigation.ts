import type { DocumentMeta, SearchEntry, SourcePosition, Target } from './types';

export interface SharedSource { document: string; position: SourcePosition }
export function sharedRoute(target: Target, raw: boolean, source?: SharedSource, line?: number): string {
  const [path, query] = routeFor(target, raw).split('?');
  const params = new URLSearchParams(query);
  if (source) {
    params.set('source', source.document);
    params.set('sourceSection', source.position.section);
    if (source.position.page) params.set('page', String(source.position.page));
    if (source.position.name !== undefined) params.set('sourceName', source.position.name);
  }
  if (line !== undefined) params.set('line', String(line));
  return `${path}${params.size ? `?${params}` : ''}`;
}

export function sharedState(hash: string): { source?: SharedSource; line?: number } {
  const params = new URLSearchParams(hash.split('?')[1]);
  const page = Number(params.get('page'));
  const line = Number(params.get('line'));
  const position: SourcePosition = {
    section: params.get('sourceSection') ?? '',
    page: Number.isInteger(page) && page > 0 ? page : null,
    name: params.get('sourceName') ?? undefined,
    exact: Number.isInteger(page) && page > 0,
  };
  return {
    ...(params.get('source') ? { source: { document: params.get('source')!, position } } : {}),
    ...(params.has('line') && Number.isInteger(line) && line >= 0 ? { line } : {}),
  };
}

export function searchSpecifications(documents: DocumentMeta[], query: string): DocumentMeta[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const compact = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!words.length) return [];
  return documents.filter(doc => {
    const text = `${doc.specification} ${doc.title} ${doc.version ?? ''}`.toLowerCase();
    return words.every(word => text.includes(word)) || Boolean(compact && `${doc.reference} ${doc.specification} ${doc.id}`.toLowerCase().replace(/[^a-z0-9]/g, '').includes(compact));
  });
}

export function routeFor(target: Target, raw = false): string {
  const params = new URLSearchParams();
  if (raw) params.set('raw', '1');
  if (target.name) params.set('name', target.name);
  return `#${encodeURIComponent(target.document)}${target.section ? `/${encodeURIComponent(target.section)}` : ''}${params.size ? `?${params}` : ''}`;
}

export function parseRoute(hash: string): { document: string; section: string; raw: boolean; query: string; name?: string } {
  const [path, query] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  try {
    const [document = '', section = ''] = path.split('/').map(decodeURIComponent);
    return { document, section, raw: params.get('raw') === '1', query: params.get('q') ?? '', ...(params.has('name') ? { name: params.get('name')! } : {}) };
  } catch {
    return { document: '', section: '', raw: false, query: '' };
  }
}

export function searchGroups(entries: SearchEntry[], query: string): SearchEntry[][] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const groups = new Map<string, SearchEntry[]>();
  const identity = needle.match(/^(\d+)\s*[:/]\s*(\d+)$/);
  const code = /^\d+$/.test(needle) ? Number(needle) : null;
  for (const entry of entries) {
    if (entry.kind !== 'AVP') continue;
    const matches = identity ? entry.identity?.[0] === Number(identity[1]) && entry.identity?.[1] === Number(identity[2])
      : code !== null ? entry.identity?.[1] === code
      : entry.name.toLocaleLowerCase().includes(needle) || entry.alias?.toLocaleLowerCase().includes(needle);
    if (!matches) continue;
    const key = JSON.stringify([entry.kind, entry.name, entry.identity]);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a[0].name.localeCompare(b[0].name));
}
