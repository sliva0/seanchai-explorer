// A document's page: the document toolbar over its text, the buttons walking the jump list, what a name's tooltip says a click
// does, a corrected line's notes and the marks after a line. Each entry's comment says where it shows; see site.ts
// for the marks.

/** The document toolbar over a document's text. */
export const strip = {
  /** [limit] The three toggles opening a panel under the toolbar, each followed by its count. A word each. */
  findings: 'Findings',
  holes: 'Holes',
  sections: 'Sections',
  /** The toolbar's crumb, the section in view, as its tooltip: `title` is "5.2.1.1 · Message ULR". */
  showInSections: (title: string) => `${title}: show in Sections`,
  /** A section's page in the Sections list, and the source pane's header: "p. 18". [limit] short */
  page: (page: number) => `p. ${page}`,
  /** [limit] The link to the other text of the document: the text as the extractor read it, or as corrected. */
  raw: 'Raw',
  corrected: 'Corrected',
  /** [limit] The box showing and hiding the Interpreted Constraints blocks, and its tooltip. */
  interpreted: 'Interpreted ',
  interpretedTitle:
    'Show or hide Interpreted Constraints blocks (rules extracted from specification prose rather than tables or ABNF). Saved across documents.',
  /** [limit] In a narrow window, the button folding the click options below. */
  clickOptions: 'Click options',
  /** [limit] The box making a plain click list a name's uses, and its tooltip. */
  clickShowsUses: 'Click shows uses ',
  clickShowsUsesTitle: 'When enabled, clicking a name opens its popup (same as right-click) instead of navigating.',
  /** [limit] The choice of where a click on a name goes first, its tooltip and its two options. */
  clickGoesTo: 'Click goes to',
  clickGoesToTitle:
    "Choose whether click and Alt-click open a name's definition or details when both exist; right-click always offers both.",
  definition: 'Definition',
  details: 'Details',
  /**
   * [limit] The box showing and hiding the source pane, a word: where it shows the source document, and where it is the
   * inspector, showing what a name is instead.
   */
  source: 'Source ',
  inspector: 'Inspector ',
  /** The text's name for a screen reader. */
  documentText: 'Document view',
  /** A raw line's tooltip, where the corrected text changes it. */
  modified: 'Modified in corrected view',
  /**
   * The tooltip of a `;; interpreted` note, which opens no record, the block under it printing its clause and quotes:
   * what it cites, the file of interpreted-constraint blocks and the block's id, "(TS29.329.dadx#call-reference-number-element)".
   */
  noteCites: (citation: string) => `Written in ${citation}`,
};

/** The four buttons left of a document's title walking the jump list. Their glyphs, ‹ › « », are not words. */
export const jumps = {
  /** The group's name for a screen reader. */
  group: 'Jump history',
  /** A button's tooltip: "Back to TS 29.153 line 113 (Ctrl+O)", `place` from the jump list's names. */
  to: (way: string, place: string, key: string) => `${way} to ${place} (${key})`,
  /** Its tooltip where it has nowhere to go: "No earlier position (Ctrl+O)". */
  end: (end: string, key: string) => `${end} (${key})`,
  back: 'Back',
  forward: 'Forward',
  noEarlierPosition: 'No earlier position',
  noLaterPosition: 'No later position',
  noEarlierDocument: 'No earlier document',
  noLaterDocument: 'No later document',
};

/**
 * A name's tooltip in the text, saying what a click, an alt-click and a right-click do as things stand: "Click: details
 * in source pane · Alt-click: details in both panes · Right-click: uses". The pieces are joined by " · ".
 */
export const clickWords = {
  click: (does: string) => `Click: ${does}`,
  altClick: (does: string) => `Alt-click: ${does}`,
  rightClick: (does: string) => `Right-click: ${does}`,
  /** Where a plain click lists uses too. */
  clickOrRightClick: (does: string) => `Click or right-click: ${does}`,
  /** What a right-click shows: of a value's name, of a command's, of an AVP's. */
  valuePopup: 'row details',
  commandPopup: 'definitions',
  avpPopup: 'uses',
  /** What a click does. `place` is "definition", "details" or what else the place is of. */
  showInPane: 'inspect in source pane',
  sourceRowInPane: 'source row in source pane',
  findInPane: 'find in source pane',
  inPane: (place: string) => `${place} in source pane`,
  sourceRow: 'source row',
  inBoth: (place: string) => `${place} in both panes`,
  goToRow: 'go to row',
  goTo: (place: string) => `go to ${place}`,
  sourceInNewTab: 'source in new tab',
  /** The place where it has no other name. */
  definition: 'definition',
  /** On a value an interpreted rule names that another document defines: "Value of Monitoring-Type, row in TS 29.336". */
  valueElsewhere: (avp: string, document: string) => `Value of ${avp}, row in ${document}`,
};

/** What the marks after a line say, in their tooltips. */
export const markWords = {
  /**
   * A member's category in its command's table, the row's document, where it is another, and table, and the row's name
   * where it has one: "C, conditional, in TS 29.328 table 6.1.3.1: Service Indication (See 7.4)".
   */
  category: (category: string, words: string, where: string, name: string | null) =>
    `${category}, ${words}, in ${where}${name ? `: ${name}` : ''}`,
  /** A row printing no category. */
  noCategory: (where: string, name: string | null) => `No category in ${where}${name ? `: ${name}` : ''}`,
  /** The last line of a category's title: what a click on it does. */
  categoryClick: 'Click to see the row stating it',
  /** A category its brackets contradict, after the category's line; the linter's rule closes it. */
  bracketsRequire: (member: string, where: string, category: string) =>
    `ABNF brackets mark ${member} as required, but ${where} lists it as ${category} (element-required-in-abnf)`,
  bracketsOptional: (member: string, where: string) =>
    `ABNF brackets mark ${member} as optional, but ${where} lists it as M, mandatory (element-optional-in-abnf)`,
  /** A member a TS 32.299 table marks not used, a dash, which the command's ABNF still holds. */
  unusedInAbnf: (member: string, where: string) =>
    `The ABNF holds ${member}, but ${where} marks it not used (element-unused-in-abnf)`,
};
