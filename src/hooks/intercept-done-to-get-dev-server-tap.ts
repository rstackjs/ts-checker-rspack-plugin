import type * as rspack from '@rspack/core';

import { getInfrastructureLogger } from '../infrastructure-logger';
import type { TsCheckerRspackPluginConfig } from '../plugin-config';
import type { TsCheckerRspackPluginState } from '../plugin-state';

function interceptDoneToGetDevServerTap(
  compiler: rspack.Compiler,
  config: TsCheckerRspackPluginConfig,
  state: TsCheckerRspackPluginState,
) {
  const { debug } = getInfrastructureLogger(compiler);

  // inspired by https://github.com/ypresto/fork-ts-checker-async-overlay-webpack-plugin
  compiler.hooks.done.intercept({
    register: (tap) => {
      if (
        ['webpack-dev-server', 'rsbuild-dev-server', 'rspack-dev-server'].includes(tap.name) &&
        tap.type === 'sync' &&
        config.devServer
      ) {
        debug('Intercepting dev-server tap.');
        state.DevServerDoneTap = tap;
      }
      return tap;
    },
  });
}

export { interceptDoneToGetDevServerTap };
