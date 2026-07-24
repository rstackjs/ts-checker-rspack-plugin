import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { expect, test } from '@rstest/core';

import { TsCheckerRspackPlugin } from '../../../lib';
import { createFixture } from '../helpers/fixture';
import {
  closeCompiler,
  closeWatching,
  createCompiler,
  createRspackConfig,
  getStatsMessages,
  recordCompiler,
  runCompiler,
  watchCompiler,
} from '../helpers/rspack';

test('reloads TypeScript configuration changes in watch mode', async () => {
  const fixture = await createFixture('basic');
  const plugin = new TsCheckerRspackPlugin({
    async: false,
    typescript: { tsgo: false },
  });
  const compiler = createCompiler(createRspackConfig(fixture.root, plugin));
  const recorder = recordCompiler(compiler);
  const { watching, fatalErrors } = watchCompiler(compiler);

  try {
    await recorder.waitForIssuesAfter(0, (issues) => issues.length === 0);

    let issueIndex = recorder.issues.length;
    await fixture.replace(
      'tsconfig.json',
      '"lib": ["ES2020", "DOM"]',
      '"lib": ["ES2020"]',
    );

    const withoutDom = await recorder.waitForIssuesAfter(
      issueIndex,
      (issues) =>
        issues.some(
          (issue) =>
            issue.code === 'TS2584' &&
            issue.message.includes("Cannot find name 'document'"),
        ),
    );
    expect(withoutDom.filter((issue) => issue.code === 'TS2584')).toHaveLength(2);

    issueIndex = recorder.issues.length;
    await fixture.replace(
      'tsconfig.json',
      '"lib": ["ES2020"]',
      '"lib": ["ES2020", "DOM"]',
    );
    await recorder.waitForIssuesAfter(issueIndex, (issues) => issues.length === 0);

    expect(fatalErrors).toEqual([]);
    expect(recorder.workerErrors).toEqual([]);
  } finally {
    await closeWatching(watching);
    await fixture.cleanup();
  }
});

test('applies configOverwrite to compiler options and root files', async () => {
  const cases = [
    {
      name: 'compilerOptions',
      configOverwrite: {
        compilerOptions: {
          lib: ['ES2020'],
        },
      },
      expected: /TS2584|Cannot find name 'document'/,
    },
    {
      name: 'include',
      configOverwrite: {
        include: [],
      },
      expected: /TS18003|No inputs were found/,
    },
  ] as const;

  for (const testCase of cases) {
    const fixture = await createFixture('basic');
    const plugin = new TsCheckerRspackPlugin({
      typescript: {
        configOverwrite: testCase.configOverwrite,
        tsgo: false,
      },
    });
    const compiler = createCompiler(createRspackConfig(fixture.root, plugin));

    try {
      const stats = await runCompiler(compiler);
      const messages = getStatsMessages(stats);

      expect(stats.hasErrors(), testCase.name).toBe(true);
      expect(messages.errors.join('\n'), testCase.name).toMatch(testCase.expected);
    } finally {
      await closeCompiler(compiler);
      await fixture.cleanup();
    }
  }
});

test('resolves configFile and context independently from process.cwd()', async () => {
  const fixture = await createFixture('basic');
  const originalCwd = process.cwd();
  const independentCwd = await realpath(tmpdir());

  await fixture.remove('tsconfig.json');
  await fixture.write(
    'config/tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        lib: ['ES2020', 'DOM'],
        module: 'Node16',
        moduleResolution: 'Node16',
        rootDir: 'src',
        strict: true,
        target: 'ES2020',
      },
      include: ['src'],
    }),
  );

  const createContextCompiler = () => {
    const plugin = new TsCheckerRspackPlugin({
      typescript: {
        configFile: 'config/tsconfig.json',
        context: fixture.root,
        tsgo: false,
      },
    });
    return createCompiler(createRspackConfig(fixture.root, plugin));
  };
  const runContextCompiler = async () => {
    const compiler = createContextCompiler();
    try {
      return await runCompiler(compiler);
    } finally {
      await closeCompiler(compiler);
    }
  };

  try {
    process.chdir(independentCwd);

    let stats = await runContextCompiler();
    expect(stats.hasErrors()).toBe(false);

    await fixture.replace('src/index.ts', 'add(1, 2)', "add(1, '2')");
    stats = await runContextCompiler();

    expect(stats.hasErrors()).toBe(true);
    expect(getStatsMessages(stats).errors.join('\n')).toContain('TS2345');
  } finally {
    process.chdir(originalCwd);
    await fixture.cleanup();
  }
});

test('uses a custom formatter for compilation issues', async () => {
  const fixture = await createFixture('basic');
  await fixture.replace('src/index.ts', 'add(1, 2)', "add(1, '2')");

  const plugin = new TsCheckerRspackPlugin({
    formatter: (issue) => `CUSTOM ${issue.code}: ${issue.message}`,
    typescript: { tsgo: false },
  });
  const compiler = createCompiler(createRspackConfig(fixture.root, plugin));

  try {
    const stats = await runCompiler(compiler);
    const errors = getStatsMessages(stats).errors.join('\n');

    expect(stats.hasErrors()).toBe(true);
    expect(errors).toContain(
      "CUSTOM TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
    );
  } finally {
    await closeCompiler(compiler);
    await fixture.cleanup();
  }
});
