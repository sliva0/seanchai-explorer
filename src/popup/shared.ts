import { Fragment, h } from 'preact';
import type { ComponentChild, ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { presenceShort, printed } from '../avp-context.ts';
import type { Rule } from '../avp-context.ts';
import { placeRoute } from '../avp-places.ts';
import type { Place } from '../avp-places.ts';
import { sourceHref } from '../data.ts';
import type { Site } from '../data.ts';
import type { SourcePane } from '../source-pane.ts';
import { useAnchoring } from './place.ts';
import type { PopupProps, PopupRequest } from './root.ts';

/** A title and its count as a muted badge, for a heading or toggle. */
export const counted = (title: string, count: number) => [`${title} `, h('span', { class: 'count' }, String(count))];

/** A link to another site, opened in a new tab. */
export const externalLink = (text: string, href: string, className?: string) =>
  h('a', { class: className, href, target: '_blank', rel: 'noopener' }, text);

interface PanelProps extends Pick<PopupProps, 'request' | 'anchor' | 'close'> {
  heading: string;
  /** The popup's own `data-` attributes, saying what it is of. */
  data: Record<`data-${string}`, string>;
  /** Labels as wide in the facts as in the places below them, for their values to start in one column. */
  alignLabels?: boolean;
  children?: ComponentChildren;
}

/**
 * What every popup is drawn in: its panel, with the heading and the close button, placed by its name and kept there.
 * The close button has the focus once it opens, and a popup drawn again leaves the focus where the reader has it.
 */
export function Panel({ request, anchor, close, heading, data, alignLabels, children }: PanelProps) {
  const panel = useRef<HTMLElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const node = panel.current;
    if (!alignLabels || !node) return;
    const labels = [...node.querySelectorAll('.popup-facts dt, .popup-places .popup-place > span:first-child')].map(
      label => label.textContent!.length,
    );
    if (labels.length) node.style.setProperty('--popup-label', `${Math.max(...labels)}ch`);
    else node.style.removeProperty('--popup-label');
  });
  useAnchoring(panel, anchor, request.documentPane, request.scrollGoal);
  useLayoutEffect(() => closer.current?.focus({ preventScroll: true }), []);
  return h(
    'section',
    { ref: panel, class: 'avp-popup', role: 'dialog', 'aria-label': heading, ...data },
    h(
      'div',
      { class: 'popup-title' },
      h('strong', null, heading),
      h('button', { ref: closer, 'aria-label': 'Close', onClick: () => close(true) }, '×'),
    ),
    children,
  );
}

/**
 * The rows of places a popup offers, each a target of a name and the two ways to it: both panels, then the pane alone.
 * Each is there only if the place is in that medium. With no way to it in the pane, its label is the publisher's copy
 * at that place, if there is one. A row is left out, as undefined, for a document the corpus does not list.
 */
export function placeRows(site: Site, pane: SourcePane, { doc, raw }: PopupRequest) {
  return (label: string, className: string, place: Place, said?: string): ComponentChild | undefined => {
    const summary = site.summary(place.document);
    if (!summary) return undefined;
    const section = place.position?.section ?? place.target?.section ?? '';
    const where =
      said ?? (place.document === doc.id ? section : [site.label(summary), section].filter(Boolean).join(' · '));
    const inPane = pane.shows(summary);
    const href = !inPane && place.position ? sourceHref(summary, place.position, site.mode) : null;
    return h(
      'div',
      { class: `popup-place ${className}` },
      h('span', null, `${label}:`),
      href ? externalLink(where, href.href, 'place-where') : h('span', { class: 'place-where' }, where),
      place.target &&
        h(
          'a',
          {
            class: 'control view-action',
            href: placeRoute(place, doc, raw),
            title: inPane
              ? 'Moves the text on the left and the source pane on the right'
              : 'Moves the text to this place',
          },
          'Jump to',
        ),
      inPane &&
        h(
          'button',
          {
            class: 'control pane-action',
            type: 'button',
            title: 'Moves only the source pane on the right, and opens it if it is hidden',
            onClick: () => pane.openPlace(place, doc),
          },
          'Show on the right',
        ),
    );
  };
}

/** A rule's members as it prints them, each with how many there may be; drawn open where `open`. */
export function RuleContents({ rule, open, title }: { rule: Rule; open: boolean; title: string }) {
  return h(
    'details',
    { class: 'popup-contents', open },
    h('summary', null, counted(title, rule.members.length)),
    h(
      'div',
      { class: 'contents-list' },
      rule.members.map((item, index) => {
        const struck = item.struck || item.strikethrough;
        const note = [
          presenceShort(item),
          item.name === 'AVP' && 'any other AVP',
          item.bold && 'bold',
          struck && 'struck through',
        ]
          .filter(Boolean)
          .join(' · ');
        return h(
          Fragment,
          { key: index },
          h('code', { class: struck ? 'struck' : undefined }, printed(item)),
          h('span', { class: 'fact-note' }, note),
        );
      }),
    ),
  );
}

/** Previous and Next, after where a walk stands, `count`, kept as wide as `widest` for the buttons not to move. */
export function Steps({ count, widest, select }: { count: string; widest: string; select(by: -1 | 1): void }) {
  return h(
    'div',
    { class: 'popup-actions' },
    h('span', { style: { minWidth: `${widest.length}ch` } }, count),
    h('button', { class: 'control', onClick: () => select(-1) }, 'Previous'),
    h('button', { class: 'control', onClick: () => select(1) }, 'Next'),
  );
}

/** The uses or rows a walk goes through, the one it stands on current and scrolled to. */
export function Entries({
  entries,
  active,
  select,
}: {
  entries: { text: string; title?: string }[];
  active: number;
  select(index: number): void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' }), [active]);
  return h(
    'div',
    { ref: list, class: 'usage-list' },
    entries.map(({ text, title }, index) =>
      h(
        'button',
        {
          key: index,
          class: 'usage-link',
          title,
          'aria-current': index === active ? 'location' : undefined,
          onClick: () => select(index),
        },
        text,
      ),
    ),
  );
}
