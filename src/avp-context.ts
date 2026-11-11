import { avpRows, blockAt, byName, cell, perFile } from './blocks.ts';
import type { AvpRow, DadFile } from './blocks.ts';
import type { Member, Presence } from './types.ts';

export { avpRows } from './blocks.ts';
export type { AvpRow } from './blocks.ts';
export type { Member, Presence } from './types.ts';

/** A `Message`, `Answer Message`, `Grouped AVP` or `Reprinted AVP` block's rule. `label` is a command's name and abbreviation. */
export interface Rule {
  kind: string;
  name: string;
  label: string;
  /** Its abbreviation where the block names one, else its name. */
  short: string;
  section: string;
  /** Its `::=` line. */
  line: number;
  members: Member[];
}

/** What one line says of a name on it: a member of a rule, the rule's own head, or a table's row. */
export type Use =
  | { kind: 'member'; rule: Rule; member: Member }
  | { kind: 'head'; rule: Rule }
  | { kind: 'row'; row: AvpRow };

const rulesOf = perFile(({ blocks }) => new Map(blocks.flatMap(block => {
  if (!block.rule) return [];
  const { name, line, members } = block.rule;
  const named = block.name ?? name;
  const rule: Rule = {
    kind: block.type, name, label: block.abbreviation ? `${named} (${block.abbreviation})` : named, short: block.abbreviation ?? name,
    section: block.section, line, members,
  };
  return [[block, rule]];
})));
const rulesByName = perFile(file => byName([...rulesOf(file).values()].map(rule => [rule.name, rule])));

/** The rule a line is in, if it is in one. */
export const ruleAt = (file: DadFile, index: number): Rule | undefined => {
  const block = blockAt(file, index);
  return block && rulesOf(file).get(block);
};

/** What the line at `index` says of `name`. */
export function useAt(file: DadFile, index: number, name: string): Use | undefined {
  const block = blockAt(file, index);
  if (!block) return undefined;
  const rule = rulesOf(file).get(block);
  if (rule) {
    if (rule.line === index) return rule.name === name ? { kind: 'head', rule } : undefined;
    const found = rule.members.find(item => item.line === index && item.name === name);
    return found && { kind: 'member', rule, member: found };
  }
  const row = avpRows(file, name).find(item => item.line === index);
  return row && { kind: 'row', row };
}

/** The Grouped AVP and reprinted rules a file gives a name. */
export const groupedRules = (file: DadFile, name: string): Rule[] =>
  (rulesByName(file).get(name) ?? []).filter(rule => rule.kind === 'Grouped AVP' || rule.kind === 'Reprinted AVP');

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
  const value = cell(row, 'M-bit')?.replace(/^"(.*)"$/, '$1').trim().toLowerCase().replace(/\s+/g, ' ');
  return value === 'must' || value === 'must not' ? value : undefined;
};

/** The rules a row's columns give its M and V bits, as the table prints them less its empty columns: `[['must', ['V']], ['must not', ['M']]]`. */
export function flagTable(row: AvpRow): [FlagRule, string[]][] {
  const rules = flagRules(row);
  return flagColumns.map(([, rule]): [FlagRule, string[]] => [rule, rules.filter(item => item.rule === rule).map(item => item.bit)]).filter(([, bits]) => bits.length);
}

/** The rule a row's flag columns give one bit, the P bit the table shows nowhere else among them. */
export function bitRule(row: AvpRow, bit: string): FlagRule | undefined {
  return flagColumns.find(([column]) => cell(row, column)?.split(',').includes(bit))?.[1];
}

/** A row's Encrypt cell as words, `Y`, `No` or `-`, if its table has the column. */
export function encryptOf(row: AvpRow): string | undefined {
  const value = cell(row, 'Encrypt');
  return value === undefined ? undefined : cellText(value);
}

/** A row's M and V bits in that order, each with the rule its columns give it and what the bit means. */
export function flagRules(row: AvpRow): { bit: string; rule: FlagRule; meaning: string }[] {
  const found = new Map<string, FlagRule>();
  for (const [column, rule] of flagColumns) {
    for (const bit of cell(row, column)?.split(',') ?? []) if (bit in bitMeaning && !found.has(bit)) found.set(bit, rule);
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
