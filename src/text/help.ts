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
   * before the list of rule kinds, the paragraph after it on conditions, and the line before the list of codecs.
   */
  constraints: 'Interpreted constraints',
  constraintsIntro:
    'Interpreted constraints capture AVP value and presence rules stated only in specification prose, not in tables or ABNF. Each rule is extracted manually and paired with the exact sentences quoted from the specification—always verify a rule against its quote. Corpus builds fail if a specification changes and no longer contains the quoted text.',
  constraintsShown:
    'In the corrected view, Interpreted Constraints blocks appear with a left border and a ";; interpreted" note citing the .dadx file of interpreted-constraint blocks they are written in; toggle "Interpreted" in the document toolbar to show or hide them across all documents. Lines referencing a constrained AVP show a ¶ mark: hover to preview the rules, or click it (or press Enter) to open the rules and quotes in the popup or inspector. The Wireshark plugin checks every rule kind on each message except "text-only" (not machine-checkable) and "default" (informational only), an "encoding element" rule only as far as the document defining the element allows, and reports a broken rule as a note under seanchai.interpreted. A rule reading the request an answer answers is checked only when the capture holds that request.',
  ruleKinds: 'Rule kinds:',
  /** After the list of rule kinds: how a predicate's or a values rule's conditions are written. */
  conditions:
    'A condition names a sibling AVP, or a member of a grouped AVP as Grouped-AVP/Member; in a block on an answer, request/Name is a member of the request it answers. "and" binds tighter than "or", and "not" negates one condition. A value is a number or a name its table gives, quoted where it is digits only ("16") or holds other characters ("H(E)NB_LOCAL_IP_ADDRESS_CHANGE"); a name links to its row where the document lists it.',
  codecs: 'Encoding rules use one of these codecs:',
};
