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

test('writes declarations but leaves JavaScript emission to Rspack in write-dts mode', async () => {
  const fixture = await createFixture('basic');
  const plugin = new TsCheckerRspackPlugin({
    typescript: {
      mode: 'write-dts',
      tsgo: false,
    },
  });
  const compiler = createCompiler(
    createRspackConfig(fixture.root, plugin, { mode: 'production' }),
  );

  try {
    const stats = await runCompiler(compiler);
    expect(getStatsMessages(stats).errors).toEqual([]);
    expect(await fixture.exists('rspack-dist/main.js')).toBe(true);
    expect(await fixture.exists('types/index.d.ts')).toBe(true);
    expect(await fixture.exists('types/math.d.ts')).toBe(true);
    expect(await fixture.exists('types/index.js')).toBe(false);
    expect(await fixture.exists('types/math.js')).toBe(false);
  } finally {
    await closeCompiler(compiler);
    await fixture.cleanup();
  }
});

test.each([
  {
    name: 'default',
    mode: undefined,
    expected: [
      'packages/shared/lib/tsconfig.tsbuildinfo',
      'packages/app/lib/tsconfig.tsbuildinfo',
    ],
    absent: [
      'packages/shared/lib/index.js',
      'packages/shared/lib/index.d.ts',
      'packages/app/lib/index.js',
      'packages/app/lib/index.d.ts',
    ],
  },
  {
    name: 'readonly',
    mode: 'readonly',
    expected: [],
    absent: [
      'packages/shared/lib',
      'packages/app/lib',
    ],
  },
  {
    name: 'write-tsbuildinfo',
    mode: 'write-tsbuildinfo',
    expected: [
      'packages/shared/lib/tsconfig.tsbuildinfo',
      'packages/app/lib/tsconfig.tsbuildinfo',
    ],
    absent: [
      'packages/shared/lib/index.js',
      'packages/shared/lib/index.d.ts',
      'packages/app/lib/index.js',
      'packages/app/lib/index.d.ts',
    ],
  },
  {
    name: 'write-dts',
    mode: 'write-dts',
    expected: [
      'packages/shared/lib/tsconfig.tsbuildinfo',
      'packages/shared/lib/index.d.ts',
      'packages/shared/lib/index.d.ts.map',
      'packages/app/lib/tsconfig.tsbuildinfo',
      'packages/app/lib/index.d.ts',
      'packages/app/lib/index.d.ts.map',
    ],
    absent: [
      'packages/shared/lib/index.js',
      'packages/app/lib/index.js',
    ],
  },
  {
    name: 'write-references',
    mode: 'write-references',
    expected: [
      'packages/shared/lib/tsconfig.tsbuildinfo',
      'packages/shared/lib/index.d.ts',
      'packages/shared/lib/index.js',
      'packages/app/lib/tsconfig.tsbuildinfo',
      'packages/app/lib/index.d.ts',
      'packages/app/lib/index.js',
    ],
    absent: [],
  },
] as const)(
  'writes only the allowed SolutionBuilder artifacts in $name mode',
  async ({ mode, expected, absent }) => {
    const fixture = await createFixture('project-references');
    const plugin = new TsCheckerRspackPlugin({
      typescript: {
        build: true,
        ...(mode ? { mode } : {}),
        tsgo: false,
      },
    });
    const compiler = createCompiler(
      createRspackConfig(fixture.root, plugin, {
        entry: './packages/app/src/index.ts',
        mode: 'production',
        resolve: {
          alias: {
            '@fixture/shared': fixture.path('packages/shared/src'),
          },
        },
      }),
    );

    try {
      const stats = await runCompiler(compiler);
      expect(getStatsMessages(stats).errors).toEqual([]);
      expect(await fixture.exists('rspack-dist/main.js')).toBe(true);

      for (const path of expected) {
        expect(await fixture.exists(path), path).toBe(true);
      }
      for (const path of absent) {
        expect(await fixture.exists(path), path).toBe(false);
      }
    } finally {
      await closeCompiler(compiler);
      await fixture.cleanup();
    }
  },
);
