import { options, render } from 'preact';

/**
 * Islands render synchronously: `mount()` has drawn one before it returns, and a state update has drawn it again
 * before the handler making it returns. The vanilla code around an island and its tests read the page straight after
 * what they did, and an island redrawn once a click gains nothing from batching. Every island is mounted through
 * `mount`, for this to hold before anything renders.
 */
options.debounceRendering = flush => flush();

export { render as mount };
