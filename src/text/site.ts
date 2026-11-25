// The site's own words for what every page shares, the index page, and the errors any page can show. Each entry's
// comment says where it shows, for whoever rewrites it, and holds for the entries after it until the next comment;
// `node scripts/strings.mjs` lists them all. Marks in a comment, on an object for all its entries: [self-hosted]
// shows only in a self-hosted build, [public] only in a public one, [linked] only in a build without
// SEANCHAI_UNLINKED=1, [unlinked] only in one with it, [limit] a length the layout holds it to.

/*
 * What only a build without SEANCHAI_UNLINKED=1 shows, apart, so that a build with it, which leaves them unused,
 * ships none of them.
 */

/** The project's two pages, the index's links to them. [linked] */
export const REPOSITORY = 'https://github.com/sliva0/seanchai';
export const PYPI = 'https://pypi.org/project/seanchai/';

/** [linked] The paragraph at the top of the index saying what the site is. */
export const indexIntro =
  'Diameter command and AVP definitions extracted from 3GPP specifications, RFCs and other documents, searchable and cross-linked to their sources. Unofficial, and not affiliated with any publisher.';

/** [linked] [limit] The links to the project's pages on the index's line of versions: the sites' own names. */
export const githubName = 'GitHub';
export const pypiName = 'PyPI';

export const site = {
  /** The site's name: the browser tab's title on the index, and the end of every other page's. */
  name: 'Seanchaí',
  /** The browser tab's title of a page: `page` is the document's name, "Search", "Wireshark plugin" or an index tab. */
  pageTitle: (page: string) => `${page} — Seanchaí`,
};

/** The header above every page. */
export const header = {
  /** A link hidden until a keyboard user tabs to it first, which moves the focus past the header to the page. */
  skip: 'Skip to content',
  /** [limit] A small button in the header: a word or two. */
  index: 'Index',
  /** [limit] A small button in the header: a word or two. */
  search: 'Search',
  /** [limit] A small button in the header: a word or two. */
  wireshark: 'Wireshark',
  /** The Wireshark button's tooltip. */
  wiresharkTitle: 'Wireshark plugin',
  /** [limit] The theme button's label, the theme it switches to, as wide as the longer of the two. */
  dark: 'Dark',
  light: 'Light',
  /** The theme button's name for a screen reader: `theme` is its label, "Dark" or "Light". */
  themeLabel: (theme: string) => `${theme} theme`,
};

/** What the page says while it loads or where it fails. */
export const pageMessages = {
  /** The page's content while a document over 150 ms to load loads: `label` is its name, "TS 29.272". */
  loading: (label: string) => `Loading ${label}…`,
  /** The heading of the page shown for an error no other heading names, and the page's title. */
  failed: 'Something went wrong',
  /** The heading of the page for an address naming no document the corpus holds, and the page's title. */
  notFound: 'Document not found',
  /** An error's message: a document the site was asked to load that the corpus does not list. `id` is its file name. */
  noSuchDocument: (id: string) => `Document not found: ${id}`,
  /** An error's message: the build's export is of another schema than the site reads; `path` the file, the numbers versions. */
  unsupportedSchema: (found: number, path: string, reads: number) =>
    `Unsupported export schema ${found} in ${path} (expected schema ${reads})`,
  /** An error's message: a data file the server answered with an error; `status` its HTTP status, "404 Not Found". */
  httpFailed: (path: string, status: string) => `${path}: HTTP ${status}`,
  /** An error's message: a data file the server answered with a web page, not JSON. */
  servedPage: (path: string) => `${path}: the server sent a web page, not JSON`,
  /** An error's message: a data file that is not JSON; `reason` is the parser's. */
  notJson: (path: string, reason: string) => `${path} is not JSON: ${reason}`,
  /** An error's message: a data file that could not be fetched at all; `reason` is the browser's. */
  unreachable: (path: string, reason: string) => `${path} could not be fetched: ${reason}`,
  /** An error's message: a data file of the right schema missing a part every such file has. */
  badShape: (path: string, field: string, kind: string) => `${path} has no ${field} ${kind}`,
  /** The kinds of part `badShape` names. */
  list: 'list',
  record: 'record',
  text: 'text',
  /** An error's message, only where a build's grammar is broken: a key the highlighter cannot run, at a path in it. */
  grammarKey: (key: string, where: string) => `Unsupported grammar key "${key}" at ${where}`,
  /** An error's message, only where a build's grammar is broken. */
  grammarRegion: (where: string) => `Grammar rule at ${where} must define both "begin" and "end"`,
};

/**
 * The page shown where something failed: a heading, what failed in plain words, what to do where there is something,
 * the way back, and the technical detail, folded. Each case has its own heading and words; `file` is a data file's path,
 * "data/documents/29272-j60.json", `label` a document's name, "TS 29.272 V19.6.0".
 */
