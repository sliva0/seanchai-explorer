import { allAvpRows, perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import type { Block, Codec, ConstraintCondition, ConstraintRule } from './types.ts';

/**
 * Interpreted Constraints: what a clause's prose says of an AVP's value or presence, as a reader declared it, pinned to
 * the sentences read. Only a corrected file holds them; the raw file is what the extractor read. Nothing here is what
 * a document prints as structure, and the site says so wherever it shows one.
 */
export const CONSTRAINTS_DOC = 'https://github.com/sliva0/seanchai/blob/main/docs/constraints.md';

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
  if ((block.type === 'Grouped AVP' || block.type === 'Reprinted AVP') && block.rule)
    return { within: block.rule.name };
  if (isInterpreted(block)) {
    const { within, command, application } = scopeOf(block);
    if (within) return { within };
    if (command) return { command: { name: command, application } };
  }
  return {};
}

/** The rule kinds the site says in words; a kind the export adds later is said as the file prints it. */
const KNOWN_KINDS = new Set([
  'length',
  'range',
  'exclude',
  'encoding',
  'present-if',
  'absent-if',
  'requires',
  'excludes',
  'text-only',
]);

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

/** A condition on a sibling AVP: "DSR-Flags has bit “Trace Data Withdrawal” set", "Result-Code is DIAMETER_SUCCESS". */
export function conditionWords({ avp, value, bit }: ConstraintCondition): string {
  if (bit != null) return `${avp} has bit ${typeof bit === 'number' ? bit : `“${bit}”`} set`;
  if (value != null) return `${avp} is ${value}`;
  return `${avp} is present`;
}

const predicateWords: Record<string, string> = {
  'present-if': 'present if',
  'absent-if': 'absent if',
  requires: 'present only if',
  excludes: 'never present if',
};

/** The codec an encoding rule names, an element with its document, clause and name. */
function encodingWords(rule: ConstraintRule): string {
  if (rule.codec === 'element') {
    const where = [rule.document, rule.clause && `clause ${rule.clause}`].filter(Boolean).join(' ');
    return `encoded as ${where || "another document's element"}${rule.element ? ` “${rule.element}”` : ''}`;
  }
  const codec = rule.codec ? codecs[rule.codec] : undefined;
  return codec ? codec.words : `encoded as ${rule.codec ?? 'a codec'}`;
}

/**
 * A rule in plain words: "3 octets", "0 to 255", "not 0", "TBCD-encoded E.164 number", "present only if DSR-Flags
 * has bit “X” set". `printed` is the rule's line as the file prints it, which a kind the site does not know is said by.
 */
export function ruleWords(rule: ConstraintRule, printed: string): string {
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
    case 'text-only':
      return 'not checkable: read the quote';
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

/** The rules of a set of blocks in plain words, one a line: a mark's title. */
export const blocksSummary = (file: DadFile, blocks: ConstraintBlock[]) =>
  blocks
    .flatMap(({ block, scope }) =>
      (block.readings ?? []).flatMap(reading =>
        textOnly(reading.rules)
          ? []
          : reading.rules.map(
              rule =>
                `${ruleWords(rule, lineText(file, rule.line))}${scope.within || scope.command ? ` (${scopeWords({ scope })})` : ''}`,
            ),
      ),
    )
    .filter((text, index, all) => all.indexOf(text) === index);

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
 * block above: what hiding them leaves out. Each block's own lines are `interpreted`, its quotes `quote` too.
 */
export const interpretedLines = perFile(({ lines, blocks }) => {
  const kinds = new Map<number, 'interpreted' | 'quote' | 'gap'>();
  for (const block of blocks) {
    if (!isInterpreted(block)) continue;
    for (let line = block.line; line <= block.last; line++) kinds.set(line, 'interpreted');
    for (const reading of block.readings ?? []) for (const quote of reading.quotes) kinds.set(quote.line, 'quote');
    for (let line = block.line - 1; line >= 0 && !kinds.has(line); line--) {
      const text = (lines[line]?.tokens ?? []).map(token => token.text).join('');
      if (text.trim()) break;
      kinds.set(line, 'gap');
    }
  }
  return kinds;
});
