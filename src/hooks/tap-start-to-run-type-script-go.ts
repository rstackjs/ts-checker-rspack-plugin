import type * as rspack from '@rspack/core';

import type { FilesChange } from '../files-change';
import { aggregateFilesChanges, consumeFilesChange } from '../files-change';
import { getInfrastructureLogger } from '../infrastructure-logger';
import type { TsCheckerRspackPluginConfig } from '../plugin-config';
import { getPluginHooks } from '../plugin-hooks';
import { issuesPool } from '../plugin-pools';
import type { TsCheckerRspackPluginState } from '../plugin-state';
import { assertTypeScriptGoExecutable } from '../typescript/type-script-support';
import {
  getTypeScriptGoDependencies,
  isTypeScriptGoStatsError,
  runTypeScriptGo,
} from '../typescript/type-script-go-runner';

import { interceptDoneToGetDevServerTap } from './intercept-done-to-get-dev-server-tap';
import { tapAfterCompileToGetIssues } from './tap-after-compile-to-get-issues';
import { tapDoneToAsyncGetIssues } from './tap-done-to-async-get-issues';

const hiddenTypeScriptGoErrors = Symbol('hiddenTypeScriptGoErrors');

type StatsCompilationWithHiddenErrors = Record<PropertyKey, any>;

type ErrorsInChildrenPrintContext = {
  compilation: StatsCompilationWithHiddenErrors;
  red: (value: string) => string;
};

type StatsFilterHook = {
  tap: (name: string, fn: (error: unknown) => false | undefined) => void;
};

type StatsPrintHook<TContext> = {
  tap: (name: string, fn: (_: unknown, context: TContext) => string | undefined) => void;
};

function getStatsFilterHook(hook: unknown): StatsFilterHook {
  return hook as StatsFilterHook;
}

function getStatsPrintHook<TContext>(hook: unknown): StatsPrintHook<TContext> {
  return hook as StatsPrintHook<TContext>;
}

