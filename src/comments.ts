/** A `;;` note less its citations, which its toggle opens: `;; interpreted: (TS29.272.py#imei-digits)` is `;; interpreted`. */
export function compactComment(text: string): string {
  return text
    .replace(/:\s*\([\w.-]+\.py#[\w-]+\)\s*$/, '')
    .replace(/\s*\([\w.-]+\.py#[\w-]+\)/g, '')
    .replace(/\s*\(occurr?ence\s+\d+\)/gi, '')
    .trimEnd();
}

/** What `compactComment` leaves out, in order: the citations and any occurrence, `(occurrence 2) (TS29.229.py#x)`. */
export function commentCitations(text: string): string {
  return (text.match(/\((?:[\w.-]+\.py#[\w-]+|occurr?ence\s+\d+)\)/gi) ?? []).join(' ');
}
