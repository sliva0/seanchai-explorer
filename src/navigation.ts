import type { Citation, Target } from './types.ts';

/** A place the source pane shows. `exact` is a page to go to as it is, not a clause to look for. */
export interface SourcePosition extends Citation { exact?: boolean; occurrence?: boolean }
export interface PaneState { document: string; position: SourcePosition }
/** `line` is a line to point at, `top` the line a view was left scrolled to. */
export interface RouteOptions { raw?: boolean; source?: PaneState; line?: number; top?: number; paneHidden?: boolean }
export interface Route extends RouteOptions {
  document: string;
  section: string;
  raw: boolean;
  query: string;
  name?: string;
}

export function routeFor(target: Target, options: RouteOptions = {}): string {
  const params = new URLSearchParams();
  if (options.raw) params.set('raw', '1');
  if (target.name) params.set('name', target.name);
  if (options.source) {
    const { document, position } = options.source;
    params.set('source', document);
    params.set('sourceSection', position.section);
    if (position.page) params.set('page', String(position.page));
    if (position.name) params.set('sourceName', position.name);
    if (position.exact) params.set('exact', '1');
    if (position.occurrence) params.set('occurrence', '1');
    if (position.row) params.set('row', '1');
  }
  if (options.paneHidden) params.set('pane', '0');
  if (options.line !== undefined) params.set('line', String(options.line));
  if (options.top !== undefined) params.set('top', String(options.top));
  return `#${encodeURIComponent(target.document)}${target.section ? `/${encodeURIComponent(target.section)}` : ''}${params.size ? `?${params}` : ''}`;
}

function parseSource(params: URLSearchParams): PaneState | undefined {
  const document = params.get('source');
  if (!document) return undefined;
  const page = Number(params.get('page'));
  return {
    document,
    position: {
      section: params.get('sourceSection') ?? '',
      page: Number.isInteger(page) && page > 0 ? page : null,
      ...(params.has('sourceName') ? { name: params.get('sourceName') } : {}),
      ...(params.get('exact') === '1' ? { exact: true } : {}),
      ...(params.get('occurrence') === '1' ? { occurrence: true } : {}),
      ...(params.get('row') === '1' ? { row: true } : {}),
    },
  };
}

export function parseRoute(hash: string): Route {
  const [path, query] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  try {
    const [document = '', section = ''] = path.split('/').map(decodeURIComponent);
    const lineNumber = (name: string) => {
      const value = Number(params.get(name));
      return params.has(name) && Number.isInteger(value) && value >= 0 ? { [name]: value } : {};
    };
    const source = parseSource(params);
    return {
      document, section, raw: params.get('raw') === '1', query: params.get('q') ?? '',
      ...(params.has('name') ? { name: params.get('name')! } : {}),
      ...lineNumber('line'),
      ...lineNumber('top'),
      ...(source ? { source } : {}),
      ...(params.get('pane') === '0' ? { paneHidden: true } : {}),
    };
  } catch {
    return { document: '', section: '', raw: false, query: '' };
  }
}
