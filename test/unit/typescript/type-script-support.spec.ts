import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import type { TypeScriptWorkerConfig } from 'src/typescript/type-script-worker-config';

describe('typescript/type-script-support', () => {
  let configuration: TypeScriptWorkerConfig;

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
      assertTypeScriptSupport({
        ...configuration,
        context: path.join(os.tmpdir(), 'ts-checker-native-preview-missing'),
        typescriptPath: path.join(
          os.tmpdir(),
          'ts-checker-native-preview-missing/package.json'
        ),
        tsgo: true,
      });
    } catch (caughtError) {
      error = caughtError as Error;
    }

    expect(error?.message).toContain(
      'When you enable TsCheckerRspackPlugin with `typescript.tsgo`, you must install `@typescript/native-preview` package.'
    );
    expect(error?.message).toContain('If you set `typescript.typescriptPath`');
  });

  it('does not print the typescriptPath hint for the default typescript-go path', async () => {
    const existsSyncSpy = rs
      .spyOn(fs, 'existsSync')
      .mockImplementation((filePath) => !filePath.toString().endsWith('lib/getExePath.js'));
    const { assertTypeScriptSupport } = await import('src/typescript/type-script-support');
    let error: Error | undefined;

    try {
      assertTypeScriptSupport({
        ...configuration,
        typescriptPath: require.resolve('@typescript/native-preview/package.json'),
        tsgo: true,
      });
    } catch (caughtError) {
      error = caughtError as Error;
    } finally {
      existsSyncSpy.mockRestore();
    }

    expect(error?.message).toContain(
      'When you enable TsCheckerRspackPlugin with `typescript.tsgo`, you must install `@typescript/native-preview` package.'
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
      });
    } catch (caughtError) {
      error = caughtError as Error;
    }

    expect(error?.message).toContain(
      'When you enable TsCheckerRspackPlugin with `typescript.tsgo`, you must install `@typescript/native-preview` package.'
    );
    expect(error?.message).not.toContain('If you set `typescript.typescriptPath`');
  });
});
