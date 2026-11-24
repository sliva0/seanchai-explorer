// The search page's own words. Each entry's comment says where it shows; see site.ts for the marks.

export const searchPage = {
  /** The page's heading, unseen but for a screen reader, the search box's name, and its button. [limit] a word */
  heading: 'Search',
  label: 'Search',
  button: 'Search',
  /** [limit] The box's placeholder: examples of what it finds, about 60 characters. */
  placeholder: '29.214, Callee-Information, CCR, vsai, DIAMETER_SUCCESS, or 505',
  /** Shown under the box until the search data has come. */
  loading: 'Loading search data…',
  /** Shown where nothing matches. */
  none: 'No matches.',
  /** Section headings, each followed by its count. */
  specifications: 'Specifications',
  avps: 'AVPs',
  commands: 'Commands',
  applications: 'Applications',
  registryRows: 'Registry rows',
  elements: 'Information elements',
  mentions: 'Mentions',
  /** A count after a heading, of the matches found by a name's initials or a misspelling: "+3 approximate". */
  approximateMore: (count: number) => `+${count} approximate`,
  /** The same, where all are: and after a result's name, beside it. */
  approximate: 'approximate',
  /** [limit] The button under a section showing the rest of it: a word. */
  more: 'More',
  /** [limit] The button under a result's documents past ten: shows the rest, "+12 more", then folds them again. */
  moreDocuments: (count: number) => `+${count} more`,
  fewer: 'Show fewer',
  /** A result's documents are listed by publisher: the label for a document of none. */
  otherPublisher: 'Other',
  /** A document's line in a result where it spells the name otherwise: "as Session-ID". The name follows. */
  as: 'as',
  /** A document's line where it defines what others re-use. */
  definesIt: 'defined here',
  /** A result's line, before the document most of its documents take the name from: "· defined in TS 29.272". */
  definedIn: 'defined in ',
  /** A result's line: what Wireshark's dictionary calls the name, where it differs. The names follow. */
  wireshark: 'Wireshark:',
  /** A document standing in for an edition cited in a release it is not of: "TS 29.212 V11.19.0, …". */
  acrossReleases: (name: string, version: string, rule: string) => `${name} V${version}, ${rule}`,
  /** A mention's place in its document, where no clause holds it: "line 12". */
  line: (line: number) => `line ${line}`,
};

/** What a result says of what it is found as, on its line and in its tooltips. */
export const identityWords = {
  /** "Application 16777251", in a tooltip. */
  application: (id: number | string) => `Application ${id}`,
  /** "application 16777251", on a result's line. */
  applicationFact: (id: number | string) => `application ${id}`,
  /** "application 16777251 (S6a/S6d)". */
  applicationNamed: (id: string, name: string) => `${id} (${name})`,
  /** "Command 316 · application 16777251 (S6a/S6d) · header none", in a tooltip. */
  command: (code: number | string) => `Command ${code}`,
  commandFact: (code: number | string) => `command ${code}`,
  commandApplication: (id: number | string) => ` · application ${id}`,
  commandApplicationName: (name: string) => ` (${name})`,
  /** The Application-ID a command's header prints, where documents disagree on it; "none" where it prints none. */
  header: (id: number | string) => `header Application-ID ${id}`,
  headerTitle: (id: number | string) => ` · header Application-ID ${id}`,
  none: 'none',
  /** "Result code 5001 of Experimental-Result-Code", the kind's row word first. */
  value: (row: string, value: number | string, avp: string) => `${row} ${value} of ${avp}`,
  /** After it: the Feature-List-ID, "list 1", and the application, "(S6a/S6d)". */
  valueList: (id: number) => ` list ${id}`,
  valueListFact: (id: number) => `list ${id}`,
  valueApplication: (application: string) => ` (${application})`,
  /** An information element's command: "in ULR", or where its table names none. */
  elementOf: (command: string) => `in ${command}`,
  elementOfNone: 'no command',
  /** The same, in a tooltip. */
  elementNoCommand: 'no command',
  /** What an information element maps to: "AVP User-Name", "AVPs Result-Code, Experimental-Result". */
  elementAvps: (count: number, names: string) => `${count > 1 ? 'AVPs' : 'AVP'} ${names}`,
};
