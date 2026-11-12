import { h } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { DadFile } from '../blocks.ts';
import type { Site } from '../data.ts';
import type { HighlightedLine, HighlightedToken } from '../highlight.ts';
import { attempt } from '../notice.ts';
import type { SourcePane } from '../source-pane.ts';
import type { Document } from '../types.ts';
import { AvpPopup } from './avp.ts';
import { CommandPopup } from './command.ts';
import { ValuePopup } from './value.ts';

export interface PopupRequest {
  token: HighlightedToken;
  doc: Document;
  /** The view is of the raw text, whose lines `lines` are. */
  raw: boolean;
  lines: HighlightedLine[];
  /** The file the view shows, whose lines `lines` decorate: the document or its raw mirror. */
  file: DadFile;
  opener: HTMLElement;
  documentPane: HTMLElement;
  /** Keeps the place a walk through the list is about to leave. */
  recordJump(): void;
  /** Goes to a node a walk through the list lands on. */
  jumpTo(node: HTMLElement): void;
  /** Where the text's pane will be scrolled to once a move under way has ended. */
  scrollGoal(): number | undefined;
}

/** What each popup is drawn from: its request, where a walk through it stands, and what it shares with the others. */
export interface PopupProps {
  site: Site;
  pane: SourcePane;
  request: PopupRequest;
  /** The use or row a walk has gone to, none until one has. */
  at: number | undefined;
  /** The name the popup is placed by: the one opened on, or the one a walk has gone to. */
  anchor: HTMLElement;
  /** Goes to use or row `at`, whose name `anchor` the popup is then placed by. */
  step(at: number, anchor: HTMLElement): void;
  /** Whether the flags' key is open: it stays as it was left from one popup to the next. */
  keyOpen: boolean;
  toggleKey(): void;
  /** Closes the popup, giving the focus back to the name opened on if `returnFocus`. */
  close(returnFocus?: boolean): void;
  /** Loads document `id` if it is another not loaded yet, drawing the popup again once it is. */
  demand(id: string | undefined): void;
}

interface IslandProps {
  site: Site;
  pane: SourcePane;
  /** The popup open, if one is. */
  request: PopupRequest | undefined;
  /** Counts the popups opened: a new one is drawn afresh, not over the last. */
  opened: number;
  close(returnFocus?: boolean): void;
}

/** The popups' island: the one open, if any, and what stays from one popup to the next. */
export function Island({ request, opened, ...shared }: IslandProps) {
  const [keyOpen, setKeyOpen] = useState(false);
  if (!request) return null;
  return h(Popup, {
    key: opened,
    ...shared,
    request,
    keyOpen,
    toggleKey: () => setKeyOpen(open => !open),
  });
}

type RootProps = Pick<PopupProps, 'site' | 'pane' | 'request' | 'keyOpen' | 'toggleKey' | 'close'>;

/**
 * One popup, which a value's name opens as its table, a command's as its definitions and an AVP's as its uses. It holds
 * where a walk through it stands and what it has loaded; a step or a load draws it again over the same nodes, so the
 * sections the reader opened, the lists' scroll and the focus stay where they are.
 */
function Popup(props: RootProps) {
  const { site, request } = props;
  const [stood, setStood] = useState<{ at?: number; anchor: HTMLElement }>({ anchor: request.opener });
  const [, setLoads] = useState(0);
  const live = useRef(true);
  useLayoutEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const demand = (id: string | undefined) => {
    const summary = id && id !== request.doc.id && !site.held(id) ? site.summary(id) : undefined;
    if (!summary) return;
    attempt(`Could not load ${site.label(summary)} for the popup`, () =>
      site.loadDocument(summary.id).then(() => {
        if (live.current && request.opener.isConnected) setLoads(loads => loads + 1);
      }),
    );
  };
  const popup: PopupProps = {
    ...props,
    at: stood.at,
    anchor: stood.anchor,
    step: (at, anchor) => setStood({ at, anchor }),
    demand,
  };
  const { token } = request;
  if (token.valueRow) return h(ValuePopup, { ...popup, row: token.valueRow });
  if (token.command) return h(CommandPopup, { ...popup, command: token.command });
  return h(AvpPopup, popup);
}