export const failure = {
  /** A document the build's data does not list, by its id in the address. */
  noDocument: (id: string) => `This build's data has no document "${id}".`,
  noDocumentHint: 'The address may be mistyped, or come from another build of the site.',
  /** A data file the server does not have: a 404, or a web page sent in its place, as vite preview sends index.html. */
  missingHeading: 'Data file missing',
  missing: (file: string, status: string) => `${file} is not in this build's data (HTTP ${status}).`,
  missingPage: (file: string) =>
    `${file} is not in this build's data: the server sent a web page in its place, as vite preview does for a file it does not have.`,
  missingHint: "The build's data is incomplete. Building the site again writes it whole.",
  /** A data file the server failed on otherwise. */
  httpHeading: 'Could not load the data',
  http: (file: string, status: string) => `The server could not send ${file} (HTTP ${status}).`,
  /** A data file that could not be fetched at all, as offline. */
  unreachable: (file: string) => `${file} could not be fetched: the server did not answer.`,
  unreachableHint: 'Check the connection, then reload.',
  /** A data file that is not JSON. */
  notJsonHeading: 'Broken data file',
  notJson: (file: string) => `${file} is not valid JSON.`,
  /** A data file of another export schema than this build reads: both numbers. */
  schemaHeading: 'Data of another export schema',
  schema: (file: string, found: string, reads: number) =>
    `${file} was written by export schema ${found}, and this build reads schema ${reads}.`,
  schemaHint:
    'The site and its data come from different builds. Building the site again with the seanchai it pins writes data it reads.',
  /** A data file of the right schema, but not shaped as the build reads it. */
  shapeHeading: 'Unexpected data',
  shape: (file: string, reads: number) =>
    `${file} is of export schema ${reads}, which this build reads, but not in the shape it reads.`,
  /** A document's page that failed as it was drawn: its data has something this build does not handle. */
  renderHeading: (label: string) => `Could not show ${label}`,
  render: (label: string) => `${label} failed as it was drawn.`,
  /** After `shape` and `render`: `seanchai` is the version the build's data names, "0.2.0". */
  newerHint: (seanchai: string) =>
    `The data may come from a newer seanchai than this build was made for (seanchai ${seanchai}). Building the site with the seanchai it pins writes data it reads.`,
  /** A page of the site's own that failed as it was drawn: `page` is its name, "Search". */
  pageRender: (page: string) => `The ${page} page failed as it was drawn.`,
  /** Anything else. */
  other: 'The site stopped on an error it did not expect.',
  /** Before the error's own message. */
  error: 'Error:',
  /** [limit] The way back: links of a word or two. */
  toIndex: 'Back to the index',
  reload: 'Reload',
  /** The fold holding the stack. */
  details: 'Technical details',
  /** The notice of an error a page did not catch, at the foot of the page, before its message. */
  unexpected: 'Something went wrong',
  /** A data file a page can go on without, which failed: `file` is its path; the error follows. */
  partFailed: (file: string) => `Could not load ${file}; the pages go on without it`,
};

/** A notice at the foot of any page, saying what failed, over the page until dismissed. */
export const notices = {
  /** [limit] The notice's button doing again what failed: a word. */
  retry: 'Retry',
  /** The notice's × button's name and tooltip. */
  dismiss: 'Dismiss',
};

/** The jump list's names for the site's own pages, in the jump buttons' tooltips ("Back to Index"). */
export const jumpPlaces = {
  index: 'Index',
  search: 'Search',
  wireshark: 'Wireshark plugin',
  /** A place in a document: `label` is its name, `line` the line number. */
  line: (label: string, line: number) => `${label} line ${line}`,
};

/** The index page. */
export const indexPage = {
  /** [limit] The search box's placeholder on the index, a line of the box's width, about 50 characters. */
  searchPlaceholder: 'Search AVP name, vendor:code, command, or interface',
  /** The search box's name for a screen reader. */
  searchLabel: 'Search',
  /** [limit] The button beside the box: a word. */
  searchButton: 'Search',
  /** The line under the introduction saying what the build is of: the corpus's version, "Corpus 2026.11.12". */
  corpus: (version: string) => `Corpus ${version}`,
  /** The same line: the seanchai version that built it, "seanchai 0.2.0". */
  seanchai: (version: string) => `seanchai ${version}`,
  /** The same line: `mode` is "public" or "self-hosted". */
  build: (mode: string) => `${mode} build`,
  /** The one-line hint under it, on what a click, a right-click and ? do. The source pane's inspector shows it too. */
  clickHint: 'Click a name to view it in the source pane, right-click for uses, or press ? for help.',
  /** The row of publisher tabs' name for a screen reader. */
  publishers: 'Publishers',
  /** The row of release tabs' name for a screen reader: `publisher` is "3GPP". */
  releases: (publisher: string) => `${publisher} releases`,
  /** [limit] A release tab: `release` is its number. A tab holds the label and a count after it. */
  release: (release: number) => `Release ${release}`,
  /** [limit] The tab of a publisher's documents that name no release, where others do. */
  noRelease: 'No release',
  /** [limit] The tab of the older copies held for later citations, of any release. */
  olderCopies: 'Older copies',
  /** The line above the older copies' table. */
  olderCopiesNote: 'Older releases kept because a newer specification cites them.',
  /** A tab's heading, unseen but for a screen reader, and the window's title: "3GPP · Release 18". */
  tabHeading: (publisher: string, release: string) => `${publisher} · ${release}`,
  /** [limit] The tables' column headings: a word each, over narrow columns. */
  number: 'Number',
  version: 'Version',
  interfaces: 'Interfaces',
  title: 'Title',
  /**
   * [limit] After a row's title, where the document has interpreted constraints: the ¶ that marks them in its text and
   * how many blocks, "¶ 105"; its title says what they are.
   */
  interpreted: (count: number) => `¶ ${count}`,
  interpretedTitle: (count: number) =>
    `${count} Interpreted Constraints ${count === 1 ? 'block' : 'blocks'}: what the prose says of an AVP's value or presence, as a reader read it`,
  /** An older edition's label in lists where the corpus holds a newer one: `release` is its number, "Rel-11". */
  edition: (release: number) => `Rel-${release}`,
};
