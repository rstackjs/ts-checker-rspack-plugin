import type * as rspack from '@rspack/core';
import { getInfrastructureLogger } from '../infrastructure-logger';
import type { TsCheckerRspackPluginConfig } from '../plugin-config';
import type { TsCheckerRspackPluginState } from '../plugin-state';
import { sep } from 'node:path';

const addTrailingSep = (dir: string) => (dir.endsWith(sep) ? dir : dir + sep);

const isStrictSubdir = (parent: string, child: string) => {
  const parentDir = addTrailingSep(parent);
  const childDir = addTrailingSep(child);
  return parentDir !== childDir && childDir.startsWith(parentDir);
};

/**
 * Excludes the Rspack output directory from watched dependencies
 * when the entire project is being watched.
 *
 * If `writeToDisk` is enabled and the build output path is not ignored,
 * emitted files in `output.path` may leading to an infinite rebuild loop.
 **/
function excludeOutputPath(
  dependencies: NonNullable<TsCheckerRspackPluginState['lastDependencies']>,
  compiler: rspack.Compiler,
) {
  const isContextIncluded = dependencies.dirs.includes(compiler.context);
  if (!isContextIncluded) {
    return dependencies;
  }

  const outputPath =
    typeof compiler.options.output?.path === 'string'
      ? compiler.options.output.path
      : compiler.outputPath;
  if (
    !outputPath ||
    // If output path is not a subdir of context, no need to exclude it
    !isStrictSubdir(compiler.context, outputPath) ||
    // If output path is explicitly included in dirs, should not exclude it
    dependencies.dirs.includes(outputPath)
  ) {
    return dependencies;
  }

  const excluded = new Set(dependencies.excluded);
  excluded.add(outputPath);

  return {
    ...dependencies,
    excluded: Array.from(excluded),
  };
}

function tapAfterCompileToAddDependencies(
  compiler: rspack.Compiler,
  config: TsCheckerRspackPluginConfig,
  state: TsCheckerRspackPluginState,
) {
  const { debug } = getInfrastructureLogger(compiler);

  compiler.hooks.afterCompile.tapPromise('TsCheckerRspackPlugin', async (compilation) => {
    if (compilation.compiler !== compiler) {
      // run only for the compiler that the plugin was registered for
      return;
    }

    const dependencies = await state.dependenciesPromise;

    debug(`Got dependencies from the getDependenciesWorker.`, dependencies);
    if (dependencies) {
      const sanitizedDependencies = excludeOutputPath(dependencies, compiler);
      state.lastDependencies = sanitizedDependencies;

      sanitizedDependencies.files.forEach((file) => {
        compilation.fileDependencies.add(file);
      });
    }
  });
}

export { tapAfterCompileToAddDependencies };
