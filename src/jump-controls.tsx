import type { JumpEntry, JumpWalk } from './jump-list.ts';
import { jumps } from './text/document.ts';

const buttons: { walk: JumpWalk; glyph: string; way: string; key: string; end: string }[] = [
  { walk: 'back', glyph: '‹', way: jumps.back, key: 'Ctrl+O', end: jumps.noEarlierPosition },
  { walk: 'forward', glyph: '›', way: jumps.forward, key: 'Ctrl+I', end: jumps.noLaterPosition },
  { walk: 'backDocument', glyph: '«', way: jumps.back, key: '[d', end: jumps.noEarlierDocument },
  { walk: 'forwardDocument', glyph: '»', way: jumps.forward, key: ']d', end: jumps.noLaterDocument },
];

/** Where each walk would land, named as its button says it: a walk with nowhere to go is left out. */
export type JumpTargets = Partial<Record<JumpWalk, string>>;

/** Names where each walk of the jump list would land, by `target`, for the buttons to say. */
export function jumpTargets(
  target: (walk: JumpWalk) => JumpEntry | undefined,
  label: (entry: JumpEntry) => string,
): JumpTargets {
  const targets: JumpTargets = {};
  for (const { walk } of buttons) {
    const entry = target(walk);
    if (entry) targets[walk] = label(entry);
  }
  return targets;
}

/**
 * The arrows beside a document's title, each saying where it goes and its key. One with nowhere to go stays in the tab
 * order, and its title says why it does nothing.
 */
export function JumpControls({ targets, onWalk }: { targets: JumpTargets; onWalk(walk: JumpWalk): void }) {
  const button = ({ walk, glyph, way, key, end }: (typeof buttons)[number]) => {
    const to = targets[walk];
    const title = to ? jumps.to(way, to, key) : jumps.end(end, key);
    return (
      <button
        key={walk}
        type="button"
        class="control jump-button"
        data-walk={walk}
        title={title}
        aria-label={title}
        aria-disabled={to ? 'false' : 'true'}
        onClick={() => {
          if (to) onWalk(walk);
        }}
      >
        {glyph}
      </button>
    );
  };
  return (
    <div class="jump-controls" role="group" aria-label={jumps.group}>
      <div class="jump-pair">{buttons.slice(0, 2).map(button)}</div>
      <div class="jump-pair">{buttons.slice(2).map(button)}</div>
    </div>
  );
}
