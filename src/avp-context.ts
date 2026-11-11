import type { Line } from './types.ts';
import { blankLine, lineText } from './values.ts';

/** How a rule's member is bracketed: `< X >` fixed, `{ X }` required, `[ X ]` optional (RFC 6733 3.2). */
export type Presence = 'fixed' | 'required' | 'optional';

/** A member of a command's or a Grouped AVP's rule, as its line prints it. `max` null is no upper bound. */
export interface Member {
  name: string;
  presence: Presence;
  /** The qualifier as printed, `1*`, `*2`, or empty. */
  qualifier: string;
  min: number;
  max: number | null;
  bold: boolean;
  /** The line is commented out with its `; strikethrough` kept, as the document strikes it. */
  struck: boolean;
  line: number;
}

/** A `Message`, `Grouped AVP` or `Reprinted AVP` block's rule. `label` is a command's name and abbreviation. */
export interface Rule {
  kind: string;
  name: string;
  label: string;
  /** Its abbreviation where the block names one, else its name. */
  short: string;
  section: string | null;
  /** Its `::=` line. */
  line: number;
  members: Member[];
}

/** A row of an AVP table, a `Reused AVPs` block or an AVP Codes registry, its cells under its own columns. */
export interface AvpRow {
  type: string;
  name: string;
  section: string | null;
  table: string | null;
  cells: [column: string, value: string][];
  line: number;
}

/** What one line says of a name on it: a member of a rule, the rule's own head, or a table's row. */
export type Use =
  | { kind: 'member'; rule: Rule; member: Member }
  | { kind: 'head'; rule: Rule }
  | { kind: 'row'; row: AvpRow };

interface Block { type: string; fields: Map<string, string>; body: boolean; rule?: Rule; rows: AvpRow[] }
interface Parsed { blocks: (Block | undefined)[]; rules: Map<string, Rule[]>; rows: Map<string, AvpRow[]> }

const directive = /^; ([\w-]+): (.*?)\s*(?:;;.*)?$/;
const ruleHead = /^\s*<?\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*>?\s*::=/;
const memberLine = /^\s*(?:(\d*)\s*\*\s*(\d*))?\s*([<{[])\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*[>}\]]/;
const cells = /(?:"(?:[^"\\]|\\.)*"|[^\s"])+/g;
const ruleTypes = new Set(['Message', 'Grouped AVP', 'Reprinted AVP']);
const presenceOf: Record<string, Presence> = { '<': 'fixed', '{': 'required', '[': 'optional' };

/** A line's text with its `;;` comments, which hold a struck member, but without what a correction replaced. */
const fullText = (line: Line) => line.tokens.filter(token => !token.correction).map(token => token.text).join('').replace(/\n$/, '');

/**
 * RFC 6733 3.2: no qualifier is exactly one of a fixed or required member and at most one of an optional one; a
 * qualifier's missing min is 0, or 1 on a required member, which is there at least once, and its missing max unbounded.
 */
export function bounds(presence: Presence, minText: string | undefined, maxText: string | undefined, qualified: boolean) {
  let min = qualified ? (minText ? Number(minText) : 0) : presence === 'optional' ? 0 : 1;
  const max = qualified ? (maxText ? Number(maxText) : null) : 1;
  if (presence === 'required') min = Math.max(1, min);
  return { min, max };
}

function member(line: Line, index: number): Member | undefined {
  let text = fullText(line);
  const struck = /^\s*;;/.test(text);
  if (struck) {
    if (!/; strikethrough\b/.test(text)) return undefined;
    text = text.replace(/^\s*;;/, '');
  } else text = text.replace(/;;.*$/, '');
  const match = text.match(memberLine);
  if (!match) return undefined;
  const [, minText, maxText, open, name] = match;
  const qualified = /^\s*\d*\s*\*/.test(text);
  const presence = presenceOf[open];
  return {
    name, presence, qualifier: qualified ? `${minText ?? ''}*${maxText ?? ''}` : '',
    ...bounds(presence, minText, maxText, qualified),
    bold: /; bold\b/.test(text), struck, line: index,
  };
}

