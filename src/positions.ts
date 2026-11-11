import { readStoredJSON, writeStored } from './storage.ts';
import type { Store } from './storage.ts';

/** A view's scroll: the line at its top edge, and how many pixels of that line are above the edge. */
export interface ScrollPosition { top: number; offset: number }

export type PositionStore = ReturnType<typeof createPositionStore>;

/** Where each document was last left in this tab, whichever way it is come back to. */
export function createPositionStore(store: () => Store) {
  const saved = readStoredJSON('positions', store);
  const positions = (saved && typeof saved === 'object' ? saved : {}) as Record<string, ScrollPosition>;
  return {
    get(key: string): ScrollPosition | undefined {
      const saved = Object.hasOwn(positions, key) ? positions[key] : undefined;
      return Number.isFinite(saved?.top) && Number.isFinite(saved?.offset) ? saved : undefined;
    },
    set(key: string, { top, offset }: ScrollPosition) {
      positions[key] = { top, offset };
      writeStored('positions', JSON.stringify(positions), store);
    },
  };
}
