import { allAvpRows, blockAt, perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import { codecs, elementText, markText, ruleKinds, ruleText, scopeText } from './text/rules.ts';
import type { Block, ConstraintCondition, ConstraintRule } from './types.ts';

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

export { codecs, ruleKinds };

const KNOWN_KINDS = new Set<string>(Object.keys(ruleKinds));

/** A reading's rules are all `text-only`: the quote is the whole of it. */
export const textOnly = (rules: Pick<ConstraintRule, 'kind'>[]) =>
  rules.length > 0 && rules.every(rule => rule.kind === 'text-only');

/** "3 octets", "14 to 15 digits", "at least 1 character": a length's or a range's bounds, with a unit if it has one. */
function boundsWords(low: number | null | undefined, high: number | null | undefined, unit = ''): string {
  const counted = (count: number) => (unit ? ruleText.counted(count, ruleText.unit(count, unit)) : String(count));
  if (low != null && high != null) return low === high ? counted(low) : ruleText.between(low, counted(high));
  if (low != null) return ruleText.atLeast(counted(low));
  if (high != null) return ruleText.atMost(counted(high));
  return unit ? ruleText.anyNumberOf(unit) : ruleText.anyValue;
}

/** A bit as a rule names it: its number, or its bit table's name. */
const bitWords = (bit: number | string) => (typeof bit === 'number' ? String(bit) : ruleText.namedBit(bit));

/**
 * A `bits` rule in words by its relation, `said` its bits as "bit 1" or "bits 4, 5, 6, 7" and `list` them alone; none
 * for a relation the site does not know.
 */
const bitsRelations: Record<string, (said: string, list: string) => string> = {
  'at-most-one': said => ruleText.bitsAtMostOne(said),
  'at-least-one': said => ruleText.bitsAtLeastOne(said),
  set: said => ruleText.bitsSet(said),
  clear: said => ruleText.bitsClear(said),
  only: (_, list) => ruleText.bitsOnly(list),
};

/**
 * A `members` rule's words around the names it lists, which a popup links as AVP names: "at least one of", the names,
 * "present"; one name "present" alone; `only` "no member present but" them. Nothing for a relation the site does not
 * know.
 */
export function membersParts(rule: Pick<ConstraintRule, 'relation' | 'members'>) {
  const names = rule.members ?? [];
  if (rule.relation === 'at-least-one')
    return { before: names.length > 1 ? ruleText.membersAtLeastOneOf : '', names, after: ruleText.membersPresent };
  if (rule.relation === 'only') return { before: ruleText.membersOnly, names, after: '' };
  return undefined;
}

/** A condition on a sibling AVP: "DSR-Flags has bit “Trace Data Withdrawal” set", "Result-Code is DIAMETER_SUCCESS". */
export function conditionWords({ avp, value, bit }: ConstraintCondition): string {
  if (bit != null) return ruleText.hasBit(avp, bitWords(bit));
  if (value != null) return ruleText.is(avp, String(value));
  return ruleText.isPresent(avp);
}

const predicateWords: Record<string, string> = {
  'present-if': ruleText.presentIf,
  'absent-if': ruleText.absentIf,
  requires: ruleText.requires,
  excludes: ruleText.excludes,
};

/**
 * A document's reference as a reader writes it, where the corpus holds no edition to name it by: `TS23.003` is
 * "TS 23.003" and `RFC6733` "RFC 6733"; any other, as `3GPP2-A.S0022`, as the export gives it.
 */
export const referenceText = (reference: string) => reference.replace(/^(TS|TR|RFC)(?=\d)/, '$1 ');

/**
 * An element rule's words around its document, which a popup links where the corpus holds it: "encoded as", the
 * document as a reader writes it, and "section 4.4 “Zone Code”".
 */
export function elementParts(rule: Pick<ConstraintRule, 'document' | 'clause' | 'element'>) {
  const after = [rule.clause && ruleText.clause(rule.clause), rule.element && ruleText.element(rule.element)]
    .filter(Boolean)
    .join(' ');
  return { before: ruleText.encodedAs, document: rule.document ? referenceText(rule.document) : null, after };
}

/** An element rule's entry in the corpus's element registry, what the element is and how far it is checked. */
export const elementEntry = (rule: ConstraintRule) =>
  rule.kind === 'encoding' && rule.codec === 'element' ? (rule.element_entry ?? undefined) : undefined;

/** The codec an encoding rule names, an element with its document, clause and name. */
function encodingWords(rule: ConstraintRule): string {
  if (rule.codec === 'element') {
    const { before, document, after } = elementParts(rule);
    const placeholder = rule.clause ? '' : ruleText.anotherElement;
    return [before, document ?? placeholder, after].filter(Boolean).join(' ');
  }
  const codec = rule.codec ? codecs[rule.codec] : undefined;
  return codec ? codec.words : ruleText.encodedAsCodec(rule.codec ?? ruleText.aCodec);
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
      return boundsWords(rule.low, rule.high, rule.unit ?? ruleText.octets);
    case 'range':
      return boundsWords(rule.low, rule.high);
    case 'exclude':
      return (rule.values ?? []).length > 1
        ? ruleText.noneOf(rule.values!.join(', '))
        : ruleText.not(String(rule.values?.[0] ?? ''));
    case 'encoding':
      return encodingWords(rule);
    case 'default':
      return ruleText.readAs(String(rule.value ?? ruleText.aDefault));
    case 'bits': {
      const bits = (rule.bits ?? []) as (number | string)[];
      const list = bits.map(bitWords).join(', ');
      const say = bitsRelations[rule.relation ?? ''];
      return say ? say(ruleText.bits(bits.length, list), list) : printed.trim();
    }
    case 'members': {
      const parts = membersParts(rule);
      return parts ? [parts.before, parts.names.join(', '), parts.after].filter(Boolean).join(' ') : printed.trim();
    }
    case 'unique':
      return ruleText.differs(within ?? ruleText.groupedAvp);
    case 'values': {
      const values = rule.values ?? [];
      const said = values.length > 1 ? ruleText.oneOf(values.join(', ')) : String(values[0] ?? '');
      return ruleText.values(said, (rule.conditions ?? []).map(conditionWords).join(ruleText.or));
    }
    case 'text-only':
      return ruleText.textOnly;
    default: {
      const conditions = (rule.conditions ?? []).map(conditionWords);
      return `${predicateWords[kind]} ${conditions.join(ruleText.or)}`;
    }
  }
}

