/** Native smooth scrolling takes as long as the browser likes, up to most of a second over a long document. */
const DURATION = 200;
/** A background tab gets no frames, and a scroll must still end. */
const GRACE = 100;

const ease = (progress: number) => 1 - (1 - progress) ** 3;

export type Scroller = ReturnType<typeof createScroller>;

/** Scrolls one pane, one move at a time. `settled` runs when a move has ended, however it ended. */
export function createScroller(pane: HTMLElement) {
  let move: { goal: number; frame: number; timer: ReturnType<typeof setTimeout>; settled?: () => void } | undefined;

  function end(finish: boolean) {
    if (!move) return;
    const { goal, frame, timer, settled } = move;
    move = undefined;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    if (finish) pane.scrollTop = goal;
    settled?.();
  }

  return {
    get moving() {
      return Boolean(move);
    },
    /** Goes to `goal` at once, or eased if `smooth` and the reader has not asked for less motion. */
    to(goal: number, smooth: boolean, settled?: () => void) {
      end(true);
      const start = pane.scrollTop;
      // The browser would stop at the end, but the easing has to aim there too.
      const reachable = Math.max(0, Math.min(goal, pane.scrollHeight - pane.clientHeight));
      if (!smooth || matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(reachable - start) < 1) {
        pane.scrollTop = goal;
        settled?.();
        return;
      }
      const began = performance.now();
      const tick = () => {
        const progress = (performance.now() - began) / DURATION;
        if (progress >= 1) {
          end(true);
          return;
        }
        pane.scrollTop = start + (reachable - start) * ease(progress);
        move!.frame = requestAnimationFrame(tick);
      };
      move = {
        goal: reachable,
        frame: requestAnimationFrame(tick),
        timer: setTimeout(() => end(true), DURATION + GRACE),
        settled,
      };
    },
    /** Ends a move at its goal, for what needs to read where it is going. */
    finish() {
      end(true);
    },
    /** Ends a move where it is, for a reader who has started scrolling. */
    stop() {
      end(false);
    },
  };
}
