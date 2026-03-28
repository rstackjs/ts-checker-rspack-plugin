import { SyncHook, SyncWaterfallHook, AsyncSeriesWaterfallHook } from '@rspack/lite-tapable';
import type * as rspack from '@rspack/core';

import type { FilesChange } from './files-change';
import type { Issue } from './issue';

const compilerHookMap = new WeakMap<
  rspack.Compiler | rspack.MultiCompiler,
  TsCheckerRspackPluginHooks
>();

function createPluginHooks() {
  return {
    start: new AsyncSeriesWaterfallHook<[FilesChange, rspack.Compilation]>([
      'change',
      'compilation',
    ]),
    waiting: new SyncHook<[rspack.Compilation]>(['compilation']),
    canceled: new SyncHook<[rspack.Compilation]>(['compilation']),
    error: new SyncHook<[unknown, rspack.Compilation]>(['error', 'compilation']),
    issues: new SyncWaterfallHook<[Issue[], rspack.Compilation | undefined], void>([
      'issues',
      'compilation',
    ]),
  };
}

type TsCheckerRspackPluginHooks = ReturnType<typeof createPluginHooks>;

function forwardPluginHooks(
  source: TsCheckerRspackPluginHooks,
  target: TsCheckerRspackPluginHooks
) {
  source.start.tapPromise('TsCheckerRspackPlugin', target.start.promise);
  source.waiting.tap('TsCheckerRspackPlugin', target.waiting.call);
  source.canceled.tap('TsCheckerRspackPlugin', target.canceled.call);
  source.error.tap('TsCheckerRspackPlugin', target.error.call);
  source.issues.tap('TsCheckerRspackPlugin', target.issues.call);
}

function getPluginHooks(compiler: rspack.Compiler | rspack.MultiCompiler) {
  let hooks = compilerHookMap.get(compiler);
  if (hooks === undefined) {
    hooks = createPluginHooks();
    compilerHookMap.set(compiler, hooks);

    // proxy hooks for multi-compiler
    if ('compilers' in compiler) {
      compiler.compilers.forEach((childCompiler) => {
        const childHooks = getPluginHooks(childCompiler);

        if (hooks) {
          forwardPluginHooks(childHooks, hooks);
        }
      });
    }
  }
  return hooks;
}

export { getPluginHooks };

export type { TsCheckerRspackPluginHooks };
