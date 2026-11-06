/** Which of a name's two places a click goes to first. */
export type ClickTarget = 'definition' | 'details';

const KEY = 'seanchai-click-target';

export function resolveClickTarget(stored: unknown): ClickTarget {
  return stored === 'definition' ? 'definition' : 'details';
}

/** The stored choice, Details by default. */
export function readClickTarget(): ClickTarget {
  try { return resolveClickTarget(localStorage.getItem(KEY)); } catch { return 'details'; }
}

export function writeClickTarget(target: ClickTarget) {
  try { localStorage.setItem(KEY, target); } catch {}
}
