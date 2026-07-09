import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import type { TypeScriptWorkerConfig } from 'src/typescript/type-script-worker-config';

describe('typescript/type-script-support', () => {
  let configuration: TypeScriptWorkerConfig;
  const tempDirs: string[] = [];

  function createTypeScriptPackage(version: string) {
    const packagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-checker-typescript-support-'));
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

    return path.join(packagePath, 'package.json');
  }

  beforeEach(() => {
    rs.resetModules();

    configuration = {
      configFile: './tsconfig.json',
      configOverwrite: {},
      context: '.',
      build: false,
      mode: 'readonly',
      diagnosticOptions: {
        declaration: false,
        global: true,
        semantic: true,
        syntactic: false,
      },
      enabled: true,
      memoryLimit: 8192,
      profile: false,
      typescriptPath: require.resolve('typescript'),
    };
  });

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('throws error if typescript is not installed', async () => {
    const { assertTypeScriptSupport } = await import('src/typescript/type-script-support');

    expect(() => assertTypeScriptSupport({
      ...configuration,
      typescriptPath: 'typescript-404',
    })).toThrowError(
      'When you use TsCheckerRspackPlugin with typescript reporter enabled, you must install `typescript` package.'
    );
  });

  it('throws error if there is no tsconfig.json file', async () => {
    rs.mock('typescript', () => ({ version: '3.8.0' }));

    const existsSyncSpy = rs.spyOn(fs, 'existsSync').mockImplementation(() => false);

    const { assertTypeScriptSupport } = await import('src/typescript/type-script-support');

    try {
      expect(() => assertTypeScriptSupport(configuration)).toThrowError(
        [
          `Cannot find the "./tsconfig.json" file.`,
          `Please check Rspack and TsCheckerRspackPlugin configuration.`,
          `Possible errors:`,
          '  - wrong `context` directory in Rspack configuration (if `configFile` is not set or is a relative path in the fork plugin configuration)',
          '  - wrong `typescript.configFile` path in the plugin configuration (should be a relative or absolute path)',
        ].join(os.EOL)
      );
    } finally {
      existsSyncSpy.mockRestore();
    }
  });

  it('throws error if typescript-go is enabled but native preview is not installed', async () => {
    const { assertTypeScriptSupport } = await import('src/typescript/type-script-support');

    let error: Error | undefined;

    try {
      const missingPackageJsonPath = path.join(
        os.tmpdir(),
        'ts-checker-native-preview-missing',
        'package.json',
      );

      assertTypeScriptSupport({
        ...configuration,
        context: path.dirname(missingPackageJsonPath),
        typescriptPath: missingPackageJsonPath,
        tsgo: true,
        tsgoPackage: 'preview',
      });
    } catch (caughtError) {
      error = caughtError as Error;
    }

    expect(error?.message).toContain(
      'When you enable TsCheckerRspackPlugin with `typescript.tsgo`, you must install `typescript@latest` or `@typescript/native-preview` package.'
    );
    expect(error?.message).toContain('If you set `typescript.typescriptPath`');
  });

  it('supports TypeScript package with native executable for tsgo', async () => {
    const packageJsonPath = createTypeScriptPackage('7.1.0');
    const { assertTypeScriptGoExecutable, assertTypeScriptSupport } = await import(
      'src/typescript/type-script-support'
    );
    const config = {
      ...configuration,
      typescriptPath: packageJsonPath,
      tsgo: true,
      tsgoPackage: 'typescript',
    };

    expect(() => assertTypeScriptSupport(config)).not.toThrow();
    await expect(assertTypeScriptGoExecutable(config)).resolves.toBeUndefined();
  });

  it('throws error if a package.json path is used without tsgo', async () => {
    const packageJsonPath = createTypeScriptPackage('7.1.0');
    const { assertTypeScriptSupport } = await import('src/typescript/type-script-support');

    expect(() =>
      assertTypeScriptSupport({
        ...configuration,
        typescriptPath: packageJsonPath,
        tsgo: false,
      })
    ).toThrowError(
      "When you use TsCheckerRspackPlugin without `typescript.tsgo`, `typescript.typescriptPath` should point to a path like `require.resolve('typescript')`."
    );
  });

  it('does not print the typescriptPath hint for the default typescript-go path', async () => {
    const existsSyncSpy = rs
      .spyOn(fs, 'existsSync')
      .mockImplementation(
        (filePath) => !filePath.toString().replace(/\\/g, '/').endsWith('/lib/getExePath.js')
      );
    const { assertTypeScriptSupport } = await import('src/typescript/type-script-support');
    let error: Error | undefined;

    try {
      assertTypeScriptSupport({
        ...configuration,
        typescriptPath: require.resolve('@typescript/native-preview/package.json'),
        tsgo: true,
        tsgoPackage: 'preview',
      });
    } catch (caughtError) {
      error = caughtError as Error;
    } finally {
      existsSyncSpy.mockRestore();
    }

    expect(error?.message).toContain(
      'When you enable TsCheckerRspackPlugin with `typescript.tsgo`, you must install `typescript@latest` or `@typescript/native-preview` package.'
    );
    expect(error?.message).not.toContain('If you set `typescript.typescriptPath`');
  });

  it('does not print the custom typescriptPath hint for the unresolved default tsgo path', async () => {
    const { assertTypeScriptSupport } = await import('src/typescript/type-script-support');
    let error: Error | undefined;

    try {
      assertTypeScriptSupport({
        ...configuration,
        // This is the internal fallback from createTypeScriptWorkerConfig when the
        // optional peer dependency cannot be resolved, not a supported custom value.
        typescriptPath: '@typescript/native-preview/package.json',
        tsgo: true,
        tsgoPackage: 'preview',
      });
    } catch (caughtError) {
      error = caughtError as Error;
    }

    expect(error?.message).toContain(
      'When you enable TsCheckerRspackPlugin with `typescript.tsgo`, you must install `typescript@latest` or `@typescript/native-preview` package.'
    );
    expect(error?.message).not.toContain('If you set `typescript.typescriptPath`');
  });

  it('throws error if the typescript-go executable cannot be resolved', async () => {
    const originalExistsSync = fs.existsSync;
    const existsSyncSpy = rs.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      const normalizedPath = filePath.toString().replace(/\\/g, '/');

      if (/\/tsgo(?:\.exe)?$/.test(normalizedPath)) {
        return false;
      }

      return originalExistsSync(filePath);
    });
    const { assertTypeScriptGoExecutable } = await import('src/typescript/type-script-support');

    try {
      await expect(
        assertTypeScriptGoExecutable({
          ...configuration,
          typescriptPath: require.resolve('@typescript/native-preview/package.json'),
          tsgo: true,
          tsgoPackage: 'preview',
        })
      ).rejects.toThrowError('Failed to resolve the tsgo executable: Executable not found');
    } finally {
      existsSyncSpy.mockRestore();
    }
  });
});
