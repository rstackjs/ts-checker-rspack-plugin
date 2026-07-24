import { expect, test } from '@rstest/core';

import { TsCheckerRspackPlugin } from '../../../lib';
import { createFixture } from '../helpers/fixture';
import {
  closeWatching,
  type CompilerRecorder,
  createCompiler,
  createRspackConfig,
  getStatsMessages,
  recordCompiler,
  watchCompiler,
} from '../helpers/rspack';

async function waitForInitialCompilation(
  recorder: CompilerRecorder,
): Promise<void> {
  await Promise.all([
    recorder.waitForBuildAfter(0),
    recorder.waitForIssuesAfter(0, (issues) => issues.length === 0),
  ]);
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
}

async function waitForIssuesForFile(
  recorder: CompilerRecorder,
  index: number,
  relativePath: string,
  kind: 'changedFiles' | 'deletedFiles',
  predicate: (issues: CompilerRecorder['issues'][number]) => boolean,
): Promise<void> {
  await recorder.waitForIssueEventAfter(index, (event) => {
    const hasFile = event.change?.[kind].some((file) =>
      file.replaceAll('\\', '/').endsWith(relativePath),
    );
    return Boolean(hasFile && predicate(event.issues));
  });
}

test.each([{ async: false }, { async: true }])(
  'tracks changed, deleted, and restored TypeScript files when async is $async',
  async ({ async }) => {
    const fixture = await createFixture('basic');
    const plugin = new TsCheckerRspackPlugin({
      async,
      typescript: { tsgo: false },
    });
    const compiler = createCompiler(createRspackConfig(fixture.root, plugin));
    const recorder = recordCompiler(compiler);
    const { watching, fatalErrors } = watchCompiler(compiler);

    try {
      await waitForInitialCompilation(recorder);

      let issueEventIndex = recorder.issueEvents.length;
      await fixture.replace('src/index.ts', 'add(1, 2)', "add(1, '2')");
      await waitForIssuesForFile(
        recorder,
        issueEventIndex,
        '/src/index.ts',
        'changedFiles',
        (issues) => issues.some((issue) => issue.code === 'TS2345'),
      );

      issueEventIndex = recorder.issueEvents.length;
      await fixture.replace('src/index.ts', "add(1, '2')", 'add(1, 2)');
      await waitForIssuesForFile(
        recorder,
        issueEventIndex,
        '/src/index.ts',
        'changedFiles',
        (issues) => issues.length === 0,
      );

      issueEventIndex = recorder.issueEvents.length;
      await fixture.remove('src/math.ts');
      await waitForIssuesForFile(
        recorder,
        issueEventIndex,
        '/src/math.ts',
        'deletedFiles',
        (issues) => issues.some((issue) => issue.code === 'TS2307'),
      );

      issueEventIndex = recorder.issueEvents.length;
      await fixture.write(
        'src/math.ts',
        [
          'function add(left: number, right: number): number {',
          '  return left + right;',
          '}',
          '',
          'export { add };',
          '',
        ].join('\n'),
      );
      const restoredEvent = await recorder.waitForIssueEventAfter(
        issueEventIndex,
        (event) =>
          Boolean(
            event.change?.changedFiles.some((file) =>
              file.replaceAll('\\', '/').endsWith('/src/math.ts'),
            ),
          ),
      );
      expect(restoredEvent.issues).toEqual([]);

      expect(fatalErrors).toEqual([]);
      expect(recorder.workerErrors).toEqual([]);
    } finally {
      await closeWatching(watching);
      await fixture.cleanup();
    }
  },
  20_000,
);

test.each([{ async: false }, { async: true }])(
  'ignores package.json in incremental TypeScript changes when async is $async',
  async ({ async }) => {
    const fixture = await createFixture('basic');
    await fixture.write(
      'package/package.json',
      JSON.stringify({
        name: 'fixture-package',
        version: '1.0.0',
        main: 'index.js',
        types: 'index.d.ts',
      }),
    );
    await fixture.write(
      'package/index.d.ts',
      'export function sayHello(name: string): string;\n',
    );
    await fixture.write(
      'package/index.js',
      'exports.sayHello = (name) => `Hello ${name}`;\n',
    );
    await fixture.write(
      'src/index.ts',
      [
        "import { sayHello } from '../package';",
        '',
        "const result = sayHello('World');",
        '',
        'if (typeof document !== "undefined") {',
        '  document.body.innerHTML = `<main>${result}</main>`;',
        '}',
        '',
        'export { result };',
        '',
      ].join('\n'),
    );

    const plugin = new TsCheckerRspackPlugin({
      async,
      typescript: { tsgo: false },
    });
    const compiler = createCompiler(createRspackConfig(fixture.root, plugin));
    const recorder = recordCompiler(compiler);
    const { watching, fatalErrors } = watchCompiler(compiler);

    try {
      await waitForInitialCompilation(recorder);
      const buildIndex = recorder.builds.length;
      const changeIndex = recorder.changes.length;
      const issueEventIndex = recorder.issueEvents.length;

      await fixture.replace(
        'package/package.json',
        '"version":"1.0.0"',
        '"version":"1.0.1"',
      );

      const stats = await recorder.waitForBuildAfter(buildIndex);
      const issueEvent = await recorder.waitForIssueEventAfter(
        issueEventIndex,
        (event) => event.compilation === stats.compilation,
      );
      const changes = recorder.changes.slice(changeIndex);

      expect(getStatsMessages(stats).errors).toEqual([]);
      expect(issueEvent.issues).toEqual([]);
      expect(
        changes.some((change) =>
          [...change.changedFiles, ...change.deletedFiles].some((file) =>
            file.endsWith('package.json'),
          ),
        ),
      ).toBe(false);
      expect(fatalErrors).toEqual([]);
      expect(recorder.workerErrors).toEqual([]);
    } finally {
      await closeWatching(watching);
      await fixture.cleanup();
    }
  },
  20_000,
);

