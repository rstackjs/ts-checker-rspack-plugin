import type * as rspack from '@rspack/core';

import { getInfrastructureLogger } from '../infrastructure-logger';
import type { TsCheckerRspackPluginState } from '../plugin-state';
import { InclusiveNodeWatchFileSystem } from '../watch/inclusive-node-watch-file-system';
import type { WatchFileSystem } from '../watch/watch-file-system';

function tapAfterEnvironmentToPatchWatching(
  compiler: rspack.Compiler,
  state: TsCheckerRspackPluginState,
) {
  const { debug } = getInfrastructureLogger(compiler);

  compiler.hooks.afterEnvironment.tap('TsCheckerRspackPlugin', () => {
    const watchFileSystem = compiler.watchFileSystem;
    if (watchFileSystem) {
      debug("Overwriting Rspack's watch file system.");
      // wrap original watch file system
      compiler.watchFileSystem = new InclusiveNodeWatchFileSystem(
        // we use some internals here
        watchFileSystem as WatchFileSystem,
        compiler,
        state,
      );
    } else {
      debug('No watch file system found - plugin may not work correctly.');
    }
  });
}

export { tapAfterEnvironmentToPatchWatching };
