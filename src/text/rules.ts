// The words the site says interpreted constraints in: what each kind of rule says, each codec, a rule in plain
// words, the ¶ mark's title, and the Interpreted section of a popup. Each entry's comment says where it shows; see
// site.ts for the marks. A rule's printed form, "length 3", is the corpus's syntax, not words to rewrite.
import type { Codec, ConstraintRule } from '../types.ts';

/**
 * Each rule kind as the text prints one (`printed`, the corpus's syntax, an example) and what it says (`says`), listed
 * by the help. A kind the export adds later is said as the file prints it.
 */
export const ruleKinds: Record<ConstraintRule['kind'], { printed: string; says: string }> = {
  length: { printed: 'length 3', says: 'Required payload length in octets, digits, or characters.' },
  range: { printed: 'range 0 255', says: 'Allowed numeric range for an integer value.' },
  exclude: { printed: 'exclude 0', says: 'Values that are not allowed.' },
  encoding: {
    printed: 'encoding e164-tbcd',
    says: 'Payload encoding format: one of the codecs below, or an information element from another specification.',
  },
  'present-if': { printed: 'present-if Other-AVP', says: 'Must be present when a condition on a sibling AVP holds.' },
  'absent-if': { printed: 'absent-if Other-AVP', says: 'Must be absent when a condition on a sibling AVP holds.' },
  requires: { printed: 'requires Flags bit 3', says: 'May be present only if a condition on a sibling AVP holds.' },
  excludes: { printed: 'excludes Other-AVP', says: 'Must not be present if a condition on a sibling AVP holds.' },
  default: { printed: 'default FALSE', says: 'Default value assumed when the AVP is absent.' },
  bits: {
    printed: 'bits at-most-one 3 6',
    says: "Bit constraint on the AVP's value: at most one bit set (at-most-one), at least one set (at-least-one), all listed bits set (set), all listed bits clear (clear), or only listed bits may be set (only). For an OctetString, octets are read as a single big-endian integer with bit 0 as the least-significant bit of the last octet.",
  },
  members: {
    printed: 'members at-least-one A B',
    says: 'Member constraint on a grouped AVP: at least one listed AVP must be present (at-least-one; with one name, that AVP must be present), or no other members may be present (only).',
  },
  unique: {
    printed: 'unique',
    says: 'Value must be unique across repeated instances of the enclosing grouped AVP (;\u00a0Within:).',
  },
  values: {
    printed: 'values 1 if Other-AVP = 1',
    says: 'Allowed integer values when a condition on a sibling AVP holds.',
  },
  'text-only': {
    printed: 'text-only',
    says: 'Prose-only rule that cannot be checked on a single message; read the quote directly.',
  },
};

/**
 * Each codec's name in a few words (`words`, a rule's words in popups and titles), and its layout (`layout`, in a rule's
 * tooltip and the help). A codec the export adds later is said by its own name. An `element` has no words of its own:
 * a rule naming one is said by its document, section and name, with `ruleText`'s words around them.
 */
