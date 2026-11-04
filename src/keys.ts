import type { JumpWalk } from './jump-list.ts';

export const CHORD_TIMEOUT = 1000;

const chordWalks: Record<string, JumpWalk> = { '[j': 'back', ']j': 'forward', '[d': 'backDocument', ']d': 'forwardDocument' };

/** Reads `[`/`]` chords from a run of keys; a chord's second key must come within a second of its first. */
export function createChords() {
  let pending: { key: string; at: number } | undefined;
  return (key: string, now: number): JumpWalk | undefined => {
    const walk = pending && now - pending.at <= CHORD_TIMEOUT ? chordWalks[pending.key + key] : undefined;
    pending = !walk && (key === '[' || key === ']') ? { key, at: now } : undefined;
    return walk;
  };
}

export interface KeyPress {
  key: string;
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Ctrl+O and Ctrl+I, with Alt for the browsers that take those. Option+O types a letter on a Mac, so with Alt the physical key counts too. */
function shortcut(event: KeyPress): JumpWalk | undefined {
  if (event.ctrlKey === event.altKey || event.metaKey || event.shiftKey) return undefined;
  const key = event.key.toLowerCase();
  if (key === 'o' || (event.altKey && event.code === 'KeyO')) return 'back';
  if (key === 'i' || (event.altKey && event.code === 'KeyI')) return 'forward';
  return undefined;
}

/** A walk a key press asks for. A chord's first key asks for none, and so stays the browser's. */
export function keyWalk(event: KeyPress, chords: ReturnType<typeof createChords>, now: number): JumpWalk | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return shortcut(event);
  return chords(event.key, now);
}

/** A control that takes typed keys. A checkbox does not, and keeps the focus after a mere toggle. */
export function takesTyping(node: Element | null): boolean {
  return Boolean(node?.matches('input:not([type="checkbox"]), textarea, select, [contenteditable]:not([contenteditable="false"])'));
}