test.each([{ async: false }, { async: true }])(
  'emits declarations for new files in watch mode when async is $async',
  async ({ async }) => {
    const fixture = await createFixture('basic');
    const plugin = new TsCheckerRspackPlugin({
      async,
      typescript: {
        mode: 'write-dts',
        tsgo: false,
      },
    });
    const compiler = createCompiler(createRspackConfig(fixture.root, plugin));
    const recorder = recordCompiler(compiler);
    const { watching, fatalErrors } = watchCompiler(compiler);

    try {
      await waitForInitialCompilation(recorder);
      expect(await fixture.exists('types/index.d.ts')).toBe(true);

      let issueEventIndex = recorder.issueEvents.length;
      await fixture.write(
        'src/organization.ts',
        'export const organization: number = 1;\n',
      );
      await waitForIssuesForFile(
        recorder,
        issueEventIndex,
        '/src/organization.ts',
        'changedFiles',
        (issues) => issues.length === 0,
      );
      expect(await fixture.exists('types/organization.d.ts')).toBe(true);

      issueEventIndex = recorder.issueEvents.length;
      await fixture.replace(
        'src/organization.ts',
        'organization: number = 1',
        "organization: number = 'invalid'",
      );
      await waitForIssuesForFile(
        recorder,
        issueEventIndex,
        '/src/organization.ts',
        'changedFiles',
        (issues) => issues.some((issue) => issue.code === 'TS2322'),
      );

      issueEventIndex = recorder.issueEvents.length;
      await fixture.replace(
        'src/organization.ts',
        "organization: number = 'invalid'",
        'organization: number = 2',
      );
      await waitForIssuesForFile(
        recorder,
        issueEventIndex,
        '/src/organization.ts',
        'changedFiles',
        (issues) => issues.length === 0,
      );

      expect(await fixture.read('types/organization.d.ts')).toContain(
        'organization: number',
      );
      expect(await fixture.exists('types/organization.js')).toBe(false);
      expect(fatalErrors).toEqual([]);
      expect(recorder.workerErrors).toEqual([]);
    } finally {
      await closeWatching(watching);
      await fixture.cleanup();
    }
  },
  20_000,
);

test('propagates SolutionBuilder diagnostics across referenced projects', async () => {
  const fixture = await createFixture('project-references');
  const plugin = new TsCheckerRspackPlugin({
    async: false,
    typescript: {
      build: true,
      mode: 'write-dts',
      tsgo: false,
    },
  });
  const compiler = createCompiler(
    createRspackConfig(fixture.root, plugin, {
      entry: './packages/app/src/index.ts',
      resolve: {
        alias: {
          '@fixture/shared': fixture.path('packages/shared/src'),
        },
      },
    }),
  );
  const recorder = recordCompiler(compiler);
  const { watching, fatalErrors } = watchCompiler(compiler);

  try {
    const [, initialIssues] = await Promise.all([
      recorder.waitForBuildAfter(0),
      recorder.waitForIssuesAfter(0, () => true),
    ]);
    expect(initialIssues).toEqual([]);

    let issueEventIndex = recorder.issueEvents.length;
    await fixture.replace(
      'packages/shared/src/index.ts',
      'return value * 2;',
      'return value.toUpperCase();',
    );
    await waitForIssuesForFile(
      recorder,
      issueEventIndex,
      '/packages/shared/src/index.ts',
      'changedFiles',
      (issues) => issues.some((issue) => issue.code === 'TS2339'),
    );

    issueEventIndex = recorder.issueEvents.length;
    await fixture.write(
      'packages/shared/src/index.ts',
      [
        'function double(value: string): number {',
        '  return value.length;',
        '}',
        '',
        'export { double };',
        '',
      ].join('\n'),
    );
    await waitForIssuesForFile(
      recorder,
      issueEventIndex,
      '/packages/shared/src/index.ts',
      'changedFiles',
      (issues) => issues.some((issue) => issue.code === 'TS2345'),
    );

    issueEventIndex = recorder.issueEvents.length;
    await fixture.replace(
      'packages/app/src/index.ts',
      'double(2)',
      "double('2')",
    );
    await waitForIssuesForFile(
      recorder,
      issueEventIndex,
      '/packages/app/src/index.ts',
      'changedFiles',
      (issues) => issues.length === 0,
    );

    issueEventIndex = recorder.issueEvents.length;
    await fixture.write(
      'packages/app/src/nested/additional.ts',
      'export const additional = 10;\n',
    );
    await waitForIssuesForFile(
      recorder,
      issueEventIndex,
      '/packages/app/src/nested/additional.ts',
      'changedFiles',
      (issues) => issues.length === 0,
    );

    issueEventIndex = recorder.issueEvents.length;
    await fixture.write(
      'packages/app/src/index.ts',
      `${await fixture.read('packages/app/src/index.ts')}\nexport { additional } from './nested/additional';\n`,
    );
    await waitForIssuesForFile(
      recorder,
      issueEventIndex,
      '/packages/app/src/index.ts',
      'changedFiles',
      (issues) => issues.length === 0,
    );

    expect(
      await fixture.exists('packages/app/lib/nested/additional.d.ts'),
    ).toBe(true);
    expect(fatalErrors).toEqual([]);
    expect(recorder.workerErrors).toEqual([]);
  } finally {
    await closeWatching(watching);
    await fixture.cleanup();
  }
}, 20_000);
