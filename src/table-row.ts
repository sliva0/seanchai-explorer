/** Names compared as the tables wrap and punctuate them: "3GPP-SGSN-" over "Address" is 3GPP-SGSN-Address. */
export const normalizeName = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/** What stands beside a name in an AVP table or a clause's list of result codes: its code or clause, its type, or the document defining it. */
export const rowEvidence = /^(?:\d+\b|\((?:[\w:]+\s+)*\d+\)|NOTE\b|Clause\b|[A-Z]?\d*[a-z]*(?:\.\d+[A-Za-z]*)+(?![\w.])|\[\d+\]|(?:\w+\s+)?RFC\s*\d|(?:3GPP2?|IETF|RFC|TS|ETSI|NASREQ|draft-)|(?:OctetString|UTF8String|Unsigned|Integer|Float|Enumerated|Grouped|Time|Address|Diam|IPFilter|QoSFilter)|N\/A\b)/i;

/** How a table cell is read against a name, as it builds up over the lines the cell wraps on. */
export interface NameMatch {
  starts(column: string): boolean;
  whole(column: string): boolean;
}

export function exactName(name: string): NameMatch {
  const wanted = normalizeName(name);
  return { starts: column => wanted.startsWith(column), whole: column => column === wanted };
}

/** Whether `column` reads as the start of `wanted` with at most one letter dropped from either. */
function startsDroppingLetter(column: string, wanted: string, drops = 1): boolean {
  for (let i = 0; i < column.length; i++) {
    if (column[i] === wanted[i]) continue;
    return drops > 0 && (startsDroppingLetter(column.slice(i + 1), wanted.slice(i), 0) || startsDroppingLetter(column.slice(i), wanted.slice(i + 1), 0));
  }
  return true;
}

/**
 * A cell that misprints the name: its last word cut short (Additional-Context-ID), or one letter
 * dropped (Acounting-Auth-Method). Never a changed letter or a missing word: 3GPP-GGSN-Address is
 * not 3GPP-SGSN-Address, and Subscription-Id is not Subscription-Id-Type.
 */
export function looseName(name: string): NameMatch {
  const wanted = normalizeName(name);
  const stem = wanted.length - normalizeName(name.split(/[^A-Za-z0-9]+/).filter(Boolean).at(-1) ?? '').length + 2;
  const dropped = (column: string) => wanted.length >= 8 && startsDroppingLetter(column, wanted);
  return {
    starts: column => wanted.startsWith(column) || dropped(column),
    whole: column => column === wanted || (column.length >= stem && wanted.startsWith(column)) || (Math.abs(column.length - wanted.length) === 1 && dropped(column)),
  };
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

/** A name as a whole word in running text, written with any of hyphens, underscores or spaces between its parts. */
export function namePattern(name: string, flags = 'iu') {
  const parts = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(part => part.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'));
  return new RegExp(`(?<![\\p{L}\\p{N}])${parts.join('[\\s_-]*')}(?![\\p{L}\\p{N}])`, flags);
}

/** A clause's title naming `name`: "EAP-Payload AVP", "Digest-Realm attribute", "Event-Report-Indication AVP (All access types)". */
export function titleNames(title: string, name: string) {
  return normalizeName(title.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+(?:AVP|attribute)\s*$/i, '')) === normalizeName(name);
}

/** How a row link found its place: the row in its own section's table, misprinted there, in another table, the clause named after it, a message or AVP format naming it, or any mention. */
export type RowFound = 'row' | 'printed' | 'loose' | 'other-table' | 'clause' | 'format' | 'mention';
