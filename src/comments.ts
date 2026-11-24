/** A `;;` note less its citations, which its toggle opens: `;; interpreted: (TS29.272.py#imei-digits)` is `;; interpreted`. */
export function compactComment(text: string): string {
  return text
    .replace(/:\s*\([\w.-]+\.py#[\w-]+\)\s*$/, '')
    .replace(/\s*\([\w.-]+\.py#[\w-]+\)/g, '')
    .replace(/\s*\(occurr?ence\s+\d+\)/gi, '')
    .trimEnd();
}

/**
 * What `compactComment` leaves out, in order, each with where it starts in `text`: the citations and any occurrence,
 * `(occurrence 2)` and `(TS29.229.py#x)`.
 */
export function citationSpans(text: string): { text: string; index: number }[] {
  return [...text.matchAll(/\((?:[\w.-]+\.py#[\w-]+|occurr?ence\s+\d+)\)/gi)].map(match => ({
    text: match[0],
    index: match.index,
  }));
}

/** The citations of `citationSpans`, as the note's record prints them: `(occurrence 2) (TS29.229.py#x)`. */
export function commentCitations(text: string): string {
  return citationSpans(text)
    .map(citation => citation.text)
    .join(' ');
}
