import type { SourcePosition } from './navigation.ts';
import type { Target } from './types.ts';
import type { ValueToken } from './values.ts';

export interface ClickModifiers { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }

export interface ClickContext {
  /** The source pane is showing and can read this document, so a position in it can go there. */
  paneOpen: boolean;
  /** The pane is or could be switched on, and can read this document. */
  sourceInPane: boolean;
  /** The one check for a followed name: wide viewport, pane switched on, target showable in a pane, if only as a placeholder. */
  paneAvailable(document: string): boolean;
  /** Names list their occurrences instead of being followed. */
  occurrences: boolean;
}

export type ClickAction =
  | { type: 'browser' }
  | { type: 'occurrences' }
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
 * Only alt or the occurrences control lists a name; a plain click with the control off never does.
 */
export function clickAction(token: ValueToken, event: ClickModifiers, section: string | undefined, context: ClickContext): ClickAction {
  const listable = token.avp || token.valueRow;
  if (listable && event.altKey) return { type: 'occurrences' };
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return { type: 'browser' };
  if (listable && context.occurrences) return { type: 'occurrences' };
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
