import { Fragment } from 'preact';
import type { ComponentChild, ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { presenceShort, printed } from '../avp-context.ts';
import type { Rule } from '../avp-context.ts';
import { placeRoute } from '../avp-places.ts';
import type { Place } from '../avp-places.ts';
import { sourceHref } from '../data.ts';
import type { Site } from '../data.ts';
import type { SourcePane } from '../source-pane.tsx';
import { useAnchoring } from './place.ts';
import type { PopupProps, PopupRequest } from './root.tsx';

/** A title and its count as a muted badge, for a heading or toggle. */
export const Counted = ({ title, count }: { title: string; count: number }) => (
  <>
    {`${title} `}
    <span class="count">{String(count)}</span>
  </>
);

/** A link to another site, opened in a new tab. */
export const ExternalLink = ({
  href,
  class: className,
  children,
}: {
  href: string;
  class?: string;
  children: string;
}) => (
  <a class={className} href={href} target="_blank" rel="noopener">
    {children}
  </a>
);

interface PanelProps extends Pick<PopupProps, 'request' | 'anchor' | 'close' | 'inline'> {
  heading: string;
  /** The popup's own `data-` attributes, saying what it is of. */
  data: Record<`data-${string}`, string>;
  /** Labels as wide in the facts as in the places below them, for their values to start in one column. */
  alignLabels?: boolean;
  children?: ComponentChildren;
}

/** Sets `--popup-label` on a panel to its widest label, for its values to start in one column. */
function useAlignedLabels(panel: { current: HTMLElement | null }, align: boolean | undefined) {
  useLayoutEffect(() => {
    const node = panel.current;
    if (!align || !node) return;
    const labels = [...node.querySelectorAll('.popup-facts dt, .popup-places .popup-place > span:first-child')].map(
      label => label.textContent!.length,
    );
    if (labels.length) node.style.setProperty('--popup-label', `${Math.max(...labels)}ch`);
    else node.style.removeProperty('--popup-label');
  });
}

/**
 * What every popup is drawn in: its panel, with the heading and the close button, placed by its name and kept there.
 * The close button has the focus once it opens, and a popup drawn again leaves the focus where the reader has it.
 * Drawn `inline`, as the source pane's inspector draws it, it is a part of the pane: no close button, no placing, and
 * the focus left where the reader has it.
 */
export function Panel(props: PanelProps) {
  return props.inline ? <InlinePanel {...props} /> : <FloatingPanel {...props} />;
}

function FloatingPanel({ request, anchor, close, heading, data, alignLabels, children }: PanelProps) {
  const panel = useRef<HTMLElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  useAlignedLabels(panel, alignLabels);
  useAnchoring(panel, anchor, request.documentPane, request.scrollGoal);
  useLayoutEffect(() => closer.current?.focus({ preventScroll: true }), []);
  return (
    <section ref={panel} class="avp-popup" role="dialog" aria-label={heading} {...data}>
      <div class="popup-title">
        <strong>{heading}</strong>
        <button ref={closer} aria-label="Close" onClick={() => close(true)}>
          ×
        </button>
      </div>
      {children}
    </section>
  );
}

function InlinePanel({ heading, data, alignLabels, children }: PanelProps) {
  const panel = useRef<HTMLElement>(null);
  useAlignedLabels(panel, alignLabels);
  return (
    <section ref={panel} class="inspector-entry" aria-label={heading} {...data}>
      <h3 class="popup-title">
        <strong>{heading}</strong>
      </h3>
      {children}
    </section>
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
    return (
      <div class={`popup-place ${className}`}>
        <span>{`${label}:`}</span>
        {href ? (
          <ExternalLink class="place-where" href={href.href}>
            {where}
          </ExternalLink>
        ) : (
          <span class="place-where">{where}</span>
        )}
        {place.target && (
          <a
            class="control view-action"
            href={placeRoute(place, doc, raw)}
            title={
              inPane ? 'Moves the text on the left and the source pane on the right' : 'Moves the text to this place'
            }
          >
            Jump to
          </a>
        )}
        {inPane && (
          <button
            class="control pane-action"
            type="button"
            title="Moves only the source pane on the right, and opens it if it is hidden"
            onClick={() => pane.openPlace(place, doc)}
          >
            Show on the right
          </button>
        )}
      </div>
    );
  };
}

/**
 * A rule's members as it prints them, each with how many there may be and its category in the Information Elements
 * tables describing the command, `categories` by its name; drawn open where `open`.
 */
export function RuleContents({
  rule,
  open,
  title,
  categories,
}: {
  rule: Rule;
  open: boolean;
  title: string;
  categories?: Map<string, string>;
}) {
  return (
    <details class="popup-contents" open={open}>
      <summary>
        <Counted title={title} count={rule.members.length} />
      </summary>
      <div class="contents-list">
        {rule.members.map((item, index) => {
          const struck = item.struck || item.strikethrough;
          const note = [
            presenceShort(item),
            item.name === 'AVP' && 'any other AVP',
            item.bold && 'bold',
            struck && 'struck through',
            categories?.get(item.name) && `category ${categories.get(item.name)}`,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Fragment key={index}>
              <code class={struck ? 'struck' : undefined}>{printed(item)}</code>
              <span class="fact-note">{note}</span>
            </Fragment>
          );
        })}
      </div>
    </details>
  );
}

/** Previous and Next, after where a walk stands, `count`, kept as wide as `widest` for the buttons not to move. */
export function Steps({ count, widest, select }: { count: string; widest: string; select(by: -1 | 1): void }) {
  return (
    <div class="popup-actions">
      <span style={{ minWidth: `${widest.length}ch` }}>{count}</span>
      <button class="control" onClick={() => select(-1)}>
        Previous
      </button>
      <button class="control" onClick={() => select(1)}>
        Next
      </button>
    </div>
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
  return (
    <div ref={list} class="usage-list">
      {entries.map(({ text, title }, index) => (
        <button
          key={index}
          class="usage-link"
          title={title}
          aria-current={index === active ? 'location' : undefined}
          onClick={() => select(index)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
