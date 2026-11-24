// The source pane beside a document's text, its inspector where it cannot show the source, and the two readers it
// holds: the PDF viewer of a self-hosted build and the RFC reader. Each entry's comment says where it shows; see
// site.ts for the marks. The PDF viewer's toolbar words are in viewer.html, there before any script runs.

export const pane = {
  /** A link to a copy of a document, in a pane's header, for a screen reader: `label` is its host, "etsi.org". */
  newTab: (label: string) => `${label}, new tab`,
  /** [limit] The letters on the file icon of a PDF's link. */
  pdf: 'PDF',
  /** The pane's region, for a screen reader, where it shows what a name is instead of the source. */
  inspector: 'Inspector',
  /** The inspector until a name is clicked, under the index's click hint. */
  inspectorEmpty:
    'A click leaves the text where it is, and an alt-click moves it to the name. A right-click shows where it is used, as do Menu and Shift+F10 on a name with the focus.',
  /** The same in a SEANCHAI_UNLINKED=1 build, which names no other build; once a name is shown it says nothing. [public] [unlinked] */
  unlinkedNote: (name: string) => `This build cannot show the PDF of ${name}, for licensing reasons.`,
  /** The bar between the text and the pane, for a screen reader; the arrow keys move it. */
  divider: 'Text pane width',
  /** A notice where a document the pane was sent to fails to load: `label` is its name. */
  loadFailed: (label: string) => `Could not load ${label} for the source pane`,
};

/** The PDF viewer, in the pane of a self-hosted build. [self-hosted] */
export const viewer = {
  /** The tab's title of the viewer opened on its own: `file` is the PDF's file name. */
  title: (file: string) => `${file} — Seanchaí`,
  /** The chapters box's tooltip, as it shows or hides the chapters. */
  hideChapters: 'Hide chapters',
  showChapters: 'Show chapters',
  /** Notices, with a Retry. */
  rowFailed: 'Could not find the row on its page',
  placeFailed: 'Could not go to the place in the PDF',
  /** Errors shown in place of the PDF: the address names none, or one of another site. */
  noFile: 'PDF not found',
  notLocal: 'PDF must be local',
};

/** The RFC reader, in the pane of either build. */
export const rfcReader = {
  /** The tab's title of the reader opened on its own: `number` is the RFC's. */
  title: (number: string) => `RFC ${number} — Seanchaí`,
  /** Errors shown in place of the text: the address names no RFC, or one from elsewhere than rfc-editor.org. */
  noFile: 'RFC not found',
  invalid: 'Invalid RFC source',
};

/*
 * What only a build without SEANCHAI_UNLINKED=1 shows, apart, so that a build with it, which leaves them unused,
 * ships none of them.
 */

/** Under the inspector of a public build: why it shows no PDF. `name` is "TS 29.153 V19.0.0". [public] [linked] */
export const publicBuildNote = (name: string) =>
  `This public build cannot show the PDF of ${name}, for licensing reasons; a self-hosted build shows it here.`;
/** The same, once a name is shown, shorter. [public] [linked] */
export const publicBuildBrief = (name: string) => `The PDF of ${name} is shown here in a self-hosted build.`;
