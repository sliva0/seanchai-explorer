/** A view's scroll: the line at its top edge, and how many pixels of that line are above the edge. */
export interface ScrollPosition { top: number; offset: number }

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'seanchai-positions';

export type PositionStore = ReturnType<typeof createPositionStore>;

/** Where each document was last left in this tab, whichever way it is come back to. */
export function createPositionStore(store: () => Store) {
  let positions: Record<string, ScrollPosition> = {};
  try {
    const saved = JSON.parse(store().getItem(KEY) ?? 'null');
    if (saved && typeof saved === 'object') positions = saved;
  } catch {}
  return {
    get(key: string): ScrollPosition | undefined {
      const saved = Object.hasOwn(positions, key) ? positions[key] : undefined;
      return Number.isFinite(saved?.top) && Number.isFinite(saved?.offset) ? saved : undefined;
    },
    set(key: string, { top, offset }: ScrollPosition) {
      positions[key] = { top, offset };
      try { store().setItem(KEY, JSON.stringify(positions)); } catch {}
    },
  };
}
