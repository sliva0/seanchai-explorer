import { routeFor } from './navigation.ts';
import type { Target } from './types.ts';

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** A title and its count as a muted badge, to append to a heading or toggle. */
export function counted(title: string, count: number): (string | HTMLElement)[] {
  return [`${title} `, element('span', String(count), 'count')];
}

export function link(text: string, target: Target): HTMLAnchorElement {
  const node = element('a', text);
  node.href = routeFor(target);
  return node;
}

export function externalLink(text: string, href: string): HTMLAnchorElement {
  const node = element('a', text);
  node.href = href;
  node.target = '_blank';
  node.rel = 'noopener';
  return node;
}

/** The pane's `scrollTop` that puts a node `margin` pixels below its top edge. */
export function scrollTopFor(pane: HTMLElement, node: Element, margin: number): number {
  return pane.scrollTop + node.getBoundingClientRect().top - pane.getBoundingClientRect().top - margin;
}