export const codecs: Record<Exclude<Codec, 'element'>, { words: string; layout: string }> &
  Record<'element', { layout: string }> = {
  'e164-tbcd': {
    words: 'TBCD-encoded E.164 number',
    layout:
      'International ITU-T E.164 number (1 to 15 decimal digits) encoded as a TBCD string: two digits per octet (first digit in bits 1-4, "1111" padding in bits 5-8 of the last octet for an odd digit count), with no nature-of-address or numbering-plan octet (TS 29.002 section 17.7.8).',
  },
  'plmn-id': {
    words: 'PLMN ID (MCC and MNC in 3 octets)',
    layout:
      'MCC and MNC in 3 octets: MCC digits 2 and 1, MNC digit 3 (or "1111" for a 2-digit MNC) and MCC digit 3, then MNC digits 2 and 1 (TS 29.272 table 7.3.9/1, based on TS 24.008 section 10.5.1.13).',
  },
  'plmn-id-prefix': {
    words: 'PLMN ID in the first 3 octets, followed by additional octets',
    layout: 'PLMN ID in the first 3 octets, followed by additional octets (TS 29.272 table 7.3.64/1, Trace-Reference).',
  },
  digits: { words: 'decimal digits as text', layout: 'Decimal digits encoded as text characters.' },
  labels: { words: 'labels separated by dots', layout: 'One or more non-empty labels separated by dots, as text.' },
  apn: { words: 'APN: labels separated by dots, or *', layout: 'Labels separated by dots, or the wildcard "*".' },
  'plmn-domain': {
    words: 'mnc<MNC>.mcc<MCC>.3gppnetwork.org',
    layout: '"mnc<MNC>.mcc<MCC>.3gppnetwork.org" (2- or 3-digit MNC, 3-digit MCC, case-insensitive).',
  },
  'epc-plmn-domain': {
    words: 'epc.mnc<MNC>.mcc<MCC>.3gppnetwork.org',
    layout: '"epc.mnc<MNC>.mcc<MCC>.3gppnetwork.org" (2- or 3-digit MNC, 3-digit MCC, case-insensitive).',
  },
  'ip-address': {
    words: 'IPv4 or IPv6 address',
    layout: 'Diameter Address of family 1 (IPv4, 4 octets) or 2 (IPv6, 16 octets), per RFC 6733 section 4.3.1.',
  },
  'time-zone': {
    words: 'time zone offset from UTC (15-minute units)',
    layout: 'Signed decimal offset from UTC in 15-minute units (for example, "+8").',
  },
  element: {
    layout:
      "An information element of another specification, named by its document, section, and name. The rule's popup and the inspector show what the element is, how far the Wireshark plugin checks it, and the editions its layout was read from.",
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
  bitsOnly: (list: string) => `no bits set except ${list}`,
  /** A `members` rule's words around the names it lists, which a popup links. */
  membersAtLeastOneOf: 'at least one of',
  membersPresent: 'present',
  membersOnly: 'no members present except',
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
  /** An `encoding element` rule: "encoded as TS 24.008 section 10.5.1.13 “PLMN identity”", the document a link. */
  encodedAs: 'encoded as',
  clause: (clause: string) => `section ${clause}`,
  element: (element: string) => `“${element}”`,
  anotherElement: 'an element from another specification',
  /** An encoding the site does not know: "encoded as x-codec". */
  encodedAsCodec: (codec: string) => `encoded as ${codec}`,
  aCodec: 'a codec',
  /** An `exclude` rule: "not 0", "none of 0, 255". */
  not: (value: string) => `not ${value}`,
  noneOf: (values: string) => `none of ${values}`,
  /** A `default` rule: "defaults to FALSE when absent". */
  readAs: (value: string) => `defaults to ${value} when absent`,
  aDefault: 'a default',
  /** A `unique` rule: "unique across APN-Configuration instances". */
  differs: (within: string) => `unique across ${within} instances`,
  groupedAvp: 'grouped AVP',
  /** A `values` rule: "is 1 if Monitoring-Type is 1", "is one of 1, 2 if …". */
  values: (said: string, conditions: string) => `is ${said} if ${conditions}`,
  oneOf: (values: string) => `one of ${values}`,
  /** A rule no checker can run on one message. */
  textOnly: 'cannot be checked on a single message',
};

/**
 * What an `encoding element` rule's element is and how far the Wireshark plugin checks it, as the corpus's element
 * registry says: rows under the rule in the Interpreted section, each a label and its text, and one line under the
 * rule in the ¶ mark's title.
 */
export const elementText = {
  /** [limit] Each row's label, before its colon: what the element is, what is checked, what is not, and where read. */
  is: 'Element',
  checked: 'Checked',
  /** What a fully checked element leaves open, as any value of a field. */
  open: 'Left open',
  /** Why a partly checked or unchecked element is not checked further. */
  unchecked: 'Not checked',
  sources: 'Read from',
  /** How far it is checked, before what is checked: "full layout — 7 octets; …". A `none` has no Checked row. */
  depth: { full: 'full layout', partial: 'partly', length: 'length only', none: 'not checked' } as Record<
    string,
    string
  >,
  checks: (depth: string, check: string) => `${depth} — ${check}`,
  /** A source read: "TS 29.002 V19.1.0 (17.7.8)", the document a link where the corpus holds it; between two. */
  source: (edition: string, clause: string) => ` ${edition} (${clause})`,
  between: ', ',
  /** The ¶ mark's line under the rule: "Checked: full layout", "Not checked". */
  mark: (depth: string) => (depth === 'none' ? '  Not checked' : `  Checked: ${elementDepth(depth)}`),
};

/** How far an element is checked, in plain words; a depth the export adds later is said as it names it. */
export const elementDepth = (depth: string) => elementText.depth[depth] ?? depth;

/** Where a block's rules hold, in the Interpreted section's scope line: "within APN-Configuration", "in DSR". */
export const scopeText = {
  within: (name: string) => `within ${name}`,
  in: (command: string) => `in ${command}`,
  wherever: 'wherever used',
};

/**
 * The ¶ mark's title after a line reading an AVP that interpreted constraints hold for there: a heading saying where
 * the rules were read from, then each in words a line, then what a click does.
 */
export const markText = {
  /** Headings, each followed by a colon. */
  fromClause: (section: string) => `From the prose of section ${section}`,
  fromThisRow: "From this row's description",
  fromMemberRow: (table: string) => `From this member's description in table ${table}`,
  fromRow: (table: string) => `From its row's description in table ${table}`,
  heading: (heading: string) => `${heading}:`,
  /** A rule's line. */
  item: (words: string) => `• ${words}`,
  /** A rule no checker can run, as its quote, cut at a word near 100 characters with … */
  textOnly: (quote: string) => `cannot be checked on a single message: “${quote}”`,
  cut: (quote: string) => `${quote}…`,
  /** Rules of one reading on one line. */
  joined: '; ',
  /** The title's last line. */
  click: 'Click to view each rule, its source quote, and a link to its block.',
};

/** The Interpreted section of a name's popup and the inspector. */
export const constraintsSection = {
  /** Its name, for a screen reader. */
  label: 'Interpreted constraints',
  /** [limit] Its heading, followed by a count. A word. */
  heading: 'Interpreted',
  /** [limit] Its button opening the help at what they are, at the heading's right, and the button's tooltip. */
  about: 'What is this?',
  aboutTitle:
    'Rules extracted manually from specification prose rather than tables or ABNF, each paired with its source quote. Verify against the quote before relying on a rule.',
  /** A text-only rule, in place of its words, and its tooltip. */
  textOnly: 'Cannot be checked on a single message',
  textOnlyTitle:
    'Cannot be checked automatically on a single message (marked text-only in the document view); read the quote directly.',
  /** [limit] A block's place's label, before its colon. */
  readIn: 'From',
};
