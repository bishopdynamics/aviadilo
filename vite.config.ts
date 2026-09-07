import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import pkg from './package.json';

export default defineConfig(({ mode }) => ({
  root: mode === 'fixture' || mode === 'development' ? 'dev' : '.',
  define: { __AVIADILO_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    {
      name: 'aviadilo-version-banner',
      generateBundle(_options, bundle) {
        const entry = bundle['aviadilo.js'];
        if (entry?.type === 'chunk')
          entry.code = `/*! Aviadilo version: ${pkg.version} */\n${entry.code}`;
      },
    },
  ],
  build:
    mode === 'fixture'
      ? { outDir: '../dist/fixture', emptyOutDir: true }
      : {
          outDir: 'custom_components/aviadilo/frontend',
          emptyOutDir: true,
          lib: {
            entry: resolve('src/aviadilo-map.ts'),
            formats: ['es'],
            fileName: () => 'aviadilo.js',
          },
        },
}));
