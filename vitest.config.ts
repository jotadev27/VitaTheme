import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    /**
     * Long enough for the tests that convert a picture.
     *
     * Reducing a wallpaper to a palette is a second of real arithmetic, and several of these
     * do it. The default of five seconds turns that into a flake under load; this is still
     * short enough to catch something that has actually stopped.
     */
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
    },
  },
});
