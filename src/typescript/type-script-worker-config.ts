import path from 'node:path';

import type * as rspack from '@rspack/core';

import type { TypeScriptConfigOverwrite } from './type-script-config-overwrite';
import type { TypeScriptDiagnosticsOptions } from './type-script-diagnostics-options';
import {
  type ResolvedTypeScriptGoPackage,
  resolveTypeScriptGoPackage,
  type TypeScriptGoPackage,
} from './type-script-go-package';
import {
  TYPESCRIPT_PACKAGE_JSON,
  TYPESCRIPT_PREVIEW_PACKAGE_JSON,
} from './type-script-go-constants';
import type { TypeScriptWorkerOptions } from './type-script-worker-options';

interface TypeScriptWorkerConfig {
  enabled: boolean;
  memoryLimit: number;
  configFile: string;
  configOverwrite: TypeScriptConfigOverwrite;
  build: boolean;
  context: string;
  mode: 'readonly' | 'write-dts' | 'write-tsbuildinfo' | 'write-references';
  diagnosticOptions: TypeScriptDiagnosticsOptions;
  profile: boolean;
  resolveRoot?: string;
  typescriptPath: string;
  tsgo?: boolean;
  tsgoPackage?: TypeScriptGoPackage;
}

type TypeScriptRuntimeConfig = Pick<
  TypeScriptWorkerConfig,
  'typescriptPath' | 'tsgo' | 'tsgoPackage'
>;

function resolveModule(request: string, resolveRoot?: string): string {
  return resolveRoot
    ? require.resolve(request, { paths: [resolveRoot] })
    : require.resolve(request);
}

function resolveInstalledTsgoPackage(
  resolveRoot?: string,
): ResolvedTypeScriptGoPackage | undefined {
  try {
    const packageJsonPath = resolveModule(TYPESCRIPT_PACKAGE_JSON, resolveRoot);
    const tsgoPackage = resolveTypeScriptGoPackage(packageJsonPath);

    if (tsgoPackage?.tsgoPackage === 'typescript') {
      return tsgoPackage;
    }
  } catch {
    // silent catch
  }

  return undefined;
}

function resolveDefaultPreviewPackageJsonPath(resolveRoot?: string): string {
  try {
    return resolveModule(TYPESCRIPT_PREVIEW_PACKAGE_JSON, resolveRoot);
  } catch {
    return TYPESCRIPT_PREVIEW_PACKAGE_JSON;
  }
}

function resolveTypeScriptRuntimeConfig(
  options: Exclude<TypeScriptWorkerOptions, boolean>,
): TypeScriptRuntimeConfig {
  if (options.typescriptPath) {
    const tsgoPackage = resolveTypeScriptGoPackage(options.typescriptPath);
    const tsgo =
      options.tsgo === undefined && tsgoPackage?.tsgoPackage === 'typescript'
        ? true
        : options.tsgo;

    return {
      typescriptPath: options.typescriptPath,
      ...(tsgo === undefined ? {} : { tsgo }),
      ...(tsgo === true && tsgoPackage ? { tsgoPackage: tsgoPackage.tsgoPackage } : {}),
    };
  }

  if (options.tsgo === false) {
    return {
      typescriptPath: resolveModule('typescript', options.resolveRoot),
      tsgo: false,
    };
  }

  const installedTsgoPackage = resolveInstalledTsgoPackage(options.resolveRoot);

  if (installedTsgoPackage) {
    return {
      typescriptPath: installedTsgoPackage.packageJsonPath,
      tsgo: true,
      tsgoPackage: 'typescript',
    };
  }

  if (options.tsgo === true) {
    return {
      typescriptPath: resolveDefaultPreviewPackageJsonPath(options.resolveRoot),
      tsgo: true,
      tsgoPackage: 'preview',
    };
  }

  return {
    typescriptPath: resolveModule('typescript', options.resolveRoot),
  };
}

function createTypeScriptWorkerConfig(
  compiler: rspack.Compiler,
  options: TypeScriptWorkerOptions | undefined,
): TypeScriptWorkerConfig {
  let configFile =
    typeof options === 'object' ? options.configFile || 'tsconfig.json' : 'tsconfig.json';

  // ensure that `configFile` is an absolute normalized path
  configFile = path.normalize(
    path.isAbsolute(configFile)
      ? configFile
      : path.resolve(compiler.options.context || process.cwd(), configFile),
  );

  const optionsAsObject: Exclude<TypeScriptWorkerOptions, boolean> =
    typeof options === 'object' ? options : {};
  const resolveRoot = optionsAsObject.resolveRoot
    ? path.isAbsolute(optionsAsObject.resolveRoot)
      ? optionsAsObject.resolveRoot
      : path.resolve(compiler.options.context || process.cwd(), optionsAsObject.resolveRoot)
    : undefined;
  const normalizedOptions = {
    ...optionsAsObject,
    ...(resolveRoot ? { resolveRoot } : {}),
  };
  const typescriptRuntimeConfig = resolveTypeScriptRuntimeConfig(normalizedOptions);

  return {
    enabled: Boolean(options) || options === undefined,
    memoryLimit: 8192,
    build: false,
    mode: optionsAsObject.build ? 'write-tsbuildinfo' : 'readonly',
    profile: false,
    ...normalizedOptions,
    ...typescriptRuntimeConfig,
    configFile: configFile,
    configOverwrite: normalizedOptions.configOverwrite || {},
    context: normalizedOptions.context || path.dirname(configFile),
    diagnosticOptions: {
      syntactic: false, // by default they are reported by the loader
      semantic: true,
      declaration: false,
      global: false,
      ...(normalizedOptions.diagnosticOptions || {}),
    },
  };
}

export {
  createTypeScriptWorkerConfig,
};

export type { TypeScriptWorkerConfig };
