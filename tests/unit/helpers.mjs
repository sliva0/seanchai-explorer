import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { commandIndex } from '../../src/commands.ts';

export const fixture = new URL('../fixtures/export/', import.meta.url);
export const readFixture = async file => JSON.parse(await readFile(new URL(file, fixture), 'utf8'));
const grammar = new URL('../../syntax/dad.tmLanguage.json', import.meta.url);
/** A few lines standing in for the Wireshark plugin a build serves, with its marked lines; npm run fixture leaves it. */
export const pluginFixture = new URL('../fixtures/plugin/seanchai_diameter.lua', import.meta.url);

/** The `commands.json` prepare would derive from the fixture, which the fixture leaves to it. */
async function commandsOfFixture() {
  const index = await readFixture('index.json');
  const documents = await Promise.all(index.documents.map(doc => readFixture(doc.path)));
  return commandIndex(documents, index.schema_version);
}

/** A self-hosted variant of the fixture: every ETSI document has a local PDF. */
function asSelfHosted(data) {
  const source = doc =>
    doc.source.kind === 'etsi-pdf' ? { ...doc, source: { ...doc.source, local: `sources/${doc.id}.pdf` } } : doc;
  if (data.documents) return { ...data, mode: 'self-hosted', documents: data.documents.map(source) };
  return data.source ? source(data) : data;
}

let boots = 0;
const globals = [
  'window',
  'document',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'matchMedia',
  'fetch',
  'innerWidth',
  'innerHeight',
  'HTMLElement',
  'Element',
  'Node',
  'requestAnimationFrame',
  'cancelAnimationFrame',
];
// An eased scroll is ended by one of node's own timers, which can fire after its page has closed and given the globals
// back: with nothing between pages for it to cancel, it cancels nothing.
globalThis.cancelAnimationFrame ??= () => {};

/**
 * Starts src/main.ts or another entry on a happy-dom page, with the fixture as its export.
 * `width` is the viewport, `transform` changes a data file before the page reads it, `text` replaces a text source,
 * `session` is what the tab's storage already holds, `clickTarget` the stored place a click on a name goes to first,
 * `commands` whether the build derived a command index, `plugin` whether it has the Wireshark plugin, whose text
 * `transform` is given too, and `prepare` runs on the page before it starts.
 */
export async function boot({
  hash = '',
  url,
  entry = 'main',
  html = '<div id="app"></div>',
  width = 1280,
  mode = 'public',
  system = 'light',
  stored,
  clickTarget,
  session = {},
  prepare = () => {},
  text,
  commands = true,
  plugin = true,
  transform = (_path, data) => data,
} = {}) {
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
      get matches() {
        return min ? window.innerWidth >= Number(min[1]) : system === 'dark';
      },
      addEventListener(_type, listener) {
        listeners.set(query, [...(listeners.get(query) ?? []), listener]);
      },
      removeEventListener() {},
    };
    return state;
  };
  window.fetch = async input => {
    const parsed = new URL(input);
    const path = parsed.pathname.replace(/^\//, '');
    fetched.push(parsed.hostname === 'localhost' ? path : parsed.href);
    if (path === 'syntax/dad.tmLanguage.json')
      return { ok: true, json: async () => JSON.parse(await readFile(grammar, 'utf8')) };
    if (path === 'plugin/seanchai_diameter.lua') {
      if (!plugin) return { ok: false, status: 404 };
      const bytes = new TextEncoder().encode(transform(path, await readFile(pluginFixture, 'utf8')));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => bytes.buffer,
        text: async () => new TextDecoder().decode(bytes),
      };
    }
    const file = new URL(path.replace(/^data\//, ''), fixture);
    if (path === 'data/commands.json' && commands)
      return { ok: true, json: async () => transform(path, await commandsOfFixture()) };
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
  boots += 1;
  await import(`../../src/${entry}.ts?boot=${boots}`);
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
        if (query.includes('min-width'))
          for (const callback of callbacks) callback({ matches: next >= Number(query.match(/\d+/)[0]) });
      }
    },
    setSystem(next) {
      system = next;
      for (const [query, callbacks] of listeners) {
        if (query.includes('prefers-color-scheme'))
          for (const callback of callbacks) callback({ matches: next === 'dark' });
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

export const click = (page, node, init = {}) =>
  node.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true, ...init }));

