import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig(({ mode }) => ({
  // Absolute base on GitHub Pages so deep links like /kristole/2/3 still load the assets.
  base: mode === 'production' ? '/kristole/' : '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
}));
