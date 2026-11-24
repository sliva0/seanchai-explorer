import type { Line } from './types.ts';
import type { ValueToken } from './values.ts';
import { pageMessages } from './text/site.ts';

interface Pattern {
  include?: string;
  name?: string;
  contentName?: string;
  match?: string;
  begin?: string;
  end?: string;
  patterns?: Pattern[];
  captures?: Record<string, Pattern>;
  beginCaptures?: Record<string, Pattern>;
  endCaptures?: Record<string, Pattern>;
}
export interface Grammar extends Pattern {
  repository: Record<string, Pattern>;
}

export interface HighlightedToken extends ValueToken {
  scope: string;
}
export interface HighlightedLine extends Line {
  decoration: string;
  tokens: HighlightedToken[];
}

const supportedKeys = new Set(['include', 'name', 'match', 'patterns', 'captures', 'comment']);
/** A begin/end rule's keys: a region over lines, which the scanner holds on a stack from line to line. */
const regionKeys = new Set([
  'begin',
  'end',
  'name',
  'contentName',
  'patterns',
  'captures',
  'beginCaptures',
  'endCaptures',
  'comment',
]);
/** What a capture may hold: its scope, and patterns within it. */
const captureKeys = new Set(['name', 'patterns', 'comment']);

/** A key the scanner cannot run, as `while`, or a region's `applyEndPatternLast`, would silently match nothing: refused. */
function checkPattern(pattern: Pattern, where: string, keys = 'begin' in pattern ? regionKeys : supportedKeys) {
  for (const key of Object.keys(pattern)) {
    if (!keys.has(key)) throw new Error(pageMessages.grammarKey(key, where));
  }
  if ('begin' in pattern !== 'end' in pattern) throw new Error(pageMessages.grammarRegion(where));
  pattern.patterns?.forEach((child, index) => checkPattern(child, `${where}.patterns[${index}]`));
  for (const field of ['captures', 'beginCaptures', 'endCaptures'] as const)
    for (const [group, capture] of Object.entries(pattern[field] ?? {}))
      checkPattern(capture, `${where}.${field}[${group}]`, captureKeys);
}

/** A rule tried at a place: a match, a region's begin, or the end of the region the scanner is in. */
interface Candidate {
  rule: Pattern;
  regex: string;
  role: 'match' | 'begin' | 'end';
}

