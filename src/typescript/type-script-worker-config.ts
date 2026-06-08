import path from 'node:path';

import type * as rspack from '@rspack/core';

import type { TypeScriptConfigOverwrite } from './type-script-config-overwrite';
import type { TypeScriptDiagnosticsOptions } from './type-script-diagnostics-options';
import { TYPESCRIPT_GO_PACKAGE_JSON } from './type-script-go-constants';
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
  typescriptPath: string;
  tsgo?: boolean;
}

function resolveDefaultTypeScriptPath(tsgo?: boolean): string {
  if (tsgo === true) {
    try {
      return require.resolve(TYPESCRIPT_GO_PACKAGE_JSON);
    } catch {
      return TYPESCRIPT_GO_PACKAGE_JSON;
    }
  }

  return require.resolve('typescript');
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

  const typescriptPath =
    optionsAsObject.typescriptPath || resolveDefaultTypeScriptPath(optionsAsObject.tsgo);

  return {
    enabled: Boolean(options) || options === undefined,
    memoryLimit: 8192,
    build: false,
    mode: optionsAsObject.build ? 'write-tsbuildinfo' : 'readonly',
    profile: false,
    ...optionsAsObject,
    configFile: configFile,
    configOverwrite: optionsAsObject.configOverwrite || {},
    context: optionsAsObject.context || path.dirname(configFile),
    diagnosticOptions: {
      syntactic: false, // by default they are reported by the loader
      semantic: true,
      declaration: false,
      global: false,
      ...(optionsAsObject.diagnosticOptions || {}),
    },
    typescriptPath,
  };
}

export { createTypeScriptWorkerConfig };

export type { TypeScriptWorkerConfig };
