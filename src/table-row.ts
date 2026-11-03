/** Names compared as the tables wrap and punctuate them: "3GPP-SGSN-" over "Address" is 3GPP-SGSN-Address. */
export const normalizeName = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/** What stands beside a name in an AVP table: its code or clause, its type, or the document defining it. */
export const rowEvidence = /^(?:\d+\b|NOTE\b|Clause\b|[A-Z]?\d*[a-z]*(?:\.\d+[A-Za-z]*)+(?![\w.])|\[\d+\]|(?:\w+\s+)?RFC\s*\d|(?:3GPP2?|IETF|RFC|TS|ETSI|NASREQ|draft-)|(?:OctetString|UTF8String|Unsigned|Integer|Float|Enumerated|Grouped|Time|Address|Diam|IPFilter|QoSFilter)|N\/A\b)/i;

/** How a table cell is read against a name, as it builds up over the lines the cell wraps on. */
export interface NameMatch {
  starts(column: string): boolean;
  whole(column: string): boolean;
}

export function exactName(name: string): NameMatch {
  const wanted = normalizeName(name);
  return { starts: column => wanted.startsWith(column), whole: column => column === wanted };
}

/** Reads a name off the start of a cell, on from `column`: what it reads so far, what the cell holds after it, and whether it goes on from a hyphen. */
export function takeName(text: string, match: NameMatch, column = '') {
  let rest = text;
  let taken = column;
  let open = false;
  for (let token = rest.match(/^[^\s|]+/); token; token = rest.match(/^[^\s|]+/)) {
    const letters = normalizeName(token[0]);
    // "MIP6-Agent-Info{" is an example's braces, "Key-Type," a sentence.
    if (!letters || /[^\p{L}\p{N}\p{Pd}_.\/]/u.test(token[0]) || !match.starts(taken + letters)) break;
    taken += letters;
    open = token[0].endsWith('-');
    rest = rest.slice(token[0].length).trimStart();
    if (match.whole(taken)) break;
  }
  return taken === column ? null : { column: taken, rest, open, text: text.slice(0, text.length - rest.length).trim() };
}
