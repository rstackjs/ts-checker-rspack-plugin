import { createRequire } from 'node:module';

import { expect, test } from '@rstest/core';
import type { Compiler, RspackPluginInstance } from '@rspack/core';
import { rspack as rspackV1 } from '@rspack/core-v1';

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

test('supports the declared Rspack 1 peer range', async () => {
  const fixture = await createFixture('basic');
  await fixture.replace('src/index.ts', 'add(1, 2)', "add(1, '2')");

  const plugin = new TsCheckerRspackPlugin({
    typescript: { tsgo: false },
  });
  const compiler = rspackV1({
    context: fixture.root,
    mode: 'development',
    entry: './src/index.ts',
    cache: false,
    devtool: false,
    module: {
      rules: [typeScriptRule],
    },
    output: {
      clean: true,
      filename: 'main.js',
      path: fixture.path('rspack-v1-dist'),
    },
    plugins: [plugin as unknown as RspackPluginInstance],
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
    },
  }) as unknown as Compiler;

  try {
    const stats = await runCompiler(compiler);
    expect(stats.hasErrors()).toBe(true);
    expect(getStatsMessages(stats).errors.join('\n')).toContain('TS2345');
  } finally {
    await closeCompiler(compiler);
    await fixture.cleanup();
  }
});

test('supports the TypeScript 5.0 compatibility baseline', async () => {
  const fixture = await createFixture('basic');
  await fixture.write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        declaration: true,
        lib: ['ES2020', 'DOM'],
        module: 'ESNext',
        moduleResolution: 'Node',
        outDir: './types',
        rootDir: './src',
        strict: true,
        target: 'ES2020',
      },
      include: ['src'],
    }),
  );
  await fixture.replace('src/index.ts', 'add(1, 2)', "add(1, '2')");

  const plugin = new TsCheckerRspackPlugin({
    typescript: {
      tsgo: false,
      typescriptPath: require.resolve('typescript-5-0'),
    },
  });
  const compiler = createCompiler(createRspackConfig(fixture.root, plugin));

  try {
    const stats = await runCompiler(compiler);
    expect(stats.hasErrors()).toBe(true);
    expect(getStatsMessages(stats).errors.join('\n')).toContain('TS2345');
  } finally {
    await closeCompiler(compiler);
    await fixture.cleanup();
  }
});
