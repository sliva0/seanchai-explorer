import type { Line } from './types.ts';
import type { ValueToken } from './values.ts';

interface Pattern {
  include?: string;
  name?: string;
  match?: string;
  patterns?: Pattern[];
  captures?: Record<string, Pattern>;
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

/** The scanner has no rule stack: a begin/end rule in the grammar would silently match nothing. */
function checkPattern(pattern: Pattern, where: string) {
  for (const key of Object.keys(pattern)) {
    if (!supportedKeys.has(key)) throw new Error(`Unsupported grammar key "${key}" at ${where}`);
  }
  pattern.patterns?.forEach((child, index) => checkPattern(child, `${where}.patterns[${index}]`));
  for (const [group, capture] of Object.entries(pattern.captures ?? {}))
    checkPattern(capture, `${where}.captures[${group}]`);
}

export function createHighlighter(grammar: Grammar) {
  (grammar.patterns ?? []).forEach((pattern, index) => checkPattern(pattern, `patterns[${index}]`));
  for (const [name, pattern] of Object.entries(grammar.repository ?? {})) checkPattern(pattern, `repository.${name}`);
  const cache = new Map<string, RegExp>();
  function rules(patterns: Pattern[]): Pattern[] {
    return patterns.flatMap(pattern =>
      pattern.include
        ? rules([grammar.repository[pattern.include.replace(/^#/, '')]])
        : pattern.match
          ? [pattern]
          : rules(pattern.patterns ?? []),
    );
  }
  function scan(text: string, patterns: Pattern[], begin: number, end: number, scopes: string[]) {
    const candidates = rules(patterns);
    const bounded = text.slice(0, end);
    let position = begin;
    while (position < end) {
      let chosen: { rule: Pattern; match: RegExpExecArray } | undefined;
      for (const rule of candidates) {
        let regex = cache.get(rule.match!);
        if (!regex) {
          regex = new RegExp(rule.match!, 'gd');
          cache.set(rule.match!, regex);
        }
        regex.lastIndex = position;
        const match = regex.exec(bounded);
        if (
          match &&
          match.index < end &&
          match.index + match[0].length <= end &&
          (!chosen || match.index < chosen.match.index)
        )
          chosen = { rule, match };
      }
      if (!chosen) return;
      const { rule, match } = chosen;
      const stop = match.index + match[0].length;
      if (rule.name) scopes.fill(rule.name, match.index, stop);
      for (const [group, capture] of Object.entries(rule.captures ?? {})) {
        const range = match.indices?.[Number(group)];
        if (!range) continue;
        if (capture.name) scopes.fill(capture.name, range[0], range[1]);
        if (capture.patterns) scan(text, capture.patterns, range[0], range[1], scopes);
      }
      position = Math.max(position + 1, stop);
    }
  }
  return (lines: Line[]): HighlightedLine[] => {
    let inTable = false;
    let row = 0;
    return lines.map(line => {
      const fullText = line.tokens.map(token => token.text).join('');
      const text = fullText.replace(/\n$/, '');
      const scopes = Array<string>(fullText.length).fill('');
      scan(text, grammar.patterns ?? [], 0, text.length, scopes);
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
