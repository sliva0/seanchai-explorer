import type { DocumentSummary, Mention, SearchEntry } from './types.ts';
import { valueRowLabel } from './values.ts';

type Kind = SearchEntry['kind'];
export const EXACT = 0;
export const PREFIX = 1;
export const SUBSTRING = 2;

export interface NameGroup { name: string; kind: Kind; rank: number; entries: SearchEntry[] }
export type EntryResults = Record<Kind, NameGroup[]>;

type Releases = Pick<DocumentSummary, 'release'> | undefined;
const newest = (a: Releases, b: Releases) => (b?.release ?? -1) - (a?.release ?? -1);
const compact = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

function rankAmong(names: string[], needle: string): number | null {
  if (names.includes(needle)) return EXACT;
  if (names.some(name => name.startsWith(needle))) return PREFIX;
  return names.some(name => name.includes(needle)) ? SUBSTRING : null;
}

/** Specifications by title or number, best match first and the newest release of equals first. */
export function searchSpecifications(documents: DocumentSummary[], query: string): DocumentSummary[] {
  const wanted = words(query);
  const number = compact(query);
  if (!wanted.length) return [];
  const ranked: { doc: DocumentSummary; rank: number }[] = [];
  for (const doc of documents) {
    const byNumber = number ? rankAmong([doc.reference, doc.specification, doc.id].map(compact), number) : null;
    const text = `${doc.specification} ${doc.title} ${doc.version ?? ''}`.toLowerCase();
    const rank = byNumber ?? (wanted.every(word => text.includes(word)) ? SUBSTRING : null);
    if (rank !== null) ranked.push({ doc, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank || newest(a.doc, b.doc) || a.doc.id.localeCompare(b.doc.id)).map(item => item.doc);
}

function rankNumber(entry: SearchEntry, code: number): number | null {
  const identity = entry.identity;
  switch (identity?.kind) {
    case 'avp': return identity.code === code ? EXACT : null;
    case 'application': return identity.application_id === code ? EXACT : null;
    case 'registry': return identity.code === code ? EXACT : null;
    // A bit's number means nothing without its table.
    case 'value': return identity.value_kind === 'result-codes' && identity.value === code ? EXACT : null;
    case 'command':
      if (identity.command_code === code) return EXACT;
      return identity.application_id === code || identity.header_application_id === code ? PREFIX : null;
    default: return null;
  }
}

/** `10415:505` is an AVP's vendor and code, `16777251:316` a command's application and code. */
function matchesPair(entry: SearchEntry, first: number, second: number): boolean {
  const identity = entry.identity;
  if (identity?.kind === 'avp') return identity.vendor_id === first && identity.code === second;
  return identity?.kind === 'command' && identity.application_id === first && identity.command_code === second;
}

function rankText(entry: SearchEntry, needle: string): number | null {
  const names = [entry.name, entry.wireshark_name, entry.abbreviation].filter(name => name != null).map(name => name.toLocaleLowerCase());
  const rank = rankAmong(names, needle);
  if (rank !== null) return rank;
  return entry.identity?.kind === 'command' && entry.identity.application?.toLocaleLowerCase().includes(needle) ? SUBSTRING : null;
}

/**
 * Names matching a query, per kind: exact, then prefix, then substring. A number
 * is matched against what it identifies for each kind, never as part of a name.
 */
export function searchEntries(entries: SearchEntry[], query: string, summary: (id: string) => Releases = () => undefined): EntryResults {
  const results: EntryResults = { avp: [], command: [], application: [], registry: [], value: [] };
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return results;
  const pair = needle.match(/^(\d+)\s*[:/]\s*(\d+)$/);
  const code = /^\d+$/.test(needle) ? Number(needle) : null;
  const groups = new Map<string, NameGroup>();
  for (const entry of entries) {
    const rank = pair ? (matchesPair(entry, Number(pair[1]), Number(pair[2])) ? EXACT : null)
      : code !== null ? rankNumber(entry, code)
      : rankText(entry, needle);
    if (rank === null) continue;
    const key = JSON.stringify([entry.kind, entry.name, entry.identity]);
    const group = groups.get(key);
    if (group) {
      group.entries.push(entry);
      group.rank = Math.min(group.rank, rank);
    } else {
      groups.set(key, { name: entry.name, kind: entry.kind, rank, entries: [entry] });
    }
  }
  for (const group of groups.values()) {
    group.entries.sort((a, b) => newest(summary(a.document), summary(b.document)));
    results[group.kind].push(group);
  }
  for (const list of Object.values(results)) list.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return results;
}

export function identityLabel(entry: Pick<SearchEntry, 'identity'>): string {
  const identity = entry.identity;
  switch (identity?.kind) {
    case 'avp': return `${identity.vendor_id}:${identity.code}`;
    case 'application': return `Application ${identity.application_id}`;
    case 'registry': return `${identity.registry} ${identity.code}`;
    case 'value': {
      const list = identity.feature_list_id === null ? '' : ` list ${identity.feature_list_id}`;
      const application = identity.application ? ` (${identity.application})` : '';
      return `${valueRowLabel(identity.value_kind)} ${identity.value} of ${identity.avp}${list}${application}`;
    }
    case 'command': {
      const application = identity.application_id === null ? '' : ` · application ${identity.application_id}${identity.application ? ` (${identity.application})` : ''}`;
      const header = identity.header_application_id !== identity.application_id ? ` · header ${identity.header_application_id ?? 'none'}` : '';
      return `Command ${identity.command_code}${application}${header}`;
    }
    default: return '';
  }
}

/** Newest release first, keeping the file order within each. */
export function sortMentions(mentions: Mention[], summary: (id: string) => Releases): Mention[] {
  return mentions.toSorted((a, b) => newest(summary(a.document), summary(b.document)));
}

/** Lines holding every word of the query, or naming an AVP the query found. */
export function filterMentions(mentions: Mention[], query: string, names: Set<string>): Mention[] {
  const wanted = words(query);
  if (!wanted.length) return [];
  return mentions.filter(mention => {
    const text = mention.text.toLowerCase();
    return wanted.every(word => text.includes(word)) || mention.avps.some(name => names.has(name));
  });
}
