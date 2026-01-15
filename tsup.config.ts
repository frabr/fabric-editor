import { defineConfig } from 'tsup';

export default defineConfig([
  // Build browser (index.ts) - fabric reste externe
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: ['#fabric', 'canvas'],
  },
  // Build Node.js (node.ts) - fabric résolu via package.json #imports
  {
    entry: ['src/node.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false, // Ne pas nettoyer (index.ts déjà buildé)
    platform: 'node',
    external: ['canvas', '#fabric'],
  },
]);
