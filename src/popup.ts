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

/** What every popup is drawn in: its panel, opened, placed and closed, drawn again when what it reads has loaded, and its rows of places. */
function createShell(site: Site, pane: SourcePane) {
  let popup: HTMLElement | undefined;
  let openerNode: HTMLElement | undefined;
  let resizing: ResizeObserver | undefined;
  /** A popup drawn again leaves the focus where the reader has it. */
  let redrawing = false;

  function close(returnFocus = false) {
    if (!popup) return;
    popup.remove();
    popup = undefined;
    resizing?.disconnect();
    resizing = undefined;
    for (const node of document.querySelectorAll('.avp-current')) node.classList.remove('avp-current');
    if (returnFocus && openerNode?.isConnected) openerNode.focus({ preventScroll: true });
    openerNode = undefined;
  }

  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(true); });
  // A notice can be the popup's own, as a Retry of what it loads, which would have nothing to redraw if this closed it.
  document.addEventListener('pointerdown', event => {
    if (popup && !popup.contains(event.target as Node) && !(event.target as Element).closest?.('.notices')) close();
  });

  /** The heading and the close button: what any popup opens with. */
  function open(heading: string, opener: HTMLElement) {
    close();
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

  function place(panel: HTMLElement, closeButton: HTMLElement, opener: HTMLElement) {
    document.body.append(panel);
    const bounds = opener.getBoundingClientRect();
    const size = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(12, Math.min(bounds.left, innerWidth - size.width - 12))}px`;
    // Below the name, or above it where it would otherwise be covered.
    const below = bounds.bottom + 8;
    const above = bounds.top - size.height - 8;
    const top = below + size.height <= innerHeight - 12 ? below : above >= 12 ? above : innerHeight - size.height - 12;
    panel.style.top = `${Math.max(12, top)}px`;
    if (!redrawing) closeButton.focus({ preventScroll: true });
    // Grown by a section opened in it, it moves up as far as it must to stay in the window.
    if (typeof ResizeObserver === 'undefined') return;
    resizing = new ResizeObserver(() => {
      const { top: at, height } = panel.getBoundingClientRect();
      if (at + height > innerHeight - 12) panel.style.top = `${Math.max(12, innerHeight - height - 12)}px`;
    });
    resizing.observe(panel);
  }

  /**
   * A target of a name and the two ways to it: both panels, then the pane alone. Each is there only if the place is in
   * that medium. With no way to it in the pane, its label is the publisher's copy at that place, if there is one.
   */
  function placeRow(label: string, className: string, place: Place, { doc, raw }: PopupRequest, said?: string) {
    const summary = site.summary(place.document);
    if (!summary) return undefined;
    const section = place.position?.section ?? place.target?.section ?? '';
    const where = said ?? (place.document === doc.id ? section : [site.label(summary), section].filter(Boolean).join(' · '));
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
      anchor.title = inPane ? 'Moves the text on the left and the source pane on the right' : 'Moves the text to this place';
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
   * again with it, if the popup is still the one open on `opener`. What has been done in it since is kept: the use
   * stepped to, the sections opened, where it stands and what in it has the focus.
   */
  function loadThenRedraw(id: string | undefined, { doc, opener }: PopupRequest, redraw: (active?: number) => void) {
    const summary = id && id !== doc.id && !site.held(id) ? site.summary(id) : undefined;
    if (!summary) return;
    attempt(`Could not load ${site.label(summary)} for the popup`, () => site.loadDocument(summary.id).then(() => {
      const old = popup;
      if (!old?.isConnected || openerNode !== opener || !opener.isConnected) return;
      const key = (node: Element) => `${node.tagName}.${node.className}|${node.textContent}`;
      const inside = old.contains(document.activeElement);
      const focused = inside ? key(document.activeElement!) : undefined;
      const opened = new Map([...old.querySelectorAll('details')].map(node => [node.className, node.open]));
      const active = [...old.querySelectorAll('.usage-link')].findIndex(node => node.hasAttribute('aria-current'));
      const { left, top } = old.style;
      redrawing = true;
      try { redraw(active < 0 ? undefined : active); } finally { redrawing = false; }
      const panel = popup as HTMLElement | undefined;
      if (!panel || panel === old) return;
      for (const node of panel.querySelectorAll('details')) node.open = opened.get(node.className) ?? node.open;
      panel.style.top = top;
      panel.style.left = `${Math.max(12, Math.min(parseFloat(left), innerWidth - panel.getBoundingClientRect().width - 12))}px`;
      // The focus the old popup held goes to the same control in the new one, or to Close; one outside stays outside.
      if (inside) ([...panel.querySelectorAll<HTMLElement>('button, summary, a')].find(node => key(node) === focused) ?? panel.querySelector<HTMLElement>('.popup-title button'))?.focus({ preventScroll: true });
    }));
  }

  return { open, place, close, placeRow, loadThenRedraw };
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
