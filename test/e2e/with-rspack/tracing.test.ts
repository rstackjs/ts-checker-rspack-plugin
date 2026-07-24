import { basename } from 'node:path';

import { expect, test } from '@rstest/core';

import { TsCheckerRspackPlugin } from '../../../lib';
import { createFixture } from '../helpers/fixture';
import {
  closeCompiler,
  createCompiler,
  createRspackConfig,
  getStatsMessages,
  runCompiler,
} from '../helpers/rspack';

test.each([{ build: false }, { build: true }])(
  'writes TypeScript trace files when build is $build',
  async ({ build }) => {
    const fixture = await createFixture('basic');
    const tsconfig = JSON.parse(await fixture.read('tsconfig.json'));
    tsconfig.compilerOptions.generateTrace = './traces';
    await fixture.write('tsconfig.json', JSON.stringify(tsconfig));

    const plugin = new TsCheckerRspackPlugin({
      typescript: {
        build,
        mode: 'readonly',
        tsgo: false,
      },
    });
    const compiler = createCompiler(createRspackConfig(fixture.root, plugin));

    try {
      const stats = await runCompiler(compiler);
      const traceFiles = await fixture.list('traces');

      expect(getStatsMessages(stats).errors).toEqual([]);
      expect(
        traceFiles.some((file) => /^trace.*\.json$/.test(basename(file))),
      ).toBe(true);
    } finally {
      await closeCompiler(compiler);
      await fixture.cleanup();
    }
  },
);