function parse(lines: Line[]): Parsed {
  const parsed: Parsed = { blocks: [], rules: new Map(), rows: new Map() };
  const add = <T>(map: Map<string, T[]>, name: string, item: T) => {
    const list = map.get(name);
    if (list) list.push(item);
    else map.set(name, [item]);
  };
  let block: Block | undefined;
  lines.forEach((line, index) => {
    const text = lineText(line);
    const field = text.match(directive);
    if (field?.[1] === 'Type') {
      block = { type: field[2], fields: new Map(), body: false, rows: [] };
      parsed.blocks[index] = block;
      return;
    }
    if (!block) return;
    if (!text.trim()) {
      if (block.body && blankLine(line)) { block = undefined; return; }
      parsed.blocks[index] = block;
      if (block.rule) {
        const found = member(line, index);
        if (found) block.rule.members.push(found);
      }
      return;
    }
    parsed.blocks[index] = block;
    if (field && !block.body) { block.fields.set(field[1], field[2]); return; }
    if (text.trimStart().startsWith(';')) return;
    const first = !block.body;
    block.body = true;
    const { type, fields } = block;
    if (ruleTypes.has(type)) {
      if (first) {
        const head = text.match(ruleHead);
        if (!head) return;
        const [name, abbreviation] = (fields.get('Name') ?? head[1]).split(/,\s*/);
        const rule: Rule = {
          kind: type, name: head[1], label: abbreviation ? `${name} (${abbreviation})` : name, short: abbreviation ?? head[1],
          section: fields.get('Section') ?? line.section ?? null, line: index, members: [],
        };
        block.rule = rule;
        add(parsed.rules, rule.name, rule);
      } else if (block.rule) {
        const found = member(line, index);
        if (found) block.rule.members.push(found);
      }
      return;
    }
    const tabulates = type === 'AVP Table' || type === 'Reused AVPs' || (type === 'Registry' && fields.get('Registry') === 'AVP Codes');
    const columns = fields.get('Columns')?.split(/\s+/);
    if (!tabulates || !columns) return;
    const row = text.match(cells) ?? [];
    const end = row.findIndex(value => value.startsWith(';'));
    if ((end < 0 ? row.length : end) !== columns.length) return;
    const name = row[columns.indexOf('Name')]?.replace(/^"(.*)"$/, '$1');
    if (!name) return;
    const found: AvpRow = {
      type, name, section: fields.get('Section') ?? line.section ?? null, table: fields.get('Table') ?? null,
      cells: columns.map((column, at) => [column, row[at]]), line: index,
    };
    block.rows.push(found);
    add(parsed.rows, name, found);
  });
  return parsed;
}

const known = new WeakMap<Line[], Parsed>();
function parsedOf(lines: Line[]): Parsed {
  let parsed = known.get(lines);
  if (!parsed) { parsed = parse(lines); known.set(lines, parsed); }
  return parsed;
}

/** The rule a line is in, if it is in one. */
export const ruleAt = (lines: Line[], index: number): Rule | undefined => parsedOf(lines).blocks[index]?.rule;

/** What the line at `index` says of `name`. */
export function useAt(lines: Line[], index: number, name: string): Use | undefined {
  const block = parsedOf(lines).blocks[index];
  if (!block) return undefined;
  const { rule } = block;
  if (rule) {
    if (rule.line === index) return rule.name === name ? { kind: 'head', rule } : undefined;
    const found = rule.members.find(item => item.line === index && item.name === name);
    return found && { kind: 'member', rule, member: found };
  }
  const row = block.rows.find(item => item.line === index && item.name === name);
  return row && { kind: 'row', row };
}

/** The Grouped AVP and reprinted rules a file gives a name. */
export const groupedRules = (lines: Line[], name: string): Rule[] =>
  (parsedOf(lines).rules.get(name) ?? []).filter(rule => rule.kind !== 'Message');

/** The table rows a file gives a name, in file order. */
export const avpRows = (lines: Line[], name: string): AvpRow[] => parsedOf(lines).rows.get(name) ?? [];

const presenceWords: Record<Presence, { label: string; brackets: string; meaning: string }> = {
  fixed: { label: 'Fixed', brackets: '< >', meaning: 'must be present, at this position in the order' },
  required: { label: 'Required', brackets: '{ }', meaning: 'must be present, in any position' },
  optional: { label: 'Optional', brackets: '[ ]', meaning: 'may be present, in any position' },
};

export function countText({ min, max }: Pick<Member, 'min' | 'max'>): string {
  if (max === null) return min === 0 ? 'any number of times' : min === 1 ? 'once or more' : `${min} or more times`;
  if (min === max) return min === 1 ? 'exactly once' : `exactly ${min} times`;
  if (min === 0) return max === 1 ? 'at most once' : `at most ${max} times`;
  return `${min} to ${max} times`;
}

/** A member as the rule prints it, `* [ Subscription-Id ]`. */
export function printed({ name, presence, qualifier }: Member): string {
  const [open, close] = presenceWords[presence].brackets.split(' ');
  return `${qualifier ? `${qualifier} ` : ''}${open} ${name} ${close}`;
}

/** "Optional [ ] · may be present, in any position · any number of times". */
export function presenceText(item: Member): string {
  const { label, brackets, meaning } = presenceWords[item.presence];
  // `0*1 < ICV >`: a fixed member a qualifier lets be absent keeps only its position.
  if (item.presence === 'fixed' && item.min === 0) return [`${label} ${brackets}`, 'may be present, at this position in the order', countText(item)].join(' · ');
  return [`${label} ${brackets}`, meaning, countText(item)].join(' · ');
}

