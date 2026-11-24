// The Wireshark plugin's page. Each entry's comment says where it shows; see site.ts for the marks. The commands and
// folder paths it shows are not words to rewrite, but the shells' and systems' names are.

export const wiresharkPage = {
  /** The page's heading. Beside it, the versions the plugin was made from. */
  heading: 'Wireshark plugin',
  /** The first paragraph: what the plugin does. */
  about:
    "Checks every Diameter message in a capture against the corpus: its AVPs, their flags, lengths and values, and what its command requires and allows. Each finding cites the clause, table and page of its rule, with links to the publisher's copy and to this site.",
  /**
   * The second paragraph, around the form of a finding's line, which follows this in code type, its words standing for
   * what the plugin writes there; then an example of one, which is not words.
   */
  findingLine: 'Each finding is one line under the message, on the octets it is about, in the form ',
  findingForm: 'Severity: place: problem [source]',
  findingExample: ', as:',
  /** The findings table: its name for a screen reader and its headings. */
  findings: 'Findings',
  severity: 'Severity',
  expertInfo: 'Expert info',
  messages: 'Messages with one',
  reports: 'Reports',
  /** Each row of the table, beside the expert info field and the filter for messages, which are not words. */
  rows: [
    { severity: 'Error', reports: 'a rule a document states, broken' },
    { severity: 'Warning', reports: 'a "should not" broken, or a value no document defines' },
    {
      severity: 'Note',
      reports: 'what the corpus cannot complete, or an AVP or command no document defines, its M bit clear',
    },
    { severity: 'Note', reports: 'an interpreted constraint broken, the source ending in interpreted' },
  ],
  /** Under the table, around `seanchai.notes`, which follows this. */
  notesCount: 'The interpreted notes count among ',
  /** Then, around the tshark command, which follows this; a full stop closes it. */
  runs: '. It runs in Wireshark 4.2 and later, and in tshark: ',
  /** The install section's name, for a screen reader. */
  install: 'Install',
  /** Where the build has no plugin. [unlinked] */
  missing: 'Not in this build.',
  /** The heading over the install commands. */
  terminal: 'Install from a terminal (Linux and macOS)',
  /** The choice of shell, for a screen reader, and its options. [limit] short */
  shell: 'Shell',
  posixShells: 'bash / zsh / sh',
  fishShell: 'fish',
  /** [limit] The copy button, a word, and its name for a screen reader. */
  copy: 'Copy',
  copied: 'Copied',
  copyLabel: 'Copy the commands',
  /** Beside the button, where the browser let the commands be selected but not copied. */
  selected: 'Selected: press Ctrl+C',
  /** The heading over the download, where the terminal's commands are there too, and where they cannot be written. */
  byHandAnySystem: 'Install by hand (any system)',
  byHand: 'Install by hand',
  /** [limit] The download button: `file` is "seanchai_diameter.lua". */
  download: (file: string) => `Download ${file}`,
  /** Beside the download button, as it goes. */
  fetching: 'Fetching…',
  saved: 'Saved',
  failed: 'Failed',
  /** Where the plugin's links could not be set to this site: `reason` is one of the reasons below. */
  savedAsBuilt: (reason: string) =>
    `Saved as built, since ${reason}: its links keep the address it was generated with.`,
  badAddress: 'the address holds a quote, a backslash or a control character',
  explorerLines: (count: number) => `it has ${count} explorer lines`,
  noExplorerLine: 'it has no explorer line',
  /** A notice where the download fails, with a Retry. */
  fetchFailed: 'Could not fetch the Wireshark plugin',
  /** The table of where to put the file: its headings and its systems' names. */
  system: 'System',
  folder: 'Folder',
  linuxMac: 'Linux and macOS',
  windows: 'Windows',
  /** Under it all. */
  restart: 'Then restart Wireshark, or press Ctrl+Shift+L.',
};

/**
 * Where the build has no plugin, followed by the command generating it, which names the project's package. [linked]
 * Apart, so that a SEANCHAI_UNLINKED=1 build, which leaves it unused, ships none of it.
 */
export const missingGenerate = 'Not in this build. Generate it with:';
