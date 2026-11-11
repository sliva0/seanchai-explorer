import { readStoredJSON, writeStored } from './storage.ts';
import type { Store } from './storage.ts';

/** A place to come back to: where its page was scrolled, and the route that shows it. Index and search have no lines, only `offset` pixels. */
export interface JumpEntry {
  /** A document's id, `search`, or empty for the index. */
  document: string;
  top: number;
  offset: number;
  line?: number;
  hash: string;
}

export type JumpWalk = 'back' | 'forward' | 'backDocument' | 'forwardDocument';

function isEntry(value: JumpEntry): boolean {
  return typeof value?.document === 'string' && typeof value.hash === 'string' && Number.isFinite(value.top) && Number.isFinite(value.offset);
}

export function sameEntry(a: JumpEntry | undefined, b: JumpEntry): boolean {
  return a?.document === b.document && a.top === b.top && a.offset === b.offset && a.line === b.line && a.hash === b.hash;
}

export type JumpList = ReturnType<typeof createJumpList>;

/**
 * One tab's walk through places, as vim's with jumpoptions=stack: a jump made from the middle drops what lay ahead.
 * `index` is the entry being shown; past the end, the place being shown is on no entry yet.
 * Every walk first writes the place being left over its entry, or adds it at the end, so a walk back returns to it.
 * `available` says a document can still be shown; an entry whose document cannot is stepped over.
 */
export function createJumpList(store: () => Store, available: (document: string) => boolean = () => true, cap = 100) {
  let entries: JumpEntry[] = [];
  let index = 0;

  const saved = readStoredJSON('jumps', store) as { entries?: unknown; index?: unknown } | null;
  if (Array.isArray(saved?.entries) && saved.entries.every(isEntry)) {
    entries = saved.entries.slice(-cap);
    index = typeof saved.index === 'number' && Number.isInteger(saved.index) ? Math.min(Math.max(saved.index, 0), entries.length) : entries.length;
  }

  function commit(next: JumpEntry[], at: number) {
    const excess = Math.max(0, next.length - cap);
    entries = next.slice(excess);
    index = Math.max(0, at - excess);
    writeStored('jumps', JSON.stringify({ entries, index }), store);
  }

  /** The list with `here` written in, and where `here` is on it. */
  function including(here: JumpEntry): { list: JumpEntry[]; at: number } {
    if (index < entries.length) return { list: entries.with(index, here), at: index };
    if (sameEntry(entries.at(-1), here)) return { list: entries, at: entries.length - 1 };
    return { list: [...entries, here], at: entries.length };
  }

  /** Where a walk from `here` lands. A document's walk lands where its run of entries ends, each way, so a step and its opposite are a round trip. */
  function seek(walk: JumpWalk, here: JumpEntry) {
    const { list, at } = including(here);
    const step = walk === 'back' || walk === 'backDocument' ? -1 : 1;
    const wholeDocument = walk === 'backDocument' || walk === 'forwardDocument';
    const skipped = (entry: JumpEntry) => !available(entry.document) || sameEntry(entry, here) || (wholeDocument && entry.document === here.document);
    let target = at + step;
    while (list[target] && skipped(list[target])) target += step;
    if (!list[target]) return undefined;
    if (wholeDocument && step > 0) while (list[target + 1]?.document === list[target].document) target++;
    return { list, target };
  }

  return {
    /** Records the place being left for a jump. */
    push(here: JumpEntry) {
      const kept = entries.slice(0, index);
      const list = sameEntry(kept.at(-1), here) ? kept : [...kept, here];
      commit(list, list.length);
    },
    /** Moves along the list, or stays where it is if there is nowhere to go. */
    walk(walk: JumpWalk, here: JumpEntry): JumpEntry | undefined {
      const found = seek(walk, here);
      if (!found) return undefined;
      commit(found.list, found.target);
      return found.list[found.target];
    },
    /** Where a walk would land, leaving the list as it is. */
    peek(walk: JumpWalk, here: JumpEntry): JumpEntry | undefined {
      const found = seek(walk, here);
      return found && found.list[found.target];
    },
    get entries(): readonly JumpEntry[] { return entries; },
    get index() { return index; },
  };
}
