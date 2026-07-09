import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

import type { TypeScriptWorkerConfig } from './type-script-worker-config';
import {
  getTsgoPackage,
  readTsgoPackageJson,
} from './type-script-go-package';
import {
  TYPESCRIPT_PACKAGE,
  TYPESCRIPT_PACKAGE_JSON,
  TYPESCRIPT_PREVIEW_PACKAGE,
  TYPESCRIPT_PREVIEW_PACKAGE_JSON,
} from './type-script-go-constants';
import {
  resolveTypeScriptGoBinPath,
  resolveTypeScriptGoPackageJsonPath,
} from './type-script-go-runner';

function isDefaultTypeScriptGoPath(typescriptPath: string): boolean {
  if (typescriptPath === TYPESCRIPT_PREVIEW_PACKAGE_JSON) {
    return true;
  }

  try {
    if (typescriptPath === require.resolve(TYPESCRIPT_PREVIEW_PACKAGE_JSON)) {
      return true;
    }
  } catch {
    // silent catch
  }

  if (
    !path.isAbsolute(typescriptPath) ||
    path.basename(typescriptPath) !== 'package.json'
  ) {
    return false;
  }

  try {
    return Boolean(getTsgoPackage(readTsgoPackageJson(typescriptPath)));
  } catch {
    return false;
  }
}

function createTypeScriptGoSupportError(config: TypeScriptWorkerConfig, error?: unknown) {
  const message = [
    `When you enable TsCheckerRspackPlugin with \`typescript.tsgo\`, you must install \`${TYPESCRIPT_PACKAGE}@latest\` or \`${TYPESCRIPT_PREVIEW_PACKAGE}\` package.`,
  ];

  if (!isDefaultTypeScriptGoPath(config.typescriptPath)) {
    message.push(
      `If you set \`typescript.typescriptPath\`, it must be an absolute path to \`${TYPESCRIPT_PACKAGE_JSON}\` from \`${TYPESCRIPT_PACKAGE}@latest\` or \`${TYPESCRIPT_PREVIEW_PACKAGE_JSON}\`.`,
    );
  }

  if (error instanceof Error && error.message) {
    message.push(`Failed to resolve the tsgo executable: ${error.message}`);
  }

  message.push(
    `You can install it with \`npm add ${TYPESCRIPT_PACKAGE}@latest -D\` or \`npm add ${TYPESCRIPT_PREVIEW_PACKAGE} -D\`.`,
  );

  return new Error(message.join(os.EOL));
}

function assertTypeScriptGoSupport(config: TypeScriptWorkerConfig) {
  try {
    const tsgoPackageJsonPath = resolveTypeScriptGoPackageJsonPath(config);
    const getExePathPath = path.resolve(
      path.dirname(tsgoPackageJsonPath),
      './lib/getExePath.js',
    );

    if (!fs.existsSync(getExePathPath)) {
      throw new Error();
    }
  } catch (error) {
    throw createTypeScriptGoSupportError(config, error);
  }
}

async function assertTypeScriptGoExecutable(config: TypeScriptWorkerConfig) {
  try {
    await resolveTypeScriptGoBinPath(config);
  } catch (error) {
    throw createTypeScriptGoSupportError(config, error);
  }
}

function assertTypeScriptSupport(config: TypeScriptWorkerConfig) {
  if (config.tsgo) {
    assertTypeScriptGoSupport(config);
  } else {
    if (path.basename(config.typescriptPath) === 'package.json') {
      throw new Error(
        "When you use TsCheckerRspackPlugin without `typescript.tsgo`, `typescript.typescriptPath` should point to a path like `require.resolve('typescript')`.",
      );
    }

    let typescriptVersion: string | undefined;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      typescriptVersion = require(config.typescriptPath).version;
    } catch {
      // silent catch
    }

    if (!typescriptVersion) {
      throw new Error(
        'When you use TsCheckerRspackPlugin with typescript reporter enabled, you must install `typescript` package.',
      );
    }
  }

  if (!fs.existsSync(config.configFile)) {
    throw new Error(
      [
        `Cannot find the "${config.configFile}" file.`,
        `Please check Rspack and TsCheckerRspackPlugin configuration.`,
        `Possible errors:`,
        '  - wrong `context` directory in Rspack configuration (if `configFile` is not set or is a relative path in the fork plugin configuration)',
        '  - wrong `typescript.configFile` path in the plugin configuration (should be a relative or absolute path)',
      ].join(os.EOL),
    );
  }
}

export { assertTypeScriptGoExecutable, assertTypeScriptSupport };
