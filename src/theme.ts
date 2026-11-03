export type Theme = 'light' | 'dark';

const KEY = 'seanchai-theme';
const systemDark = () => matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(stored: unknown, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

function readStored(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function writeStored(theme: Theme) {
  try {
    if (theme === resolveTheme(null, systemDark().matches)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {}
}

/** Applies the stored or OS theme and follows changes from the OS, other tabs and the parent page. */
export function initTheme(onChange?: (theme: Theme) => void) {
  let current: Theme;
  const apply = (theme: Theme) => {
    current = theme;
    document.documentElement.dataset.theme = theme;
    onChange?.(theme);
  };
  apply(resolveTheme(readStored(), systemDark().matches));
  systemDark().addEventListener('change', event => {
    if (readStored() === null) apply(resolveTheme(null, event.matches));
  });
  window.addEventListener('storage', event => {
    if (event.key === KEY || event.key === null) apply(resolveTheme(event.newValue, systemDark().matches));
  });
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'seanchai-theme') apply(resolveTheme(event.data.theme, systemDark().matches));
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
