// The popups a name opens over the document view, and the inspector, which draws them in the source pane: an AVP's, a
// command's and a value's, and what they share. Each entry's comment says where it shows; see site.ts for the marks.
// The interpreted constraints' section is in rules.ts.

/** What every popup has. */
export const popupShared = {
  /** The × button's name for a screen reader, on a popup and on the help. */
  close: 'Close',
  /** [limit] A place's two buttons, and their tooltips: the first as it moves the document view alone or the pane too. */
  jumpTo: 'Jump to',
  jumpToBoth: 'Jump here in both the document view and the source pane',
  jumpToText: 'Jump here in the document view',
  showOnTheRight: 'Show in source',
  showOnTheRightTitle: 'Show in the source pane only (opens it if hidden)',
  /** A place's label, before its colon: "Definition: 7.3.2". */
  placeLabel: (label: string) => `${label}:`,
  /** [limit] The buttons stepping through a name's uses: a word each. */
  previous: 'Previous',
  next: 'Next',
  /** A rule's contents, each member's line after its brackets: "required, exactly once · bold · category M". */
  anyOtherAvp: 'any other AVP',
  bold: 'bold',
  struckThrough: 'struck through',
  /** `categories` its letters, M or M/O; TS 32.299's dash, not used, said so. */
  category: (categories: string) =>
    `category ${categories
      .split('/')
      .map(category => (category === '-' ? 'not used' : category))
      .join('/')}`,
  /** A notice where a document a popup or the inspector needs fails to load: `label` is its name. */
  loadFailed: (label: string) => `Could not load referenced document ${label}`,
};

/** A member's presence and count, as its brackets and qualifier say: "Optional [ ] · may be present, in any position · any number of times". */
export const presenceWords = {
  fixed: { label: 'Fixed', meaning: 'must be present at this position' },
  required: { label: 'Required', meaning: 'must be present, in any position' },
  optional: { label: 'Optional', meaning: 'may be present, in any position' },
  /** A fixed member a qualifier lets be absent. */
  fixedOptional: 'may be present at this position',
};

/** How often a member may occur. */
export const countWords = {
  anyNumber: 'any number of times',
  onceOrMore: 'once or more',
  orMore: (min: number) => `${min} or more times`,
  exactlyOnce: 'exactly once',
  exactly: (count: number) => `exactly ${count} times`,
  atMostOnce: 'at most once',
  atMost: (max: number) => `at most ${max} times`,
  between: (min: number, max: number) => `${min} to ${max} times`,
};

/** An AVP's flag rules, in its popup's small table and what its "?" opens. */
export const flagText = {
  /** [limit] The table's column headings, over a letter or two each. */
  headings: { must: 'Must', may: 'May', 'should not': 'Should not', 'must not': 'Must not' },
  /** A cell's tooltip: "M must be set. Mandatory: …". */
  words: { must: 'must be set', may: 'may be set', 'should not': 'should not be set', 'must not': 'must not be set' },
  cell: (bit: string, words: string, meaning: string) => `${bit} ${words}. ${meaning}`,
  /** What each bit means, in a cell's tooltip and the "?"'s list. */
  meaning: {
    M: 'Mandatory: if set, a receiver that does not support the AVP must reject the message; if clear, it may ignore the AVP.',
    V: 'Vendor-Specific: if set, the AVP header includes a Vendor-ID and the code is vendor-defined; if clear, the code is IETF-defined.',
  },
  /** The "?"'s list, of what the popup leaves out. */
  protectedBit: 'Protected (not shown): reserved for end-to-end security, which RFC 6733 deprecated; leave clear.',
  encrypt: 'Not shown: whether the AVP may be encrypted for RFC 3588 end-to-end security (deprecated in RFC 6733).',
  /** The "?" button's tooltip and name. [limit] the button shows "?" */
  key: 'What these mean',
  /** A value the rows give differently, with the table each is from: "must be set (AVP Table 7.3.1/1)". */
  each: (text: string, table: string) => `${text} (${table})`,
};

/** What a table's other columns mean, in their tooltips and the "?"'s list, by the column's name. */
export const columnNotes: Record<string, string> = {
  From: 'Specification that defines this reused AVP.',
  'Defined-In': 'Specification that defines this AVP.',
  'Acc-Type': 'Access types this AVP applies to (see table notes).',
  Applicability: 'Features or cases this AVP applies to (see table notes).',
  'Reference-Points': 'Reference points where this AVP is used.',
};

/** A cell the table leaves blank. */
export const blankCell = '(blank)';

