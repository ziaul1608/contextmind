import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    css: false,
    fileParallelism: false,

  },
  resolve: {
    alias: {
      '@contextmind/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