/**
 * A codec's layout, for the title of a rule naming it; none for an element its entry says, as the rows under the rule
 * do.
 */
export const ruleNote = (rule: ConstraintRule): string | undefined =>
  rule.kind === 'encoding' && rule.codec && !elementEntry(rule) ? codecs[rule.codec]?.layout : undefined;

/** "Within APN-Configuration", "In Delete-Subscriber-Data-Request", "Wherever read": where a block's rules hold. */
export function scopeWords({ scope }: Pick<ConstraintBlock, 'scope'>, short: (command: string) => string = String) {
  if (scope.within) return scopeText.within(scope.within);
  if (scope.command) return scopeText.in(short(scope.command));
  return scopeText.wherever;
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
  return markText.cut(cut.slice(0, Math.max(cut.lastIndexOf(' '), length / 2)).replace(/[\s,;:]+$/, ''));
}

/**
 * Where a block was read from, as a mark on line `line` of `file` says it: the description of that line's own row in
 * the block's table, of another row there, as a command member's, or a clause's text.
 */
export function readFrom(file: DadFile, line: number, { block }: Pick<ConstraintBlock, 'block'>): string {
  const table = block.fields.Table;
  if (!table) return markText.fromClause(block.section);
  const here = blockAt(file, line);
  if (here?.fields.Table === table) return markText.fromThisRow;
  if (here?.rule) return markText.fromMemberRow(table);
  return markText.fromRow(table);
}

export const MARK_CLICK = markText.click;

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
        ? markText.textOnly(shortQuote(reading.quotes.map(quote => quote.text).join(' ')))
        : [
            reading.rules
              .filter(rule => rule.kind !== 'text-only')
              .map(rule => ruleWords(rule, lineText(source, rule.line), item.scope.within))
              .join(markText.joined),
            ...reading.rules.flatMap(rule => {
              const entry = elementEntry(rule);
              return entry ? [elementText.mark(entry.depth)] : [];
            }),
          ].join('\n');
      if (!said.includes(words)) said.push(words);
    }
    groups.set(heading, said);
  }
  return [
    ...[...groups].flatMap(([heading, said]) => [markText.heading(heading), ...said.map(markText.item)]),
    MARK_CLICK,
  ];
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