export function createHighlighter(grammar: Grammar) {
  (grammar.patterns ?? []).forEach((pattern, index) => checkPattern(pattern, `patterns[${index}]`));
  for (const [name, pattern] of Object.entries(grammar.repository ?? {})) checkPattern(pattern, `repository.${name}`);
  const cache = new Map<string, RegExp>();
  function rules(patterns: Pattern[]): Pattern[] {
    return patterns.flatMap(pattern =>
      pattern.include
        ? rules([grammar.repository[pattern.include.replace(/^#/, '')]])
        : pattern.match || pattern.begin
          ? [pattern]
          : rules(pattern.patterns ?? []),
    );
  }
  const candidatesOf = (patterns: Pattern[]): Candidate[] =>
    rules(patterns).map(rule =>
      rule.begin ? { rule, regex: rule.begin, role: 'begin' } : { rule, regex: rule.match!, role: 'match' },
    );
  /** The scope a region gives the text inside it, the innermost region's that names one. */
  const regionScope = (stack: Pattern[]) => {
    const inner = stack.findLast(rule => rule.contentName || rule.name);
    return inner?.contentName ?? inner?.name ?? '';
  };
  const ids = new Map<Pattern, number>();
  const idOf = (rule: Pattern) => ids.get(rule) ?? ids.set(rule, ids.size).get(rule)!;
  function fillCaptures(
    text: string,
    captures: Record<string, Pattern> | undefined,
    match: RegExpExecArray,
    scopes: string[],
  ) {
    for (const [group, capture] of Object.entries(captures ?? {})) {
      const range = match.indices?.[Number(group)];
      if (!range) continue;
      if (capture.name) scopes.fill(capture.name, range[0], range[1]);
      if (capture.patterns) scan(text, capture.patterns, range[0], range[1], scopes);
    }
  }
  /**
   * Scopes `begin` to `end` of a line. With `stack`, the regions open at the line's start, it is a whole line: the
   * innermost region's patterns and its end are tried, and a begin opens a region that may last past the line.
   */
  function scan(text: string, patterns: Pattern[], begin: number, end: number, scopes: string[], stack?: Pattern[]) {
    const bounded = text.slice(0, end);
    let position = begin;
    // A region begun or ended without a character is not begun or ended again there, which would loop.
    const empty = new Set<string>();
    while (position < end) {
      const region = stack?.at(-1);
      const candidates: Candidate[] = region
        ? [{ rule: region, regex: region.end!, role: 'end' }, ...candidatesOf(region.patterns ?? [])]
        : candidatesOf(stack ? (grammar.patterns ?? []) : patterns);
      let chosen: { candidate: Candidate; match: RegExpExecArray } | undefined;
      for (const candidate of candidates) {
        if (candidate.role === 'begin' && !stack) continue;
        let regex = cache.get(candidate.regex);
        if (!regex) {
          regex = new RegExp(candidate.regex, 'gd');
          cache.set(candidate.regex, regex);
        }
        regex.lastIndex = position;
        const match = regex.exec(bounded);
        if (
          match &&
          match.index < end &&
          match.index + match[0].length <= end &&
          !(match[0] === '' && candidate.role !== 'match' && empty.has(`${idOf(candidate.rule)} ${match.index}`)) &&
          (!chosen || match.index < chosen.match.index)
        )
          chosen = { candidate, match };
      }
      if (!chosen) return;
      const { candidate, match } = chosen;
      const { rule, role } = candidate;
      const stop = match.index + match[0].length;
      if (role === 'match') {
        if (rule.name) scopes.fill(rule.name, match.index, stop);
        fillCaptures(text, rule.captures, match, scopes);
        position = Math.max(position + 1, stop);
        continue;
      }
      // A region's begin and end are its own name's, and what lies between its content's, to the line's end or its end.
      if (rule.name) scopes.fill(rule.name, match.index, stop);
      fillCaptures(text, (role === 'begin' ? rule.beginCaptures : rule.endCaptures) ?? rule.captures, match, scopes);
      if (role === 'begin') stack!.push(rule);
      else stack!.pop();
      scopes.fill(regionScope(stack!), stop, end);
      if (match[0] === '') empty.add(`${idOf(rule)} ${stop}`);
      position = stop;
    }
  }
  return (lines: Line[]): HighlightedLine[] => {
    let inTable = false;
    let row = 0;
    // The regions open from line to line, as an Information Elements block is.
    const stack: Pattern[] = [];
    return lines.map(line => {
      const fullText = line.tokens.map(token => token.text).join('');
      const text = fullText.replace(/\n$/, '');
      const scopes = Array<string>(fullText.length).fill(regionScope(stack));
      scan(text, grammar.patterns ?? [], 0, text.length, scopes, stack);
      scopes.fill(regionScope(stack), text.length);
      const decoration = [];
      if (text.startsWith('; Columns:')) {
        inTable = true;
        row = 0;
      } else if (inTable) {
        if (!text.trim()) inTable = false;
        else if (!text.startsWith(';;')) {
          decoration.push('table-row');
          if (++row % 2 === 0) decoration.push('striped');
        }
      }
      const rule = text.replace(/;;.*$/, '');
      if (/; bold(\s*; strikethrough)?\s*$/.test(rule)) decoration.push('bold-rule');
      if (/; strikethrough\s*$/.test(rule)) decoration.push('struck-rule');
      let offset = 0;
      const tokens: HighlightedToken[] = [];
      for (const token of line.tokens) {
        if (token.correction || token.kind) tokens.push({ ...token, scope: token.kind ?? '' });
        else {
          let start = 0;
          while (start < token.text.length) {
            const scope = scopes[offset + start];
            let end = start + 1;
            while (end < token.text.length && scopes[offset + end] === scope) end++;
            tokens.push({ ...token, text: token.text.slice(start, end), scope });
            start = end;
          }
        }
        offset += token.text.length;
      }
      return { ...line, decoration: decoration.join(' '), tokens };
    });
  };
}
