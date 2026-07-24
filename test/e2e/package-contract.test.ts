import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { expect, test } from '@rstest/core';

const execFileAsync = promisify(execFile);

interface CommandFailure extends Error {
  stderr?: string;
  stdout?: string;
}

test('publishes a package whose TypeScript options are usable by consumers', async () => {
  const packageRoot = process.cwd();
  const temporaryDirectory = await realpath(
    await mkdtemp(join(tmpdir(), 'ts-checker-package-contract-')),
  );
  const packDirectory = join(temporaryDirectory, 'pack');
  const consumerDirectory = join(temporaryDirectory, 'consumer');

  await mkdir(packDirectory);
  await mkdir(consumerDirectory);

  try {
    await execFileAsync(
      'pnpm',
      ['pack', '--pack-destination', packDirectory],
      { cwd: packageRoot },
    );
    const tarballName = (await readdir(packDirectory)).find((file) =>
      file.endsWith('.tgz'),
    );
    expect(tarballName).toBeTruthy();

    await writeFile(
      join(consumerDirectory, 'package.json'),
      JSON.stringify({
        name: 'ts-checker-package-contract-consumer',
        private: true,
        type: 'module',
        dependencies: {
          '@rspack/core': '2.1.4',
          'ts-checker-rspack-plugin': `file:${join(
            packDirectory,
            tarballName!,
          )}`,
          typescript: '6.0.3',
        },
      }),
    );
    await writeFile(
      join(consumerDirectory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'Node16',
          moduleResolution: 'Node16',
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: 'ES2020',
        },
        include: ['rspack.config.ts'],
      }),
    );
    await writeFile(
      join(consumerDirectory, 'rspack.config.ts'),
      [
        "import type { Configuration } from '@rspack/core';",
        "import { TsCheckerRspackPlugin } from 'ts-checker-rspack-plugin';",
        '',
        'const config: Configuration = {',
        '  plugins: [',
        '    new TsCheckerRspackPlugin({',
        "      async: 'invalid',",
        '    }),',
        '  ],',
        '};',
        '',
        'export default config;',
        '',
      ].join('\n'),
    );

    await execFileAsync(
      'pnpm',
      ['install', '--offline', '--ignore-workspace'],
      { cwd: consumerDirectory },
    );

    let typeCheckFailure: CommandFailure | undefined;
    try {
      await execFileAsync('pnpm', ['exec', 'tsc', '--noEmit'], {
        cwd: consumerDirectory,
      });
    } catch (error) {
      typeCheckFailure = error as CommandFailure;
    }

    expect(typeCheckFailure).toBeDefined();
    expect(
      `${typeCheckFailure?.stdout || ''}\n${typeCheckFailure?.stderr || ''}`,
    ).toContain(
      "Type 'string' is not assignable to type 'boolean | undefined'.",
    );

    await writeFile(
      join(consumerDirectory, 'rspack.config.ts'),
      [
        "import type { Configuration } from '@rspack/core';",
        "import { TsCheckerRspackPlugin } from 'ts-checker-rspack-plugin';",
        '',
        'const config: Configuration = {',
        '  plugins: [new TsCheckerRspackPlugin({ async: true })],',
        '};',
        '',
        'export default config;',
        '',
      ].join('\n'),
    );
    await expect(
      execFileAsync('pnpm', ['exec', 'tsc', '--noEmit'], {
        cwd: consumerDirectory,
      }),
    ).resolves.toBeDefined();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}, 60_000);
