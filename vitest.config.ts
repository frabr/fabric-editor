import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    // Par défaut: environnement Node.js
    environment: 'node',
    include: [
      'src/**/*.test.ts',
    ],
    exclude: [
      'src/**/*.browser.test.ts',
    ],
  },
});
