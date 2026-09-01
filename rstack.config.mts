// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';
import { defineInlineProject } from 'rstack/test';

define.lib({
  lib: [
    {
      source: {
        entry: {
          index: './src/index.ts',
          getIssuesWorker: './src/typescript/worker/get-issues-worker.ts',
          getDependenciesWorker: './src/typescript/worker/get-dependencies-worker.ts',
        },
      },
      format: 'cjs',
      syntax: 'es2021',
      output: {
        distPath: 'lib',
      },
      dts: true,
    },
  ],
});

define.test(() => {
  // Disable color in test
  process.env.NO_COLOR = '1';
  process.env.FORCE_COLOR = '0';

  return {
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
  };
});

define.lint(({ js, ts }) => [
  js.configs.recommended,
  ts.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);

define.fmt({
  printWidth: 100,
  singleQuote: true,
});
