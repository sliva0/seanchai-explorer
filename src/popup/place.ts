import { useLayoutEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

/** Space kept between a popup and the name it is about, and between it and the edge of the text's visible part. */
const GAP = 8;
/** Space kept between a popup and the window's edge. */
const EDGE = 12;
/** How long a popup takes from one name to another: the text's own eased scroll, and a little after it. */
const GLIDE = 260;

/** Which side of its name a popup is on; a detached popup's name is out of the text's view on that side. */
type Side = 'below' | 'above';
type Detached = 'up' | 'down' | 'left' | 'right';
type Box = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>;
const NO_BOX: Box = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };

/**
 * Where a popup of `size` goes for a name at `name` with the text's visible part `area`: below the name, or above it
 * where it would be covered there, keeping `side` while it fits there. A name scrolled out of the text's view leaves the
 * popup at the nearest edge of it, `detached` saying which. An `area` with no height is none: the window is.
 */
export function placement(
  name: Box,
  size: { width: number; height: number },
  area: Box,
  view: { width: number; height: number },
  side: Side = 'below',
): { left: number; top: number; side: Side; detached?: Detached } {
  const spread = area.height > 0 && area.width > 0;
  const top = Math.max(EDGE, spread ? area.top + GAP : 0);
  const bottom = Math.min(view.height - EDGE, spread ? area.bottom - GAP : view.height);
  const clampTop = (at: number) =>
    size.height > bottom - top
      ? Math.max(EDGE, bottom - size.height)
      : Math.min(Math.max(at, top), bottom - size.height);
  const clampLeft = (at: number) =>
    Math.max(EDGE, Math.min(Math.max(at, spread ? area.left + GAP : 0), view.width - size.width - EDGE));
  const detached: Detached | undefined = !spread
    ? undefined
    : name.bottom <= area.top
      ? 'up'
      : name.top >= area.bottom
        ? 'down'
        : name.right <= area.left
          ? 'left'
          : name.left >= area.right
            ? 'right'
            : undefined;
  const left = clampLeft(name.left);
  if (detached === 'up') return { left, top: clampTop(top), side, detached };
  if (detached === 'down') return { left, top: clampTop(bottom - size.height), side, detached };
  const below = name.bottom + GAP;
  const above = name.top - size.height - GAP;
  const fits = { below: below + size.height <= bottom, above: above >= top };
  const other: Side = side === 'below' ? 'above' : 'below';
  const chosen = fits[side] ? side : fits[other] ? other : undefined;
  const at = chosen === 'below' ? below : chosen === 'above' ? above : bottom - size.height;
  return { left, top: clampTop(at), side: chosen ?? side, ...(detached ? { detached } : {}) };
}

/** What keeps a panel by its name: where it is placed from, and the frame and glide under way. */
function anchoring(panelOf: () => HTMLElement | null) {
  /** The name the popup is placed by: the one opened on, or the use a walk has gone to. */
  let anchor: HTMLElement | undefined;
  /** The text's scrolled pane, whose visible part the popup stays in. */
  let area: HTMLElement | undefined;
  /** Where the text's pane is being scrolled to, if it is: the popup is placed for where its name will be. */
  let goalOf: (() => number | undefined) | undefined;
  let side: Side = 'below';
  let frame = 0;
  let gliding: ReturnType<typeof setTimeout> | undefined;

  function reposition() {
    const panel = panelOf();
    if (!panel || !anchor) return;
    const size = panel.getBoundingClientRect();
    const box = area?.isConnected ? area.getBoundingClientRect() : NO_BOX;
    // A name the text is being scrolled to is placed by where it will stand, not where it passes.
    const goal = area?.isConnected ? goalOf?.() : undefined;
    const rest = goal === undefined ? 0 : goal - area!.scrollTop;
    const name = anchor.getBoundingClientRect();
    const at = placement(
      rest
        ? {
            top: name.top - rest,
            bottom: name.bottom - rest,
            left: name.left,
            right: name.right,
            width: name.width,
            height: name.height,
          }
        : name,
      size,
      box,
      { width: innerWidth, height: innerHeight },
      side,
    );
    side = at.side;
    panel.style.left = `${at.left}px`;
    panel.style.top = `${at.top}px`;
    if (at.detached) panel.dataset.detached = at.detached;
    else delete panel.dataset.detached;
  }
  /** One move a frame, however many scrolls and resizes asked for it. */
  function schedule() {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      reposition();
    });
  }
  /**
   * Moves the popup from `from`, where it stood by another name, to where it now belongs, eased as the text's scroll
   * is, instead of at once. While it glides a new place only turns it; after, it follows its name again frame by frame.
   */
  function glide(panel: HTMLElement, from: { left: string; top: string }) {
    if (!from.left || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { left, top } = panel.style;
    if (left === from.left && top === from.top) return;
    panel.classList.remove('gliding');
    panel.style.left = from.left;
    panel.style.top = from.top;
    // Read, for the move to start from there.
    void panel.offsetWidth;
    panel.classList.add('gliding');
    panel.style.left = left;
    panel.style.top = top;
    clearTimeout(gliding);
    gliding = setTimeout(() => panel.classList.remove('gliding'), GLIDE);
  }
  // A scroll of any pane but one inside the popup, its lists' own, moves the name it is placed by.
  const scrolled = (event: Event) => {
    if (!panelOf()?.contains(event.target as Node)) schedule();
  };

  return {
    /**
     * Places the panel by `name` in `pane`: gliding there from where it stood if that was by another name, as a walk
     * goes, and at once if it is drawn again by the same one, as when it grows.
     */
    place(name: HTMLElement, pane: HTMLElement, scrollGoal: (() => number | undefined) | undefined) {
      const panel = panelOf();
      if (!panel) return;
      const from = { left: panel.style.left, top: panel.style.top };
      const moved = name !== anchor;
      anchor = name;
      area = pane;
      goalOf = scrollGoal;
      reposition();
      if (moved) glide(panel, from);
    },
    /** Keeps the panel by its name as the text scrolls, the window is resized or the panel grows, until it is gone. */
    follow() {
      document.addEventListener('scroll', scrolled, { capture: true, passive: true });
      window.addEventListener('resize', schedule, { passive: true });
      const panel = panelOf();
      const resizing = typeof ResizeObserver === 'undefined' || !panel ? undefined : new ResizeObserver(schedule);
      if (panel) resizing?.observe(panel);
      return () => {
        resizing?.disconnect();
        cancelAnimationFrame(frame);
        frame = 0;
        clearTimeout(gliding);
        document.removeEventListener('scroll', scrolled, { capture: true });
        window.removeEventListener('resize', schedule);
      };
    },
  };
}

/**
 * Keeps the panel `panel` by `name`, the name it is about, inside `pane`, the text's: placed there each time it is
 * drawn, gliding from where it stood when that is another place, and moved with it as the text scrolls.
 */
export function useAnchoring(
  panel: RefObject<HTMLElement | null>,
  name: HTMLElement,
  pane: HTMLElement,
  scrollGoal: (() => number | undefined) | undefined,
) {
  const [anchor] = useState(() => anchoring(() => panel.current));
  useLayoutEffect(() => anchor.place(name, pane, scrollGoal));
  useLayoutEffect(() => anchor.follow(), []);
}
