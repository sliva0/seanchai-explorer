import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { PLUGIN_PATH, explorerAddresses, explorerOf, explorerProblem, normalAddress } from './src/plugin-file.ts';

/**
 * The addresses the site counts as its own (src/build-options.d.ts): `SEANCHAI_EXPLORER_URLS`, else, but in a build
 * naming nothing of the project, the address on the marked line of the plugin prepare left in public/.
 */
function explorerOwn(): string[] {
  const raw = process.env.SEANCHAI_EXPLORER_URLS;
  if (raw?.trim()) {
    const checked = explorerAddresses(raw);
    if ('problem' in checked) throw new Error(explorerProblem(raw, checked));
    return checked.addresses;
  }
  const file = `public/${PLUGIN_PATH}`;
  if (process.env.SEANCHAI_UNLINKED === '1' || !existsSync(file)) return [];
  const line = explorerOf(readFileSync(file, 'utf8'));
  const address = line ? normalAddress(line) : null;
  return address ? [address] : [];
}

export default defineConfig(({ mode }) => ({
  base: './',
  // Build options, as constants a build's code is reduced by: see src/build-options.d.ts.
  define: {
    SEANCHAI_UNLINKED: JSON.stringify(process.env.SEANCHAI_UNLINKED === '1'),
    SEANCHAI_EXPLORER_ADDRESSES: JSON.stringify(explorerOwn()),
  },
  // Components are .tsx, compiled for Preact's automatic runtime as tests/tsx.mjs compiles them for the unit tests.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    rolldownOptions: {
      input: { main: 'index.html', rfc: 'rfc.html', ...(mode === 'self-hosted' ? { viewer: 'viewer.html' } : {}) },
    },
  },
}));
