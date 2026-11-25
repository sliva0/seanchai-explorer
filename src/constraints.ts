import { allAvpRows, blockAt, perFile } from './blocks.ts';
import type { DadFile } from './blocks.ts';
import { codecs, elementText, markText, ruleKinds, ruleText, scopeText } from './text/rules.ts';
import { blockRowKey, commandDocument, markSectionLine } from './elements.ts';
import type { Block, ConstraintRule, ElementRow, Line, Target } from './types.ts';
import type { ValueToken } from './values.ts';

/*
 * Interpreted Constraints: what a clause's prose says of an AVP's value or presence, as a reader declared it, pinned to
 * the sentences read. Only a corrected file holds them; the raw file is what the extractor read. Nothing here is what
 * a document prints as structure, and the site says so wherever it shows one.
 */

export const isInterpreted = (block: Pick<Block, 'type' | 'interpreted'>) =>
  block.interpreted === true || block.type === 'Interpreted Constraints';

/**
 * Where a block's rules hold: wherever the document reads the AVP, as a member of the grouped AVP `within`, or in
 * command `command`, of application `application` where the block names one, printed at `commandSection` where the
 * document prints it more than once (`; Command-Section:`). `requestSection` is where the request its rules read is
 * printed, where the block says (`; Request-Section:`).
 */
export interface ConstraintScope {
  within?: string;
  command?: string;
  application?: number;
  commandSection?: string;
  requestSection?: string;
}

/** An Interpreted Constraints block of a file, the AVP its `; AVP:` names and where its rules hold. */
export interface ConstraintBlock {
  block: Block;
  avp: string;
  scope: ConstraintScope;
}

/**
 * Where a name is read: as a member of a grouped AVP, or in a command, of an application where it says, printed at
 * `section` where that is known.
 */
export interface ReadContext {
  within?: string;
  command?: { name: string; application?: number | null; section?: string | null };
}

/** A command or grouped AVP spelt in another case is the same: one TS 29.338 table does so. */
const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

function scopeOf(block: Block): ConstraintScope {
  const { Within: within, Command: command } = block.fields;
  const commandSection = block.fields['Command-Section'];
  const requestSection = block.fields['Request-Section'];
  const application = Number(block.fields['Application-ID']);
  return {
    ...(within ? { within } : {}),
    ...(command ? { command } : {}),
    ...(command && block.fields['Application-ID'] && Number.isInteger(application) ? { application } : {}),
    ...(command && commandSection ? { commandSection } : {}),
    ...(command && requestSection ? { requestSection } : {}),
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
    if (scope.commandSection && command.section && scope.commandSection !== command.section) return false;
    return scope.application === undefined || command.application == null || scope.application === command.application;
  }
  return true;
}

/** Whether a block holds wherever the document reads its AVP. */
export const unscoped = ({ scope }: Pick<ConstraintBlock, 'scope'>) => !scope.within && !scope.command;

/**
 * Whether a rule's reference `ref` names the AVP `name` read in `context`: a member of the grouped AVP before it in the
 * path, of the request the block's answer answers, of the block's command or grouped AVP, or with no scope of the
 * block's own AVP.
 */
function reaches(
  file: DadFile,
  item: ConstraintBlock,
  { root, path }: ConstraintRef,
  name: string,
  context: ReadContext,
) {
  if (path[path.length - 1] !== name) return false;
  if (path.length > 1) return same(context.within, path[path.length - 2]);
  if (root === 'request') {
    const request = requestMessage(file, item.block);
    const { command } = context;
    return (
      !!request &&
      !!command &&
      same(command.name, request.name) &&
      (!command.section || command.section === request.section)
    );
  }
  if (unscoped(item)) return same(context.within, item.avp);
  return holdsIn(item, context);
}

/**
 * The blocks of a file on other AVPs whose rules read `name` where it is read: a condition on it, a value read from
 * it, an `equals` naming it, through a path or from the request an answer answers.
 */
