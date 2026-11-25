// The Wireshark plugin's page. Each entry's comment says where it shows; see site.ts for the marks. The commands and
// folder paths it shows are not words to rewrite, but the shells' and systems' names are.

export const wiresharkPage = {
  /** The page's heading. Beside it, the versions the plugin was made from. */
  heading: 'Wireshark plugin',
  /** The first paragraph: what the plugin does. */
  about:
    "Validates every Diameter message in a capture against the corpus: AVPs, flags, lengths, values, and command requirements. Each finding cites the relevant section, table, and page, with links to the publisher's copy and to this site.",
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
  /** Each row of the table, by its expert info field, beside it and the filter for messages, which are not words. */
  rows: {
    violation: { severity: 'Error', reports: 'Violated specification rules.' },
    warning: { severity: 'Warning', reports: '"Should not" rules broken, or undefined values.' },
    note: { severity: 'Note', reports: 'Incomplete corpus data, or an unknown AVP or command without the M bit.' },
    interpreted: {
      severity: 'Note',
      reports:
        'Violated interpreted constraints; the source ends in "interpreted". Rules on the request an answer answers are checked only when the capture holds the request.',
    },
  },
  /** Under the table, around `seanchai.notes`, which follows this. */
  notesCount: 'Interpreted notes are counted in ',
  /** Then, around `seanchai.request_missing`, which follows this. */
  requestMissing: ', and the rules an answer leaves unchecked without its request in ',
  /** Then, around the tshark command, which follows this; a full stop closes it. */
  runs: '. Requires Wireshark 4.2 or later, and also works with tshark: ',
  /** The install section's name, for a screen reader. */
  install: 'Install',
  /** Where the build has no plugin. [unlinked] */
  missing: 'The Wireshark plugin is not included in this build.',
  /**
   * Over the install commands and the download, where the plugin was built to link to another site than the one
   * showing the page, `address`, to none, or, in a build naming nothing of the project, to a site not its own, which
   * it does not name: why they set this site's address in it.
   */
  otherSite: (address: string) =>
    `The plugin was built to link to ${address}, not this site, so the commands and the download below set this site's address in it.`,
  noSite:
    "The plugin was built to link to no site, so the commands and the download below set this site's address in it.",
  anotherSite:
    "The plugin was built to link to another site, so the commands and the download below set this site's address in it.",
  /** The heading over the install commands. */
  terminal: 'Install from a terminal (Linux and macOS)',
  /** The choice of shell, for a screen reader, and its options. [limit] short */
  shell: 'Shell',
  posixShells: 'bash / zsh / sh',
  fishShell: 'fish',
  /**
   * [limit] The copy button, a word, and its name for a screen reader: beside the commands, or beside the one command
   * where the plugin links to this site already.
   */
  copy: 'Copy',
  copied: 'Copied',
  copyLabel: 'Copy commands',
  copyCommandLabel: 'Copy command',
  /** Beside the button, where the browser let the commands be selected but not copied. */
  selected: 'Selected — press Ctrl+C to copy',
  /** The heading over the download, where the terminal's commands are there too, and where they cannot be written. */
  byHandAnySystem: 'Manual install (any system)',
  byHand: 'Manual install',
  /** [limit] The download button: `file` is "seanchai_diameter.lua". */
  download: (file: string) => `Download ${file}`,
  /** Beside the download button, as it goes. */
  fetching: 'Downloading…',
  saved: 'Saved',
  failed: 'Download failed',
  /** Where the plugin's links could not be set to this site: `reason` is one of the reasons below. */
  savedAsBuilt: (reason: string) => `Saved with original links (could not update site URL: ${reason}).`,
  badAddress: 'the site URL contains quotes, backslashes, or control characters',
  explorerLines: (count: number) => `found ${count} explorer URL markers instead of 1`,
  noExplorerLine: 'no explorer URL marker found in plugin file',
  /** A notice where the download fails, with a Retry. */
  fetchFailed: 'Could not download the Wireshark plugin',
  /** The table of where to put the file: its headings and its systems' names. */
  system: 'System',
  folder: 'Folder',
  linuxMac: 'Linux and macOS',
  windows: 'Windows',
  /** Under it all. */
  restart: 'Restart Wireshark, or press Ctrl+Shift+L to reload Lua plugins.',
};

/**
 * Where the build has no plugin, followed by the command generating it, which names the project's package. [linked]
 * Apart, so that a SEANCHAI_UNLINKED=1 build, which leaves it unused, ships none of it.
 */
export const missingGenerate = 'The Wireshark plugin is not included in this build. Generate it with:';
