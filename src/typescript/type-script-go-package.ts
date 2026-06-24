import path from 'node:path';

import {
  TYPESCRIPT_PACKAGE,
  TYPESCRIPT_PREVIEW_PACKAGE,
} from './type-script-go-constants';

type TypeScriptGoPackage = 'typescript' | 'preview';

type TypeScriptGoPackageJson = {
  name?: string;
  version?: string;
  bin?: string | Record<string, string>;
};

type ResolvedTypeScriptGoPackage = {
  packageJsonPath: string;
  tsgoPackage: TypeScriptGoPackage;
};

function readTsgoPackageJson(packageJsonPath: string): TypeScriptGoPackageJson {
  return require(packageJsonPath) as TypeScriptGoPackageJson;
}

function getTsgoPackage(packageJson: TypeScriptGoPackageJson): TypeScriptGoPackage | undefined {
  if (packageJson.name === TYPESCRIPT_PACKAGE) {
    const versionMatch = packageJson.version?.match(/^(\d+)\.(\d+)(?:\.|$|-)/);

    if (versionMatch && Number(versionMatch[1]) >= 7) {
      return 'typescript';
    }
  }

  if (packageJson.name === TYPESCRIPT_PREVIEW_PACKAGE) {
    return 'preview';
  }

  return undefined;
}

function resolveTypeScriptGoPackage(
  packageJsonPath: string,
): ResolvedTypeScriptGoPackage | undefined {
  if (
    !path.isAbsolute(packageJsonPath) ||
    path.basename(packageJsonPath) !== 'package.json'
  ) {
    return undefined;
  }

  try {
    const tsgoPackage = getTsgoPackage(readTsgoPackageJson(packageJsonPath));

    return tsgoPackage ? { packageJsonPath, tsgoPackage } : undefined;
  } catch {
    return undefined;
  }
}

export {
  getTsgoPackage,
  readTsgoPackageJson,
  resolveTypeScriptGoPackage,
};

export type {
  ResolvedTypeScriptGoPackage,
  TypeScriptGoPackage,
  TypeScriptGoPackageJson,
};
