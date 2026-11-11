import type { DadFile } from './blocks.ts';
import { commandFacts, emptyIndex } from './commands.ts';
import type { CommandIndex } from './commands.ts';
import { SCHEMA_VERSION } from './types.ts';
import type { Document, DocumentSummary, Index, RawDocument, Search } from './types.ts';
import type { SourcePosition } from './navigation.ts';
import { valueTables } from './values.ts';

export type Mode = Index['mode'];
export type PaneKind = 'pdf' | 'rfc' | 'placeholder';

export const siteURL = (path: string) => new URL(path, new URL('.', location.href));
export const dataURL = (path: string) => siteURL(`data/${path}`);

async function loadJSON<T>(path: string): Promise<T> {
  const response = await fetch(dataURL(path));
  if (!response.ok) throw new Error(`${response.status}: ${path}`);
  const data = await response.json() as T & { schema_version: number };
  if (data.schema_version !== SCHEMA_VERSION) throw new Error(`Unsupported export schema ${data.schema_version} in ${path}, expected ${SCHEMA_VERSION}`);
  return data;
}

export function docLabel(doc: Pick<DocumentSummary, 'specification' | 'version'>): string {
  return `${doc.specification}${doc.version ? ` V${doc.version}` : ''}`;
}

type Named = Pick<DocumentSummary, 'publisher' | 'specification'>;

/** The name where any publisher's may be beside it: a bare TS number is 3GPP's, and the others keep their prefix. */
export function docName(doc: Named): string {
  return doc.publisher === '3GPP' ? doc.specification.replace(/^3GPP /, '') : doc.specification;
}

/** The name under a heading that says the publisher. 3GPP2, oneM2M and OMA keep their prefix, which carries meaning. */
export function docNumber(doc: Named): string {
  if (doc.publisher === '3GPP') return docName(doc).replace(/^TS /, '');
  return doc.publisher === 'ETSI' ? doc.specification.replace(/^ETSI /, '') : doc.specification;
}

/** The name beside its publisher's: OMA's `DDS-Charging_Data` reads as its publisher prints it, `DDS Charging_Data`. */
export function docInFamily(name: string, doc: Pick<DocumentSummary, 'publisher'>): string {
  const bare = name.replace(new RegExp(`^${doc.publisher}[ -]`), '');
  return doc.publisher === 'OMA' ? bare.replace(/^DDS-/, 'DDS ') : bare;
}

/** The name and version, for a pane showing the text itself. */
export function docVersioned(doc: Named & Pick<DocumentSummary, 'version'>): string {
  return `${docName(doc)}${doc.version ? ` V${doc.version}` : ''}`;
}

const compact = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

type Titled = Pick<DocumentSummary, 'id' | 'specification' | 'version' | 'reference' | 'title' | 'interfaces'>;

/** The Diameter interfaces or reference points a document specifies, or an RFC's application: blank where it has none or the corpus does not say. */
export const interfacesOf = (doc: Pick<DocumentSummary, 'interfaces'>): string => (doc.interfaces ?? []).join(', ');

/** The title, unless it only says the specification's name again. */
export function docSubject(doc: Titled): string {
  const title = compact(doc.title);
  return !title || [doc.specification, doc.reference, docLabel(doc)].some(name => compact(name) === title) ? '' : doc.title;
}

/** The interfaces, unless the title names them all, and the title. */
export function docAbout(doc: Titled): { interfaces: string; subject: string } {
  const subject = docSubject(doc);
  const interfaces = interfacesOf(doc);
  const words = new Set(subject.split(/[\s;:,()]+/));
  return { interfaces: interfaces.split(', ').every(name => words.has(name)) ? '' : interfaces, subject };
}

/** A label with what its document is about. */
export function docHeading(label: string, doc: Titled): string {
  const { interfaces, subject } = docAbout(doc);
  return `${label}${interfaces ? ` · ${interfaces}` : ''}${subject ? ` — ${subject}` : ''}`;
}

/** The full heading of a document's own page. */
export function docTitle(doc: Titled): string {
  return docHeading(docLabel(doc), doc);
}

const PUBLISHER_ORDER = ['3GPP', 'IETF', 'ETSI', '3GPP2', 'oneM2M', 'OMA'];

/** Where a publisher's documents go in any list by publisher, one not named last. */
export function publisherRank(publisher: string): number {
  const rank = PUBLISHER_ORDER.indexOf(publisher);
  return rank === -1 ? PUBLISHER_ORDER.length : rank;
}

type Edition = Pick<DocumentSummary, 'id' | 'specification' | 'release' | 'version'>;

const compareEditions = (a: Edition, b: Edition) => (a.release ?? -1) - (b.release ?? -1) || (a.version ?? '').localeCompare(b.version ?? '', undefined, { numeric: true });

/** What tells each edition from a newer one of its specification in the corpus. The newest has nothing to say. */
function olderEditions(documents: Edition[]): Map<string, string> {
  const newest = new Map<string, Edition>();
  for (const doc of documents) {
    const held = newest.get(doc.specification);
    if (!held || compareEditions(doc, held) > 0) newest.set(doc.specification, doc);
  }
  const older = documents.filter(doc => newest.get(doc.specification) !== doc);
  return new Map(older.map(doc => [doc.id, doc.release ? `Rel-${doc.release}` : doc.version ? `V${doc.version}` : '']));
}

/** Whether a URL is a publisher's PDF, which a source kind may not say. */
export function isPdfURL(url: URL): boolean {
  return url.pathname.toLowerCase().endsWith('.pdf');
}

/**
 * What the side pane can show of a document. A public build holds no PDFs, so
 * it shows a `placeholder` for them; null is a document with no pane at all.
 */