export function readersFor(file: DadFile, name: string, context: ReadContext): ConstraintBlock[] {
  return constraintBlocks(file).filter(item =>
    (item.block.readings ?? []).some(reading =>
      reading.rules.some(rule => ruleReferences(rule).some(ref => reaches(file, item, ref, name, context))),
    ),
  );
}

/**
 * Where a name on an interpreted rule's line is read, by the path to it: a member of the grouped AVP before it, of the
 * request, or of the block's own scope.
 */
export function referenceContext(file: DadFile, block: Block, { root, path }: ConstraintRef): ReadContext {
  if (path.length > 1) return { within: path[path.length - 2] };
  if (root === 'request') {
    const request = requestMessage(file, block);
    return request?.name
      ? { command: { name: request.name, application: request.command?.application_id, section: request.section } }
      : {};
  }
  const { within, command, application, commandSection } = scopeOf(block);
  if (within) return { within };
  if (command) return { command: { name: command, application, section: commandSection } };
  return { within: block.name ?? block.fields.AVP };
}

/**
 * The blocks of a file scoped to a command that its body's lines cannot show: on an AVP its rule does not print, which
 * only its `* [ AVP ]` admits, or saying an AVP is never sent there (`absent`). `members` are the names its rule prints.
 */
export function commandConstraints(file: DadFile, context: ReadContext, members: Set<string>): ConstraintBlock[] {
  return constraintBlocks(file).filter(
    item =>
      !!item.scope.command &&
      holdsIn(item, context) &&
      (!members.has(item.avp) ||
        (item.block.readings ?? []).some(reading => reading.rules.some(rule => rule.kind === 'absent'))),
  );
}

/** The blocks of a file on an AVP that hold where it is read: those for the place first, then those for everywhere. */
export function constraintsFor(file: DadFile, avp: string, context: ReadContext): ConstraintBlock[] {
  const found = constraintBlocks(file).filter(item => item.avp === avp && holdsIn(item, context));
  return [...found.filter(item => !unscoped(item)), ...found.filter(unscoped)];
}

/** A file's Message blocks of a command, in file order. */
const messagesNamed = (file: DadFile, command: string) =>
  file.blocks.filter(block => block.type === 'Message' && same(block.name, command));

/** The application a command's Message block in a file is of, if the file has one naming it. */
const applicationOf = (file: DadFile, command: string) => messagesNamed(file, command)[0]?.command?.application_id;

/**
 * The Message block a block scoped to a command means: the one at its `; Command-Section:`, else the first of its
 * name and application. None where the file prints no such command.
 */
export function scopeMessage(file: DadFile, { scope }: Pick<ConstraintBlock, 'scope'>): Block | undefined {
  if (!scope.command) return undefined;
  const named = messagesNamed(file, scope.command);
  if (scope.commandSection) return named.find(block => block.section === scope.commandSection);
  return (
    named.find(
      block =>
        scope.application === undefined ||
        block.command?.application_id == null ||
        block.command.application_id === scope.application,
    ) ?? named[0]
  );
}

/**
 * The Message block of the request a block's rules read, which `request_target` names, of the block's application
 * where the clause prints it for several: in this file only, where it is the file's own.
 */
export function requestMessage(file: DadFile, block: Pick<Block, 'request_target' | 'fields'>): Block | undefined {
  const target = block.request_target;
  const own = (file as DadFile & { id?: string }).id;
  if (!target || (own && target.document !== own)) return undefined;
  const printed = file.blocks.filter(
    item => item.type === 'Message' && item.section === target.section && item.command?.request === true,
  );
  // A clause printing it for two applications, as TS 29.272's 7.2.9 does IDR: the block's application's.
  const application = Number(block.fields?.['Application-ID']);
  return printed.find(item => item.command?.application_id === application) ?? printed[0];
}

/** A command's short name as a file prints it, its abbreviation where its Message block has one. */
export const commandShort = (file: DadFile, command: string) =>
  messagesNamed(file, command).find(block => block.abbreviation)?.abbreviation ?? command;

