import type { JumpEntry, JumpWalk } from './jump-list.ts';

const buttons: { walk: JumpWalk; glyph: string; way: string; key: string; end: string }[] = [
  { walk: 'back', glyph: '‹', way: 'Back', key: 'Ctrl+O', end: 'No earlier position' },
  { walk: 'forward', glyph: '›', way: 'Forward', key: 'Ctrl+I', end: 'No later position' },
  { walk: 'backDocument', glyph: '«', way: 'Back', key: '[d', end: 'No earlier document' },
  { walk: 'forwardDocument', glyph: '»', way: 'Forward', key: ']d', end: 'No later document' },
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
    const title = to ? `${way} to ${to} (${key})` : `${end} (${key})`;
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
    <div class="jump-controls" role="group" aria-label="Jumps">
      <div class="jump-pair">{buttons.slice(0, 2).map(button)}</div>
      <div class="jump-pair">{buttons.slice(2).map(button)}</div>
    </div>
  );
}
