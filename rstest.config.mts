import { defineConfig, defineInlineProject } from '@rstest/core';

// Disable color in test
process.env.NO_COLOR = '1';
process.env.FORCE_COLOR = '0';

export default defineConfig({
  isolate: false,
  projects: [
    defineInlineProject({
      name: 'unit',
      root: 'test/unit',
      globals: true,
      source: {
        tsconfigPath: '../tsconfig.json',
      },
      output: {
        module: true,
      },
    }),
    defineInlineProject({
      name: 'e2e',
      root: 'test/e2e',
      env: {
        // Let Rsbuild choose the mode based on the command.
        NODE_ENV: undefined,
      },
    }),
  ],
});
