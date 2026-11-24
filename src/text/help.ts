// The help dialog's own words; the list of controls it shows is controls.ts, and what each kind of rule says and each
// codec is are in rules.ts. Each entry's comment says where it shows; see site.ts for the marks.

export const helpText = {
  /** The dialog's heading, the "?" button's name for a screen reader, and its tooltip. [limit] the button shows "?" */
  title: 'Mouse and keyboard',
  toggleTitle: 'Mouse and keyboard (?)',
  /** Between two keys doing the same, for a screen reader only: the keys stand apart on screen. */
  or: ' or ',
  /** The section on interpreted constraints: its heading, the paragraph before the list of rule kinds, the line before the
   * list of codecs, and the paragraph after it. */
  constraints: 'Interpreted constraints',
  constraintsIntro:
    "What a clause's prose says of an AVP's value or presence, as a reader read it, pinned to the sentences quoted: no document prints it as structure. Its blocks read as the rest of the corrected text, with a thin rule left of their lines and an \";; interpreted\" note opening the declaration's record; \"Interpreted\" in the strip hides and shows them for every document. A line reading an AVP they hold for has a ¶ after it, a paragraph's mark: read from prose. Its title says where from, the description of a table's row or a clause's text, and each rule in words, and a click on it, or Enter on it, opens the name's popup or the inspector at them, as does the name's own: each rule in words, as the text prints it, and its quote, a rule no checker can run on one message said so. Trust a rule as far as its quote. A rule is one of these kinds:",
  codecs: 'An encoding names one of these layouts:',
  constraintsChecked:
    "A rule stands after the sentences it was read from, word for word, and the corpus is built only while the document still prints them. The Wireshark plugin checks the rules on each message, a rule broken a note under seanchai.interpreted, not a warning: lengths, ranges, excluded values, encodings but another document's element, bits, members, unique and values rules and the presence conditions; a text-only rule it cannot check, and a default breaks nothing.",
};
