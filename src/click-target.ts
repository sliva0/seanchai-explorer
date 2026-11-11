import { readStored, writeStored } from './storage.ts';

/** Which of a name's two places a click goes to first. */
export type ClickTarget = 'definition' | 'details';

export function resolveClickTarget(stored: unknown): ClickTarget {
  return stored === 'definition' ? 'definition' : 'details';
}

/** The stored choice, Details by default. */
export function readClickTarget(): ClickTarget {
  return resolveClickTarget(readStored('clickTarget'));
}

export function writeClickTarget(target: ClickTarget) {
  writeStored('clickTarget', target);
}
