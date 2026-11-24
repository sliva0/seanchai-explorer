import { allAvpRows, blockAt, perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import type { Block, Codec, ConstraintCondition, ConstraintRule } from './types.ts';

/*
 * Interpreted Constraints: what a clause's prose says of an AVP's value or presence, as a reader declared it, pinned to
 * the sentences read. Only a corrected file holds them; the raw file is what the extractor read. Nothing here is what
 * a document prints as structure, and the site says so wherever it shows one.
 */

export const isInterpreted = (block: Pick<Block, 'type' | 'interpreted'>) =>
  block.interpreted === true || block.type === 'Interpreted Constraints';

/**
 * Where a block's rules hold: wherever the document reads the AVP, as a member of the grouped AVP `within`, or in
 * command `command`, of application `application` where the block names one.
 */
export interface ConstraintScope {
  within?: string;
  command?: string;
  application?: number;
}

/** An Interpreted Constraints block of a file, the AVP its `; AVP:` names and where its rules hold. */
export interface ConstraintBlock {
  block: Block;
  avp: string;
  scope: ConstraintScope;
}

/** Where a name is read: as a member of a grouped AVP, or in a command, of an application where it says. */
export interface ReadContext {
  within?: string;
  command?: { name: string; application?: number | null };
}

/** A command or grouped AVP spelt in another case is the same: one TS 29.338 table does so. */
const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

function scopeOf(block: Block): ConstraintScope {
  const { Within: within, Command: command } = block.fields;
  const application = Number(block.fields['Application-ID']);
  return {
    ...(within ? { within } : {}),
    ...(command ? { command } : {}),
    ...(command && block.fields['Application-ID'] && Number.isInteger(application) ? { application } : {}),
  };
}

/** A file's Interpreted Constraints blocks, in file order. */
export const constraintBlocks = perFile(({ blocks }) =>
  blocks.filter(isInterpreted).flatMap((block): ConstraintBlock[] => {
    const avp = block.name ?? block.fields.AVP;
    return avp ? [{ block, avp, scope: scopeOf(block) }] : [];
  }),
);

/** Whether a block's rules hold where a name is read: one with no scope wherever, one with a scope only there. */
export function holdsIn({ scope }: Pick<ConstraintBlock, 'scope'>, context: ReadContext): boolean {
  if (scope.within) return same(scope.within, context.within);
  if (scope.command) {
    const { command } = context;
    if (!command || !same(scope.command, command.name)) return false;
    return scope.application === undefined || command.application == null || scope.application === command.application;
  }
  return true;
}

/** Whether a block holds wherever the document reads its AVP. */
export const unscoped = ({ scope }: Pick<ConstraintBlock, 'scope'>) => !scope.within && !scope.command;

/** The blocks of a file on an AVP that hold where it is read: those for the place first, then those for everywhere. */
export function constraintsFor(file: DadFile, avp: string, context: ReadContext): ConstraintBlock[] {
  const found = constraintBlocks(file).filter(item => item.avp === avp && holdsIn(item, context));
  return [...found.filter(item => !unscoped(item)), ...found.filter(unscoped)];
}

/** The application a command's Message block in a file is of, if the file has one naming it. */
const applicationOf = (file: DadFile, command: string) =>
  file.blocks.find(block => block.type === 'Message' && same(block.name, command))?.command?.application_id;

/**
 * Where a block's members are read: a command's Message block or Information Elements table in the command, a
 * grouped AVP's rule within it. Nothing for any other block: a name there is read wherever.
 */
export function blockContext(file: DadFile, block: Block | undefined): ReadContext {
  if (!block) return {};
  if (block.type === 'Message' && block.name)
    return { command: { name: block.name, application: block.command?.application_id } };
  if (block.type === 'Information Elements' && block.name)
    return { command: { name: block.name, application: applicationOf(file, block.name) } };
  if (block.type === 'Grouped AVP' && block.rule) return { within: block.rule.name };
  if (isInterpreted(block)) {
    const { within, command, application } = scopeOf(block);
    if (within) return { within };
    if (command) return { command: { name: command, application } };
  }
  return {};
}

/**
 * Each rule kind as the text prints one and what it says, for the help: the kinds the site says in words. A kind the
 * export adds later is said as the file prints it.
 */
export const ruleKinds: Record<ConstraintRule['kind'], { printed: string; says: string }> = {
  length: { printed: 'length 3', says: "the payload's octets, or the digits or characters it carries" },
  range: { printed: 'range 0 255', says: 'the values an integer may take' },
  exclude: { printed: 'exclude 0', says: 'values it may not take' },
  encoding: {
    printed: 'encoding e164-tbcd',
    says: "how the payload is laid out: a codec below, or another document's element",
  },
  'present-if': { printed: 'present-if Other-AVP', says: 'present when a condition on a sibling AVP holds' },
  'absent-if': { printed: 'absent-if Other-AVP', says: 'absent when a condition holds' },
  requires: { printed: 'requires Flags bit 3', says: 'present only if a condition holds' },
  excludes: { printed: 'excludes Other-AVP', says: 'never present if a condition holds' },
  default: { printed: 'default FALSE', says: 'what the AVP is read as when it is absent' },
  bits: {
    printed: 'bits at-most-one 3 6',
    says: "of these bits of the AVP's own value, at most one is set (at-most-one), at least one (at-least-one), each is set (set), each is clear (clear), or none but these is set (only); an OctetString's octets are read as one big-endian number, bit 0 the lowest of its last octet",
  },
  members: {
    printed: 'members at-least-one A B',
    says: "of the grouped AVP's members, at least one of these is present (at-least-one; with one name, it is), or none but these (only)",
  },
  unique: {
    printed: 'unique',
    says: 'no two of the grouped AVPs it is read within (; Within:) beside each other hold it with the same value',
  },
  values: {
    printed: 'values 1 if Other-AVP = 1',
    says: 'the values an integer may take when a condition on a sibling AVP holds',
  },
  'text-only': { printed: 'text-only', says: 'a rule no checker can run: the quote says it' },
};

const KNOWN_KINDS = new Set<string>(Object.keys(ruleKinds));

/** A reading's rules are all `text-only`: the quote is the whole of it. */
export const textOnly = (rules: Pick<ConstraintRule, 'kind'>[]) =>
  rules.length > 0 && rules.every(rule => rule.kind === 'text-only');

/**
 * Each codec's name in a few words, and its layout as constraints.md says it, for a title and the help. A codec the
 * export adds later is said by its own name.
 */
export const codecs: Record<Codec, { words: string; layout: string }> = {
  'e164-tbcd': {
    words: 'TBCD-encoded E.164 number',
    layout:
      'An international number, ITU-T E.164 (1 to 15 decimal digits), as a TBCD-string: two digits an octet, the first in bits 1-4, "1111" filling bits 5-8 of the last octet after an odd count; no octet for the nature of address and numbering plan (TS 29.002 clause 17.7.8).',
  },
  'plmn-id': {
    words: 'PLMN ID, MCC and MNC in 3 octets',
    layout:
      'MCC and MNC in 3 octets: MCC digits 2 and 1, then MNC digit 3 (or "1111" for a 2-digit MNC) and MCC digit 3, then MNC digits 2 and 1 (TS 29.272 table 7.3.9/1, after TS 24.008 clause 10.5.1.13).',
  },
  'plmn-id-prefix': {
    words: 'PLMN ID in the first 3 octets, more after it',
    layout: 'A PLMN ID in the first 3 octets, more octets after it (TS 29.272 table 7.3.64/1, Trace-Reference).',
  },
  digits: { words: 'decimal digits as text', layout: 'Decimal digits as text, a character each.' },
  labels: { words: 'labels separated by dots', layout: 'One or more non-empty labels separated by dots, as text.' },
  apn: { words: 'APN: labels separated by dots, or *', layout: 'Labels separated by dots, or the wild card "*".' },
  'plmn-domain': {
    words: 'mnc<MNC>.mcc<MCC>.3gppnetwork.org',
    layout: '"mnc<MNC>.mcc<MCC>.3gppnetwork.org", MNC 2 or 3 digits, MCC 3, in any case.',
  },
  'epc-plmn-domain': {
    words: 'epc.mnc<MNC>.mcc<MCC>.3gppnetwork.org',
    layout: '"epc.mnc<MNC>.mcc<MCC>.3gppnetwork.org", MNC 2 or 3 digits, MCC 3, in any case.',
  },
  'ip-address': {
    words: 'IPv4 or IPv6 address',
    layout: 'An Address of family 1 (IPv4, 4 octets) or 2 (IPv6, 16 octets), RFC 6733 clause 4.3.1.',
  },
  'time-zone': {
    words: 'time zone, in 15 minutes from UTC',
    layout: 'A sign and decimal digits, the offset from UTC in units of 15 minutes: "+8".',
  },
  element: {
    words: "another document's information element",
    layout:
      'An information element another document defines, carried whole: its document, and the clause and name where the clause gives them. Checked no further than a length rule beside it says.',
  },
};

const plural = (count: number, unit: string) => (count === 1 ? unit.replace(/s$/, '') : unit);

/** "3 octets", "14 to 15 digits", "at least 1 character": a length's or a range's bounds, with a unit if it has one. */
function boundsWords(low: number | null | undefined, high: number | null | undefined, unit = ''): string {
  const counted = (count: number) => (unit ? `${count} ${plural(count, unit)}` : String(count));
  if (low != null && high != null) return low === high ? counted(low) : `${low} to ${counted(high)}`;
  if (low != null) return `at least ${counted(low)}`;
  if (high != null) return `at most ${counted(high)}`;
  return unit ? `any number of ${unit}` : 'any value';
}

/** A bit as a rule names it: its number, or its bit table's name. */
const bitWords = (bit: number | string) => (typeof bit === 'number' ? String(bit) : `“${bit}”`);

/**
 * A `bits` rule in words by its relation, `said` its bits as "bit 1" or "bits 4, 5, 6, 7" and `list` them alone; none
 * for a relation the site does not know.
 */
const bitsRelations: Record<string, (said: string, list: string) => string> = {
  'at-most-one': said => `at most one of ${said} set`,
  'at-least-one': said => `at least one of ${said} set`,
  set: said => `${said} set`,
  clear: said => `${said} clear`,
  only: (_, list) => `no bit set but ${list}`,
};

/**
 * A `members` rule's words around the names it lists, which a popup links as AVP names: "at least one of", the names,
 * "present"; one name "present" alone; `only` "no member present but" them. Nothing for a relation the site does not
 * know.
 */
export function membersParts(rule: Pick<ConstraintRule, 'relation' | 'members'>) {
  const names = rule.members ?? [];
  if (rule.relation === 'at-least-one')
    return { before: names.length > 1 ? 'at least one of' : '', names, after: 'present' };
  if (rule.relation === 'only') return { before: 'no member present but', names, after: '' };
  return undefined;
}

/** A condition on a sibling AVP: "DSR-Flags has bit “Trace Data Withdrawal” set", "Result-Code is DIAMETER_SUCCESS". */
export function conditionWords({ avp, value, bit }: ConstraintCondition): string {
  if (bit != null) return `${avp} has bit ${bitWords(bit)} set`;
  if (value != null) return `${avp} is ${value}`;
  return `${avp} is present`;
}

const predicateWords: Record<string, string> = {
  'present-if': 'present if',
  'absent-if': 'absent if',
  requires: 'present only if',
  excludes: 'never present if',
};

/**
 * An element rule's words around its document, which a popup links where the corpus holds it: "encoded as", the
 * document as printed, and "clause 4.4 “Zone Code”".
 */
export function elementParts(rule: Pick<ConstraintRule, 'document' | 'clause' | 'element'>) {
  const after = [rule.clause && `clause ${rule.clause}`, rule.element && `“${rule.element}”`].filter(Boolean).join(' ');
  return { before: 'encoded as', document: rule.document ?? null, after };
}

/** The codec an encoding rule names, an element with its document, clause and name. */
function encodingWords(rule: ConstraintRule): string {
  if (rule.codec === 'element') {
    const { before, document, after } = elementParts(rule);
    const placeholder = rule.clause ? '' : "another document's element";
    return [before, document ?? placeholder, after].filter(Boolean).join(' ');
  }
  const codec = rule.codec ? codecs[rule.codec] : undefined;
  return codec ? codec.words : `encoded as ${rule.codec ?? 'a codec'}`;
}

/**
 * A rule in plain words: "3 octets", "0 to 255", "not 0", "TBCD-encoded E.164 number", "present only if DSR-Flags
 * has bit “X” set", "read as FALSE when absent", "at most one of bits 3, 6 set", "at least one of A, B present",
 * "differs from one APN-Configuration to the next" for a `unique` rule `within` it, "is 1 if Monitoring-Type is 1".
 * `printed` is the rule's line as the file prints it, which a kind or relation the site does not know is said by.
 */
export function ruleWords(rule: ConstraintRule, printed: string, within?: string): string {
  const kind = rule.kind as string;
  if (!KNOWN_KINDS.has(kind)) return printed.trim();
  switch (rule.kind) {
    case 'length':
      return boundsWords(rule.low, rule.high, rule.unit ?? 'octets');
    case 'range':
      return boundsWords(rule.low, rule.high);
    case 'exclude':
      return (rule.values ?? []).length > 1 ? `none of ${rule.values!.join(', ')}` : `not ${rule.values?.[0] ?? ''}`;
    case 'encoding':
      return encodingWords(rule);
    case 'default':
      return `read as ${rule.value ?? 'a default'} when absent`;
    case 'bits': {
      const bits = (rule.bits ?? []) as (number | string)[];
      const list = bits.map(bitWords).join(', ');
      const say = bitsRelations[rule.relation ?? ''];
      return say ? say(`${bits.length > 1 ? 'bits' : 'bit'} ${list}`, list) : printed.trim();
    }
    case 'members': {
      const parts = membersParts(rule);
      return parts ? [parts.before, parts.names.join(', '), parts.after].filter(Boolean).join(' ') : printed.trim();
    }
    case 'unique':
      return `differs from one ${within ?? 'grouped AVP'} to the next`;
    case 'values': {
      const values = rule.values ?? [];
      const said = values.length > 1 ? `one of ${values.join(', ')}` : String(values[0] ?? '');
      return `is ${said} if ${(rule.conditions ?? []).map(conditionWords).join(' or ')}`;
    }
    case 'text-only':
      return 'not checkable from one message';
    default: {
      const conditions = (rule.conditions ?? []).map(conditionWords);
      return `${predicateWords[kind]} ${conditions.join(' or ')}`;
    }
  }
}

/** A codec's layout, for the title of a rule naming it. */
export const ruleNote = (rule: ConstraintRule): string | undefined =>
  rule.kind === 'encoding' && rule.codec ? codecs[rule.codec]?.layout : undefined;

/** "Within APN-Configuration", "In Delete-Subscriber-Data-Request", "Wherever read": where a block's rules hold. */
export function scopeWords({ scope }: Pick<ConstraintBlock, 'scope'>, short: (command: string) => string = String) {
  if (scope.within) return `within ${scope.within}`;
  if (scope.command) return `in ${short(scope.command)}`;
  return 'wherever read';
}

/** A line's text as the file prints it, its newline left out. */
export const lineText = (file: DadFile, line: number) =>
  (file.lines[line]?.tokens ?? [])
    .map(token => token.text)
    .join('')
    .replace(/\n$/, '');

/** A quote cut at a word near `length` characters, for a title. */
function shortQuote(text: string, length = 100): string {
  if (text.length <= length) return text;
  const cut = text.slice(0, length);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), length / 2)).replace(/[\s,;:]+$/, '')}…`;
}

/**
 * Where a block was read from, as a mark on line `line` of `file` says it: the description of that line's own row in
 * the block's table, of another row there, as a command member's, or a clause's text.
 */
export function readFrom(file: DadFile, line: number, { block }: Pick<ConstraintBlock, 'block'>): string {
  const table = block.fields.Table;
  if (!table) return `Read from clause ${block.section}'s text`;
  const here = blockAt(file, line);
  if (here?.fields.Table === table) return 'Read from the description of this row';
  if (here?.rule) return `Read from the description of this member's row in table ${table}`;
  return `Read from the description of its row in table ${table}`;
}

