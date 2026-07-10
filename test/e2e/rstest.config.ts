import { defineConfig } from '@rstest/core';

export default defineConfig({
  env: {
    // Let Rsbuild choose the mode based on the command.
    NODE_ENV: undefined,
  },
  root: __dirname,
  include: ['./with-rsbuild/**/*.test.ts'],
  isolate: false,
  testTimeout: 30_000,
});
