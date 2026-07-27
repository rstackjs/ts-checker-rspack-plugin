import type * as rspack from '@rspack/core';

import type { FilesChange } from '../files-change';
import { aggregateFilesChanges, consumeFilesChange } from '../files-change';
import { getInfrastructureLogger } from '../infrastructure-logger';
import type { TsCheckerRspackPluginConfig } from '../plugin-config';
import { getPluginHooks } from '../plugin-hooks';
import { dependenciesPool, issuesPool } from '../plugin-pools';
import type { TsCheckerRspackPluginState } from '../plugin-state';
import type { RpcWorker } from '../rpc';
import type { GetDependenciesWorker } from '../typescript/worker/get-dependencies-worker';
import type { GetIssuesWorker } from '../typescript/worker/get-issues-worker';

import { interceptDoneToGetDevServerTap } from './intercept-done-to-get-dev-server-tap';
import { tapAfterCompileToGetIssues } from './tap-after-compile-to-get-issues';
import { tapDoneToAsyncGetIssues } from './tap-done-to-async-get-issues';

function tapStartToRunWorkers(
  compiler: rspack.Compiler,
  getIssuesWorker: RpcWorker<GetIssuesWorker>,
  getDependenciesWorker: RpcWorker<GetDependenciesWorker>,
  config: TsCheckerRspackPluginConfig,
  state: TsCheckerRspackPluginState,
) {
  const hooks = getPluginHooks(compiler);
  const { log, debug } = getInfrastructureLogger(compiler);

  compiler.hooks.run.tap('TsCheckerRspackPlugin', () => {
    if (!state.initialized) {
      debug('Initializing plugin for single run (not async).');
      state.initialized = true;

      state.watching = false;
      tapAfterCompileToGetIssues(compiler, config, state);
    }
  });

  compiler.hooks.watchRun.tap('TsCheckerRspackPlugin', async () => {
    if (!state.initialized) {
      state.initialized = true;

      state.watching = true;
      if (config.async) {
        debug('Initializing plugin for watch run (async).');

        tapDoneToAsyncGetIssues(compiler, config, state);
        interceptDoneToGetDevServerTap(compiler, config, state);
      } else {
        debug('Initializing plugin for watch run (not async).');

        tapAfterCompileToGetIssues(compiler, config, state);
      }
    }
  });

  compiler.hooks.compilation.tap('TsCheckerRspackPlugin', async (compilation) => {
    if (compilation.compiler !== compiler) {
      // run only for the compiler that the plugin was registered for
      return;
    }

    // get current iteration number
    const iteration = ++state.iteration;

    // abort previous iteration
    if (state.abortController) {
      debug(`Aborting iteration ${iteration - 1}.`);
      state.abortController.abort();
    }

    // create new abort controller for the new iteration
    const abortController = new AbortController();
    state.abortController = abortController;

    let filesChange: FilesChange = {};

    if (state.watching) {
      filesChange = consumeFilesChange(compiler);
      log(
        [
          'Calling reporter service for incremental check.',
          `  Changed files: ${JSON.stringify(filesChange.changedFiles)}`,
          `  Deleted files: ${JSON.stringify(filesChange.deletedFiles)}`,
        ].join('\n'),
      );
    } else {
      log('Calling reporter service for single check.');
    }

    filesChange = await hooks.start.promise(filesChange, compilation);
    let aggregatedFilesChange = filesChange;
    if (state.aggregatedFilesChange) {
      aggregatedFilesChange = aggregateFilesChanges([aggregatedFilesChange, filesChange]);
      debug(
        [
          `Aggregating with previous files change, iteration ${iteration}.`,
          `  Changed files: ${JSON.stringify(aggregatedFilesChange.changedFiles)}`,
          `  Deleted files: ${JSON.stringify(aggregatedFilesChange.deletedFiles)}`,
        ].join('\n'),
      );
    }
    state.aggregatedFilesChange = aggregatedFilesChange;
    const reuseIssuesWorkerForDependencies = !state.watching || !config.async;

    // submit one at a time for a single compiler
    const workerResultPromise = (state.issuesPromise || Promise.resolve())
      // resolve to undefined on error
      .catch(() => undefined)
      .then(() => {
        // early return
        if (abortController.signal.aborted) {
          return undefined;
        }

        debug(`Submitting the getIssuesWorker to the pool, iteration ${iteration}.`);
        return issuesPool.submit(async () => {
          try {
            debug(`Running the getIssuesWorker, iteration ${iteration}.`);
            const result = await getIssuesWorker(
              aggregatedFilesChange,
              state.watching,
              config.issue.defaultSeverity,
              // Non-watch and synchronous watch builds already wait for diagnostics.
              // Returning the dependencies here avoids starting a second worker.
              reuseIssuesWorkerForDependencies,
            );
            if (state.aggregatedFilesChange === aggregatedFilesChange) {
              state.aggregatedFilesChange = undefined;
            }
            if (state.abortController === abortController) {
              state.abortController = undefined;
            }
            return result;
          } catch (error) {
            hooks.error.call(error, compilation);
            return undefined;
          } finally {
            debug(`The getIssuesWorker finished its job, iteration ${iteration}.`);
          }
        }, abortController.signal);
      });

    state.issuesPromise = workerResultPromise.then((result) => result?.issues);

    if (reuseIssuesWorkerForDependencies) {
      debug(`Reusing dependencies from the getIssuesWorker, iteration ${iteration}.`);
      state.dependenciesPromise = workerResultPromise.then((result) => result?.dependencies);
      return;
    }

    // Keep dependency collection independent in async watch mode so diagnostics
    // can finish after the compilation without delaying dependency registration.
    debug(`Submitting the getDependenciesWorker to the pool, iteration ${iteration}.`);
    state.dependenciesPromise = dependenciesPool.submit(async () => {
      try {
        debug(`Running the getDependenciesWorker, iteration ${iteration}.`);
        return await getDependenciesWorker(filesChange);
      } catch (error) {
        hooks.error.call(error, compilation);
        return undefined;
      } finally {
        debug(`The getDependenciesWorker finished its job, iteration ${iteration}.`);
      }
    }); // don't pass abortController.signal because getDependencies() is blocking
  });
}

export { tapStartToRunWorkers };
