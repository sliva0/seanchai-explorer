/**
 * What the site answers to, by mouse and by key, as the help dialog lists it. One list, so README.md's "Mouse" and
 * "Keyboard" tables could be generated from it or checked against it: `keys` are spelt as the README spells them.
 * Where the two differ the handlers are right: clicks.ts, keys.ts, document-view.ts, popup.ts and its popups,
 * search-view.ts, source-pane.ts and viewer.ts.
 */
export interface Control {
  /** Each a way to do it, any one of them. */
  keys: string[];
  does: string;
}

export interface ControlGroup {
  title: string;
  /** Said under the title, of every control in the group. */
  note?: string;
  controls: Control[];
}

export const controlGroups: ControlGroup[] = [
  {
    title: 'Mouse, on a name',
    note: 'Where the source pane cannot show the place, a click does what an alt-click does.',
    controls: [
      { keys: ['Click'], does: 'Its Details or its definition, as "Click goes to" in the document\'s strip says, in the source pane alone, which opens if it was switched off. With "Click shows uses" on, where it is used' },
      { keys: ['Alt-click'], does: 'The same place in the text and the pane' },
      { keys: ['Right-click'], does: 'Where it is used, with Definition and Details each offering "Jump to", which moves the text and the pane, and "Show on the right", which moves the pane alone; for a command, what it is and where else it is printed' },
      { keys: ['Ctrl-click', 'Shift-click', 'Cmd-click'], does: 'The browser\'s' },
    ],
  },
  {
    title: 'Keyboard',
    note: 'The keys wait while the focus is in a text box or a list, and a bracket\'s second key must come within a second.',
    controls: [
      { keys: ['Ctrl+O', 'Alt+O', '[j'], does: 'The place before on the jump list' },
      { keys: ['Ctrl+I', 'Alt+I', ']j'], does: 'The place after on the jump list' },
      { keys: ['[d'], does: 'The place before on the list in another document' },
      { keys: [']d'], does: 'The place after on the list in another document' },
      { keys: ['Menu', 'Shift+F10'], does: 'On a name with the focus, what a right-click does' },
      { keys: ['←', '→'], does: 'On the divider between the panes, widens or narrows the source pane' },
      { keys: ['Escape'], does: 'Closes a popup, or this help' },
      { keys: ['?'], does: 'Opens this help' },
    ],
  },
  {
    title: 'Search',
    controls: [
      { keys: ['↑', '↓'], does: 'From result to result, from the box too' },
      { keys: ['←', '→'], does: 'Between the links of one result; in the box they move the caret' },
    ],
  },
  {
    title: 'PDF pane',
    note: 'A self-hosted build\'s, with the focus in it.',
    controls: [
      { keys: ['Ctrl++', 'Ctrl+-'], does: 'Zooms in or out, with = and _ too, as Cmd does on a Mac' },
      { keys: ['Ctrl+wheel'], does: 'Zooms at the pointer, as a pinch does' },
      { keys: ['Enter'], does: 'In the page box goes to the page, in the find box to the next match' },
    ],
  },
];
