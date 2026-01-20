import { dirname, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  createRsbuild as baseCreateRsbuild,
  mergeRsbuildConfig,
  type CreateRsbuildOptions,
} from '@rsbuild/core';
import { webpackProvider } from '@rsbuild/webpack';
import { pluginSwc } from '@rsbuild/plugin-webpack-swc';
import { TsCheckerRspackPlugin } from '../../../lib';
import { getRandomPort, proxyConsole } from '../helper';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Although this plugin is designed for Rspack, it can also be used in webpack in some cases.
 * So we need to test the webpack compatibility.
 */
const createRsbuild = async (config: CreateRsbuildOptions) => {
  const rsbuildConfig = mergeRsbuildConfig(
    config.rsbuildConfig,
    { server: { port: getRandomPort() } },
    process.env.WEBPACK
      ? {
          tools: {
            webpack: config.rsbuildConfig?.tools?.rspack as any,
          },
          dev: {
            progressBar: false,
          },
          provider: webpackProvider,
          plugins: [pluginSwc()],
        }
      : {},
  );

  return await baseCreateRsbuild({
    cwd: __dirname,
    rsbuildConfig,
  });
};

test('should throw error when exist type errors', async () => {
  const { logs, restore } = proxyConsole();

  const rsbuild = await createRsbuild({
    rsbuildConfig: {
      tools: {
        rspack: {
          plugins: [new TsCheckerRspackPlugin()],
        },
      },
    },
  });

  await expect(rsbuild.build()).rejects.toThrowError('build failed!');

  expect(logs.find((log) => log.includes('File:') && log.includes('/src/index.ts'))).toBeTruthy();

  expect(
    logs.find((log) =>
      log.includes(`Argument of type 'string' is not assignable to parameter of type 'number'.`),
    ),
  ).toBeTruthy();

  restore();
});

test('should throw error when exist type errors in dev mode', async ({ page }) => {
  const { logs, restore } = proxyConsole();

  const rsbuild = await createRsbuild({
    rsbuildConfig: {
      tools: {
        rspack: {
          plugins: [
            new TsCheckerRspackPlugin({
              async: false,
            }),
          ],
        },
      },
    },
  });

  const { server, urls } = await rsbuild.startDevServer();

  await page.goto(urls[0]);

  expect(logs.find((log) => log.includes('File:') && log.includes('/src/index.ts'))).toBeTruthy();

  expect(
    logs.find((log) =>
      log.includes(`Argument of type 'string' is not assignable to parameter of type 'number'.`),
    ),
  ).toBeTruthy();

  restore();
  await server.close();
});

test('should not throw error when the file is excluded', async () => {
  const rsbuild = await createRsbuild({
    rsbuildConfig: {
      tools: {
        rspack: {
          plugins: [
            new TsCheckerRspackPlugin({
              issue: {
                exclude: [{ file: '**/index.ts' }],
              },
            }),
          ],
        },
      },
    },
  });

  await expect(rsbuild.build()).resolves.toBeTruthy();
});

test('should downgrade type errors to warnings when defaultSeverity is warning', async () => {
  const rsbuild = await createRsbuild({
    rsbuildConfig: {
      tools: {
        rspack: {
          plugins: [
            new TsCheckerRspackPlugin({
              async: false,
              issue: {
                defaultSeverity: 'warning',
              },
            }),
          ],
        },
      },
    },
  });

  const { stats } = await rsbuild.build();
  const statsJson = stats?.toJson('errors-warnings') || {};
  expect(statsJson.warnings?.[0]?.message).toContain(
    `Argument of type 'string' is not assignable to parameter of type 'number'`,
  );
  expect(statsJson.errors?.length).toEqual(0);
});

test('should not throw error when the file is excluded by code', async () => {
  const rsbuild = await createRsbuild({
    rsbuildConfig: {
      tools: {
        rspack: {
          plugins: [
            new TsCheckerRspackPlugin({
              issue: {
                exclude: [{ code: 'TS2345' }],
              },
            }),
          ],
        },
      },
    },
  });

  await expect(rsbuild.build()).resolves.toBeTruthy();
});

test('should host diagnostics in SolutionBuilder (e.g. TS6202 for circular project references)', async () => {
  const { logs, restore } = proxyConsole();

  const rsbuild = await createRsbuild({
    rsbuildConfig: {
      tools: {
        rspack: {
          plugins: [
            new TsCheckerRspackPlugin({
              typescript: {
                build: true,
                configFile: './tsconfig.circular.json',
              },
            }),
          ],
        },
      },
    },
  });

  await expect(rsbuild.build()).rejects.toThrowError('build failed!');
  expect(logs.find((log) => log.includes('TS6202'))).toBeTruthy();

  restore();
});

test('should cleanup host diagnostics in SolutionBuilder when rebuild in dev mode', async ({
  page,
}) => {
  const { logs, restore } = proxyConsole();

  const srcIndexPath = resolve(__dirname, 'src/index.ts');
  const originalSrcIndex = await readFile(srcIndexPath, 'utf8');

  const updateSrcIndex = async (updater: (content: string) => string) => {
    const current = await readFile(srcIndexPath, 'utf8');
    const next = updater(current);
    await writeFile(srcIndexPath, next);
  };

  const rsbuild = await createRsbuild({
    rsbuildConfig: {
      tools: {
        rspack: {
          plugins: [
            new TsCheckerRspackPlugin({
              async: false,
              typescript: {
                build: true,
              },
            }),
          ],
        },
      },
    },
  });

  const { server, urls } = await rsbuild.startDevServer();

  try {
    await page.goto(urls[0]);

    expect(logs.find((log) => log.includes('File:') && log.includes('/src/index.ts'))).toBeTruthy();

    expect(
      logs.find((log) =>
        log.includes(`Argument of type 'string' is not assignable to parameter of type 'number'.`),
      ),
    ).toBeTruthy();

    // 1) Fix TS2345 by changing src/index.ts to `const res = add(1, 2);`
    await updateSrcIndex((content) =>
      content.replace(/const\s+res\s*=\s*add\([^;]*\);/, 'const res = add(1, 2);'),
    );

    // Wait for watcher rebuild.
    await page.waitForTimeout(1500);
    const logLenAfterFixTypeError = logs.length;

    // 2) Add a syntax error: `console.log('foo)` and verify `Unterminated string literal.`
    await updateSrcIndex((content) => `${content}\nconsole.log('foo)\n`);

    await expect
      .poll(() => logs.some((log) => log.includes('Unterminated string literal.')), {
        timeout: 20_000,
      })
      .toBeTruthy();

    // Also ensure the previous type error doesn't re-appear in subsequent rebuild logs.
    expect(
      logs
        .slice(logLenAfterFixTypeError)
        .some((log) =>
          log.includes(
            `Argument of type 'string' is not assignable to parameter of type 'number'.`,
          ),
        ),
    ).toBeFalsy();

    // 3) Fix syntax error: `console.log('foo')` and verify the error is gone.
    const logLenAfterUnterminated = logs.length;
    await updateSrcIndex((content) => content.replace("console.log('foo)", "console.log('foo')"));
    await page.waitForTimeout(1500);

    expect(
      logs
        .slice(logLenAfterUnterminated)
        .some((log) => log.includes('Unterminated string literal.')),
    ).toBeFalsy();
  } finally {
    await writeFile(srcIndexPath, originalSrcIndex);
    restore();
    await server.close();
  }
});
