/** A `;;` note less its citations, which its toggle opens: `;; interpreted: (TS29.272.py#imei-digits)` is `;; interpreted`. */
export function compactComment(text: string): string {
  return text
    .replace(/:\s*\([\w.-]+\.py#[\w-]+\)\s*$/, '')
    .replace(/\s*\([\w.-]+\.py#[\w-]+\)/g, '')
    .replace(/\s*\(occurr?ence\s+\d+\)/gi, '')
    .trimEnd();
}