export const MARK_CLICK = 'Click for each rule with its quote, and the way to it in the text.';

/**
 * A mark's title, in plain words: where its rules were read from, then each in words, a rule no checker can run as
 * its quote, shortened; blocks read from the same place under one heading. `file` is the file whose line `line` the
 * mark is on, `source` the corrected one holding the blocks.
 */
export function markTitle(file: DadFile, source: DadFile, line: number, blocks: ConstraintBlock[]): string[] {
  const groups = new Map<string, string[]>();
  for (const item of blocks) {
    const heading = readFrom(file, line, item);
    const said = groups.get(heading) ?? [];
    for (const reading of item.block.readings ?? []) {
      const words = textOnly(reading.rules)
        ? `not checkable from one message: “${shortQuote(reading.quotes.map(quote => quote.text).join(' '))}”`
        : reading.rules
            .filter(rule => rule.kind !== 'text-only')
            .map(rule => ruleWords(rule, lineText(source, rule.line), item.scope.within))
            .join('; ');
      if (!said.includes(words)) said.push(words);
    }
    groups.set(heading, said);
  }
  return [...[...groups].flatMap(([heading, said]) => [`${heading}:`, ...said.map(words => `• ${words}`)]), MARK_CLICK];
}

/**
 * The lines of a file reading an AVP that `source`'s constraints hold for there, and those blocks: a command's or
 * grouped AVP's members, an Information Elements row's AVPs, an AVP table's rows. `source` is the corrected file,
 * which a raw mirror's lines are read against, by its blocks' names.
 */
