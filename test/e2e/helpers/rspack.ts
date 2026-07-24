import { resolve } from 'node:path';

import {
  rspack,
  type Compiler,
  type Configuration,
  type MultiStats,
  type Stats,
  type Watching,
} from '@rspack/core';

import { TsCheckerRspackPlugin } from '../../../lib';

export interface RecordedIssue {
  code: string;
  file?: string;
  message: string;
  severity: string;
}

export interface RecordedFilesChange {
  changedFiles: string[];
  deletedFiles: string[];
}

export interface RecordedIssueEvent {
  change?: RecordedFilesChange;
  issues: RecordedIssue[];
}

export interface CompilerRecorder {
  builds: Stats[];
  changes: RecordedFilesChange[];
  issues: RecordedIssue[][];
  issueEvents: RecordedIssueEvent[];
  workerErrors: unknown[];
  waitForBuildAfter(index: number, timeout?: number): Promise<Stats>;
  waitForChangesAfter(
    index: number,
    predicate: (change: RecordedFilesChange) => boolean,
    timeout?: number,
  ): Promise<RecordedFilesChange>;
  waitForIssuesAfter(
    index: number,
    predicate: (issues: RecordedIssue[]) => boolean,
    timeout?: number,
  ): Promise<RecordedIssue[]>;
  waitForIssueEventAfter(
    index: number,
    predicate: (event: RecordedIssueEvent) => boolean,
    timeout?: number,
  ): Promise<RecordedIssueEvent>;
}

export const typeScriptRule = {
  test: /\.tsx?$/,
  loader: 'builtin:swc-loader',
  options: {
    jsc: {
      parser: {
        syntax: 'typescript',
      },
    },
  },
};

export function createRspackConfig(
  root: string,
  plugin: TsCheckerRspackPlugin,
  overrides: Configuration = {},
): Configuration {
  const base: Configuration = {
    context: root,
    mode: 'development',
    entry: './src/index.ts',
    cache: false,
    devtool: false,
    module: {
      rules: [typeScriptRule],
    },
    output: {
      clean: true,
      filename: 'main.js',
      path: resolve(root, 'rspack-dist'),
    },
    plugins: [plugin],
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
    },
  };

  return {
    ...base,
    ...overrides,
    module: {
      ...base.module,
      ...overrides.module,
      rules: overrides.module?.rules || base.module?.rules,
    },
    output: {
      ...base.output,
      ...overrides.output,
    },
    resolve: {
      ...base.resolve,
      ...overrides.resolve,
    },
  };
}

export function createCompiler(config: Configuration): Compiler {
  const compiler = rspack(config);

  if ('compilers' in compiler) {
    throw new Error('The e2e harness does not support multi-compiler configurations.');
  }

  return compiler;
}

export function recordCompiler(compiler: Compiler): CompilerRecorder {
  const builds: Stats[] = [];
  const changes: RecordedFilesChange[] = [];
  const issues: RecordedIssue[][] = [];
  const issueEvents: RecordedIssueEvent[] = [];
  const workerErrors: unknown[] = [];
  const hooks = TsCheckerRspackPlugin.getCompilerHooks(compiler);
  const compilationChanges = new WeakMap<object, RecordedFilesChange>();

  compiler.hooks.done.tap('TsCheckerRspackPluginE2ERecorder', (stats) => {
    builds.push(stats);
  });
  hooks.start.tapPromise(
    'TsCheckerRspackPluginE2ERecorder',
    async (filesChange, compilation) => {
      const recordedChange = {
        changedFiles: [...(filesChange.changedFiles || [])],
        deletedFiles: [...(filesChange.deletedFiles || [])],
      };
      changes.push(recordedChange);
      compilationChanges.set(compilation, recordedChange);
      return filesChange;
    },
  );
  hooks.issues.tap('TsCheckerRspackPluginE2ERecorder', (nextIssues, compilation) => {
    const recordedIssues = nextIssues.map((issue) => ({
      code: issue.code,
      file: issue.file,
      message: issue.message,
      severity: issue.severity,
    }));
    issues.push(recordedIssues);
    issueEvents.push({
      change: compilation
        ? compilationChanges.get(compilation)
        : undefined,
      issues: recordedIssues,
    });
    return nextIssues;
  });
  hooks.error.tap('TsCheckerRspackPluginE2ERecorder', (error) => {
    workerErrors.push(error);
  });

  return {
    builds,
    changes,
    issues,
    issueEvents,
    workerErrors,
    waitForBuildAfter: (index, timeout) =>
      waitForValue(
        () => builds.slice(index).at(0),
        `a compilation after build ${index}`,
        timeout,
      ),
    waitForChangesAfter: (index, predicate, timeout) =>
      waitForValue(
        () => changes.slice(index).find(predicate),
        `a file-change event after event ${index}`,
        timeout,
      ),
    waitForIssuesAfter: (index, predicate, timeout) =>
      waitForValue(
        () => issues.slice(index).find(predicate),
        `an issue event after event ${index}`,
        timeout,
      ),
    waitForIssueEventAfter: (index, predicate, timeout) =>
      waitForValue(
        () => issueEvents.slice(index).find(predicate),
        `a correlated issue event after event ${index}`,
        timeout,
      ),
  };
}

export async function runCompiler(compiler: Compiler): Promise<Stats> {
  return new Promise((resolveRun, rejectRun) => {
    compiler.run((error, stats) => {
      if (error) {
        rejectRun(error);
      } else if (!stats || isMultiStats(stats)) {
        rejectRun(new Error('Rspack did not return single-compiler stats.'));
      } else {
        resolveRun(stats);
      }
    });
  });
}

export function watchCompiler(compiler: Compiler): {
  watching: Watching;
  fatalErrors: Error[];
} {
  const fatalErrors: Error[] = [];
  const watching = compiler.watch(compiler.options.watchOptions || {}, (error) => {
    if (error) {
      fatalErrors.push(error);
    }
  });

  return { watching, fatalErrors };
}

export async function closeWatching(watching: Watching): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    watching.close((error) => {
      if (error) {
        rejectClose(error);
      } else {
        resolveClose();
      }
    });
  });
}

export async function closeCompiler(compiler: Compiler): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    compiler.close((error) => {
      if (error) {
        rejectClose(error);
      } else {
        resolveClose();
      }
    });
  });
}

export function getStatsMessages(stats: Stats): {
  errors: string[];
  warnings: string[];
} {
  const json = stats.toJson({
    all: false,
    errors: true,
    errorDetails: true,
    warnings: true,
  });

  return {
    errors: (json.errors || []).map((error) =>
      typeof error === 'string' ? error : error.message || String(error),
    ),
    warnings: (json.warnings || []).map((warning) =>
      typeof warning === 'string' ? warning : warning.message || String(warning),
    ),
  };
}

async function waitForValue<T>(
  getValue: () => T | undefined,
  description: string,
  timeout = 20_000,
): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const value = getValue();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }

  throw new Error(`Timed out after ${timeout}ms waiting for ${description}.`);
}

function isMultiStats(stats: Stats | MultiStats): stats is MultiStats {
  return 'stats' in stats;
}
