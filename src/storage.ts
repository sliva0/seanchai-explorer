/**
 * Every key the site keeps in the browser's storage, named once. The names and the values under them are what they
 * have always been, so a reader's settings outlive an update: rename one and every reader loses it.
 * index.html, rfc.html and viewer.html also read `theme` by its literal name in an inline script in their `<head>`,
 * before the first paint and so before any module loads: a change to it here has to be made there too.
 */
export const storageKeys = {
  /** Local: `light` or `dark`. */
  theme: 'seanchai-theme',
  /** Local: `definition` or `details`, where a click on a name goes first. */
  clickTarget: 'seanchai-click-target',
  /** Local: `posix` or `fish`, the shell the Wireshark page's install script is written for. */
  installShell: 'seanchai-install-shell',
  /** Local: `visible` or `hidden`, the PDF viewer's chapters. */
  outline: 'seanchai-outline',
  /** Local: the PDF viewer's zoom, as its select's value. */
  zoom: 'seanchai-zoom',
  /** Session: where each document was left, as JSON. */
  positions: 'seanchai-positions',
  /** Session: the jump list, as JSON. */
  jumps: 'seanchai-jumps',
} as const;

export type StorageKey = keyof typeof storageKeys;

export type Store = Pick<Storage, 'getItem' | 'setItem'>;

// Getters, since merely reading `localStorage` throws where storage is blocked, as in a sandboxed frame.
export const local = (): Store => localStorage;
export const session = (): Store => sessionStorage;

/** What is stored under a key, or null where nothing is or storage is blocked. */
export function readStored(key: StorageKey, store: () => Store = local): string | null {
  try {
    return store().getItem(storageKeys[key]);
  } catch {
    return null;
  }
}

/** Stores a value where storage allows it; where it does not, the setting lasts as long as the page. */
export function writeStored(key: StorageKey, value: string, store: () => Store = local) {
  try {
    store().setItem(storageKeys[key], value);
  } catch {}
}

/** A stored JSON value, or null where it is missing or no longer parses. */
export function readStoredJSON(key: StorageKey, store: () => Store = local): unknown {
  try {
    return JSON.parse(readStored(key, store) ?? 'null');
  } catch {
    return null;
  }
}
