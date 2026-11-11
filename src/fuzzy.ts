/** Tolerant matching of a folded query against a name's words, with no knowledge of what the name is. */

export interface FoldedName {
  lower: string;
  /** The words, joined by one space. */
  spaced: string;
  /** The words with nothing between them. */
  compact: string;
  /** Where each word starts in `compact`. */
  starts: number[];
  initials: string;
  digits: string;
}

export interface FoldedQuery {
  lower: string;
  words: string[];
  spaced: string;
  compact: string;
  digits: string;
}

export type Span = [start: number, end: number];

const wordsOf = (text: string) => text.split(/[^a-z0-9]+/).filter(Boolean);
const digitsOf = (text: string) => text.replace(/\D/g, '');

export function foldName(name: string): FoldedName {
  const lower = name.toLowerCase();
  const words = wordsOf(lower);
  const starts: number[] = [];
  let compact = '';
  for (const word of words) {
    starts.push(compact.length);
    compact += word;
  }
  return {
    lower,
    spaced: words.join(' '),
    compact,
    starts,
    initials: words.map(word => word[0]).join(''),
    digits: digitsOf(compact),
  };
}

export function foldQuery(query: string): FoldedQuery {
  const lower = query.trim().toLowerCase();
  const words = wordsOf(lower);
  const compact = words.join('');
  return { lower, words, spaced: words.join(' '), compact, digits: digitsOf(compact) };
}

/** Under this nothing is approximate. */
const MIN_FUZZY = 3;
/** The rows below hold this; a query past it is no name. */
const MAX_FUZZY = 64;
/** From here a query may split across words and line up loosely; a shorter one only as a name's initials. */
const MIN_SPLIT = 5;
/** A query this long says enough that, with one typo, it need not end on a word's end. */
const MIN_OPEN_ENDED = 7;
/** A loose subsequence must cover this share of the name, or nearly any long name would hold it. */
const MIN_COVERAGE = 1 / 3;

export const allowedTypos = (length: number) => (length >= 9 ? 2 : length >= 5 ? 1 : 0);

export const allowsFuzzy = (query: FoldedQuery) =>
  query.compact.length >= MIN_FUZZY && query.compact.length <= MAX_FUZZY && /[a-z]/.test(query.compact);

const rows = [0, 1, 2].map(() => new Int32Array(MAX_FUZZY + 4));

/**
 * Optimal string alignment distance from `query` to the prefixes of `text` from
 * `from` on, `limit` at most: `row[j]` for the prefix of length `j`, or null when
 * all of them are over the limit. Damerau-Levenshtein but for an edit inside a
 * transposition, which a typo does not need.
 */
function distances(query: string, text: string, from: number, limit: number): Int32Array | null {
  const width = Math.min(text.length - from, query.length + limit);
  if (width < query.length - limit) return null;
  let [before, previous, row] = rows;
  for (let j = 0; j <= width; j++) previous[j] = j;
  for (let i = 1; i <= query.length; i++) {
    row[0] = i;
    let least = i;
    for (let j = 1; j <= width; j++) {
      const a = query.charCodeAt(i - 1);
      const b = text.charCodeAt(from + j - 1);
      let cost = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a === b ? 0 : 1));
      if (i > 1 && j > 1 && a === text.charCodeAt(from + j - 2) && query.charCodeAt(i - 2) === b)
        cost = Math.min(cost, before[j - 2] + 1);
      row[j] = cost;
      if (cost < least) least = cost;
    }
    if (least > limit) return null;
    const spare = before;
    before = previous;
    previous = row;
    row = spare;
  }
  return previous.subarray(0, width + 1);
}

/** Damerau-Levenshtein distance within `limit`, or null past it. */
export function typoDistance(query: string, text: string, limit: number): number | null {
  if (Math.abs(query.length - text.length) > limit) return null;
  const row = distances(query, text, 0, limit);
  return row && row[text.length] <= limit ? row[text.length] : null;
}

