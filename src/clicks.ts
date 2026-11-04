import type { SourcePosition } from './navigation.ts';
import type { Target } from './types.ts';
import type { ValueToken } from './values.ts';

export interface ClickModifiers { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }

export interface ClickContext {
  /** The source pane is showing and can read this document, so a position in it can go there. */
  paneOpen: boolean;
  /** The pane is or could be switched on, and can read this document. */
  sourceInPane: boolean;
  /** The one check for a followed name: wide viewport, pane switched on, target showable in a pane, if only as a placeholder. */
  paneAvailable(document: string): boolean;
  /** Names list their uses instead of being followed. */
  uses: boolean;
}

export type ClickAction =
  | { type: 'browser' }
  /** The token's link in the new tab its markup asks for, which an alt-click would have the browser download. */
  | { type: 'new-tab' }
  | { type: 'uses' }
  | { type: 'source'; position: SourcePosition }
  | { type: 'pane-target'; target: Target }
  | { type: 'navigate'; target: Target };

function follow(target: Target, context: ClickContext): ClickAction {
  return context.paneAvailable(target.document) ? { type: 'pane-target', target } : { type: 'navigate', target };
}

/**
 * What a click on a token does. Followed names and `; Bases:` stay in this tab,
 * in the pane or on the target's page; only `; Section:` and `; Page:` links
 * with no pane to go to are left to the browser, whose new tab their markup asks for.
 * Only the uses control makes a click list a name; otherwise that is a right-click's, which the view handles.
 * A table row's name and Section cell go to the AVP's Details where it has them apart from its Definition, the row itself.
 * An alt-click goes to the Definition whatever the control says, and nothing of it is left to the browser.
 */
export function clickAction(token: ValueToken, event: ClickModifiers, section: string | undefined, context: ClickContext): ClickAction {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return { type: 'browser' };
  if (!event.altKey) return plainAction(token, token.details ?? token.source, section, context);
  const action = plainAction(token, token.source, section, { ...context, uses: false });
  if (action.type !== 'browser') return action;
  return token.target ? { type: 'navigate', target: token.target } : token.source ? { type: 'new-tab' } : action;
}

function plainAction(token: ValueToken, place: SourcePosition | null | undefined, section: string | undefined, context: ClickContext): ClickAction {
  const listable = token.avp || token.valueRow;
  if (listable && context.uses) return { type: 'uses' };
  if (token.valueRow) return context.paneOpen && token.source ? { type: 'source', position: token.source } : { type: 'browser' };
  if (token.avp) {
    if (place?.row && context.paneOpen) return { type: 'source', position: place };
    if (token.target) return follow({ ...token.target, name: token.target.name ?? token.avp }, context);
    if (!token.source) {
      return context.paneOpen && section ? { type: 'source', position: { section, name: token.avp, exact: true, occurrence: true } } : { type: 'browser' };
    }
  }
  if (place && context.sourceInPane) return { type: 'source', position: place };
  if (token.source) return { type: 'browser' };
  if (token.target) return follow(token.target, context);
  return { type: 'browser' };
}

const PLAIN_CLICK: ClickModifiers = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };

/** Where an action takes a name, in a tooltip's words. */
function destination(token: ValueToken, action: ClickAction): string {
  if (action.type === 'source') {
    if (!action.position.row) return 'find in source';
    if (token.valueRow) return 'source row';
    return action.position === token.details ? 'details' : 'definition';
  }
  if (token.target) return token.valueRow ? 'its row' : 'definition';
  return token.source ? 'source' : '';
}

/** A name's tooltip as things stand: what a click does, what an alt-click does if that differs, and the way to its uses. A value's popup is its table instead. */
export function nameTitle(token: ValueToken, section: string | undefined, context: ClickContext): string {
  const popup = token.valueRow ? 'its table' : 'where it is used';
  const plain = clickAction(token, PLAIN_CLICK, section, context);
  const alt = destination(token, clickAction(token, { ...PLAIN_CLICK, altKey: true }, section, context));
  const listing = plain.type === 'uses';
  const click = listing ? '' : destination(token, plain);
  return [
    listing ? `Click or right-click: ${popup}` : click && `Click: ${click}`,
    alt && alt !== click && `Alt-click: ${alt}`,
    !listing && `Right-click: ${popup}`,
  ].filter(Boolean).join(' · ');
}
