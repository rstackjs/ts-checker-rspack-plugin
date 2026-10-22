import { expect, test } from 'rstack/test';

import { TsCheckerRspackPlugin } from '../../../lib';
import { createFixture } from '../helpers/fixture';
import {
  closeCompiler,
  closeWatching,
  createCompiler,
  createRspackConfig,
  recordCompiler,
  runCompiler,
  watchCompiler,
} from '../helpers/rspack';

async function createReferenceFixture() {
  const fixture = await createFixture('basic');
  await fixture.write('reference/src/index.ts', 'export const value: number = 1;\n');
  await fixture.write(
    'reference/tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        composite: true,
        noEmit: true,
        rootDir: 'src',
        module: 'Node16',
        skipLibCheck: true,
      },
      include: ['src'],
    }),
  );
  const rootConfig = JSON.parse(await fixture.read('tsconfig.json'));
  rootConfig.compilerOptions.noEmit = true;
  rootConfig.references = [{ path: './reference' }];
  await fixture.write('tsconfig.json', JSON.stringify(rootConfig));
  return fixture;
}

async function expectSettled(recorder: ReturnType<typeof recordCompiler>) {
  const builds = recorder.builds.length;
  const checks = recorder.changes.length;
  // Chokidar waits for two seconds of stable output before reporting additions.
  await new Promise((resolve) => setTimeout(resolve, 2800));
  expect(recorder.builds).toHaveLength(builds);
  expect(recorder.changes).toHaveLength(checks);
}

test('builds unbuilt references with write-references despite tsconfig noEmit', async () => {
  const fixture = await createReferenceFixture();
  const compiler = createCompiler(
    createRspackConfig(
      fixture.root,
      new TsCheckerRspackPlugin({
        typescript: { tsgo: true, build: true, mode: 'write-references' },
      }),
    ),
  );
  try {
    const stats = await runCompiler(compiler);
    expect(stats.hasErrors()).toBe(false);
    expect(await fixture.exists('types/index.js')).toBe(true);
    expect(await fixture.exists('reference/src/index.js')).toBe(true);
    expect(await fixture.exists('reference/src/index.d.ts')).toBe(true);
  } finally {
    await closeCompiler(compiler);
    await fixture.cleanup();
  }
});

test('filters emitted reference outputs without ignoring added source files', async () => {
  const fixture = await createReferenceFixture();
  const compiler = createCompiler(
    createRspackConfig(
      fixture.root,
      new TsCheckerRspackPlugin({
        async: false,
        typescript: { tsgo: true, build: true, mode: 'write-references' },
      }),
    ),
  );
  const recorder = recordCompiler(compiler);
  const { watching, fatalErrors } = watchCompiler(compiler);
  try {
    await recorder.waitForBuildAndIssueEventAfter(0, 0, (event) => event.issues.length === 0);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await expectSettled(recorder);
    const buildIndex = recorder.builds.length;
    const issueIndex = recorder.issueEvents.length;
    await fixture.write('reference/src/added.ts', 'export const added = 2;\n');
    await recorder.waitForBuildAndIssueEventAfter(
      buildIndex,
      issueIndex,
      (event) => event.issues.length === 0,
    );
    expect(await fixture.exists('reference/src/added.js')).toBe(true);
    await expectSettled(recorder);
    expect(fatalErrors).toEqual([]);
    expect(recorder.workerErrors).toEqual([]);
  } finally {
    await closeWatching(watching);
    await fixture.cleanup();
  }
}, 20_000);
