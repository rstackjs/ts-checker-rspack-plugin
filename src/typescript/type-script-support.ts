import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

import type { TypeScriptWorkerConfig } from './type-script-worker-config';
import { TYPESCRIPT_GO_PACKAGE, TYPESCRIPT_GO_PACKAGE_JSON } from './type-script-go-constants';
import { resolveTypeScriptGoPackageJsonPath } from './type-script-go-runner';

function isDefaultTypeScriptGoPath(typescriptPath: string): boolean {
  if (typescriptPath === TYPESCRIPT_GO_PACKAGE_JSON) {
    return true;
  }

  try {
    return typescriptPath === require.resolve(TYPESCRIPT_GO_PACKAGE_JSON);
  } catch {
    return false;
  }
}

function assertTypeScriptGoSupport(config: TypeScriptWorkerConfig) {
  try {
    const tsgoPackageJsonPath = resolveTypeScriptGoPackageJsonPath(config);
    const getExePathPath = path.resolve(path.dirname(tsgoPackageJsonPath), './lib/getExePath.js');

    if (!fs.existsSync(getExePathPath)) {
      throw new Error();
    }
  } catch {
    const message = [
      `When you enable TsCheckerRspackPlugin with \`typescript.tsgo\`, you must install \`${TYPESCRIPT_GO_PACKAGE}\` package.`,
    ];

    if (!isDefaultTypeScriptGoPath(config.typescriptPath)) {
      message.push(
        `If you set \`typescript.typescriptPath\`, it must be an absolute path to \`${TYPESCRIPT_GO_PACKAGE_JSON}\`.`,
      );
    }

    message.push(`You can install it with \`npm add ${TYPESCRIPT_GO_PACKAGE} -D\`.`);

    throw new Error(message.join(os.EOL));
  }
}

function assertTypeScriptSupport(config: TypeScriptWorkerConfig) {
  if (config.tsgo) {
    assertTypeScriptGoSupport(config);
  } else {
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

export { assertTypeScriptSupport };
