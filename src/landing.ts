/**
 * How long a "you were sent here" highlight lasts, in milliseconds: a short fade in, a hold, a slow fade out. The
 * `landing` keyframes in layout.css hold the same, 4150 ms in all, their stops at 150 ms and 1650 ms.
 */
export const LANDING = { in: 150, hold: 1500, out: 2500 } as const;
export const LANDING_MS = LANDING.in + LANDING.hold + LANDING.out;

const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/**
 * Highlights a node the reader was just sent to, a line of the text or a section of a popup, as `.landing` draws it:
 * again from the start where it is highlighted already. The class goes once the highlight has run its time, by a timer
 * rather than `animationend`, which a node hidden meanwhile, or a reader asking for reduced motion, may never fire.
 */
export function land(node: Element) {
  clearTimeout(timers.get(node));
  node.classList.remove('landing');
  // A reflow between, for the animation to start again on a node that had the class.
  void (node as HTMLElement).offsetWidth;
  node.classList.add('landing');
  timers.set(
    node,
    setTimeout(() => {
      timers.delete(node);
      node.classList.remove('landing');
    }, LANDING_MS),
  );
}
