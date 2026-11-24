// The help dialog's own words; the list of controls it shows is controls.ts, and what each kind of rule says and each
// codec is are in rules.ts. Each entry's comment says where it shows; see site.ts for the marks.

export const helpText = {
  /** The dialog's heading, the "?" button's name for a screen reader, and its tooltip. [limit] the button shows "?" */
  title: 'Help',
  toggleTitle: 'Help (?)',
  /** Between two keys doing the same, for a screen reader only: the keys stand apart on screen. */
  or: ' or ',
  /**
   * The section on interpreted constraints, after the lists of controls: its heading, two paragraphs, what they are and
   * how far to trust them, then how the site shows them and what the Wireshark plugin checks of them; then the line
   * before the list of rule kinds, and the line before the list of codecs.
   */
  constraints: 'Interpreted constraints',
  constraintsIntro:
    'Interpreted constraints capture AVP value and presence rules stated only in specification prose, not in tables or ABNF. Each rule is extracted manually and paired with the exact sentences quoted from the specification—always verify a rule against its quote. Corpus builds fail if a specification changes and no longer contains the quoted text.',
  constraintsShown:
    'In the corrected view, Interpreted Constraints blocks appear with a left border and a ";; interpreted" note; toggle "Interpreted" in the document toolbar to show or hide them across all documents. Lines referencing a constrained AVP show a ¶ mark: hover to preview the rules, or click it (or press Enter) to open the rules and quotes in the popup or inspector. The Wireshark plugin checks every rule kind on each message except "encoding element" (checked only by any accompanying length rule), "text-only" (not machine-checkable) and "default" (informational only), and reports a broken rule as a note under seanchai.interpreted.',
  ruleKinds: 'Rule kinds:',
  codecs: 'Encoding rules use one of these codecs:',
};
