import type { Place } from './avp-places.ts';
import type { ValueToken } from './values.ts';

export interface ClickModifiers { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }

export interface ClickContext {
  /** The pane can read this document here, switched on or not: wide enough, and not a placeholder or an unknown format. */
  paneShows(document: string): boolean;
  /** The pane is switched on, which a move of the view leaves as it is. */
  paneOn: boolean;
  /** Names list their uses instead of showing their definition. */
  uses: boolean;
}

export type ClickAction =
  | { type: 'browser' }
  /** The token's link in the new tab its markup asks for, which an alt-click would have the browser download. */
  | { type: 'new-tab' }
  | { type: 'uses' }
  /** The source pane alone moves, and is switched on if it was off. */
  | { type: 'pane'; place: Place }
  /** The view moves, and the pane with it. */
  | { type: 'both'; place: Place };

/**
 * What a click on a token does. The view is what is being read and the pane only beside it, so a plain click moves
 * the pane alone, and an alt-click both. Where the pane cannot read the place all that can happen is the view's jump.
 * A link to the source alone is left to the browser then, whose new tab its markup asks for. Nothing of an alt-click
 * is left to the browser, and only the uses control makes a click list a name; otherwise that is a right-click's.
 * A name's `fallback`, its other place, is gone to where the gesture can do less with `place`: nothing, or for an
 * alt-click the pane alone.
 */
export function clickAction(token: ValueToken, place: Place | undefined, event: ClickModifiers, context: ClickContext, fallback?: Place): ClickAction {
  const action = placeAction(token, place, event, context);
  if (!fallback || !short(action, event)) return action;
  const instead = placeAction(token, fallback, event, context);
  return short(instead, event) ? action : instead;
}

const short = (action: ClickAction, event: ClickModifiers) => action.type === 'browser' || (event.altKey && action.type === 'pane');

function placeAction(token: ValueToken, place: Place | undefined, event: ClickModifiers, context: ClickContext): ClickAction {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return { type: 'browser' };
  if (!event.altKey && context.uses && (token.avp || token.valueRow)) return { type: 'uses' };
  if (!place) return { type: 'browser' };
  const inPane = context.paneShows(place.document);
  if (!inPane && token.source && !token.target) return { type: event.altKey ? 'new-tab' : 'browser' };
  if (inPane && !(event.altKey && place.target)) return { type: 'pane', place };
  return place.target ? { type: 'both', place } : { type: 'browser' };
}

const PLAIN_CLICK: ClickModifiers = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };

/** What an action does for a name, in a tooltip's words. */
function saying(token: ValueToken, action: ClickAction, context: ClickContext): string {
  if (action.type === 'pane') return token.valueRow ? 'source row in pane' : action.place.position?.occurrence ? 'find in pane' : `${action.place.of ?? 'definition'} in pane`;
  if (action.type === 'both') {
    if (context.paneOn && context.paneShows(action.place.document)) return `${token.valueRow ? 'source row' : action.place.of ?? 'definition'} in both`;
    return token.valueRow ? 'go to its row' : `go to ${action.place.of ?? 'definition'}`;
  }
  return token.source ? 'source in new tab' : '';
}

/** A name's tooltip as things stand: what a click does, what an alt-click does if that differs, and the way to its uses. A value's popup is its table instead. */
export function nameTitle(token: ValueToken, place: Place | undefined, context: ClickContext, fallback?: Place): string {
  const popup = token.valueRow ? 'its table' : 'uses';
  const plain = clickAction(token, place, PLAIN_CLICK, context, fallback);
  const alt = saying(token, clickAction(token, place, { ...PLAIN_CLICK, altKey: true }, context, fallback), context);
  const listing = plain.type === 'uses';
  const click = listing ? '' : saying(token, plain, context);
  return [
    listing ? `Click or right-click: ${popup}` : click && `Click: ${click}`,
    alt && alt !== click && `Alt-click: ${alt}`,
    !listing && `Right-click: ${popup}`,
  ].filter(Boolean).join(' · ');
}