/** Whether a typo's digits are the name's: `Rel-15` is no misspelling of `Rel-16`. */
const digitsAgree = (query: FoldedQuery, name: FoldedName) => !query.digits || name.digits.includes(query.digits);

/** The query against the whole name, separators ignored. */
export function nameTypos(query: FoldedQuery, name: FoldedName): number | null {
  const limit = allowedTypos(query.compact.length);
  if (!limit || !digitsAgree(query, name)) return null;
  return typoDistance(query.compact, name.compact, limit);
}

/**
 * The query against words of the name, from a word's start to a word's end, so
 * `sesion` finds `Session-Id` and `state` does not find `Status`. A long query may
 * end inside a word with one typo, because it is often still being typed.
 */
export function wordTypos(query: FoldedQuery, name: FoldedName): Span | null {
  const limit = allowedTypos(query.compact.length);
  if (!limit || !digitsAgree(query, name)) return null;
  const openEnded = query.compact.length >= MIN_OPEN_ENDED;
  for (let index = 0; index < name.starts.length; index++) {
    const from = name.starts[index];
    const row = distances(query.compact, name.compact, from, limit);
    if (!row) continue;
    let best: Span | null = null;
    let least = limit + 1;
    for (let end = index + 1; end <= name.starts.length; end++) {
      const length = (end < name.starts.length ? name.starts[end] : name.compact.length) - from;
      // The words must be long enough for the typos too: `cc request` has not `Request` two typos off.
      if (length < row.length && row[length] < least && row[length] <= allowedTypos(length)) {
        least = row[length];
        best = [from, from + length];
      }
    }
    if (!best && openEnded) {
      const length = row.findIndex((distance, length) => length > 0 && distance <= 1);
      if (length > 0) best = [from, from + length];
    }
    if (best) return best;
  }
  return null;
}

/**
 * The query as prefixes of the name's words, in order, words skipped or not:
 * `destrealm` in `Destination-Realm`. A short query must be the initials of the
 * name's first words, or three letters would find half the corpus.
 */
export function wordPrefixes(query: FoldedQuery, name: FoldedName): Span[] | null {
  const wanted = query.compact;
  if (wanted.length < MIN_FUZZY) return null;
  if (wanted.length < MIN_SPLIT) {
    return name.starts.length >= wanted.length && name.initials.startsWith(wanted)
      ? name.starts.slice(0, wanted.length).map(start => [start, start + 1])
      : null;
  }
  const text = name.compact;
  const wordEnd = (index: number) => (index + 1 < name.starts.length ? name.starts[index + 1] : text.length);
  function place(position: number, word: number): Span[] | null {
    if (position === wanted.length) return [];
    for (let index = word; index < name.starts.length; index++) {
      const start = name.starts[index];
      const room = wordEnd(index) - start;
      let length = 0;
      while (length < room && position + length < wanted.length && text[start + length] === wanted[position + length])
        length++;
      for (; length > 0; length--) {
        const rest = place(position + length, index + 1);
        if (rest) return [[start, start + length], ...rest];
      }
    }
    return null;
  }
  return place(0, 0);
}

/** The query's letters in order from the name's start, with most of the name accounted for. */
export function looseSubsequence(query: FoldedQuery, name: FoldedName): number[] | null {
  const wanted = query.compact;
  const text = name.compact;
  if (wanted.length < MIN_SPLIT || wanted[0] !== text[0] || wanted.length / text.length < MIN_COVERAGE) return null;
  const positions: number[] = [];
  let position = 0;
  for (const letter of wanted) {
    position = text.indexOf(letter, position);
    if (position < 0) return null;
    positions.push(position++);
  }
  return positions;
}

/** A span of `name.compact` as spans of the name as written, its separators kept inside. */
export function spansInName(name: string, spans: Span[]): Span[] {
  const offsets: number[] = [];
  for (let index = 0; index < name.length; index++) {
    if (/[a-z0-9]/i.test(name[index])) offsets.push(index);
  }
  return spans
    .filter(([start, end]) => end > start && end <= offsets.length)
    .map(([start, end]) => [offsets[start], offsets[end - 1] + 1]);
}
