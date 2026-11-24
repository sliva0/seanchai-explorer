import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  // Build options, as constants a build's code is reduced by: see src/build-options.ts.
  define: { SEANCHAI_UNLINKED: JSON.stringify(process.env.SEANCHAI_UNLINKED === '1') },
  // Components are .tsx, compiled for Preact's automatic runtime as tests/tsx.mjs compiles them for the unit tests.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    rolldownOptions: {
      input: { main: 'index.html', rfc: 'rfc.html', ...(mode === 'self-hosted' ? { viewer: 'viewer.html' } : {}) },
    },
  },
}));
