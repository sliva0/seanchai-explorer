export type Theme = 'light' | 'dark';

const KEY = 'seanchai-theme';

export function resolveTheme(stored: unknown): Theme {
  return stored === 'dark' ? 'dark' : 'light';
}

function readStored(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function writeStored(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch {}
}

/** Applies the stored theme, light by default, and follows changes from other tabs and the parent page. */
export function initTheme(onChange?: (theme: Theme) => void) {
  let current: Theme;
  const apply = (theme: Theme) => {
    current = theme;
    document.documentElement.dataset.theme = theme;
    onChange?.(theme);
  };
  apply(resolveTheme(readStored()));
  window.addEventListener('storage', event => {
    if (event.key === KEY || event.key === null) apply(resolveTheme(event.newValue));
  });
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'seanchai-theme') apply(resolveTheme(event.data.theme));
  });
  return {
    get current() { return current; },
    toggle() {
      const next = current === 'light' ? 'dark' : 'light';
      writeStored(next);
      apply(next);
    },
  };
}
