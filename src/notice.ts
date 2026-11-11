import { element } from './dom.ts';

const REGION = 'notices';

/**
 * The strip notices are said in, at the foot of the page. A page makes it as it starts: a live region is announced
 * only if it was there before its text, and a polite one waits for the reader to finish what is being read.
 */
export function noticeRegion(): HTMLElement {
  let region = document.getElementById(REGION);
  if (region) return region;
  region = element('div', undefined, 'notices');
  region.id = REGION;
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  document.body.append(region);
  return region;
}

/**
 * Says what failed, with the error beside it, until dismissed; `retry`, where trying again can help, is offered too.
 * The error still goes to the console for whoever debugs. A second failure of the same thing replaces the first.
 * The focus is never taken; a button that had it gives it back to where it was when the notice came.
 */
export function notifyFailure(what: string, error: unknown, retry?: () => void) {
  console.error(error);
  const region = noticeRegion();
  for (const old of region.querySelectorAll<HTMLElement>('.notice')) if (old.dataset.what === what) old.remove();
  const before = document.activeElement as HTMLElement | null;
  const notice = element('div', undefined, 'notice');
  notice.dataset.what = what;
  const message = element('p', `${what}. `);
  message.append(element('span', String(error), 'notice-detail'));
  notice.append(message);
  const remove = () => {
    const focused = notice.contains(document.activeElement);
    notice.remove();
    if (focused && before?.isConnected) before.focus({ preventScroll: true });
  };
  if (retry) {
    const again = element('button', 'Retry', 'control');
    again.type = 'button';
    again.onclick = () => { remove(); retry(); };
    notice.append(again);
  }
  const dismiss = element('button', '×', 'control notice-dismiss');
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.title = 'Dismiss';
  dismiss.onclick = remove;
  notice.append(dismiss);
  region.append(notice);
}

/** Runs a load the reader asked for; if it fails, says so with a Retry that runs it again the same way. */
export function attempt(what: string, run: () => Promise<unknown>) {
  run().catch(error => notifyFailure(what, error, () => attempt(what, run)));
}

/** Drops every notice: a page left behind takes its failures with it. */
export function clearNotices() {
  document.getElementById(REGION)?.replaceChildren();
}
