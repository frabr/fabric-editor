import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    environment: 'jsdom',
    include: [
      'src/**/*.browser.test.ts',
    ],
  },
  resolve: {
    alias: {
      // Force #fabric vers fabric (browser) au lieu de fabric/node
      '#fabric': 'fabric',
    },
  },
});