// A failed assert.equal prints its operands, and printing a DOM node walks the whole document: these compare nodes
// with === and name a node only by its tag, id and class.
const named = node =>
  node?.nodeType === 1
    ? `<${node.localName}${node.id ? `#${node.id}` : ''}${node.getAttribute('class') ? `.${node.getAttribute('class').trim().split(/\s+/).join('.')}` : ''}>`
    : node?.nodeType
      ? node.nodeName
      : String(node);
/** Asserts there is no node: `node` is null. */
export const absent = (node, message) => assert.ok(node === null, message ?? `expected no node, found ${named(node)}`);
/** Asserts there is a node: `node` is neither null nor undefined. */
export const present = (node, message) =>
  assert.ok(node !== null && node !== undefined, message ?? `expected a node, found ${named(node)}`);
/** Asserts `actual` is the node `expected`. */
export const same = (actual, expected, message) =>
  assert.ok(actual === expected, message ?? `expected ${named(expected)}, found ${named(actual)}`);
/** Asserts `actual` is not the node `other`. */
export const notSame = (actual, other, message) =>
  assert.ok(actual !== other, message ?? `expected another node than ${named(other)}`);

// Shared by the app-*.test.mjs files, which boot the whole site.

/** The first name in the text whose link starts with `href`. */
export const nameLink = (document, href) =>
  [...document.querySelectorAll('pre a[data-avp]')].find(a => a.getAttribute('href').startsWith(href));
/** Where the source pane's frame points, or null without a frame or before it is loaded. */
export const frameSrc = document => document.querySelector('iframe')?.getAttribute('src');
/** The parameters the source pane's reader was given in its frame's hash. */
export const paneAt = document => new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
/** A right-click on `node`; false if the page took it over. */
export const rightClick = (page, node) =>
  node.dispatchEvent(new page.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
/** TS 29.061's TMGI table row name. */
export const tmgi = document =>
  [...document.querySelectorAll('.table-row a[data-avp]')].find(node => node.dataset.avp === 'TMGI');
/** The names a command `key` such as `265 answer` is printed as in the text. */
export const commandNames = (document, key) => [...document.querySelectorAll(`pre [data-command="${key}"]`)];

/** Right-clicks `node` and returns the popup it opens. */
export const popupOf = async (page, node) => {
  rightClick(page, node);
  await settle();
  return page.document.querySelector('.avp-popup');
};
/** A popup's identity lines. */
export const identities = popup => [...popup.querySelectorAll('.popup-identity p')].map(line => line.textContent);
/** A popup's value table rows, as their cells' text. */
export const tableRows = popup =>
  [...popup.querySelectorAll('.popup-tables .place-table')].map(row => [...row.children].map(node => node.textContent));

// A page laid out as a browser would, for what the view reads back: lines of 20 pixels under a pane at the top of the window.
export const layOut = page => {
  const { HTMLElement } = page.window;
  const rect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.id === 'document') return { top: 0, bottom: 500 };
    if (!this.classList.contains('dad-line')) return rect.call(this);
    const top = Number(this.dataset.line) * 20 - this.closest('#document').scrollTop;
    return { top, bottom: top + 20 };
  };
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return 1e7;
    },
  });
};
/** A keydown on `target`, the body by default; returns the event to see whether it was taken. */
export const press = (page, init, target = page.document.body) => {
  const event = new page.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
/** The document view's scrolling pane. */
export const pane = document => document.querySelector('#document');
/** Waits out a smooth scroll. */
export const easing = () => new Promise(resolve => setTimeout(resolve, 320));
