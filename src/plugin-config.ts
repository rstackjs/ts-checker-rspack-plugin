import type * as rspack from '@rspack/core';

import type { FormatterConfig } from './formatter';
import { createFormatterConfig } from './formatter';
import { getInfrastructureLogger } from './infrastructure-logger';
import type { IssueConfig } from './issue/issue-config';
import { createIssueConfig } from './issue/issue-config';
import type { Logger } from './logger';
import type { TsCheckerRspackPluginOptions } from './plugin-options';
import type { TypeScriptWorkerConfig } from './typescript/type-script-worker-config';
import { createTypeScriptWorkerConfig } from './typescript/type-script-worker-config';

interface TsCheckerRspackPluginConfig {
  async: boolean;
  typescript: TypeScriptWorkerConfig;
  issue: IssueConfig;
  formatter: FormatterConfig;
  logger: Logger;
  devServer: boolean;
}

function createPluginConfig(
  compiler: rspack.Compiler,
  options: TsCheckerRspackPluginOptions = {}
): TsCheckerRspackPluginConfig {
  return {
    async: options.async === undefined ? compiler.options.mode === 'development' : options.async,
    typescript: createTypeScriptWorkerConfig(compiler, options.typescript),
    issue: createIssueConfig(compiler, options.issue),
    formatter: createFormatterConfig(options.formatter),
    logger:
      options.logger === 'webpack-infrastructure'
        ? (() => {
            const { info, error } = getInfrastructureLogger(compiler);

            return {
              log: info,
              error,
            };
          })()
        : options.logger || console,
    devServer: options.devServer !== false,
  };
}

export { createPluginConfig };

export type { TsCheckerRspackPluginConfig };
