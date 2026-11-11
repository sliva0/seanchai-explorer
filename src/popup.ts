import { createAvpPopup } from './avp-popup.ts';
import { placeRoute } from './avp-places.ts';
import type { Place } from './avp-places.ts';
import type { DadFile } from './blocks.ts';
import { createCommandPopup } from './command-popup.ts';
import { sourceHref } from './data.ts';
import type { Site } from './data.ts';
import { element, externalLink } from './dom.ts';
import type { HighlightedLine, HighlightedToken } from './highlight.ts';
import { attempt } from './notice.ts';
import type { SourcePane } from './source-pane.ts';
import type { Document } from './types.ts';
import { createValuePopup } from './value-popup.ts';

export interface PopupRequest {
  token: HighlightedToken;
  doc: Document;
  /** The view is of the raw text, whose lines `lines` are. */
  raw: boolean;
  lines: HighlightedLine[];
  /** The file the view shows, whose lines `lines` decorate: the document or its raw mirror. */
  file: DadFile;
  opener: HTMLElement;
  documentPane: HTMLElement;
  /** Keeps the place a walk through the list is about to leave. */
  recordJump(): void;
  /** Goes to a node a walk through the list lands on. */
  jumpTo(node: HTMLElement): void;
}

export type PopupShell = ReturnType<typeof createShell>;
export type Popups = ReturnType<typeof createPopups>;

/** Space kept between a popup and the name it is about, and between it and the edge of the text's visible part. */
const GAP = 8;
/** Space kept between a popup and the window's edge. */
const EDGE = 12;

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

