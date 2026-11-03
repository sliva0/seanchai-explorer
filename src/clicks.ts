import type { SourcePosition } from './navigation.ts';
import type { Target, Token } from './types.ts';

export interface ClickModifiers { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }

export interface ClickContext {
  /** The source pane is showing, so a position in this document can go to it. */
  paneOpen: boolean;
  /** The pane is or could be switched on, and this document can be shown in it. */
  sourceInPane: boolean;
  /** The one check for a followed name: wide viewport, pane switched on, target showable in a pane. */
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
 */
export function clickAction(token: Token, event: ClickModifiers, section: string | undefined, context: ClickContext): ClickAction {
  if (token.avp && (event.altKey || context.occurrences)) return { type: 'occurrences' };
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return { type: 'browser' };
  if (token.avp) {
    if (token.source?.row && context.paneOpen) return { type: 'source', position: token.source };
    if (token.target) return follow({ ...token.target, name: token.target.name ?? token.avp }, context);
    if (!token.source) {
      return context.paneOpen && section ? { type: 'source', position: { section, name: token.avp, exact: true, occurrence: true } } : { type: 'occurrences' };
    }
  }
  if (token.source) return context.sourceInPane ? { type: 'source', position: token.source } : { type: 'browser' };
  if (token.target) return follow(token.target, context);
  return { type: 'browser' };
}