/**
 * Where a block's members are read: a command's Message block or Information Elements table in the command, a
 * grouped AVP's rule within it. Nothing for any other block: a name there is read wherever.
 */
export function blockContext(file: DadFile, block: Block | undefined): ReadContext {
  if (!block) return {};
  if (block.type === 'Message' && block.name)
    return { command: { name: block.name, application: block.command?.application_id, section: block.section } };
  if (block.type === 'Information Elements' && block.name) {
    const printed =
      block.fields['Command-Section'] ?? (block.described?.length === 1 ? block.described[0].section : null);
    return { command: { name: block.name, application: applicationOf(file, block.name), section: printed } };
  }
  if (block.type === 'Grouped AVP' && block.rule) return { within: block.rule.name };
  if (isInterpreted(block)) {
    const { within, command, application, commandSection } = scopeOf(block);
    if (within) return { within };
    if (command) return { command: { name: command, application, section: commandSection } };
  }
  return {};
}

/** Where an Information Elements row reads its AVP: within the grouped AVP it is set off under, or else the block's command. */
export function elementRowContext(block: Block, row: ElementRow, context: ReadContext): ReadContext {
  const parents = blockRowKey(block, row).parents;
  return parents.length ? { within: parents[parents.length - 1] } : context;
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

/**
 * An AVP a rule reads beside its own: `path` the names from the block's scope down to it, through the grouped AVPs it
 * names, `root` `request` for a member of the request an answer answers, else null.
 */
export interface ConstraintRef {
  root: 'request' | null;
  path: string[];
}

/** A condition of a rule as the site reads it: the AVP its reference names present, holding `value`, or with `bit`. */
export interface Condition extends ConstraintRef {
  value?: number | string | ConstraintRef;
  bit?: number | string;
  negated: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isScalar = (value: unknown): value is number | string => typeof value === 'number' || typeof value === 'string';

/** A reference as the export gives one, `{root, path}`; none for a shape the site does not know. */
export function referenceOf(value: unknown): ConstraintRef | undefined {
  if (!isObject(value)) return undefined;
  const root = value.root ?? null;
  const { path } = value;
  if (root !== null && root !== 'request') return undefined;
  if (!Array.isArray(path) || !path.length || !path.every(name => typeof name === 'string' && name)) return undefined;
  return { root, path: path as string[] };
}

/** A condition as the export gives one, an older export's `avp` read as a path of one; none for any other shape. */
function conditionOf(raw: unknown): Condition | undefined {
  if (!isObject(raw)) return undefined;
  const ref =
    referenceOf(raw) ??
    (raw.path === undefined && raw.root == null && typeof raw.avp === 'string' && raw.avp
      ? { root: null, path: [raw.avp] }
      : undefined);
  if (!ref || (raw.negated != null && typeof raw.negated !== 'boolean')) return undefined;
  const { value, bit } = raw;
  if (value != null && bit != null) return undefined;
  const read = value == null ? undefined : isScalar(value) ? value : referenceOf(value);
  if (value != null && read === undefined) return undefined;
  if (bit != null && !isScalar(bit)) return undefined;
  return {
    ...ref,
    ...(read === undefined ? {} : { value: read }),
    ...(bit == null ? {} : { bit }),
    negated: raw.negated === true,
  };
}

/**
 * A rule's conditions as alternatives, any of which holding is enough, each conditions that must all hold; an older
 * export's flat list as alternatives of one. None where a shape is not one the site knows, or there are none.
 */
export function alternativesOf(rule: Pick<ConstraintRule, 'conditions'>): Condition[][] | undefined {
  const raw = rule.conditions as unknown;
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const alternatives = raw.map(alternative =>
    Array.isArray(alternative) ? alternative.map(conditionOf) : [conditionOf(alternative)],
  );
  if (alternatives.some(alternative => !alternative.length || alternative.some(item => !item))) return undefined;
  return alternatives as Condition[][];
}

/** Every AVP a rule reads beside its own, in the order its line prints them: its conditions and values, an `equals`'s. */
export function ruleReferences(rule: ConstraintRule): ConstraintRef[] {
  const found: ConstraintRef[] = [];
  for (const alternative of alternativesOf(rule) ?? [])
    for (const { root, path, value } of alternative) {
      found.push({ root, path });
      if (isObject(value)) found.push(value as ConstraintRef);
    }
  if (rule.kind === 'equals') {
    const reference = referenceOf(rule.reference);
    if (reference) found.push(reference);
  }
  return found;
}

/** Whether a rule reads the request its answer answers, which the Wireshark plugin checks only with that request. */
export const readsRequest = (rule: ConstraintRule) => ruleReferences(rule).some(ref => ref.root === 'request');

/**
 * An AVP a rule reads, in words: "Result-Code", "the request's IDR-Flags", "MIP-Home-Agent-Host in MIP6-Agent-Info",
 * "Monitoring-Event-Configuration in the request's Subscription-Data".
 */
export function referenceWords({ root, path }: ConstraintRef): string {
  const name = path[path.length - 1];
  const parents = path.slice(0, -1).join(ruleText.pathJoin);
  if (!parents) return root ? ruleText.requests(name) : name;
  return ruleText.memberIn(name, root ? ruleText.requests(parents) : parents);
}

/**
 * A condition in words: "DSR-Flags has bit “Trace Data Withdrawal” set", "Result-Code is DIAMETER_SUCCESS", "the
 * request's ULR-Flags does not have bit “Skip Subscriber Data” set", "MIP-Home-Agent-Host in MIP6-Agent-Info is
 * absent", "Result-Code equals the request's Result-Code".
 */
export function conditionWords(condition: Condition): string {
  const { bit, value, negated } = condition;
  const avp = referenceWords(condition);
  if (bit != null) return negated ? ruleText.lacksBit(avp, bitWords(bit)) : ruleText.hasBit(avp, bitWords(bit));
  if (isObject(value)) {
    const other = referenceWords(value as ConstraintRef);
    return negated ? ruleText.differsFrom(avp, other) : ruleText.equalsOther(avp, other);
  }
  if (value != null) return negated ? ruleText.isNot(avp, String(value)) : ruleText.is(avp, String(value));
  return negated ? ruleText.isAbsent(avp) : ruleText.isPresent(avp);
}

/**
 * Alternatives in words, the conditions of each joined by "and" and the alternatives by "or", after a comma where one
 * of them joins several, as "and" binds tighter.
 */
export function alternativesWords(alternatives: Condition[][]): string {
  const said = alternatives.map(alternative => alternative.map(conditionWords).join(ruleText.and));
  return said.join(alternatives.some(alternative => alternative.length > 1) ? ruleText.orAfterAnd : ruleText.or);
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

/** Where a rule is said to hold, for a `unique` or an `absent` rule: the grouped AVP, or the command by its short name. */
export interface RuleWhere {
  within?: string;
  command?: string;
}

/**
 * A rule in plain words: "3 octets", "0 to 255", "not 0", "TBCD-encoded E.164 number", "present only if DSR-Flags
 * has bit “X” set", "read as FALSE when absent", "at most one of bits 3, 6 set", "at least one of A, B present",
 * "unique across APN-Configuration instances" for a `unique` rule `within` it, "is 1 if Monitoring-Type is 1", "holds
 * the same value as the request's User-Name", "never sent in STR" for an `absent` rule in that command. `printed` is
 * the rule's line as the file prints it, which a kind, relation or condition the site does not know is said by.
 */
export function ruleWords(rule: ConstraintRule, printed: string, where: RuleWhere = {}): string {
  const { within } = where;
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
      const alternatives = alternativesOf(rule);
      if (!alternatives || !values.length) return printed.trim();
      const said = values.length > 1 ? ruleText.oneOf(values.join(', ')) : String(values[0]);
      return ruleText.values(said, alternativesWords(alternatives));
    }
    case 'equals': {
      const reference = referenceOf(rule.reference);
      return reference ? ruleText.sameValueAs(referenceWords(reference)) : printed.trim();
    }
    case 'absent': {
      const scope = where.within ?? where.command;
      return scope ? ruleText.neverSentIn(scope) : ruleText.neverSent;
    }
    case 'text-only':
      return ruleText.textOnly;
    default: {
      const alternatives = alternativesOf(rule);
      if (!alternatives || !(kind in predicateWords)) return printed.trim();
      return `${predicateWords[kind]} ${alternativesWords(alternatives)}`;
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

/** Where a block's rules are said to hold, for `ruleWords`: its grouped AVP, or its command as `short` names it. */
export const ruleWhere = (
  { scope }: Pick<ConstraintBlock, 'scope'>,
  short: (command: string) => string = String,
): RuleWhere => ({
  ...(scope.within ? { within: scope.within } : {}),
  ...(scope.command ? { command: short(scope.command) } : {}),
});

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
  // On a command's `* [ AVP ]` line, each rule says which AVP it is on, as the line names none of them.
  const admitted = new Set(admittedBy(file, line, blocks));
  for (const item of blocks) {
    const heading = readFrom(file, line, item);
    const said = groups.get(heading) ?? [];
    for (const reading of item.block.readings ?? []) {
      const words = textOnly(reading.rules)
        ? markText.textOnly(shortQuote(reading.quotes.map(quote => quote.text).join(' ')))
        : [
            reading.rules
              .filter(rule => rule.kind !== 'text-only')
              .map(rule =>
                ruleWords(
                  rule,
                  lineText(source, rule.line),
                  ruleWhere(item, command => commandShort(source, command)),
                ),
              )
              .join(markText.joined),
            ...reading.rules.flatMap(rule => {
              const entry = elementEntry(rule);
              return entry ? [elementText.mark(entry.depth)] : [];
            }),
          ].join('\n');
      const named = admitted.has(item.avp) ? markText.named(item.avp, words) : words;
      if (!said.includes(named)) said.push(named);
    }
    groups.set(heading, said);
  }
  return [
    ...[...groups].flatMap(([heading, said]) => [markText.heading(heading), ...said.map(markText.item)]),
    MARK_CLICK,
  ];
}

/** A command's `* [ AVP ]` line, and the blocks on AVPs its rule does not print that hold in it, which that line admits. */
function admittedLine(block: Block, source: DadFile, context: ReadContext): [number, ConstraintBlock[]] {
  const rule = block.rule!;
  const members = new Set(rule.members.map(member => member.name));
  const wildcard = rule.members.find(member => member.name === 'AVP');
  const found = commandConstraints(source, context, members).filter(item => !members.has(item.avp));
  return [wildcard?.line ?? rule.line, found];
}

/** The AVPs a mark's blocks are on that its line does not print, which only its command's `* [ AVP ]` admits. */
export function admittedBy(file: DadFile, line: number, found: ConstraintBlock[]): string[] {
  const rule = blockAt(file, line)?.rule;
  if (!rule) return [];
  const members = new Set(rule.members.map(member => member.name));
  return [...new Set(found.filter(item => !members.has(item.avp)).map(item => item.avp))];
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
    if (block.type === 'Message' && block.rule) add(...admittedLine(block, source, context));
    for (const row of block.element_rows ?? [])
      for (const avp of row.avps ?? [])
        add(row.line, constraintsFor(source, avp, elementRowContext(block, row, context)));
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

/** The first link a file gives a name, by name: where a name a rule reads goes where nothing nearer says. */
const firstTargets = perFile(({ lines }) => {
  const found = new Map<string, Target>();
  for (const line of lines)
    for (const token of line.tokens)
      if (token.avp && token.target && !found.has(token.avp)) found.set(token.avp, token.target);
  return found;
});

/** The link a rule's or block's member line gives a name: the member of that name in `block`'s rule, if it has one. */
function memberTarget(file: DadFile, block: Block | undefined, name: string): Target | undefined {
  const member = block?.rule?.members.find(item => item.name === name);
  return member ? (file.lines[member.line]?.tokens.find(token => token.avp === name)?.target ?? undefined) : undefined;
}

/** A file's Grouped AVP block of a name, the first. */
const groupedBlock = (file: DadFile, name: string) =>
  file.blocks.find(block => block.type === 'Grouped AVP' && block.rule?.name === name);

/**
 * Where a name a rule reads links: the member it is of the grouped AVP before it in the path, of the request, of the
 * block's command or grouped AVP, or of the block's own AVP where it has no scope; else wherever the file first links it.
 */
function referenceTarget(file: DadFile, item: ConstraintBlock, { root, path }: ConstraintRef): Target | undefined {
  const name = path[path.length - 1];
  const parent = path.length > 1 ? path[path.length - 2] : undefined;
  const { scope } = item;
  const holder = parent
    ? groupedBlock(file, parent)
    : root === 'request'
      ? requestMessage(file, item.block)
      : scope.command
        ? scopeMessage(file, item)
        : groupedBlock(file, scope.within ?? item.avp);
  return memberTarget(file, holder, name) ?? firstTargets(file).get(name);
}

const NAME_CHAR = /[A-Za-z0-9_\-/]/;

/**
 * Marks `start` to `end` of a line as a name a rule reads: the token spelling just that, which the export may have
 * linked already, or a plain token holding it, split around it. A span reaching over a token's edge is left as it is.
 */
function markReference(line: Line, start: number, end: number, name: string, ref: ConstraintRef, target?: Target) {
  let at = 0;
  for (const [index, token] of (line.tokens as ValueToken[]).entries()) {
    const stop = at + token.text.length;
    if (start >= at && end <= stop) {
      if (token.kind || token.correction || token.command || token.source) return;
      if (start === at && end === stop) {
        if (token.avp && token.avp !== name) return;
        token.avp = name;
        token.constraintRef = ref;
        if (!token.target && target) token.target = target;
        return;
      }
      if (token.avp || token.target) return;
      const parts: ValueToken[] = [
        { text: token.text.slice(0, start - at) },
        { text: token.text.slice(start - at, end - at), avp: name, constraintRef: ref, ...(target ? { target } : {}) },
        { text: token.text.slice(end - at) },
      ];
      line.tokens.splice(index, 1, ...parts.filter(part => part.text));
      return;
    }
    at = stop;
  }
}

/**
 * Marks what an Interpreted Constraints block's lines name beyond the export's links: `; Command-Section:` a link to
 * the command's clause and `; Request-Section:` to the request's, and on a rule's line every name of each path it
 * reads, `request/` left out, each its own name linking to the member it is, with the path to it, so that a popup
 * reads it where the path reaches it. A path the line does not print as the export gives it is left as text.
 */
export const markConstraints = perFile(file => {
  for (const item of constraintBlocks(file)) {
    const { block } = item;
    markSectionLine(file, block, 'Command-Section', commandDocument(file, block));
    markSectionLine(file, block, 'Request-Section', block.request_target?.document ?? undefined);
    for (const reading of block.readings ?? [])
      for (const rule of reading.rules) {
        const line = file.lines[rule.line];
        if (!line) continue;
        const text = line.tokens.map(token => token.text).join('');
        let from = text.length - text.trimStart().length + rule.kind.length;
        for (const ref of ruleReferences(rule)) {
          const printed = [...(ref.root ? [ref.root] : []), ...ref.path].join('/');
          let start = text.indexOf(printed, from);
          while (
            start >= 0 &&
            (NAME_CHAR.test(text[start - 1] ?? '') || NAME_CHAR.test(text[start + printed.length] ?? ''))
          )
            start = text.indexOf(printed, start + 1);
          if (start < 0) continue;
          let at = start + (ref.root ? ref.root.length + 1 : 0);
          ref.path.forEach((name, index) => {
            const prefix = { root: ref.root, path: ref.path.slice(0, index + 1) };
            markReference(line, at, at + name.length, name, prefix, referenceTarget(file, item, prefix));
            at += name.length + 1;
          });
          from = start + printed.length;
        }
      }
  }
  return true;
});
