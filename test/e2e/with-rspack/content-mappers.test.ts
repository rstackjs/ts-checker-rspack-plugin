import { expect, test } from 'rstack/test';

import { TsCheckerRspackPlugin } from '../../../lib';
import { contentMapperTypeScriptPath, createContentMapperFixture } from '../helpers/content-mapper';
import {
  closeCompiler,
  closeWatching,
  createCompiler,
  createRspackConfig,
  recordCompiler,
  runCompiler,
  typeScriptRule,
  watchCompiler,
} from '../helpers/rspack';

test('runs content mappers in referenced projects', async () => {
  const fixture = await createContentMapperFixture();
  await fixture.write('solution.json', JSON.stringify({ files: [], references: [{ path: '.' }] }));
  const compiler = createCompiler(
    createRspackConfig(
      fixture.root,
      new TsCheckerRspackPlugin({
        typescript: {
          typescriptPath: contentMapperTypeScriptPath,
          configFile: 'solution.json',
          build: true,
          mode: 'write-references',
        },
      }),
    ),
  );
  try {
    const stats = await runCompiler(compiler);
    expect(stats.hasErrors()).toBe(false);
  } finally {
    await closeCompiler(compiler);
    await fixture.cleanup();
  }
});

test('rechecks mapped styles instead of reusing cached diagnostics', async () => {
  const fixture = await createContentMapperFixture();
  await fixture.write('src/index.ts', 'import "./value.module.css";\n');
  const compiler = createCompiler(
    createRspackConfig(
      fixture.root,
      new TsCheckerRspackPlugin({
        async: false,
        typescript: { typescriptPath: contentMapperTypeScriptPath },
      }),
      { module: { rules: [typeScriptRule, { test: /\.css$/, type: 'asset/source' }] } },
    ),
  );
  const recorder = recordCompiler(compiler);
  const { watching, fatalErrors } = watchCompiler(compiler);
  try {
    await recorder.waitForBuildAndIssueEventAfter(0, 0, (event) => event.issues.length === 0);
    const buildIndex = recorder.builds.length;
    const issueIndex = recorder.issueEvents.length;
    await fixture.write('src/value.module.css', 'export default "wrong";\n');
    await recorder.waitForBuildAndIssueEventAfter(buildIndex, issueIndex, (event) =>
      event.issues.some((issue) => issue.code === 'TS2322'),
    );
    const nextBuildIndex = recorder.builds.length;
    const nextIssueIndex = recorder.issueEvents.length;
    await fixture.write('src/value.module.css', 'export default 42;\n');
    await recorder.waitForBuildAndIssueEventAfter(
      nextBuildIndex,
      nextIssueIndex,
      (event) => event.issues.length === 0,
    );
    expect(fatalErrors).toEqual([]);
    expect(recorder.workerErrors).toEqual([]);
  } finally {
    await closeWatching(watching);
    await fixture.cleanup();
  }
});