function tapStartToRunTypeScriptGo(
  compiler: rspack.Compiler,
  config: TsCheckerRspackPluginConfig,
  state: TsCheckerRspackPluginState,
) {
  const hooks = getPluginHooks(compiler);
  const { log, debug } = getInfrastructureLogger(compiler);
  let assertTypeScriptGoExecutablePromise: Promise<void> | undefined;

  const assertTypeScriptGoExecutableOnce = async () => {
    try {
      if (!assertTypeScriptGoExecutablePromise) {
        assertTypeScriptGoExecutablePromise = assertTypeScriptGoExecutable(config.typescript);
      }
      await assertTypeScriptGoExecutablePromise;
    } catch (error) {
      assertTypeScriptGoExecutablePromise = undefined;
      throw error;
    }
  };

  compiler.hooks.run.tapPromise('TsCheckerRspackPlugin', async () => {
    if (!state.initialized) {
      await assertTypeScriptGoExecutableOnce();

      debug('Initializing tsgo for single run (not async).');
      state.initialized = true;

      state.watching = false;
      tapAfterCompileToGetIssues(compiler, config, state);
    }
  });

  compiler.hooks.watchRun.tapPromise('TsCheckerRspackPlugin', async () => {
    if (!state.initialized) {
      await assertTypeScriptGoExecutableOnce();

      state.initialized = true;

      state.watching = true;
      if (config.async) {
        debug('Initializing tsgo for watch run (async).');

        tapDoneToAsyncGetIssues(compiler, config, state);
        interceptDoneToGetDevServerTap(compiler, config, state);
      } else {
        debug('Initializing tsgo for watch run (not async).');

        tapAfterCompileToGetIssues(compiler, config, state);
      }
    }
  });

  compiler.hooks.compilation.tap('TsCheckerRspackPlugin', async (compilation) => {
    if (compilation.compiler !== compiler) {
      // run only for the compiler that the plugin was registered for
      return;
    }

    compilation.hooks.statsFactory.tap('TsCheckerRspackPlugin', (stats) => {
      const errorsFilter = getStatsFilterHook(stats.hooks.filter.for('compilation.errors'));

      errorsFilter.tap('TsCheckerRspackPlugin', (error) =>
        isTypeScriptGoStatsError(error) ? false : undefined,
      );

      stats.hooks.result
        .for('compilation')
        .tap('TsCheckerRspackPlugin', (statsCompilation, context) => {
          const hiddenErrorsCount =
            context.cachedGetErrors?.(context.compilation).filter(isTypeScriptGoStatsError)
              .length || 0;

          if (hiddenErrorsCount) {
            Object.defineProperty(statsCompilation, hiddenTypeScriptGoErrors, {
              value: hiddenErrorsCount,
            });
          }

          return statsCompilation;
        });
    });

    compilation.hooks.statsPrinter.tap('TsCheckerRspackPlugin', (stats) => {
      const errorsInChildrenPrinter = getStatsPrintHook<ErrorsInChildrenPrintContext>(
        stats.hooks.print.for('compilation.errorsInChildren!'),
      );

      errorsInChildrenPrinter.tap('TsCheckerRspackPlugin', (_, { compilation, red }) => {
        const hiddenErrorsCount = compilation[hiddenTypeScriptGoErrors] || 0;

        if (
          !hiddenErrorsCount ||
          compilation.children ||
          !compilation.errorsCount ||
          !compilation.errors
        ) {
          return undefined;
        }

        const childErrorsCount =
          compilation.errorsCount - compilation.errors.length - hiddenErrorsCount;

        if (childErrorsCount <= 0) {
          return '';
        }

        const childErrorsLabel = childErrorsCount === 1 ? 'ERROR' : 'ERRORS';
        const childErrorsMessage =
          `${childErrorsCount} ${childErrorsLabel} in child compilations ` +
          "(Use 'stats.children: true' resp. '--stats-children' for more details)";

        return red(childErrorsMessage);
      });
    });

    const iteration = ++state.iteration;

    if (state.abortController) {
      debug(`Aborting tsgo iteration ${iteration - 1}.`);
      state.abortController.abort();
    }

    const abortController = new AbortController();
    state.abortController = abortController;

    let filesChange: FilesChange = {};

    if (state.watching) {
      filesChange = consumeFilesChange(compiler);
      // This mirrors the existing reporter infrastructure log and is only visible
      // when infrastructureLogging enables TsCheckerRspackPlugin logs.
      log(
        [
          'Calling tsgo for incremental check.',
          `  Changed files: ${JSON.stringify(filesChange.changedFiles)}`,
          `  Deleted files: ${JSON.stringify(filesChange.deletedFiles)}`,
        ].join('\n'),
      );
    } else {
      log('Calling tsgo for single check.');
    }

    state.dependenciesPromise = Promise.resolve(getTypeScriptGoDependencies(config.typescript));

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

    state.issuesPromise = (state.issuesPromise || Promise.resolve())
      .catch(() => undefined)
      .then(() => {
        if (abortController.signal.aborted) {
          return undefined;
        }

        debug(`Submitting tsgo to the pool, iteration ${iteration}.`);
        return issuesPool.submit(async (signal) => {
          try {
            debug(`Running tsgo, iteration ${iteration}.`);
            const issues = await runTypeScriptGo(
              config.typescript,
              config.logger,
              config.issue.defaultSeverity,
              signal,
            );
            if (state.aggregatedFilesChange === aggregatedFilesChange) {
              state.aggregatedFilesChange = undefined;
            }
            if (state.abortController === abortController) {
              state.abortController = undefined;
            }
            return issues;
          } catch (error) {
            hooks.error.call(error, compilation);
            return undefined;
          } finally {
            debug(`tsgo finished its job, iteration ${iteration}.`);
          }
        }, abortController.signal);
      });
  });

  const abortTypeScriptGo = () => {
    if (state.abortController) {
      debug('Compiler is going to close - terminating tsgo...');
      state.abortController.abort();
      state.abortController = undefined;
    }
  };

  compiler.hooks.watchClose.tap('TsCheckerRspackPlugin', abortTypeScriptGo);

  compiler.hooks.failed.tap('TsCheckerRspackPlugin', () => {
    if (!state.watching) {
      abortTypeScriptGo();
    }
  });
}

export { tapStartToRunTypeScriptGo };
