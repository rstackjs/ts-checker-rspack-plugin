import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { TypeScriptWorkerConfig } from 'src/typescript/type-script-worker-config';
import type { TypeScriptWorkerOptions } from 'src/typescript/type-script-worker-options';
import type * as rspack from '@rspack/core';

describe('typescript/type-scripts-worker-config', () => {
  let compiler: rspack.Compiler;
  const context = path.resolve('webpack-context');
  const customPreviewPackageJsonPath = path.resolve(
    'custom',
    'native-preview',
    'package.json',
  );

  const configuration: TypeScriptWorkerConfig = {
    enabled: true,
    memoryLimit: 8192,
    configFile: path.normalize(path.resolve(context, 'tsconfig.json')),
    configOverwrite: {},
    context: path.normalize(path.dirname(path.resolve(context, 'tsconfig.json'))),
    build: false,
    mode: 'readonly',
    diagnosticOptions: {
      semantic: true,
      syntactic: false,
      declaration: false,
      global: false,
    },
    profile: false,
    typescriptPath: require.resolve('typescript'),
  };
  const tsgoConfiguration: TypeScriptWorkerConfig = {
    ...configuration,
    tsgo: true,
    tsgoPackage: 'preview',
    typescriptPath: require.resolve('@typescript/native-preview/package.json'),
  };
  const tempDirs: string[] = [];

  function createResolveRoot() {
    const resolveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-checker-resolve-root-'));

    tempDirs.push(resolveRoot);

    return resolveRoot;
  }

  function createTypeScriptPackage(version: string, resolveRoot?: string) {
    const packagePath = resolveRoot
      ? path.join(resolveRoot, 'node_modules', 'typescript')
      : fs.mkdtempSync(path.join(os.tmpdir(), 'ts-checker-typescript-config-'));
    const binDir = path.join(packagePath, 'bin');
    const libDir = path.join(packagePath, 'lib');

    if (!resolveRoot) {
      tempDirs.push(packagePath);
    }
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(packagePath, 'package.json'),
      JSON.stringify({
        name: 'typescript',
        version,
        main: 'lib/typescript.js',
        bin: {
          tsc: 'bin/tsc',
        },
      }),
    );
    fs.writeFileSync(path.join(binDir, 'tsc'), '#!/usr/bin/env node\n');
    fs.writeFileSync(
      path.join(libDir, 'typescript.js'),
      `module.exports = { version: ${JSON.stringify(version)} };\n`,
    );

    return path.join(packagePath, 'package.json');
  }

  beforeEach(() => {
    compiler = {
      options: {
        context,
      },
    } as rspack.Compiler;
  });
  afterEach(() => {
    rs.resetModules();
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it.each([
    [undefined, configuration],
    [{}, configuration],
    [true, configuration],
    [false, { ...configuration, enabled: false }],
    [{ enabled: false }, { ...configuration, enabled: false }],
    [{ memoryLimit: 512 }, { ...configuration, memoryLimit: 512 }],
    [
      { configFile: 'tsconfig.another.json' },
      {
        ...configuration,
        configFile: path.normalize(path.resolve(context, 'tsconfig.another.json')),
      },
    ],
    [{ build: true }, { ...configuration, build: true, mode: 'write-tsbuildinfo' }],
    [{ mode: 'readonly' }, { ...configuration, mode: 'readonly' }],
    [{ mode: 'write-tsbuildinfo' }, { ...configuration, mode: 'write-tsbuildinfo' }],
    [{ mode: 'write-dts' }, { ...configuration, mode: 'write-dts' }],
    [{ mode: 'write-references' }, { ...configuration, mode: 'write-references' }],
    [
      { configOverwrite: { compilerOptions: { strict: true }, include: ['src'] } },
      {
        ...configuration,
        configOverwrite: {
          compilerOptions: {
            strict: true,
          },
          include: ['src'],
        },
      },
    ],
    [{ diagnosticOptions: {} }, configuration],
    [
      { diagnosticOptions: { syntactic: true, semantic: false } },
      {
        ...configuration,
        diagnosticOptions: { semantic: false, syntactic: true, declaration: false, global: false },
      },
    ],
    [{ profile: true }, { ...configuration, profile: true }],
    [{ tsgo: true }, tsgoConfiguration],
    [
      { tsgo: true, typescriptPath: customPreviewPackageJsonPath },
      {
        ...configuration,
        tsgo: true,
        typescriptPath: customPreviewPackageJsonPath,
      },
    ],
  ])('creates configuration from options %p', async (options, expectedConfig) => {
    const { createTypeScriptWorkerConfig } = await import(
      'src/typescript/type-script-worker-config'
    );
    const config = createTypeScriptWorkerConfig(compiler, options as TypeScriptWorkerOptions);

    expect(config).toEqual(expectedConfig);
  });

  it('infers tsgo from the default TypeScript package only when tsgo is not configured', async () => {
    const packageJsonPath = require.resolve('typescript/package.json');
    const packageModule = await import('src/typescript/type-script-go-package');
    const resolveTypeScriptGoPackageSpy = rs
      .spyOn(packageModule, 'resolveTypeScriptGoPackage')
      .mockImplementation((resolvedPackageJsonPath: string) => ({
        packageJsonPath: resolvedPackageJsonPath,
        tsgoPackage: 'typescript',
      }));

    try {
      const { createTypeScriptWorkerConfig } = await import(
        'src/typescript/type-script-worker-config'
      );

      expect(createTypeScriptWorkerConfig(compiler, {})).toEqual({
        ...configuration,
        tsgo: true,
        tsgoPackage: 'typescript',
        typescriptPath: packageJsonPath,
      });
      expect(createTypeScriptWorkerConfig(compiler, { tsgo: false })).toEqual({
        ...configuration,
        tsgo: false,
      });
    } finally {
      resolveTypeScriptGoPackageSpy.mockRestore();
    }
  });

  it('uses resolveRoot to resolve the default TypeScript package', async () => {
    const resolveRoot = createResolveRoot();
    createTypeScriptPackage('6.1.0', resolveRoot);
    const typescriptPath = require.resolve('typescript', { paths: [resolveRoot] });
    const { createTypeScriptWorkerConfig } = await import(
      'src/typescript/type-script-worker-config'
    );

    expect(
      createTypeScriptWorkerConfig(compiler, {
        resolveRoot,
      })
    ).toEqual({
      ...configuration,
      resolveRoot,
      typescriptPath,
    });
  });

  it('uses resolveRoot when detecting the default TypeScript Go package', async () => {
    const resolveRoot = createResolveRoot();
    createTypeScriptPackage('7.1.0', resolveRoot);
    const packageJsonPath = require.resolve('typescript/package.json', {
      paths: [resolveRoot],
    });
    const { createTypeScriptWorkerConfig } = await import(
      'src/typescript/type-script-worker-config'
    );

    expect(
      createTypeScriptWorkerConfig(compiler, {
        resolveRoot,
      })
    ).toEqual({
      ...configuration,
      resolveRoot,
      tsgo: true,
      tsgoPackage: 'typescript',
      typescriptPath: packageJsonPath,
    });
  });

  it('prefers typescriptPath over resolveRoot', async () => {
    const resolveRoot = createResolveRoot();
    createTypeScriptPackage('7.1.0', resolveRoot);
    const packageJsonPath = createTypeScriptPackage('7.2.0');
    const { createTypeScriptWorkerConfig } = await import(
      'src/typescript/type-script-worker-config'
    );

    expect(
      createTypeScriptWorkerConfig(compiler, {
        resolveRoot,
        typescriptPath: packageJsonPath,
      })
    ).toEqual({
      ...configuration,
      resolveRoot,
      tsgo: true,
      tsgoPackage: 'typescript',
      typescriptPath: packageJsonPath,
    });
  });

  it('infers tsgo when typescriptPath points to supported TypeScript package', async () => {
    const packageJsonPath = createTypeScriptPackage('7.1.0');
    const { createTypeScriptWorkerConfig } = await import(
      'src/typescript/type-script-worker-config'
    );

    expect(
      createTypeScriptWorkerConfig(compiler, {
        typescriptPath: packageJsonPath,
      })
    ).toEqual({
      ...configuration,
      tsgo: true,
      tsgoPackage: 'typescript',
      typescriptPath: packageJsonPath,
    });
  });

  it('uses configured TypeScript package path when tsgo is explicitly enabled', async () => {
    const packageJsonPath = createTypeScriptPackage('7.1.0');
    const { createTypeScriptWorkerConfig } = await import(
      'src/typescript/type-script-worker-config'
    );

    expect(
      createTypeScriptWorkerConfig(compiler, {
        tsgo: true,
        typescriptPath: packageJsonPath,
      })
    ).toEqual({
      ...configuration,
      tsgo: true,
      tsgoPackage: 'typescript',
      typescriptPath: packageJsonPath,
    });
  });

  it('does not infer tsgo from configured TypeScript package path when tsgo is disabled', async () => {
    const packageJsonPath = createTypeScriptPackage('7.1.0');
    const { createTypeScriptWorkerConfig } = await import(
      'src/typescript/type-script-worker-config'
    );

    expect(
      createTypeScriptWorkerConfig(compiler, {
        tsgo: false,
        typescriptPath: packageJsonPath,
      })
    ).toEqual({
      ...configuration,
      tsgo: false,
      typescriptPath: packageJsonPath,
    });
  });
});
