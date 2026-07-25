import { createRequire } from 'node:module';

import { expect, test } from '@rstest/core';
import type { RuleSetRule } from '@rspack/core';

import { TsCheckerRspackPlugin } from '../../../lib';
import { createFixture } from '../helpers/fixture';
import {
  closeCompiler,
  createCompiler,
  createRspackConfig,
  getStatsMessages,
  runCompiler,
  typeScriptRule,
} from '../helpers/rspack';

const require = createRequire(import.meta.url);

function createLoaderRule(
  loader: 'builtin-swc' | 'ts-loader' | 'babel-loader',
  configFile: string,
): RuleSetRule {
  if (loader === 'ts-loader') {
    return {
      test: /\.tsx?$/,
      loader: require.resolve('ts-loader'),
      options: {
        configFile,
        transpileOnly: true,
      },
    };
  }

  if (loader === 'babel-loader') {
    return {
      test: /\.tsx?$/,
      loader: require.resolve('babel-loader'),
      options: {
        presets: [require.resolve('@babel/preset-typescript')],
      },
    };
  }

  return typeScriptRule;
}

test.each([
  { loader: 'builtin-swc' },
  { loader: 'ts-loader' },
  { loader: 'babel-loader' },
] as const)(
  'reports checker diagnostics independently of the $loader transpiler',
  async ({ loader }) => {
    const fixture = await createFixture('basic');
    await fixture.replace('src/index.ts', 'add(1, 2)', "add(1, '2')");

    const plugin = new TsCheckerRspackPlugin({
      typescript: { tsgo: false },
    });
    const compiler = createCompiler(
      createRspackConfig(fixture.root, plugin, {
        module: {
          rules: [
            createLoaderRule(loader, fixture.path('tsconfig.json')),
          ],
        },
      }),
    );

    try {
      const stats = await runCompiler(compiler);
      const errors = getStatsMessages(stats).errors;

      expect(stats.hasErrors()).toBe(true);
      expect(errors.join('\n')).toContain('TS2345');
      expect(errors.join('\n')).not.toContain('Module build failed');
    } finally {
      await closeCompiler(compiler);
      await fixture.cleanup();
    }
  },
);
