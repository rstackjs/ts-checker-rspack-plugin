import path from 'node:path';

import type { TypeScriptWorkerConfig } from 'src/typescript/type-script-worker-config';

describe('typescript/type-script-go-runner', () => {
  const tsgoPackageJsonPath = require.resolve('@typescript/native-preview/package.json');
  const projectContext = path.resolve('/project');
  const config: TypeScriptWorkerConfig = {
    enabled: true,
    memoryLimit: 8192,
    configFile: path.join(projectContext, 'tsconfig.json'),
    configOverwrite: {},
    context: projectContext,
    build: false,
    mode: 'readonly',
    diagnosticOptions: {
      semantic: true,
      syntactic: false,
      declaration: false,
      global: false,
    },
    profile: false,
    typescriptPath: tsgoPackageJsonPath,
    tsgo: true,
  };

  it('creates tsgo project args for regular checks', async () => {
    const { createTypeScriptGoArgs } = await import('src/typescript/type-script-go-runner');

    expect(createTypeScriptGoArgs(config)).toEqual([
      '--project',
      config.configFile,
      '--noEmit',
      '--pretty',
    ]);
  });

  it('creates tsgo build args for project references', async () => {
    const { createTypeScriptGoArgs } = await import('src/typescript/type-script-go-runner');

    expect(createTypeScriptGoArgs({ ...config, build: true })).toEqual([
      '--build',
      config.configFile,
      '--noEmit',
      '--pretty',
    ]);
  });

  it('creates coarse watcher dependencies without parsing tsconfig', async () => {
    const { getTypeScriptGoDependencies } = await import('src/typescript/type-script-go-runner');

    expect(getTypeScriptGoDependencies(config)).toEqual({
      files: [config.configFile],
      dirs: [config.context],
      excluded: [path.join(config.context, 'node_modules')],
      extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'],
    });
  });

  it('resolves the tsgo package from an absolute package.json path', async () => {
    const { resolveTypeScriptGoPackageJsonPath } =
      await import('src/typescript/type-script-go-runner');

    expect(resolveTypeScriptGoPackageJsonPath(config)).toBe(tsgoPackageJsonPath);
  });

  it('rejects non-package-json tsgo paths', async () => {
    const { resolveTypeScriptGoPackageJsonPath } =
      await import('src/typescript/type-script-go-runner');

    expect(() =>
      resolveTypeScriptGoPackageJsonPath({
        ...config,
        typescriptPath: path.dirname(tsgoPackageJsonPath),
      }),
    ).toThrowError('typescriptPath option must be an absolute path');
    expect(() =>
      resolveTypeScriptGoPackageJsonPath({
        ...config,
        typescriptPath: '@typescript/native-preview/package.json',
      }),
    ).toThrowError('typescriptPath option must be an absolute path');
  });

  it('extracts the error count from tsgo summary output', async () => {
    const { getTypeScriptGoErrorCount } = await import('src/typescript/type-script-go-runner');

    expect(
      getTypeScriptGoErrorCount(
        '\u001b[91merror\u001b[0m TS2345\nFound 2 errors in the same file, starting at: src/index.ts:2',
      ),
    ).toBe(2);
    expect(getTypeScriptGoErrorCount('Found 1 error in src/index.ts:6')).toBe(1);
    expect(getTypeScriptGoErrorCount('No diagnostics')).toBeUndefined();
  });

  it('creates hidden internal issues from the tsgo error summary count', async () => {
    const { createTypeScriptGoExitIssues } = await import('src/typescript/type-script-go-runner');

    expect(
      createTypeScriptGoExitIssues(
        'Found 2 errors in the same file, starting at: src/index.ts:2',
        null,
        config,
      ),
    ).toMatchObject([
      {
        code: 'TSGO',
        message: 'tsgo check failed. See the output above for diagnostics.',
        severity: 'error',
      },
      {
        code: 'TSGO',
        message: 'tsgo check failed. See the output above for diagnostics.',
        severity: 'error',
      },
    ]);
  });

  it('parses tsgo diagnostic headers with code, file, location and message', async () => {
    const { parseTypeScriptGoIssues } = await import('src/typescript/type-script-go-runner');

    expect(
      parseTypeScriptGoIssues(
        [
          '\u001b[96msrc/index.ts\u001b[0m:\u001b[93m4\u001b[0m:\u001b[93m20\u001b[0m - \u001b[91merror\u001b[0m\u001b[90m TS2345: \u001b[0mArgument of type string is not assignable.',
          '',
          '\u001b[7m4\u001b[0m const res = add("2");',
          '\u001b[7m \u001b[0m \u001b[91m                   ~~~~~~\u001b[0m',
          '',
          'Found 1 error in src/index.ts:4',
        ].join('\n'),
        config,
      ),
    ).toMatchObject([
      {
        code: 'TS2345',
        file: path.resolve(config.context, 'src/index.ts'),
        location: {
          start: {
            column: 20,
            line: 4,
          },
          end: {
            column: 26,
            line: 4,
          },
        },
        message: 'Argument of type string is not assignable.',
        severity: 'error',
      },
    ]);
  });

  it('creates warning issues when default severity is warning', async () => {
    const { createTypeScriptGoExitIssues } = await import('src/typescript/type-script-go-runner');

    expect(
      createTypeScriptGoExitIssues(
        'src/index.ts:1:1 - error TS2345: Type mismatch.',
        null,
        config,
        'warning',
      ),
    ).toMatchObject([
      {
        code: 'TS2345',
        message: 'Type mismatch.',
        severity: 'warning',
      },
    ]);
  });

  it('falls back to internal issues when parsed diagnostics do not match summary count', async () => {
    const { createTypeScriptGoExitIssues } = await import('src/typescript/type-script-go-runner');

    expect(
      createTypeScriptGoExitIssues(
        [
          'src/index.ts:1:1 - error TS2345: Type mismatch.',
          'Found 2 errors in the same file, starting at: src/index.ts:1',
        ].join('\n'),
        null,
        config,
      ),
    ).toMatchObject([
      {
        code: 'TSGO',
        message: 'tsgo check failed. See the output above for diagnostics.',
        severity: 'error',
      },
      {
        code: 'TSGO',
        message: 'tsgo check failed. See the output above for diagnostics.',
        severity: 'error',
      },
    ]);
  });

  it('keeps fallback internal issues as errors when default severity is warning', async () => {
    const { createTypeScriptGoExitIssues } = await import('src/typescript/type-script-go-runner');

    expect(
      createTypeScriptGoExitIssues(
        'Found 1 error in the same file, starting at: src/index.ts:1',
        null,
        config,
        'warning',
      ),
    ).toMatchObject([
      {
        code: 'TSGO',
        severity: 'error',
      },
    ]);
  });

  it('detects virtual tsgo issues and stats errors', async () => {
    const { isTypeScriptGoIssue, isTypeScriptGoStatsError } =
      await import('src/typescript/type-script-go-runner');

    expect(
      isTypeScriptGoIssue({
        code: 'TSGO',
        message: 'tsgo check failed. See the output above for diagnostics.',
        severity: 'error',
      }),
    ).toBeTruthy();
    expect(
      isTypeScriptGoStatsError({ message: '  × Error: TSGO: tsgo check failed.' }),
    ).toBeTruthy();
    expect(isTypeScriptGoStatsError({ message: 'Module parse failed.' })).toBeFalsy();
  });
});
