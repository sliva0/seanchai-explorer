import { SCHEMA_VERSION } from './types.ts';
import type { Document, DocumentSummary, Index, Line, RawDocument, Search } from './types.ts';
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

const compact = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The label with the title, unless the title only says the specification's name again. */
export function docTitle(doc: Pick<DocumentSummary, 'specification' | 'version' | 'reference' | 'title'>): string {
  const label = docLabel(doc);
  const title = compact(doc.title);
  if (!title || [doc.specification, doc.reference, label].some(name => compact(name) === title)) return label;
  return `${label} — ${doc.title}`;
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
  loadDocument(id: string): Promise<Document>;
  loadRaw(id: string): Promise<RawDocument>;
  loadSearch(): Promise<Search>;
}

/** A value table's rows link as other table rows do from the moment a file is read. */
function marked<T extends { lines: Line[] }>(file: T): T {
  valueTables(file.lines);
  return file;
}

export function createSite(index: Index): Site {
  const summaries = new Map(index.documents.map(doc => [doc.id, doc]));
  const cache = new Map<string, Promise<unknown>>();
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
    loadDocument: id => cached<Document>(known(id).path).then(marked),
    loadRaw: id => cached<RawDocument>(known(id).raw!).then(marked),
    loadSearch: () => cached<Search>('search.json'),
  };
}

/** Checks the export's schema before anything else is fetched. */
export async function openSite(): Promise<Site> {
  return createSite(await loadJSON<Index>('index.json'));
}
