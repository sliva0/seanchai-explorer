import type { SourcePosition } from './navigation.ts';
import type { Target } from './types.ts';
import type { ValueToken } from './values.ts';

export interface ClickModifiers { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }

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
 */
export function clickAction(token: ValueToken, event: ClickModifiers, section: string | undefined, context: ClickContext): ClickAction {
  const listable = token.avp || token.valueRow;
  if (event.ctrlKey || event.metaKey || event.shiftKey) return { type: 'browser' };
  if (listable && context.uses) return { type: 'uses' };
  if (token.valueRow) return context.paneOpen && token.source ? { type: 'source', position: token.source } : { type: 'browser' };
  if (token.avp) {
    if (token.source?.row && context.paneOpen) return { type: 'source', position: token.source };
    if (token.target) return follow({ ...token.target, name: token.target.name ?? token.avp }, context);
    if (!token.source) {
      return context.paneOpen && section ? { type: 'source', position: { section, name: token.avp, exact: true, occurrence: true } } : { type: 'browser' };
    }
  }
  if (token.source) return context.sourceInPane ? { type: 'source', position: token.source } : { type: 'browser' };
  if (token.target) return follow(token.target, context);
  return { type: 'browser' };
}

export const PLAIN_CLICK: ClickModifiers = { ctrlKey: false, metaKey: false, shiftKey: false };

/** A name's tooltip: what a plain click does now, and the way to its uses. A value's popup is its table instead. */
export function nameTitle(token: ValueToken, action: ClickAction): string {
  const popup = token.valueRow ? 'its table' : 'where it is used';
  if (action.type === 'uses') return `Click or right-click: ${popup}`;
  const click = action.type === 'source' ? (action.position.row ? 'source row' : 'find in source')
    : action.type !== 'browser' ? 'definition'
    : token.target ? (token.valueRow ? 'its row' : 'definition')
    : token.source ? 'source' : '';
  return `${click ? `Click: ${click} · ` : ''}Right-click: ${popup}`;
}
