/**
 * What the site answers to, by mouse and by key, as the help dialog lists it. One list, so README.md's "Mouse" and
 * "Keyboard" tables could be generated from it or checked against it: `keys` are spelt as the README spells them.
 * Where the two differ the handlers are right: clicks.ts, keys.ts, document-view.tsx, the popups in popup/,
 * search-view.tsx, source-pane.tsx and viewer.ts.
 */
export interface Control {
  /** Each a way to do it, any one of them; in a group of `marks`, each a mark as a line shows it. */
  keys: string[];
  does: string;
  /** In a group of `marks`, how its marks look: a category, one its brackets contradict, or the ¶. */
  mark?: 'category' | 'disagrees' | 'constraint';
}

export interface ControlGroup {
  title: string;
  /** Said under the title, of every control in the group. */
  note?: string;
  controls: Control[];
  /** What a line shows after its end rather than what a key or the mouse does: its keys are drawn as the marks. */
  marks?: boolean;
  /** Listed only in a self-hosted build, as the PDF viewer's keys are. [self-hosted] */
  selfHosted?: boolean;
}

export const controlGroups: ControlGroup[] = [
  {
    title: 'Mouse (on a name)',
    note: 'Where the source pane cannot show the source, a click opens the name in the inspector; with no pane, as in a narrow window, it acts like Alt-click.',
    controls: [
      {
        keys: ['Click'],
        does: 'Open the name\'s Details or Definition (per "Click goes to" in the document toolbar, or under "Click options" in narrow windows) in the source pane only, opening the pane if hidden. When "Click shows uses" is enabled, opens the popup instead.',
      },
      {
        keys: ['Alt-click'],
        does: 'Jump both the document view and the source pane to that location. On the rule a document prints for an AVP it reuses from another, it jumps to the definition in that document.',
      },
      {
        keys: ['Right-click'],
        does: 'Open the name\'s popup: uses, flags, and every place it is declared but the one opened on, each with "Jump to" for both panes and "Show in source" for the source pane only: Definition (where it gets its code, in the defining document for an AVP reused from another, or a note where this build lacks it), Reused (this document\'s Reused AVPs row), Rule (its Grouped AVP rule here) and Details; for commands, identity, other definitions, Information Elements tables, and the tables of result codes an answer may carry; for such a code, its number and the document defining it. Command members linked to an Information Elements table also show their element and category (M, C, or O; in TS 32.299 also OM, OC, or - for not used), and rows set off under a grouped AVP row name the AVPs they are under. Constrained AVPs list the interpreted constraints that apply where they are used, and the rules on other AVPs that read them there; a command lists those its lines cannot show, as an AVP never sent in it.',
      },
      {
        keys: ['Ctrl-click', 'Shift-click', 'Cmd-click'],
        does: 'Default browser behavior (for example, open in a new tab or window).',
      },
      {
        keys: ['; Section:', '; Page:', '; Table:'],
        does: "In a block header: jump to that place in the source document; a ;\u00a0Table: link goes to the table's caption.",
      },
      {
        keys: ['; Command-Section:', '; Request-Section:'],
        does: "In an Information Elements or Interpreted Constraints header: go to the section printing the command the block is about, where a document prints it more than once; a ;\u00a0Request-Section: goes to the section printing the request an answer's rules read.",
      },
      {
        keys: ['Table link'],
        does: "In a popup or the inspector: jump to the table's block in the document view.",
      },
    ],
  },
  {
    title: 'Line marks',
    note: "Shown after a line's end; copying from the document view leaves them out.",
    marks: true,
    controls: [
      {
        keys: ['C', 'OC', 'OM'],
        mark: 'category',
        does: "A member's category in its command's Information Elements table where ABNF brackets cannot express it: C, conditional; TS 32.299's OC and OM, conditional or mandatory where the operator provisions it.",
      },
      {
        keys: ['M', 'O', 'C', '-'],
        mark: 'disagrees',
        does: 'In the warning colour: a category that contradicts the ABNF brackets, such as M on [ ] or O on { }, or a member the ABNF holds that the table marks - for not used; its tooltip says how.',
      },
      {
        keys: ['¶'],
        mark: 'constraint',
        does: "Interpreted constraints apply to the AVP here: hover to preview the rules, or click it (or press Enter) to open them in the popup or inspector. On a command's * [ AVP ] line, they are on AVPs only that line admits, as one never sent in the command, and open in the command's popup.",
      },
    ],
  },
  {
    title: 'Keyboard',
    note: 'Shortcuts are inactive while focus is in a text input or dropdown. Two-key sequences starting with [ or ] must be completed within 1 second.',
    controls: [
      { keys: ['Ctrl+O', 'Alt+O', '[j'], does: 'Previous position in jump history.' },
      { keys: ['Ctrl+I', 'Alt+I', ']j'], does: 'Next position in jump history.' },
      { keys: ['[d'], does: 'Previous document in jump history.' },
      { keys: [']d'], does: 'Next document in jump history.' },
      { keys: ['Menu', 'Shift+F10'], does: 'Open the popup for the focused name (same as right-click).' },
      { keys: ['←', '→'], does: 'When the pane divider is focused, resize the document view and source pane.' },
      { keys: ['/'], does: 'Focus the search box (from any page).' },
      { keys: ['Escape'], does: 'Close the open popup or this help dialog.' },
      { keys: ['?'], does: 'Open or close this help dialog.' },
    ],
  },
  {
    title: 'Search',
    controls: [
      { keys: ['↑', '↓'], does: 'Move between search results (works from the search box too).' },
      { keys: ['←', '→'], does: 'Move between links within a result (moves the cursor when in the search box).' },
    ],
  },
  /** [self-hosted] The PDF viewer's keys, listed only in a self-hosted build. */
  {
    title: 'PDF viewer',
    note: 'With the focus in the PDF viewer.',
    selfHosted: true,
    controls: [
      { keys: ['Ctrl++', 'Ctrl+-'], does: 'Zoom in or out (also works with = and _; use Cmd on macOS).' },
      { keys: ['Ctrl+wheel'], does: 'Zoom centered on the pointer (same as pinch-to-zoom).' },
      { keys: ['Enter'], does: 'In the page field, jump to that page; in the find field, jump to the next match.' },
    ],
  },
];