/** "Required, exactly once": a member's line in a rule's contents. */
export const presenceShort = (item: Member) => `${presenceWords[item.presence].label.toLowerCase()}, ${countText(item)}`;

export type FlagRule = 'must' | 'may' | 'should not' | 'must not';
const flagColumns: [string, FlagRule][] = [['Must', 'must'], ['May', 'may'], ['S.not', 'should not'], ['M.not', 'must not']];
/** What each bit means, said once for every AVP; P is left out, RFC 6733 deprecates it. */
export const bitMeaning: Record<string, string> = {
  M: 'Mandatory: set, a receiver that does not support the AVP must reject the message; clear, it may skip the AVP.',
  V: 'Vendor-Specific: set, the header carries a Vendor-ID and the code is that vendor\'s; clear, the code is IETF\'s.',
};
/** Columns the popup does not show: the identity line says them, the flags table says them, or nothing uses them. */
const hiddenColumns = new Set(['Name', 'Code', 'Section', 'Type', 'Vendor-ID', 'Encrypt', ...flagColumns.map(([column]) => column)]);
/** A Reused AVPs table's M-bit cell, `MUST` or `Must not`, as a flag rule. */
const mBit = (row: AvpRow): FlagRule | undefined => {
  const value = row.cells.find(([name]) => name === 'M-bit')?.[1].replace(/^"(.*)"$/, '$1').trim().toLowerCase().replace(/\s+/g, ' ');
  return value === 'must' || value === 'must not' ? value : undefined;
};

/** The rules a row's columns give its M and V bits, as the table prints them less its empty columns: `[['must', ['V']], ['must not', ['M']]]`. */
export function flagTable(row: AvpRow): [FlagRule, string[]][] {
  const rules = flagRules(row);
  return flagColumns.map(([, rule]): [FlagRule, string[]] => [rule, rules.filter(item => item.rule === rule).map(item => item.bit)]).filter(([, bits]) => bits.length);
}

/** The rule a row's flag columns give one bit, the P bit the table shows nowhere else among them. */
export function bitRule(row: AvpRow, bit: string): FlagRule | undefined {
  return flagColumns.find(([column]) => row.cells.find(([name]) => name === column)?.[1].split(',').includes(bit))?.[1];
}

/** A row's Encrypt cell as words, `Y`, `No` or `-`, if its table has the column. */
export function encryptOf(row: AvpRow): string | undefined {
  const value = row.cells.find(([column]) => column === 'Encrypt')?.[1];
  return value === undefined ? undefined : cellText(value);
}

/** A row's M and V bits in that order, each with the rule its columns give it and what the bit means. */
export function flagRules(row: AvpRow): { bit: string; rule: FlagRule; meaning: string }[] {
  const found = new Map<string, FlagRule>();
  for (const [column, rule] of flagColumns) {
    const value = row.cells.find(([name]) => name === column)?.[1];
    for (const bit of value?.split(',') ?? []) if (bit in bitMeaning && !found.has(bit)) found.set(bit, rule);
  }
  const fromColumn = mBit(row);
  if (fromColumn && !found.has('M')) found.set('M', fromColumn);
  return Object.keys(bitMeaning).filter(bit => found.has(bit)).map(bit => ({ bit, rule: found.get(bit)!, meaning: bitMeaning[bit] }));
}

/** What a row's other columns mean. Encrypt is not shown: RFC 6733 dropped the end-to-end security it is for. */
export const columnNotes: Record<string, string> = {
  From: 'The specification that defines the AVP, which this one re-uses.',
  'Defined-In': 'The specification that defines the AVP.',
  'Acc-Type': 'The access types the AVP applies to, as the table\'s notes say.',
  Applicability: 'The features or cases the AVP applies to, as the table\'s notes say.',
  'Reference-Points': 'The reference points the AVP is used on.',
};

/** A cell as words: its quotes gone, a dash kept, a blank said. */
const cellText = (value: string) => value === '""' ? '(blank)' : value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(part => part.replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1')).join(', ');

/** The row's cells besides its identity, its flags and Encrypt: From, an M-bit not read as a flag, its marks, as `[column, text]`. */
export const otherCells = (row: AvpRow): [string, string][] =>
  row.cells.filter(([column]) => !hiddenColumns.has(column) && !(column === 'M-bit' && mBit(row))).map(([column, value]) => [column, cellText(value)]);

/** Whether a row says anything the popup shows beyond the identity line. */
export const rowSaysMore = (row: AvpRow) => flagRules(row).length > 0 || otherCells(row).length > 0;
