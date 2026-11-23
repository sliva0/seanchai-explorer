import { options, render } from 'preact';
import type { ComponentChild } from 'preact';

/**
 * The site is one Preact tree, and it renders synchronously: `mount()` has drawn it before it returns, and a state
 * update has drawn it again before the handler making it returns. What is not drawn by components reads the page
 * straight after what it did: the router positions a document's text to the pixel once it is drawn, the text's own
 * handlers and the popups measure names and lines, and the tests read the page as a reader would see it. Batching
 * updates to a microtask would make each of them wait for a flush; the site makes a handful of updates per gesture,
 * and drawing them one by one costs nothing a reader could notice.
 *
 * An update made while a draw is under way, as by a layout effect, waits for that draw to end and is drawn right
 * after it, before `mount()` or the handler returns: drawn inside it, it would draw the same components again
 * from a commit not yet finished.
 */
let drawing = 0;
let queued: (() => void) | undefined;

function drain() {
  while (queued) {
    const flush = queued;
    queued = undefined;
    drawing++;
    try {
      flush();
    } finally {
      drawing--;
    }
  }
}

options.debounceRendering = flush => {
  queued = flush;
  if (!drawing) drain();
};

/** Draws `vnode` into `parent`, the site's root or the popups', and whatever it updates as it is drawn. */
export function mount(vnode: ComponentChild, parent: Element) {
  drawing++;
  try {
    render(vnode, parent);
  } finally {
    drawing--;
  }
  if (!drawing) drain();
}
