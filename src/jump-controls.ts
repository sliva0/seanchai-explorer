import { element } from './dom.ts';
import type { JumpEntry, JumpWalk } from './jump-list.ts';

const buttons: { walk: JumpWalk; glyph: string; way: string; key: string; end: string }[] = [
  { walk: 'back', glyph: '‹', way: 'Back', key: 'Ctrl+O', end: 'No earlier position' },
  { walk: 'forward', glyph: '›', way: 'Forward', key: 'Ctrl+I', end: 'No later position' },
  { walk: 'backDocument', glyph: '«', way: 'Back', key: '[d', end: 'No earlier document' },
  { walk: 'forwardDocument', glyph: '»', way: 'Forward', key: ']d', end: 'No later document' },
];

export type JumpControls = ReturnType<typeof createJumpControls>;

/** The arrows beside a document's title. One set, moved from header to header, so a button keeps the focus across documents. */
export function createJumpControls(onWalk: (walk: JumpWalk) => void) {
  const node = element('div', undefined, 'jump-controls');
  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', 'Jumps');
  const pairs = [element('div', undefined, 'jump-pair'), element('div', undefined, 'jump-pair')];
  node.append(...pairs);
  const made = buttons.map((spec, index) => {
    const button = element('button', spec.glyph, 'control jump-button');
    button.type = 'button';
    button.dataset.walk = spec.walk;
    // Still in the tab order, and its title still says why it does nothing.
    button.onclick = () => {
      if (button.getAttribute('aria-disabled') !== 'true') onWalk(spec.walk);
    };
    pairs[index >> 1].append(button);
    return { spec, button };
  });
  return {
    node,
    /** `target` says where each walk would land, and `label` how to name that. */
    update(target: (walk: JumpWalk) => JumpEntry | undefined, label: (entry: JumpEntry) => string) {
      for (const { spec, button } of made) {
        const entry = target(spec.walk);
        button.title = entry ? `${spec.way} to ${label(entry)} (${spec.key})` : `${spec.end} (${spec.key})`;
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-disabled', String(!entry));
      }
    },
  };
}
