import type * as rspack from '@rspack/core';

import { getInfrastructureLogger } from '../infrastructure-logger';
import type { TsCheckerRspackPluginState } from '../plugin-state';
import type { RpcWorker } from '../rpc';

function tapStopToTerminateWorkers(
  compiler: rspack.Compiler,
  getIssuesWorker: RpcWorker,
  getDependenciesWorker: RpcWorker,
  state: TsCheckerRspackPluginState,
) {
  const { debug } = getInfrastructureLogger(compiler);

  const terminateWorkers = () => {
    debug('Compiler is going to close - terminating workers...');
    getIssuesWorker.terminate();
    getDependenciesWorker.terminate();
  };

  compiler.hooks.watchClose.tap('TsCheckerRspackPlugin', () => {
    terminateWorkers();
  });

  compiler.hooks.done.tap('TsCheckerRspackPlugin', () => {
    if (!state.watching) {
      terminateWorkers();
    }
  });

  compiler.hooks.failed.tap('TsCheckerRspackPlugin', () => {
    if (!state.watching) {
      terminateWorkers();
    }
  });
}

export { tapStopToTerminateWorkers };
