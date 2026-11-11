import { allowsFuzzy, foldName, foldQuery, looseSubsequence, nameTypos, spansInName, wordPrefixes, wordTypos } from './fuzzy.ts';
import type { FoldedName, FoldedQuery, Span } from './fuzzy.ts';
import type { DocumentSummary, Mention, SearchEntry } from './types.ts';
import { valueRowLabel } from './values.ts';

type Kind = SearchEntry['kind'];
export const EXACT = 0;
export const PREFIX = 1;
/** At the start of a word of the name. */
export const WORD = 2;
export const SUBSTRING = 3;
/** Every word of the query starts a word of the name, in any order. */
export const ALL_WORDS = 4;
/** From here on a match is approximate. */
export const INITIALS = 5;
export const ONE_TYPO = 6;
export const TWO_TYPOS = 7;
export const TYPO_IN_WORD = 8;
export const SUBSEQUENCE = 9;

/** Approximate names kept per kind, best first: enough to find a misspelling, too few to bury a section. */
const MAX_APPROXIMATE = 30;

export interface NameGroup { name: string; kind: Kind; rank: number; entries: SearchEntry[] }
export type EntryResults = Record<Kind, NameGroup[]>;
export const isApproximate = (group: Pick<NameGroup, 'rank'>) => group.rank >= INITIALS;

interface IndexedEntry { entry: SearchEntry; names: number[]; application: string | null; title: string; group: string }
/** Entries with their names folded once: a query ranks each distinct name, not each entry. */
export interface EntryIndex { entries: IndexedEntry[]; names: FoldedName[] }
export type FoldedMention = Mention & { folded: string };

type Releases = Pick<DocumentSummary, 'release'> | undefined;
const newest = (a: Releases, b: Releases) => (b?.release ?? -1) - (a?.release ?? -1);
const compact = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

function rankAmong(names: string[], needle: string): number | null {
  if (names.includes(needle)) return EXACT;
  if (names.some(name => name.startsWith(needle))) return PREFIX;
  return names.some(name => name.includes(needle)) ? SUBSTRING : null;
}

/**
 * A query as an interface's name, whole, from its start or from a word's: the names are too short for
 * anything looser, `6a` being no `S6a`. Digits alone are the number of a specification, not `CH-2`.
 */
function matchInterface(query: string, name: string): Match | null {
  const folded = foldQuery(query);
  if (!/[a-z]/.test(folded.compact)) return null;
  const written = matchWritten(folded.lower, name.toLowerCase());
  return written && written.rank < SUBSTRING ? written : matchIgnoringSeparators(folded, foldName(name));
}

/** What of an interfaces list to mark for a query: each name it matches, as a whole or word by word. */
export function interfaceSpans(interfaces: string, query: string): Span[] {
  const spans: Span[] = [];
  let at = 0;
  for (const name of interfaces.split(', ')) {
    for (const needle of [query, ...words(query)]) {
      const match = matchInterface(needle, name);
      for (const [start, end] of match ? matchedSpans(name, match) : []) spans.push([at + start, at + end]);
    }
    at += name.length + 2;
  }
  return mergeSpans(spans);
}