export function constraintLines(file: DadFile, source: DadFile): Map<number, ConstraintBlock[]> {
  const lines = new Map<number, ConstraintBlock[]>();
  if (!constraintBlocks(source).length) return lines;
  const add = (line: number, found: ConstraintBlock[]) => {
    if (!found.length) return;
    const held = lines.get(line) ?? [];
    lines.set(line, [...held, ...found.filter(item => !held.includes(item))]);
  };
  for (const block of file.blocks) {
    const context = blockContext(file, block);
    if (block.rule && block.type !== 'Answer Message')
      for (const member of block.rule.members) add(member.line, constraintsFor(source, member.name, context));
    for (const row of block.element_rows ?? [])
      for (const avp of row.avps ?? []) add(row.line, constraintsFor(source, avp, context));
  }
  for (const row of allAvpRows(file)) add(row.line, constraintsFor(source, row.name, {}).filter(unscoped));
  return lines;
}

/**
 * The lines of a file's Interpreted Constraints blocks, and of the blank lines before each that part it from the
 * block above: what hiding them leaves out. Each block's own lines are `interpreted`, its quotes `quote` and its rules
 * `rule` too.
 */
export const interpretedLines = perFile(({ lines, blocks }) => {
  const kinds = new Map<number, 'interpreted' | 'quote' | 'rule' | 'gap'>();
  for (const block of blocks) {
    if (!isInterpreted(block)) continue;
    for (let line = block.line; line <= block.last; line++) kinds.set(line, 'interpreted');
    for (const reading of block.readings ?? []) {
      for (const quote of reading.quotes) kinds.set(quote.line, 'quote');
      for (const rule of reading.rules) kinds.set(rule.line, 'rule');
    }
    for (let line = block.line - 1; line >= 0 && !kinds.has(line); line--) {
      const text = (lines[line]?.tokens ?? []).map(token => token.text).join('');
      if (text.trim()) break;
      kinds.set(line, 'gap');
    }
  }
  return kinds;
});