export function paneKind(doc: Pick<DocumentSummary, 'source'>, mode: Mode): PaneKind | null {
  const { kind, local, url } = doc.source;
  if (kind === 'rfc-text') return 'rfc';
  if (mode === 'self-hosted') return local ? 'pdf' : null;
  return local || (url && (kind === 'etsi-pdf' || isPdfURL(new URL(url)))) ? 'placeholder' : null;
}

/** The file the pane's reader loads and names in its messages. */
export function paneFile(doc: Pick<DocumentSummary, 'source'>, mode: Mode): string | null {
  const kind = paneKind(doc, mode);
  if (kind === 'pdf') return dataURL(doc.source.local!).href;
  if (kind === 'rfc') return doc.source.text ? dataURL(doc.source.text).href : doc.source.url;
  return null;
}

export function paneURL(doc: Pick<DocumentSummary, 'source'>, position: SourcePosition, mode: Mode): URL | null {
  const kind = paneKind(doc, mode);
  const file = paneFile(doc, mode);
  if (!kind || !file) return null;
  const url = siteURL(kind === 'pdf' ? 'viewer.html' : 'rfc.html');
  url.searchParams.set('file', file);
  const hash = new URLSearchParams();
  hash.set('page', String(position.page ?? 1));
  if (kind === 'pdf') {
    hash.set('search', position.section);
    if (position.name != null) hash.set('name', position.name);
    if (position.occurrence) hash.set('match', '1');
  } else {
    hash.set('section', position.section);
    hash.set('query', position.name ?? '');
  }
  if (position.row) hash.set('row', '1');
  if (position.titled) hash.set('titled', '1');
  if (position.value !== undefined) hash.set('value', String(position.value));
  if (position.printed) hash.set('printed', position.printed);
  if (position.exact) hash.set('exact', '1');
  url.hash = hash.toString();
  return url;
}

/** The publisher's own copy, at the position where its format can say so. */
export function publisherURL(doc: Pick<DocumentSummary, 'source'>, position: Pick<SourcePosition, 'section' | 'page' | 'exact'>): URL | null {
  if (!doc.source.url) return null;
  if (doc.source.kind === 'rfc-text') {
    const url = new URL(doc.source.url.replace(/\.txt$/, '.html'));
    if (position.exact && position.page) url.hash = `page-${position.page}`;
    else if (position.section) url.hash = `section-${position.section}`;
    return url;
  }
  const url = new URL(doc.source.url);
  if (position.page) url.hash = `page=${position.page}`;
  return url;
}

/** Where a `; Section:` or `; Page:` link goes without a pane: always a new tab. */
export function sourceHref(doc: Pick<DocumentSummary, 'source'>, position: SourcePosition, mode: Mode): URL | null {
  return paneKind(doc, mode) === 'pdf' ? paneURL(doc, position, mode) : publisherURL(doc, position);
}

export interface Site {
  index: Index;
  mode: Mode;
  summary(id: string): DocumentSummary | undefined;
  /** The edition, only if the corpus holds a newer one of the specification: `Rel-11`, or a version with no release. */
  edition(doc: DocumentSummary): string;
  /** The name in a list of any publishers' documents, with the edition if it has to say. */
  label(doc: DocumentSummary): string;
  loadDocument(id: string): Promise<Document>;
  /** A document already loaded, for what can be shown of it without waiting. */
  held(id: string): Document | undefined;
  loadRaw(id: string): Promise<RawDocument>;
  loadSearch(): Promise<Search>;
  /** The corpus's commands, an empty index where the build derived none. */
  loadCommands(): Promise<CommandIndex>;
  /** That index once loaded, which a document's view waits for. */
  commands(): CommandIndex | undefined;
}

/** A value table's rows and a command's names link as other names do from the moment a file is read. */
function marked<T extends DadFile>(file: T): T {
  valueTables(file);
  commandFacts(file);
  return file;
}

export function createSite(index: Index): Site {
  const summaries = new Map(index.documents.map(doc => [doc.id, doc]));
  const editions = olderEditions(index.documents);
  const cache = new Map<string, Promise<unknown>>();
  const held = new Map<string, Document>();
  let commands: CommandIndex | undefined;
  let commandsLoading: Promise<CommandIndex> | undefined;
  function cached<T>(path: string): Promise<T> {
    let result = cache.get(path) as Promise<T> | undefined;
    if (!result) {
      result = loadJSON<T>(path);
      cache.set(path, result);
      result.catch(() => cache.delete(path));
    }
    return result;
  }
  const known = (id: string) => {
    const summary = summaries.get(id);
    if (!summary) throw new Error(`Document not found: ${id}`);
    return summary;
  };
  return {
    index,
    mode: index.mode,
    summary: id => summaries.get(id),
    edition: doc => editions.get(doc.id) ?? '',
    label: doc => [docName(doc), editions.get(doc.id)].filter(Boolean).join(' '),
    loadDocument: id => cached<Document>(known(id).path).then(marked).then(doc => { held.set(id, doc); return doc; }),
    held: id => held.get(id),
    loadRaw: id => cached<RawDocument>(known(id).raw!).then(marked),
    loadSearch: () => cached<Search>('search.json'),
    loadCommands: () => commandsLoading ??= loadJSON<CommandIndex>('commands.json')
      .catch(() => emptyIndex(SCHEMA_VERSION))
      .then(index => commands = index),
    commands: () => commands,
  };
}

/** Checks the export's schema before anything else is fetched. */
export async function openSite(): Promise<Site> {
  return createSite(await loadJSON<Index>('index.json'));
}
