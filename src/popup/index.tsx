import type { Site } from '../data.ts';
import { element } from '../dom.ts';
import { mount } from '../render.ts';
import type { SourcePane } from '../source-pane.tsx';
import { Island } from './root.tsx';
import type { PopupRequest } from './root.tsx';

export type { PopupRequest } from './root.tsx';
export type Popups = ReturnType<typeof createPopups>;

/**
 * The popups a name opens: a value's table, a command's definitions, an AVP's uses. One is open at a time, drawn by
 * the popups' island in a host of its own at the end of the page; Escape, a press outside it and Close close it.
 */
export function createPopups(site: Site, pane: SourcePane) {
  const host = element('div', undefined, 'popup-host');
  let shown: PopupRequest | undefined;
  let opened = 0;
  const draw = () => mount(<Island site={site} pane={pane} request={shown} opened={opened} close={close} />, host);

  function close(returnFocus = false) {
    if (!shown) return;
    const { opener } = shown;
    shown = undefined;
    draw();
    for (const node of document.querySelectorAll('.avp-current')) node.classList.remove('avp-current');
    if (returnFocus && opener.isConnected) opener.focus({ preventScroll: true });
  }

  function show(request: PopupRequest) {
    close();
    shown = request;
    opened += 1;
    document.body.append(host);
    draw();
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close(true);
  });
  // A notice can be the popup's own, as a Retry of what it loads, which would have nothing to draw again if this closed it.
  document.addEventListener('pointerdown', event => {
    if (shown && !host.contains(event.target as Node) && !(event.target as Element).closest?.('.notices')) close();
  });

  return { show, close };
}