/** What every popup is drawn in: its panel, opened, placed by its name and kept there, drawn again, and its rows of places. */
function createShell(site: Site, pane: SourcePane) {
  let popup: HTMLElement | undefined;
  let openerNode: HTMLElement | undefined;
  /** The name the popup is placed by: the one opened on, or the use a walk has gone to. */
  let anchorNode: HTMLElement | undefined;
  /** The text's scrolled pane, whose visible part the popup stays in. */
  let areaNode: HTMLElement | undefined;
  let side: Side = 'below';
  let frame = 0;
  let resizing: ResizeObserver | undefined;
  /** A popup drawn again leaves the focus where the reader has it. */
  let redrawing = false;

  function reposition() {
    if (!popup || !anchorNode) return;
    const size = popup.getBoundingClientRect();
    const area = areaNode?.isConnected ? areaNode.getBoundingClientRect() : NO_BOX;
    const at = placement(
      anchorNode.getBoundingClientRect(),
      size,
      area,
      { width: innerWidth, height: innerHeight },
      side,
    );
    side = at.side;
    popup.style.left = `${at.left}px`;
    popup.style.top = `${at.top}px`;
    if (at.detached) popup.dataset.detached = at.detached;
    else delete popup.dataset.detached;
  }
  /** One move a frame, however many scrolls and resizes asked for it. */
  function schedule() {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      reposition();
    });
  }
  // A scroll of any pane but one inside the popup, its lists' own, moves the name it is placed by.
  const scrolled = (event: Event) => {
    if (popup && !popup.contains(event.target as Node)) schedule();
  };

  function close(returnFocus = false) {
    if (!popup) return;
    popup.remove();
    popup = undefined;
    resizing?.disconnect();
    resizing = undefined;
    cancelAnimationFrame(frame);
    frame = 0;
    document.removeEventListener('scroll', scrolled, { capture: true });
    window.removeEventListener('resize', schedule);
    for (const node of document.querySelectorAll('.avp-current')) node.classList.remove('avp-current');
    if (returnFocus && openerNode?.isConnected) openerNode.focus({ preventScroll: true });
    openerNode = undefined;
    anchorNode = undefined;
    areaNode = undefined;
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close(true);
  });
  // A notice can be the popup's own, as a Retry of what it loads, which would have nothing to redraw if this closed it.
  document.addEventListener('pointerdown', event => {
    if (popup && !popup.contains(event.target as Node) && !(event.target as Element).closest?.('.notices')) close();
  });

  /** The heading and the close button: what any popup opens with. */
  function open(heading: string, opener: HTMLElement) {
    // Drawn again, it stays on the side of its name it was on.
    const kept = redrawing ? side : 'below';
    close();
    side = kept;
    openerNode = opener;
    const panel = element('section', undefined, 'avp-popup');
    popup = panel;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', heading);
    const title = element('div', undefined, 'popup-title');
    title.append(element('strong', heading));
    const closeButton = element('button', '×');
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.onclick = () => close(true);
    title.append(closeButton);
    panel.append(title);
    return { panel, closeButton };
  }

  /**
   * Shows the panel by `anchor`, the name it is about, and keeps it there as `area`, the text's pane, scrolls, the
   * window is resized or the panel grows. Each `details` notes whether it was drawn open, for a redraw to tell what the
   * reader changed.
   */
  function place(panel: HTMLElement, closeButton: HTMLElement, anchor: HTMLElement, area: HTMLElement) {
    document.body.append(panel);
    for (const node of panel.querySelectorAll('details')) node.dataset.drawnOpen = String(node.open);
    anchorNode = anchor;
    areaNode = area;
    reposition();
    if (!redrawing) closeButton.focus({ preventScroll: true });
    document.addEventListener('scroll', scrolled, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    if (typeof ResizeObserver === 'undefined') return;
    resizing = new ResizeObserver(schedule);
    resizing.observe(panel);
  }

  /** Places the popup by another name, as a walk through its uses or rows goes to one. */
  function anchorTo(node: HTMLElement) {
    if (!popup) return;
    anchorNode = node;
    schedule();
  }

  /**
   * Draws the open popup again with `draw`, keeping what the reader has done in it: the sections opened or closed, how
   * far its lists are scrolled, the use it stands on and what in it has the focus. `draw` is told the use it stood on.
   */
  function redraw(draw: (active?: number) => void) {
    const old = popup;
    if (!old) return;
    const key = (node: Element) => `${node.tagName}.${node.className}|${node.textContent}`;
    const controls = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLElement>('button, summary, a')];
    const inside = old.contains(document.activeElement);
    const focused = inside ? key(document.activeElement!) : undefined;
    // Which of the controls alike it is, as two uses of a name printed alike in one section are.
    const nth = inside
      ? controls(old)
          .filter(node => key(node) === focused)
          .indexOf(document.activeElement as HTMLElement)
      : -1;
    // A section the reader opened or closed stays so; one left as drawn is drawn as the new popup has it.
    const changed = new Map(
      [...old.querySelectorAll('details')]
        .filter(node => node.dataset.drawnOpen !== String(node.open))
        .map(node => [node.className, node.open]),
    );
    const scrolls = new Map(
      [...old.querySelectorAll<HTMLElement>('.usage-list, .contents-list, .command-places')].map(node => [
        node.className,
        node.scrollTop,
      ]),
    );
    const active = [...old.querySelectorAll('.usage-link')].findIndex(node => node.hasAttribute('aria-current'));
    redrawing = true;
    try {
      draw(active < 0 ? undefined : active);
    } finally {
      redrawing = false;
    }
    const panel = popup as HTMLElement | undefined;
    if (!panel || panel === old) return;
    for (const node of panel.querySelectorAll('details')) node.open = changed.get(node.className) ?? node.open;
    for (const node of panel.querySelectorAll<HTMLElement>('.usage-list, .contents-list, .command-places'))
      node.scrollTop = scrolls.get(node.className) ?? node.scrollTop;
    reposition();
    // The focus the old popup held goes to the same control in the new one, or to Close; one outside stays outside.
    if (inside) {
      const alike = controls(panel).filter(node => key(node) === focused);
      (alike[nth] ?? alike[0] ?? panel.querySelector<HTMLElement>('.popup-title button'))?.focus({
        preventScroll: true,
      });
    }
  }

  /**
   * A target of a name and the two ways to it: both panels, then the pane alone. Each is there only if the place is in
   * that medium. With no way to it in the pane, its label is the publisher's copy at that place, if there is one.
   */
  function placeRow(label: string, className: string, place: Place, { doc, raw }: PopupRequest, said?: string) {
    const summary = site.summary(place.document);
    if (!summary) return undefined;
    const section = place.position?.section ?? place.target?.section ?? '';
    const where =
      said ?? (place.document === doc.id ? section : [site.label(summary), section].filter(Boolean).join(' · '));
    const row = element('div', undefined, `popup-place ${className}`);
    row.append(element('span', `${label}:`));
    const inPane = pane.shows(summary);
    const href = !inPane && place.position ? sourceHref(summary, place.position, site.mode) : null;
    const whereNode = href ? externalLink(where, href.href) : element('span', where);
    whereNode.classList.add('place-where');
    row.append(whereNode);
    if (place.target) {
      const anchor = element('a', 'Jump to', 'control view-action');
      anchor.href = placeRoute(place, doc, raw);
      anchor.title = inPane
        ? 'Moves the text on the left and the source pane on the right'
        : 'Moves the text to this place';
      row.append(anchor);
    }
    if (inPane) {
      const button = element('button', 'Show on the right', 'control pane-action');
      button.type = 'button';
      button.title = 'Moves only the source pane on the right, and opens it if it is hidden';
      button.onclick = () => pane.openPlace(place, doc);
      row.append(button);
    }
    return row;
  }

  /**
   * The document a popup reads from but has not loaded, as a definition's or a command's: loaded, then the popup drawn
   * again with it, as `redraw` draws it, if the popup is still the one open on `opener`.
   */
  function loadThenRedraw(id: string | undefined, { doc, opener }: PopupRequest, draw: (active?: number) => void) {
    const summary = id && id !== doc.id && !site.held(id) ? site.summary(id) : undefined;
    if (!summary) return;
    attempt(`Could not load ${site.label(summary)} for the popup`, () =>
      site.loadDocument(summary.id).then(() => {
        if (!popup?.isConnected || openerNode !== opener || !opener.isConnected) return;
        redraw(draw);
      }),
    );
  }

  return { open, place, anchorTo, redraw, close, placeRow, loadThenRedraw };
}

/** The popups a name opens: a value's table, a command's definitions, an AVP's uses. One is open at a time. */
export function createPopups(site: Site, pane: SourcePane) {
  const shell = createShell(site, pane);
  const value = createValuePopup(shell, site, pane);
  const command = createCommandPopup(shell, site);
  const avp = createAvpPopup(shell, site, pane);
  function show(request: PopupRequest) {
    const { token } = request;
    if (token.valueRow) value(token.valueRow, request);
    else if (token.command) command(token.command, request);
    else avp(request);
  }
  return { show, close: shell.close };
}