/** Specifications by title, number or interface, best match first and the newest release of equals first. */
export function searchSpecifications(documents: DocumentSummary[], query: string): DocumentSummary[] {
  const wanted = words(query);
  const number = compact(query);
  if (!wanted.length) return [];
  const ranked: { doc: DocumentSummary; rank: number }[] = [];
  for (const doc of documents) {
    const byNumber = number ? rankAmong([doc.reference, doc.specification, doc.id].map(compact), number) : null;
    const interfaces = doc.interfaces ?? [];
    const byInterface = interfaces.flatMap(name => matchInterface(query, name)?.rank ?? []);
    const text = `${doc.specification} ${doc.title} ${doc.version ?? ''}`.toLowerCase();
    const byWords = wanted.every(word => text.includes(word) || interfaces.some(name => matchInterface(word, name))) ? [SUBSTRING] : [];
    const rank = Math.min(...[byNumber ?? []].flat(), ...byInterface, ...byWords);
    if (rank !== Infinity) ranked.push({ doc, rank });
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

/**
 * Commands some documents print shortened, as TS 29.061 does `AC-Answer`: one code and
 * abbreviation make one command, under the name spelled out, or else the one most documents use.
 */
function commandTitles(entries: SearchEntry[]): Map<string, string> {
  const spellings = new Map<string, Map<string, number>>();
  for (const { identity, abbreviation, name } of entries) {
    if (identity?.kind !== 'command' || !abbreviation) continue;
    const key = `${identity.command_code} ${abbreviation}`;
    const counts = spellings.get(key) ?? new Map<string, number>();
    spellings.set(key, counts.set(name, (counts.get(name) ?? 0) + 1));
  }
  const shortened = (name: string) => /^[A-Z]{2}-/.test(name) ? 1 : 0;
  const titles = new Map<string, string>();
  for (const counts of spellings.values()) {
    const [title, ...others] = [...counts.keys()].sort((a, b) => shortened(a) - shortened(b) || counts.get(b)! - counts.get(a)! || b.length - a.length);
    for (const name of others) titles.set(name, title);
  }
  return titles;
}

export function indexEntries(entries: SearchEntry[]): EntryIndex {
  const titles = commandTitles(entries);
  const names: FoldedName[] = [];
  const known = new Map<string, number>();
  const nameId = (name: string) => {
    let id = known.get(name);
    if (id === undefined) {
      id = names.push(foldName(name)) - 1;
      known.set(name, id);
    }
    return id;
  };
  return {
    names,
    entries: entries.map(entry => {
      const title = entry.kind === 'command' ? titles.get(entry.name) ?? entry.name : entry.name;
      return {
        entry,
        names: [entry.name, entry.wireshark_name, entry.abbreviation].filter(name => name != null).map(nameId),
        application: entry.identity?.kind === 'command' ? entry.identity.application?.toLowerCase() ?? null : null,
        title,
        // Each kind of value has a section of its own.
        group: JSON.stringify([entry.kind, entry.identity?.kind === 'value' ? entry.identity.value_kind : null, title]),
      };
    }),
  };
}

export const foldMentions = (mentions: Mention[]): FoldedMention[] => mentions.map(mention => ({ ...mention, folded: mention.text.toLowerCase() }));

interface Match {
  rank: number;
  /** Where the query stands in the lowercase name as written. */
  written?: Span;
  /** Or in the name with its separators gone. */
  spans?: Span[];
}

const startsWord = (text: string, at: number) => at === 0 || !/[a-z0-9]/.test(text[at - 1]);

function matchWritten(needle: string, name: string): Match | null {
  if (!needle) return null;
  let at = name.indexOf(needle);
  if (at < 0) return null;
  const written = (start: number): Span => [start, start + needle.length];
  if (name === needle) return { rank: EXACT, written: written(0) };
  if (at === 0) return { rank: PREFIX, written: written(0) };
  const first = at;
  for (; at >= 0; at = name.indexOf(needle, at + 1)) {
    if (startsWord(name, at)) return { rank: WORD, written: written(at) };
  }
  return { rank: SUBSTRING, written: written(first) };
}

/** `sessionid` and `session id` as `Session-Id`: across separators, but from a word's start, or `nr` would be in every `Destination-Realm`. */
function matchIgnoringSeparators(query: FoldedQuery, name: FoldedName): Match | null {
  const wanted = query.compact;
  if (!wanted) return null;
  // `session id` must break where a word of the name does, `a b` is not `Abort`.
  const fits = (start: number) => {
    if (!name.compact.startsWith(wanted, start)) return false;
    let end = start;
    return query.words.every((word, index) => {
      end += word.length;
      return index === query.words.length - 1 || name.starts.includes(end);
    });
  };
  const start = name.starts.find(fits);
  if (start === undefined) return null;
  const spans: Span[] = [[start, start + wanted.length]];
  if (start > 0) return { rank: WORD, spans };
  return { rank: wanted.length === name.compact.length ? EXACT : PREFIX, spans };
}

function matchAllWords(query: FoldedQuery, name: FoldedName): Match | null {
  if (query.words.length < 2 || query.compact.length < 3) return null;
  const spans: Span[] = [];
  for (const word of query.words) {
    const start = name.starts.find(start => name.compact.startsWith(word, start));
    if (start === undefined) return null;
    spans.push([start, start + word.length]);
  }
  return { rank: ALL_WORDS, spans };
}

function matchApproximately(query: FoldedQuery, name: FoldedName): Match | null {
  if (!allowsFuzzy(query)) return null;
  const prefixes = wordPrefixes(query, name);
  if (prefixes) return { rank: INITIALS, spans: prefixes };
  const typos = nameTypos(query, name);
  if (typos !== null) return { rank: typos > 1 ? TWO_TYPOS : ONE_TYPO, spans: [[0, name.compact.length]] };
  const span = wordTypos(query, name);
  if (span) return { rank: TYPO_IN_WORD, spans: [span] };
  const letters = looseSubsequence(query, name);
  return letters && { rank: SUBSEQUENCE, spans: letters.map(at => [at, at + 1]) };
}

function matchName(query: FoldedQuery, name: FoldedName): Match | null {
  const written = matchWritten(query.lower, name.lower);
  const separate = matchIgnoringSeparators(query, name);
  if (written && (!separate || written.rank <= separate.rank)) return written;
  return separate ?? matchAllWords(query, name) ?? matchApproximately(query, name);
}

function mergeSpans(spans: Span[]): Span[] {
  const merged: Span[] = [];
  for (const [start, end] of spans.toSorted((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

const matchedSpans = (name: string, match: Match): Span[] => match.written ? [match.written] : mergeSpans(spansInName(name, match.spans ?? []));

/** What of a name to mark for a query, as written. */
export function matchSpans(name: string, query: string): Span[] {
  const match = matchName(foldQuery(query), foldName(name));
  return match ? matchedSpans(name, match) : [];
}

/**
 * Names matching a query, per kind: the precise ranks, then at most a few
 * approximate ones, and the shorter of equals first. A number is matched against
 * what it identifies for each kind, never as part of a name, and is never approximate.
 */
export function searchEntries(index: EntryIndex, query: string, summary: (id: string) => Releases = () => undefined): EntryResults {
  const results: EntryResults = { avp: [], command: [], application: [], registry: [], value: [] };
  const needle = query.trim().toLowerCase();
  if (!needle) return results;
  const pair = needle.match(/^(\d+)\s*[:/]\s*(\d+)$/);
  const code = /^\d+$/.test(needle) ? Number(needle) : null;
  const numeric = pair !== null || code !== null;
  const matches = (entry: SearchEntry) => pair ? (matchesPair(entry, Number(pair[1]), Number(pair[2])) ? EXACT : null) : rankNumber(entry, code!);
  const folded = foldQuery(query);
  const nameRanks = numeric ? [] : index.names.map(name => matchName(folded, name)?.rank ?? null);
  // Letters merely in order are a last resort: beside anything better they are noise, `class` finding `Client-Address`.
  if (nameRanks.some(rank => rank !== null && rank < SUBSEQUENCE)) nameRanks.forEach((rank, id) => { if (rank === SUBSEQUENCE) nameRanks[id] = null; });
  // The AVPs a number identifies bring their result codes, whose own numbers it is not.
  const tables = new Set<string>();
  if (numeric) {
    for (const { entry } of index.entries) {
      if (entry.kind === 'avp' && matches(entry) !== null) tables.add(entry.name);
    }
  }
  const groups = new Map<string, NameGroup>();
  for (const item of index.entries) {
    const { entry } = item;
    let rank: number | null = null;
    if (numeric) {
      rank = matches(entry);
      if (rank === null && entry.identity?.kind === 'value' && entry.identity.value_kind === 'result-codes' && tables.has(entry.identity.avp)) rank = SUBSTRING;
    } else {
      for (const id of item.names) {
        const ranked = nameRanks[id];
        if (ranked !== null && (rank === null || ranked < rank)) rank = ranked;
      }
      if ((rank === null || rank > SUBSTRING) && item.application?.includes(needle)) rank = SUBSTRING;
    }
    if (rank === null) continue;
    const group = groups.get(item.group);
    if (group) {
      group.entries.push(entry);
      group.rank = Math.min(group.rank, rank);
    } else {
      groups.set(item.group, { name: item.title, kind: entry.kind, rank, entries: [entry] });
    }
  }
  for (const group of groups.values()) {
    group.entries.sort((a, b) => newest(summary(a.document), summary(b.document)));
    results[group.kind].push(group);
  }
  for (const kind of Object.keys(results) as Kind[]) {
    const list = results[kind].sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name));
    const precise = list.findIndex(isApproximate);
    if (precise >= 0) list.length = Math.min(list.length, precise + MAX_APPROXIMATE);
  }
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

/** What is said of an entry, in order; `brief` beside a document's label, where the entry's name is already said. */
interface Fact { text: string; brief?: string }

function entryFacts(entry: SearchEntry): Fact[] {
  const identity = entry.identity;
  const type = { text: entry.data_type ?? '' };
  switch (identity?.kind) {
    case 'avp': return [{ text: `${identity.vendor_id}:${identity.code}` }, type];
    case 'application': return [{ text: `application ${identity.application_id}` }, type];
    case 'registry': return [{ text: `${identity.registry} ${identity.code}` }, type];
    case 'value': return [
      { text: `${valueRowLabel(identity.value_kind)} ${identity.value} of ${identity.avp}` },
      { text: identity.feature_list_id === null ? '' : `list ${identity.feature_list_id}` },
      { text: identity.application ?? '' },
    ];
    case 'command': {
      const id = identity.application_id === null ? '' : `application ${identity.application_id}`;
      const name = identity.application ?? '';
      return [
        { text: `command ${identity.command_code}` },
        { text: name && id ? `${id} (${name})` : id || name, brief: name.replace(/^Diameter /, '') || id },
      ];
    }
    default: return [];
  }
}

/** What a command's header prints, worth saying only where documents disagree on it. */
function headerFact(entry: SearchEntry): string {
  const identity = entry.identity;
  return identity?.kind === 'command' ? `header ${identity.header_application_id ?? 'none'}` : '';
}

export interface GroupFacts {
  /** What every entry of a name agrees on, said once. */
  shared: string[];
  /** What tells this entry from the name's others. */
  differing(entry: SearchEntry): string[];
}

/** An entry with no identity is a hole, a name its document does not define: it has nothing to disagree about. */
export function groupFacts(entries: SearchEntry[]): GroupFacts {
  const known = entries.filter(entry => entry.identity);
  const facts = new Map(known.map(entry => [entry, entryFacts(entry)]));
  const slots = facts.get(known[0])?.length ?? 0;
  const agree = (read: (entry: SearchEntry) => string) => known.every(entry => read(entry) === read(known[0]));
  const agreed = Array.from({ length: slots }, (_, slot) => agree(entry => facts.get(entry)![slot].text));
  const headers = !agree(headerFact);
  return {
    shared: agreed.flatMap((same, slot) => same && facts.get(known[0])![slot].text ? [facts.get(known[0])![slot].text] : []),
    differing(entry) {
      const own = facts.get(entry) ?? [];
      const said = own.flatMap((fact, slot) => agreed[slot] ? [] : [fact.brief ?? fact.text]);
      return [...said, headers ? headerFact(entry) : ''].filter(Boolean);
    },
  };
}

type Definition = SearchEntry['target'];
type Referenced = (id: string) => Pick<DocumentSummary, 'reference' | 'release'> | undefined;

/**
 * Where each entry's name is defined: its target, but a value's in the document its `defined_in` names, whose own
 * entry for the name is its row there, of the citing document's release where several editions list it. A value
 * whose origin lists it under no such name has that document's newest edition, with no clause.
 */
export function definitions(entries: SearchEntry[], summary: Referenced, documents: Pick<DocumentSummary, 'id' | 'reference' | 'release'>[] = []): Map<SearchEntry, Definition> {
  const reference = (id: string) => summary(id)?.reference;
  const defines = (entry: SearchEntry) => entry.defined_in.includes(reference(entry.document) ?? '');
  return new Map(entries.map(entry => {
    if (entry.kind !== 'value' || !entry.target || !entry.defined_in.length || defines(entry)) return [entry, entry.target];
    const origin = entry.defined_in[0];
    const release = summary(entry.document)?.release;
    const own = entries.filter(other => other.target && reference(other.document) === origin && defines(other));
    const found = own.find(other => summary(other.document)?.release === release) ?? own[0];
    if (found) return [entry, { ...found.target!, name: found.name }];
    const held = documents.filter(doc => doc.reference === origin).toSorted(newest)[0];
    return [entry, held ? { document: held.id, section: null } : null];
  }));
}

/** Where most of the documents using a name but not defining it find it; none if all define their own. */
export function usualDefinition(entries: SearchEntry[], defined?: Map<SearchEntry, Definition>): Definition | undefined {
  const uses = new Map<string, number>();
  let usual: Definition | undefined;
  for (const entry of entries) {
    const { document } = entry;
    const target = defined ? defined.get(entry) : entry.target;
    if (!target || target.document === document) continue;
    const count = (uses.get(target.document) ?? 0) + 1;
    uses.set(target.document, count);
    if (!usual || count > uses.get(usual.document)!) usual = target;
  }
  return usual;
}

/** Newest release first, keeping the file order within each. */
export function sortMentions<T extends Mention>(mentions: T[], summary: (id: string) => Releases): T[] {
  return mentions.toSorted((a, b) => newest(summary(a.document), summary(b.document)));
}

/** Lines holding every word of the query, or naming an AVP the query found. */
export function filterMentions(mentions: FoldedMention[], query: string, names: Set<string>): FoldedMention[] {
  const wanted = words(query);
  if (!wanted.length) return [];
  return mentions.filter(mention => wanted.every(word => mention.folded.includes(word)) || mention.avps.some(name => names.has(name)));
}

/** What of a mention to mark: the query, or else its words, and any AVP found by it. */
export function mentionSpans(mention: FoldedMention, query: string, names: Set<string>): Span[] {
  const { folded } = mention;
  if (folded.length !== mention.text.length) return [];
  const whole = query.trim().toLowerCase();
  const wanted = words(query);
  const needles = folded.includes(whole) ? [whole] : wanted.every(word => folded.includes(word)) ? wanted : [];
  needles.push(...mention.avps.filter(name => names.has(name)).map(name => name.toLowerCase()));
  const spans: Span[] = [];
  for (const needle of needles) {
    for (let at = folded.indexOf(needle); needle && at >= 0; at = folded.indexOf(needle, at + 1)) spans.push([at, at + needle.length]);
  }
  return mergeSpans(spans);
}
