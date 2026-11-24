/**
 * A citation's declaration, as the grammar scopes it: a correction's in the corrections module, `TS29.272.py#area-scope-code`,
 * or an interpretation's in a `.dadx` file of interpreted-constraint blocks, `TS29.272.dadx#imei-digits`.
 */
const declaration = String.raw`[\w.+-]+\.(?:py|dadx)#[\w.-]+`;
const endCitation = new RegExp(String.raw`:\s*\(${declaration}\)\s*$`);
const anyCitation = new RegExp(String.raw`\s*\(${declaration}\)`, 'g');
const citation = new RegExp(String.raw`\((?:${declaration}|occurr?ence\s+\d+)\)`, 'gi');

/** A `;;` note less its citations, which its toggle opens: `;; interpreted: (TS29.272.dadx#imei-digits)` is `;; interpreted`. */
export function compactComment(text: string): string {
  return text
    .replace(endCitation, '')
    .replace(anyCitation, '')
    .replace(/\s*\(occurr?ence\s+\d+\)/gi, '')
    .trimEnd();
}

/**
 * What `compactComment` leaves out, in order, each with where it starts in `text`: the citations and any occurrence,
 * `(occurrence 2)` and `(TS29.229.py#x)`.
 */
export function citationSpans(text: string): { text: string; index: number }[] {
  return [...text.matchAll(citation)].map(match => ({
    text: match[0],
    index: match.index,
  }));
}

/** The citations of `citationSpans`, as the note's record prints them: `(occurrence 2) (TS29.229.py#x)`. */
export function commentCitations(text: string): string {
  return citationSpans(text)
    .map(found => found.text)
    .join(' ');
}