/** An AVP's popup. */
export const avpPopup = {
  /** Its first line: "Code 1405 · Vendor-ID 10415 · Unsigned32". */
  code: (code: number) => `Code ${code}`,
  vendor: (vendor: number) => `Vendor-ID ${vendor}`,
  /** What the line opened on is, after "Here: ": a member, "in command ULR · 5.2.1.1", or the rule it heads. */
  inRule: (rule: string, section: string) => `Here: in ${rule}${section ? ` · ${section}` : ''}`,
  ruleOf: (rule: string, section: string) => `Here: rule for ${rule}${section ? ` · ${section}` : ''}`,
  /** A rule's kind and name: "command ULR", "Grouped AVP Subscription-Data". */
  command: 'command',
  ruleName: (kind: string, label: string) => `${kind} ${label}`,
  /** Under a member's line. */
  bold: 'Bold in source: defined or modified in this document',
  struckLeftOut: 'Struck through in source (omitted from rule)',
  struck: 'Struck through in source',
  /** A line of an Interpreted Constraints block, after "Here: ": `on` the AVP the block is on, `scope` its scope. */
  here: (what: string, section: string) => `Here: ${what} · ${section}`,
  constraintSubject: (scope: string) => `subject of interpreted constraints${scope}`,
  constraintScope: (on: string) => `scope of interpreted constraints on ${on}`,
  constraintMember: (on: string, scope: string) => `member referenced in an interpreted rule on ${on}${scope}`,
  constraintCondition: (on: string, scope: string) => `condition AVP in an interpreted rule on ${on}${scope}`,
  /** The scope after it: " · within APN-Configuration", " · in ULR". */
  within: (name: string) => ` · within ${name}`,
  in: (name: string) => ` · in ${name}`,
  /** A row of an Information Elements table: "Here: an element of ULR · table 5.2.1.1.1/1 · 5.2.1.1.1". */
  elementOf: (command: string) => `element of ${command}`,
  element: 'element',
  hereElement: (of: string) => `Here: an ${of} · `,
  /** Where the table has no number. */
  informationElements: 'Information Elements',
  /** A row of an AVP table: "Here: a row of AVP Table 7.3.1/1". */
  hereRow: (type: string) => `Here: a row of ${type} `,
  /** After a table's name, for the row of a table that applies where the name is read. */
  appliesHere: ' · applies here',
  /** An application a table's commands are of, where none is named. */
  applicationId: (id: number) => `Application-ID ${id}`,
  /** What an Information Elements row says of a member: "Element: SGSN number (See 7.3.102) · C, conditional". */
  elementLine: (text: string) => `Element: ${text}`,
  /** Where a row's member is not found. */
  noCommand: 'This table does not specify a command',
  noRule: (command: string) => `No unique rule for ${command} matches this table`,
  notMember: (command: string) => `Not a member of the ${command} rule`,
  /** A row set off under grouped AVP rows, TS 32.299's: the AVPs it is under, outermost first, joined by `parentsBetween`. */
  setOffUnder: (parents: string) => `A member of ${parents}`,
  parentsBetween: ' › ',
  /**
   * [limit] Labels of a place, before its colon. A word or two. Every place an AVP is declared at: its Definition, the
   * row giving it its code, in the document defining it for an AVP another document reuses; Reused, this document's
   * row of a Reused AVPs table listing it as another's; Rule, its Grouped AVP rule here; and its Details.
   */
  definition: 'Definition',
  reused: 'Reused',
  rule: 'Rule',
  details: 'Details',
  /** A Definition in a document the build does not hold: `reference` as the row prints it, "TS 29.999". */
  notHeld: (reference: string) => `${reference}, which this build does not hold`,
  /** The row opened on, in one line, after its flags in words: "M must not be set". */
  flagLine: (bits: string, rule: string) => `${bits} ${rule}`,
  elementPlace: 'Element',
  member: 'Member',
  /** The row of the grouped AVP a row is set off under, in its table. */
  underRow: 'Under',
  /** An Enumerated AVP's values, as a place, where no value table holds them. */
  enumerated: 'Enumerated',
  /** [limit] The toggles over a Grouped AVP's members, and over its uses, each with a count. */
  contents: 'Contents',
  uses: 'Uses',
  /** The value tables' group, for a screen reader. */
  valueTables: 'Value tables',
  /** [limit] Between Previous and Next: which of the document's uses the popup is at, "Use 3/14". */
  useCount: (at: number, of: number) => `Use ${at}/${of}`,
};

/** A command's popup. */
export const commandPopup = {
  /** Its first line: "Code 316 · Request · PXY". */
  code: (code: number) => `Code ${code}`,
  request: 'Request',
  answer: 'Answer',
  /** Its second line: "Application-ID 16777251 · S6a/S6d", and where the header prints none, where the id is from. */
  applicationId: (id: number | string) => `Application-ID ${id}`,
  noApplicationId: 'No Application-ID in command header',
  idFrom: (section: string) => `from section ${section} (not in header)`,
  /** What tells another definition from this one: its code, its application, or none. */
  otherCode: (code: number) => `code ${code}`,
  otherApplication: (id: number, name: string) => `Application-ID ${id}${name ? ` ${name}` : ''}`,
  noOtherApplication: 'no Application-ID',
  /** [limit] Labels of a place and groups of places, before a colon or a count. A word or two each. */
  definition: 'Definition',
  tables: 'Tables',
  avpTable: 'AVP table',
  informationElements: 'Information elements',
  elements: 'Elements',
  registry: 'Registry',
  otherDefinitions: 'Other definitions',
  /** [limit] A place: a table of the result codes the procedure's answer may carry, a Command Result Codes block. */
  resultCodes: 'Result codes',
  sameName: 'Same name, other command',
  definitions: 'Definitions',
  /** The toggle over its members. */
  avps: 'AVPs',
};

/** A value's popup, of one row of a value table. */
export const valuePopup = {
  /** Its first line: "Result code 5001 of Experimental-Result-Code", the AVP a link. */
  of: (row: string, value: number | string) => `${row} ${value} of `,
  /** [limit] A place's label. */
  definedIn: 'Defined in',
  /** Where the corpus does not hold the document defining it: "Defined in TS29.229". */
  definedInReference: (reference: string) => `Defined in ${reference}`,
  /** After the AVP: its table's Feature-List-ID, " · list 1". */
  list: (id: number) => ` · list ${id}`,
  /** Before the row's section and page, a link to the source document. */
  source: 'Source: ',
  /**
   * A code a Command Result Codes block lists for an answer, after the AVP: " · listed for PPA"; a code the export
   * found no number for; and while the documents that may define it load.
   */
  listedFor: (command: string) => ` · listed for ${command}`,
  noNumber: 'Result code, its number not found in the corpus',
  finding: 'Looking for the document defining it…',
};
