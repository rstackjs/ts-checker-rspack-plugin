import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import type { TypeScriptWorkerConfig } from 'src/typescript/type-script-worker-config';

describe('typescript/type-script-go-runner', () => {
  const tsgoPackageJsonPath = require.resolve('@typescript/native-preview/package.json');
  const requireFromTypeScript7Example = createRequire(
    path.resolve('examples/typescript-7/package.json'),
  );
  const typeScript7PackageJsonPath =
    requireFromTypeScript7Example.resolve('typescript/package.json');
  const projectContext = path.resolve('project');
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
    tsgoPackage: 'preview',
  };
  const tempDirs: string[] = [];

  function createTypeScriptPackage(version: string) {
    const packagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-checker-typescript-go-'));
    const libDir = path.join(packagePath, 'lib');
    const nativeTscPath = path.join(libDir, 'tsc');

    tempDirs.push(packagePath);
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(packagePath, 'package.json'),
      JSON.stringify({
        name: 'typescript',
        version,
        bin: {
          tsc: 'bin/tsc',
        },
      }),
    );
    fs.writeFileSync(
      path.join(libDir, 'getExePath.js'),
      "module.exports = function getExePath() { return require('./nativeTscPath.json'); };\n",
    );
    fs.writeFileSync(path.join(libDir, 'nativeTscPath.json'), JSON.stringify(nativeTscPath));
    fs.writeFileSync(nativeTscPath, '#!/usr/bin/env node\n');
    fs.chmodSync(nativeTscPath, 0o755);

    return {
      packageJsonPath: path.join(packagePath, 'package.json'),
      nativeTscPath,
    };
  }

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

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

  it('collects root files from tsgo showConfig', async () => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-checker-tsgo-project-'));
    const srcPath = path.join(projectPath, 'src');
    const configFile = path.join(projectPath, 'tsconfig.json');
    tempDirs.push(projectPath);
    fs.mkdirSync(srcPath, { recursive: true });
    fs.writeFileSync(path.join(srcPath, 'index.ts'), 'export const value = 1;\n');
    fs.writeFileSync(path.join(srcPath, 'excluded.ts'), 'export const excluded = 3;\n');
    fs.writeFileSync(
      configFile,
      JSON.stringify({ include: ['src'], exclude: ['src/excluded.ts'] }),
    );
    const { getTypeScriptGoDependencies } = await import('src/typescript/type-script-go-runner');
    const typeScript7Config = {
      ...config,
      configFile,
      context: projectPath,
      typescriptPath: typeScript7PackageJsonPath,
      tsgoPackage: 'typescript' as const,
    };
    const extensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'];

    const dependencies = await getTypeScriptGoDependencies(typeScript7Config);

    expect(new Set(dependencies.files)).toEqual(
      new Set([configFile, path.join(srcPath, 'index.ts')]),
    );
    expect(dependencies.dirs).toEqual([projectPath]);
    expect(new Set(dependencies.excluded)).toEqual(
      new Set([path.join(projectPath, 'node_modules'), path.join(srcPath, 'excluded.ts')]),
    );
    expect(dependencies.extensions).toEqual(extensions);
  });

  it('collects files from project references', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-checker-tsgo-solution-'));
    const projectPath = path.join(workspacePath, 'root');
    const childPath = path.join(projectPath, 'packages/child');
    const childSrcPath = path.join(childPath, 'src');
    const configFile = path.join(projectPath, 'tsconfig.json');
    const childConfigFile = path.join(childPath, 'tsconfig.json');
    const childFile = path.join(childSrcPath, 'index.ts');
    tempDirs.push(workspacePath);
    fs.mkdirSync(projectPath, { recursive: true });
    fs.mkdirSync(childSrcPath, { recursive: true });
    fs.writeFileSync(
      configFile,
      JSON.stringify({
        exclude: ['packages'],
        files: [],
        references: [{ path: './packages/child' }],
      }),
    );
    fs.writeFileSync(childConfigFile, JSON.stringify({ include: ['src'] }));
    fs.writeFileSync(childFile, 'export const child = 1;\n');
    const { getTypeScriptGoDependencies } = await import('src/typescript/type-script-go-runner');

    const dependencies = await getTypeScriptGoDependencies({
      ...config,
      build: true,
      configFile,
      context: projectPath,
      typescriptPath: typeScript7PackageJsonPath,
      tsgoPackage: 'typescript',
    });

    expect(new Set(dependencies.files)).toEqual(new Set([configFile, childConfigFile, childFile]));
    expect(dependencies.dirs).toEqual([projectPath]);
    expect(new Set(dependencies.excluded)).toEqual(
      new Set([path.join(projectPath, 'node_modules'), path.join(childPath, 'node_modules')]),
    );
  });

  it('refreshes cached dependencies when the file list may change', async () => {
    const configFile = path.join(projectContext, 'tsconfig.json');
    const knownFile = path.join(projectContext, 'src/index.ts');
    const referencedConfigFile = path.join(projectContext, 'packages/app/tsconfig.json');
    const dependencies = {
      files: [configFile, knownFile, referencedConfigFile],
      dirs: [projectContext],
      excluded: [],
      extensions: ['.ts'],
    };
    const { shouldRefreshTypeScriptGoDependencies } =
      await import('src/typescript/type-script-go-runner');

    expect([
      shouldRefreshTypeScriptGoDependencies(undefined, {}),
      shouldRefreshTypeScriptGoDependencies(dependencies, {
        changedFiles: [knownFile],
      }),
      shouldRefreshTypeScriptGoDependencies(dependencies, {
        changedFiles: [referencedConfigFile],
      }),
      shouldRefreshTypeScriptGoDependencies(dependencies, {
        changedFiles: [path.join(projectContext, 'src/new.ts')],
      }),
      shouldRefreshTypeScriptGoDependencies(dependencies, {
        deletedFiles: [knownFile],
      }),
      shouldRefreshTypeScriptGoDependencies(dependencies, {
        changedFiles: [path.join(projectContext, 'src/style.css')],
      }),
    ]).toEqual([true, false, true, true, true, false]);
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

  it('resolves native executable from supported TypeScript package', async () => {
    const { packageJsonPath, nativeTscPath } = createTypeScriptPackage('7.1.0');
    const { resolveTypeScriptGoBinPath, resolveTypeScriptGoExecutable } =
      await import('src/typescript/type-script-go-runner');

    await expect(
      resolveTypeScriptGoBinPath({
        ...config,
        typescriptPath: packageJsonPath,
        tsgoPackage: 'typescript',
      }),
    ).resolves.toBe(nativeTscPath);
    await expect(
      resolveTypeScriptGoExecutable({
        ...config,
        typescriptPath: packageJsonPath,
        tsgoPackage: 'typescript',
      }),
    ).resolves.toEqual({
      command: nativeTscPath,
      args: [],
    });
  });

  it('rejects tsgo package paths that were not classified by config', async () => {
    const { packageJsonPath } = createTypeScriptPackage('6.0.3');
    const { resolveTypeScriptGoPackageJsonPath } =
      await import('src/typescript/type-script-go-runner');

    expect(() =>
      resolveTypeScriptGoPackageJsonPath({
        ...config,
        typescriptPath: packageJsonPath,
        tsgoPackage: undefined,
      }),
    ).toThrowError('typescript@>=7');
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
