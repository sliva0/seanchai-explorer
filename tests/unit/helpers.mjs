import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { commandIndex } from '../../src/commands.ts';

export const fixture = new URL('../fixtures/export/', import.meta.url);
export const readFixture = async file => JSON.parse(await readFile(new URL(file, fixture), 'utf8'));
const grammar = new URL('../../syntax/dad.tmLanguage.json', import.meta.url);

/** The `commands.json` prepare would derive from the fixture, which the fixture leaves to it. */
async function commandsOfFixture() {
  const index = await readFixture('index.json');
  const documents = await Promise.all(index.documents.map(async doc => ({ id: doc.id, lines: (await readFixture(doc.path)).lines })));
  return commandIndex(documents, index.schema_version);
}

/** A self-hosted variant of the fixture: every ETSI document has a local PDF. */
function asSelfHosted(data) {
  const source = doc => doc.source.kind === 'etsi-pdf' ? { ...doc, source: { ...doc.source, local: `sources/${doc.id}.pdf` } } : doc;
  if (data.documents) return { ...data, mode: 'self-hosted', documents: data.documents.map(source) };
  return data.source ? source(data) : data;
}

let boots = 0;
const globals = ['window', 'document', 'location', 'history', 'localStorage', 'sessionStorage', 'matchMedia', 'fetch', 'innerWidth', 'innerHeight', 'HTMLElement', 'Element', 'Node', 'requestAnimationFrame', 'cancelAnimationFrame'];

/**
 * Starts src/main.ts or another entry on a happy-dom page, with the fixture as its export.
 * `width` is the viewport, `transform` changes a data file before the page reads it, `text` replaces a text source,
 * `session` is what the tab's storage already holds, `clickTarget` the stored place a click on a name goes to first,
 * `commands` whether the build derived a command index, and `prepare` runs on the page before it starts.
 */
export async function boot({ hash = '', url, entry = 'main', html = '<div id="app"></div>', width = 1280, mode = 'public', system = 'light', stored, clickTarget, session = {}, prepare = () => {}, text, commands = true, transform = (_path, data) => data } = {}) {
  const window = new Window({
    url: url ?? `http://localhost/${hash}`,
    width,
    height: 800,
    settings: { disableIframePageLoading: true, disableCSSFileLoading: true },
  });
  window.document.body.innerHTML = html;
  const fetched = [];
  const listeners = new Map();
  window.matchMedia = query => {
    const min = query.match(/min-width: (\d+)px/);
    const state = {
      get matches() { return min ? window.innerWidth >= Number(min[1]) : system === 'dark'; },
      addEventListener(_type, listener) { listeners.set(query, [...(listeners.get(query) ?? []), listener]); },
      removeEventListener() {},
    };
    return state;
  };
  window.fetch = async input => {
    const parsed = new URL(input);
    const path = parsed.pathname.replace(/^\//, '');
    fetched.push(parsed.hostname === 'localhost' ? path : parsed.href);
    if (path === 'syntax/dad.tmLanguage.json') return { ok: true, json: async () => JSON.parse(await readFile(grammar, 'utf8')) };
    const file = new URL(path.replace(/^data\//, ''), fixture);
    if (path === 'data/commands.json' && commands) return { ok: true, json: async () => transform(path, await commandsOfFixture()) };
    try {
      if (path.endsWith('.txt')) return { ok: true, text: async () => text ?? readFile(file, 'utf8') };
      const data = JSON.parse(await readFile(file, 'utf8'));
      const shaped = mode === 'self-hosted' ? asSelfHosted(data) : data;
      return { ok: true, json: async () => transform(path, shaped) };
    } catch {
      return { ok: false, status: 404 };
    }
  };
  if (stored) window.localStorage.setItem('seanchai-theme', stored);
  if (clickTarget) window.localStorage.setItem('seanchai-click-target', clickTarget);
  // happy-dom announces pushState and replaceState as hash changes, which a browser does not.
  const silent = [];
  for (const method of ['pushState', 'replaceState']) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (...args) => {
      const before = window.location.hash;
      original(...args);
      if (window.location.hash !== before) silent.push(window.location.href);
    };
  }
  window.addEventListener('hashchange', event => {
    const at = silent.indexOf(event.newURL);
    if (at < 0) return;
    silent.splice(at, 1);
    event.stopImmediatePropagation();
  });
  for (const [key, value] of Object.entries(session)) window.sessionStorage.setItem(key, value);
  prepare({ window, document: window.document });
  const saved = Object.fromEntries(globals.map(name => [name, globalThis[name]]));
  for (const name of globals) globalThis[name] = window[name];
  globalThis.window = window;
  await import(`../../src/${entry}.ts?boot=${++boots}`);
  await settle();
  return {
    window,
    document: window.document,
    fetched,
    settle,
    async go(next) {
      window.location.hash = next;
      await settle();
    },
    resize(next) {
      window.innerWidth = next;
      for (const [query, callbacks] of listeners) {
        if (query.includes('min-width')) for (const callback of callbacks) callback({ matches: next >= Number(query.match(/\d+/)[0]) });
      }
    },
    setSystem(next) {
      system = next;
      for (const [query, callbacks] of listeners) {
        if (query.includes('prefers-color-scheme')) for (const callback of callbacks) callback({ matches: next === 'dark' });
      }
    },
    async close() {
      await window.happyDOM.close();
      for (const name of globals) globalThis[name] = saved[name];
    },
  };
}

export async function settle() {
  for (let i = 0; i < 12; i++) await new Promise(resolve => setTimeout(resolve, 5));
}

export const click = (page, node, init = {}) => node.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
