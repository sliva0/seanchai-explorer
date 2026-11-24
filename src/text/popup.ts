// The popups a name opens over the text, and the inspector, which draws them in the source pane: an AVP's, a
// command's and a value's, and what they share. Each entry's comment says where it shows; see site.ts for the marks.
// The interpreted constraints' section is in rules.ts.

/** What every popup has. */
export const popupShared = {
  /** The × button's name for a screen reader, on a popup and on the help. */
  close: 'Close',
  /** [limit] A place's two buttons, and their tooltips: the first as it moves the text alone or the pane too. */
  jumpTo: 'Jump to',
  jumpToBoth: 'Moves the text on the left and the source pane on the right',
  jumpToText: 'Moves the text to this place',
  showOnTheRight: 'Show on the right',
  showOnTheRightTitle: 'Moves only the source pane on the right, and opens it if it is hidden',
  /** A place's label, before its colon: "Definition: 7.3.2". */
  placeLabel: (label: string) => `${label}:`,
  /** [limit] The buttons stepping through a name's uses: a word each. */
  previous: 'Previous',
  next: 'Next',
  /** A rule's contents, each member's line after its brackets: "required, exactly once · bold · category M". */
  anyOtherAvp: 'any other AVP',
  bold: 'bold',
  struckThrough: 'struck through',
  category: (categories: string) => `category ${categories}`,
  /** A notice where a document a popup needs fails to load: `label` is its name. */
  loadFailed: (label: string) => `Could not load ${label} for the popup`,
};

/** A member's presence and count, as its brackets and qualifier say: "Optional [ ] · may be present, in any position · any number of times". */
export const presenceWords = {
  fixed: { label: 'Fixed', meaning: 'must be present, at this position in the order' },
  required: { label: 'Required', meaning: 'must be present, in any position' },
  optional: { label: 'Optional', meaning: 'may be present, in any position' },
  /** A fixed member a qualifier lets be absent. */
  fixedOptional: 'may be present, at this position in the order',
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
    M: 'Mandatory: set, a receiver that does not support the AVP must reject the message; clear, it may skip the AVP.',
    V: "Vendor-Specific: set, the header carries a Vendor-ID and the code is that vendor's; clear, the code is IETF's.",
  },
  /** The "?"'s list, of what the popup leaves out. */
  protectedBit:
    'Protected, not shown: it was for end-to-end security, which RFC 6733 dropped; it says to leave the bit clear.',
  encrypt: 'Not shown: whether the AVP may be encrypted with RFC 3588 end-to-end security, which RFC 6733 dropped.',
  /** The "?" button's tooltip and name. [limit] the button shows "?" */
  key: 'What these mean',
  /** A value the rows give differently, with the table each is from: "must be set (AVP Table 7.3.1/1)". */
  each: (text: string, table: string) => `${text} (${table})`,
};

/** What a table's other columns mean, in their tooltips and the "?"'s list, by the column's name. */
export const columnNotes: Record<string, string> = {
  From: 'The specification that defines the AVP, which this one re-uses.',
  'Defined-In': 'The specification that defines the AVP.',
  'Acc-Type': "The access types the AVP applies to, as the table's notes say.",
  Applicability: "The features or cases the AVP applies to, as the table's notes say.",
  'Reference-Points': 'The reference points the AVP is used on.',
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
  ruleOf: (rule: string, section: string) => `Here: the rule of ${rule}${section ? ` · ${section}` : ''}`,
  /** A rule's kind and name: "command ULR", "Grouped AVP Subscription-Data". */
  command: 'command',
  ruleName: (kind: string, label: string) => `${kind} ${label}`,
  /** Under a member's line. */
  bold: 'Bold in the source: the document defines or modifies it here',
  struckLeftOut: 'Struck through in the source, and left out of the rule',
  struck: 'Struck through in the source',
  /** A line of an Interpreted Constraints block, after "Here: ": `on` the AVP the block is on, `scope` its scope. */
  here: (what: string, section: string) => `Here: ${what} · ${section}`,
  constraintSubject: (scope: string) => `the AVP of interpreted constraints${scope}`,
  constraintScope: (on: string) => `the grouped AVP interpreted constraints on ${on} hold within`,
  constraintMember: (on: string, scope: string) => `a member an interpreted rule on ${on} names${scope}`,
  constraintCondition: (on: string, scope: string) => `a condition of an interpreted rule on ${on}${scope}`,
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
  noCommand: 'The table names no command',
  noRule: (command: string) => `No one rule of ${command} found for the table`,
  notMember: (command: string) => `Not a member of ${command}'s rule`,
  /** [limit] Labels of a place, before its colon. A word or two. */
  definition: 'Definition',
  details: 'Details',
  elementPlace: 'Element',
  member: 'Member',
  /** An Enumerated AVP's values, as a place, where no value table holds them. */
  enumerated: 'Enumerated',
  /** [limit] The toggles over a Grouped AVP's members, and over its uses, each with a count. */
  contents: 'Contents',
  uses: 'Uses',
  /** The value tables' group, for a screen reader. */
  valueTables: 'Value tables',
  /** [limit] Between Previous and Next: which of the document's uses the popup is at, "file 3/14". */
  useCount: (at: number, of: number) => `.dad ${at}/${of}`,
};

/** A command's popup. */
export const commandPopup = {
  /** Its first line: "Code 316 · Request · PXY". */
  code: (code: number) => `Code ${code}`,
  request: 'Request',
  answer: 'Answer',
  /** Its second line: "Application-ID 16777251 · S6a/S6d", and where the header prints none, where the id is from. */
  applicationId: (id: number | string) => `Application-ID ${id}`,
  noApplicationId: 'No Application-ID: the header prints none',
  idFrom: (section: string) => `from ${section}, not the header`,
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
  /** Before the row's clause and page, a link to the source. */
  source: 'Source: ',
};
