import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  base: '/provably-fair-verifier/',
  server: { port: 5174 },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
});
