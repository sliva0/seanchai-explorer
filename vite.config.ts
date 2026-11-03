import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    rolldownOptions: {
      input: { main: 'index.html', rfc: 'rfc.html', ...(mode === 'self-hosted' ? { viewer: 'viewer.html' } : {}) },
    },
  },
}));
