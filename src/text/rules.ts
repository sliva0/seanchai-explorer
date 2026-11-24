// The words the site says interpreted constraints in: what each kind of rule says, each codec, a rule in plain
// words, the ¶ mark's title, and the Interpreted section of a popup. Each entry's comment says where it shows; see
// site.ts for the marks. A rule's printed form, "length 3", is the corpus's syntax, not words to rewrite.
import type { Codec, ConstraintRule } from '../types.ts';

/**
 * Each rule kind as the text prints one (`printed`, the corpus's syntax, an example) and what it says (`says`), listed
 * by the help. A kind the export adds later is said as the file prints it.
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

/**
 * Each codec's name in a few words (`words`, a rule's words in popups and titles), and its layout (`layout`, in a rule's
 * tooltip and the help). A codec the export adds later is said by its own name.
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

/** A rule in plain words, in the ¶ mark's title and the Interpreted section: the pieces each kind is said with. */
export const ruleText = {
  /** A unit for one of it: "1 octet" where the rule's unit is "octets". */
  unit: (count: number, unit: string) => (count === 1 ? unit.replace(/s$/, '') : unit),
  /** A count with its unit: "3 octets". */
  counted: (count: number, unit: string) => `${count} ${unit}`,
  /** A length's or a range's bounds: "3 to 255", "at least 1 character", "at most 3 octets". */
  between: (low: number, high: string) => `${low} to ${high}`,
  atLeast: (low: string) => `at least ${low}`,
  atMost: (high: string) => `at most ${high}`,
  anyNumberOf: (unit: string) => `any number of ${unit}`,
  anyValue: 'any value',
  /** A length's unit where the rule names none. */
  octets: 'octets',
  /** A bit a rule names by its bit table's name, quoted: “Trace Data Withdrawal”. */
  namedBit: (name: string) => `“${name}”`,
  /** A `bits` rule's bits: "bit 1", "bits 4, 5, 6, 7". */
  bits: (count: number, list: string) => `${count > 1 ? 'bits' : 'bit'} ${list}`,
  /** A `bits` rule by its relation, `said` its bits as above and `list` them alone. */
  bitsAtMostOne: (said: string) => `at most one of ${said} set`,
  bitsAtLeastOne: (said: string) => `at least one of ${said} set`,
  bitsSet: (said: string) => `${said} set`,
  bitsClear: (said: string) => `${said} clear`,
  bitsOnly: (list: string) => `no bit set but ${list}`,
  /** A `members` rule's words around the names it lists, which a popup links. */
  membersAtLeastOneOf: 'at least one of',
  membersPresent: 'present',
  membersOnly: 'no member present but',
  /** A condition on a sibling AVP: "DSR-Flags has bit “X” set", "Result-Code is DIAMETER_SUCCESS". */
  hasBit: (avp: string, bit: string) => `${avp} has bit ${bit} set`,
  is: (avp: string, value: string) => `${avp} is ${value}`,
  isPresent: (avp: string) => `${avp} is present`,
  /** Conditions joined. */
  or: ' or ',
  /** The predicates tying a member's presence to its siblings, before their conditions. */
  presentIf: 'present if',
  absentIf: 'absent if',
  requires: 'present only if',
  excludes: 'never present if',
  /** An `encoding element` rule: "encoded as TS 24.008 clause 10.5.1.13 “PLMN identity”", the document a link. */
  encodedAs: 'encoded as',
  clause: (clause: string) => `clause ${clause}`,
  element: (element: string) => `“${element}”`,
  anotherElement: "another document's element",
  /** An encoding the site does not know: "encoded as x-codec". */
  encodedAsCodec: (codec: string) => `encoded as ${codec}`,
  aCodec: 'a codec',
  /** An `exclude` rule: "not 0", "none of 0, 255". */
  not: (value: string) => `not ${value}`,
  noneOf: (values: string) => `none of ${values}`,
  /** A `default` rule: "read as FALSE when absent". */
  readAs: (value: string) => `read as ${value} when absent`,
  aDefault: 'a default',
  /** A `unique` rule: "differs from one APN-Configuration to the next". */
  differs: (within: string) => `differs from one ${within} to the next`,
  groupedAvp: 'grouped AVP',
  /** A `values` rule: "is 1 if Monitoring-Type is 1", "is one of 1, 2 if …". */
  values: (said: string, conditions: string) => `is ${said} if ${conditions}`,
  oneOf: (values: string) => `one of ${values}`,
  /** A rule no checker can run on one message. */
  textOnly: 'not checkable from one message',
};

/** Where a block's rules hold, in the Interpreted section's scope line: "within APN-Configuration", "in DSR". */
export const scopeText = {
  within: (name: string) => `within ${name}`,
  in: (command: string) => `in ${command}`,
  wherever: 'wherever read',
};

/**
 * The ¶ mark's title after a line reading an AVP that interpreted constraints hold for there: a heading saying where
 * the rules were read from, then each in words a line, then what a click does.
 */
export const markText = {
  /** Headings, each followed by a colon. */
  fromClause: (section: string) => `Read from clause ${section}'s text`,
  fromThisRow: 'Read from the description of this row',
  fromMemberRow: (table: string) => `Read from the description of this member's row in table ${table}`,
  fromRow: (table: string) => `Read from the description of its row in table ${table}`,
  heading: (heading: string) => `${heading}:`,
  /** A rule's line. */
  item: (words: string) => `• ${words}`,
  /** A rule no checker can run, as its quote, cut at a word near 100 characters with … */
  textOnly: (quote: string) => `not checkable from one message: “${quote}”`,
  cut: (quote: string) => `${quote}…`,
  /** Rules of one reading on one line. */
  joined: '; ',
  /** The title's last line. */
  click: 'Click for each rule with its quote, and the way to it in the text.',
};

/** The Interpreted section of a name's popup and the inspector. */
export const constraintsSection = {
  /** Its name, for a screen reader. */
  label: 'Interpreted constraints',
  /** [limit] Its heading, followed by a count. A word. */
  heading: 'Interpreted',
  /** [limit] Its button opening the help at what they are, at the heading's right, and the button's tooltip. */
  about: 'what these are',
  aboutTitle:
    'Rules a reader of the specification took from its prose, each beside the sentence it was read from. The specification prints none of them as a table or ABNF rule, so each is as sure as its quote.',
  /** A text-only rule, in place of its words, and its tooltip. */
  textOnly: 'Not checkable from one message',
  textOnlyTitle: 'No checker can run it on one message: the quote is the whole of it, as the text prints text-only',
  /** [limit] A block's place's label, before its colon. */
  readIn: 'Read in',
};
