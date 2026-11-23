import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  // Components are .tsx, compiled for Preact's automatic runtime as tests/tsx.mjs compiles them for the unit tests.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    rolldownOptions: {
      input: { main: 'index.html', rfc: 'rfc.html', ...(mode === 'self-hosted' ? { viewer: 'viewer.html' } : {}) },
    },
  },
}));
