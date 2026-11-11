import { readStored, storageKeys, writeStored } from './storage.ts';

export type Theme = 'light' | 'dark';

/** The header's `--ui-chrome` in theme.css, for the browser's own bar to match the page under it. */
export const themeColors: Record<Theme, string> = { light: '#e8e4d9', dark: '#2c2a27' };

export function resolveTheme(stored: unknown): Theme {
  return stored === 'dark' ? 'dark' : 'light';
}

/** Applies the stored theme, light by default, and follows changes from other tabs and the parent page. */
export function initTheme(onChange?: (theme: Theme) => void) {
  let current: Theme;
  const apply = (theme: Theme) => {
    current = theme;
    document.documentElement.dataset.theme = theme;
    // One meta, not one per OS scheme: the page follows the stored theme, never the OS.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[theme]);
    onChange?.(theme);
  };
  apply(resolveTheme(readStored('theme')));
  window.addEventListener('storage', event => {
    if (event.key === storageKeys.theme || event.key === null) apply(resolveTheme(event.newValue));
  });
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'seanchai-theme') apply(resolveTheme(event.data.theme));
  });
  return {
    get current() { return current; },
    toggle() {
      const next = current === 'light' ? 'dark' : 'light';
      writeStored('theme', next);
      apply(next);
    },
  };
}
