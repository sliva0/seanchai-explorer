import { failure as words, pageMessages } from './text/site.ts';

// What the site says where something fails, and what it logs. A failure the site can explain, a data file missing,
// broken, of another schema or another shape, or a document the data does not hold, is a `DataError` naming its
// `problem`; anything else is whatever was thrown. `describeFailure` turns either into the page's words, and
// `reportError` logs it once, as the error object itself, for its stack to be followed in the console.

/** What is wrong with a data file, or with a document asked for. */
export type DataProblem =
  /** The server has no such file: a 404, or a web page sent in its place (`page`), as `vite preview` sends index.html. */
  | { kind: 'missing'; file: string; status: string; page: boolean }
  /** The server failed on it otherwise. */
  | { kind: 'http'; file: string; status: string }
  /** It could not be fetched at all. */
  | { kind: 'unreachable'; file: string }
  | { kind: 'not-json'; file: string }
  /** Written by another export schema than the site reads: `found` as the file says it, which may be nothing. */
  | { kind: 'schema'; file: string; found: string; reads: number }
  /** Of the schema the site reads, but lacking a part every such file has. */
  | { kind: 'shape'; file: string; reads: number }
  /** A document the data does not list, by its id. */
  | { kind: 'no-document'; id: string };

/** A failure the site can name: what is wrong, and the error under it, as a fetch's or the parser's. */
export class DataError extends Error {
  readonly problem: DataProblem;
  constructor(problem: DataProblem, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DataError';
    this.problem = problem;
  }
}

/** What a page's failure says: its heading, what failed, what to do where there is something, and the detail. */
export interface Failure {
  heading: string;
  summary: string;
  hint?: string;
  /** The error's own message, "TypeError: Cannot read properties of undefined (reading 'title')". */
  message: string;
  /** Its stack, and its cause's, for the folded detail. */
  stack: string;
}

/** Where a failure happened, for its words: the document being drawn, or the site's own page, and the build's data. */
export interface FailureContext {
  /** A document's name, "TS 29.272 V19.6.0", when it failed as it was drawn. */
  document?: string;
  /** A page of the site's own, "Search", when it failed as it was drawn. */
  page?: string;
  /** The seanchai version the build's data names, for what a document's data may come from. */
  seanchai?: string;
}

const messageOf = (error: unknown) =>
  error instanceof Error ? `${error.name === 'Error' ? '' : `${error.name}: `}${error.message}` : String(error);

/** An error's stack and its causes', each under the last, or its message where it has none. */
function stackOf(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  for (let at: unknown = error; at !== undefined && !seen.has(at); at = (at as { cause?: unknown })?.cause) {
    seen.add(at);
    const stack = at instanceof Error ? at.stack : undefined;
    // A V8 stack starts with the message; another browser's does not.
    parts.push(
      stack
        ? stack.includes(at instanceof Error ? at.message : '')
          ? stack
          : `${messageOf(at)}\n${stack}`
        : messageOf(at),
    );
    if (!(at instanceof Error)) break;
  }
  return parts.join('\n\nCaused by: ');
}

/** What the page says of a failure, in its context. */
export function describeFailure(error: unknown, context: FailureContext = {}): Failure {
  const detail = { message: messageOf(error), stack: stackOf(error) };
  if (error instanceof DataError) {
    const { problem } = error;
    switch (problem.kind) {
      case 'no-document':
        return {
          heading: pageMessages.notFound,
          summary: words.noDocument(problem.id),
          hint: words.noDocumentHint,
          ...detail,
        };
      case 'missing':
        return {
          heading: words.missingHeading,
          summary: problem.page ? words.missingPage(problem.file) : words.missing(problem.file, problem.status),
          hint: words.missingHint,
          ...detail,
        };
      case 'http':
        return { heading: words.httpHeading, summary: words.http(problem.file, problem.status), ...detail };
      case 'unreachable':
        return {
          heading: words.httpHeading,
          summary: words.unreachable(problem.file),
          hint: words.unreachableHint,
          ...detail,
        };
      case 'not-json':
        return {
          heading: words.notJsonHeading,
          summary: words.notJson(problem.file),
          hint: words.missingHint,
          ...detail,
        };
      case 'schema':
        return {
          heading: words.schemaHeading,
          summary: words.schema(problem.file, problem.found, problem.reads),
          hint: words.schemaHint,
          ...detail,
        };
      case 'shape':
        return {
          heading: words.shapeHeading,
          summary: words.shape(problem.file, problem.reads),
          ...(context.seanchai ? { hint: words.newerHint(context.seanchai) } : {}),
          ...detail,
        };
    }
  }
  if (context.document)
    return {
      heading: words.renderHeading(context.document),
      summary: words.render(context.document),
      ...(context.seanchai ? { hint: words.newerHint(context.seanchai) } : {}),
      ...detail,
    };
  if (context.page) return { heading: pageMessages.failed, summary: words.pageRender(context.page), ...detail };
  return { heading: pageMessages.failed, summary: words.other, ...detail };
}

const reported = new WeakSet<object>();

/**
 * Logs an error with `console.error`, the error object itself, so that its stack can be followed: once, however many
 * of the places it passes through report it.
 */
export function reportError(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    if (reported.has(error)) return;
    reported.add(error);
  }
  console.error(error);
}
