import { AsyncSeriesHook, SyncHook } from '@rspack/lite-tapable';
import type { Compilation, Compiler } from '@rspack/core';

import { updateFilesChange } from 'src/files-change';
import { tapStartToRunTypeScriptGo } from 'src/hooks/tap-start-to-run-type-script-go';
import type { TsCheckerRspackPluginConfig } from 'src/plugin-config';
import { getPluginHooks } from 'src/plugin-hooks';
import { createPluginState } from 'src/plugin-state';
import { getTypeScriptGoDependencies, runTypeScriptGo } from 'src/typescript/type-script-go-runner';

rs.mock('src/typescript/type-script-go-runner', () => ({
  getTypeScriptGoDependencies: rs.fn(),
  runTypeScriptGo: rs.fn(),
  shouldRefreshTypeScriptGoDependencies: rs.fn(() => false),
  isTypeScriptGoStatsError: rs.fn(() => false),
}));

const issue = {
  code: 'TS2322',
  severity: 'error' as const,
  message: 'Type string is not assignable to type number.',
};

function setup() {
  const logger = { log: rs.fn(), debug: rs.fn(), error: rs.fn(), warn: rs.fn(), info: rs.fn() };
  const compiler = {
    hooks: {
      run: new AsyncSeriesHook<[]>([]),
      watchRun: new AsyncSeriesHook<[]>([]),
      compilation: new SyncHook(['compilation']),
      watchClose: new SyncHook<[]>([]),
      failed: new SyncHook(['error']),
    },
    getInfrastructureLogger: () => logger,
    modifiedFiles: new Set<string>(),
    removedFiles: new Set<string>(),
  } as unknown as Compiler;
  const dependencies = { files: ['/src/index.ts'], dirs: [], excluded: [], extensions: ['.ts'] };
  rs.mocked(getTypeScriptGoDependencies).mockResolvedValue(dependencies);
  rs.mocked(runTypeScriptGo).mockResolvedValue([issue]);
  const state = createPluginState();
  state.watching = true;
  state.lastDependencies = dependencies;
  tapStartToRunTypeScriptGo(
    compiler,
    { typescript: {}, issue: {}, logger } as unknown as TsCheckerRspackPluginConfig,
    state,
  );
  const compile = async (changedFiles: string[] = [], deletedFiles: string[] = []) => {
    updateFilesChange(compiler, { changedFiles, deletedFiles });
    const compilation = {
      compiler,
      hooks: {
        statsFactory: new SyncHook(['stats']),
        statsPrinter: new SyncHook(['stats']),
      },
    } as unknown as Compilation;
    compiler.hooks.compilation.call(compilation, {} as never);
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  return { compiler, state, compile };
}

beforeEach(() => {
  rs.clearAllMocks();
});

it.each(['css', 'scss', 'sass', 'less', 'styl'])(
  'reuses diagnostics after a .%s edit',
  async (extension) => {
    const { compile, state } = setup();
    await compile();
    const previous = state.issuesPromise;
    await expect(previous).resolves.toEqual([issue]);
    const dependencies = state.dependenciesPromise;

    await compile([`/src/style.${extension}`]);

    expect(state.issuesPromise).not.toBe(previous);
    await expect(state.issuesPromise).resolves.toEqual([issue]);
    expect(state.dependenciesPromise).toBe(dependencies);
    expect(runTypeScriptGo).toHaveBeenCalledTimes(1);
  },
);

it('keeps a pending check alive across repeated style edits', async () => {
  const { compile, state } = setup();
  let finish!: (issues: (typeof issue)[]) => void;
  rs.mocked(runTypeScriptGo).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await compile();
  const controller = state.abortController!;
  const original = state.issuesPromise;

  await compile(['/src/style.scss']);
  const firstStyle = state.issuesPromise;
  await compile(['/src/style.css']);

  expect(controller.signal.aborted).toBe(false);
  expect(state.abortController).toBe(controller);
  expect(state.issuesPromise).not.toBe(firstStyle);
  expect(state.issuesPromise).not.toBe(original);
  finish([issue]);
  await expect(state.issuesPromise).resolves.toEqual([issue]);
  expect(runTypeScriptGo).toHaveBeenCalledTimes(1);
});

it.each([
  { files: ['/src/index.ts'] },
  { files: ['/src/index.js'] },
  { files: ['/tsconfig.json'] },
  { files: ['/src/data.json'] },
  { files: ['/src/style.scss', '/src/index.ts'] },
  { files: [] },
])('checks again for $files', async ({ files }) => {
  const { compile } = setup();
  await compile();
  await compile(files);
  expect(runTypeScriptGo).toHaveBeenCalledTimes(2);
});

it('checks again for removed styles', async () => {
  const { compile } = setup();
  await compile();
  await compile([], ['/src/style.scss']);
  expect(runTypeScriptGo).toHaveBeenCalledTimes(2);
});

it('checks package changes even though the legacy change tracker filters them out', async () => {
  const { compile, compiler } = setup();
  await compile();
  compiler.modifiedFiles = new Set(['/package.json', '/src/style.scss']);
  await compile(['/package.json', '/src/style.scss']);
  expect(runTypeScriptGo).toHaveBeenCalledTimes(2);
});

it('checks styles used as explicit TypeScript dependencies', async () => {
  const { compile, state } = setup();
  await compile();
  state.lastDependencies!.files.push('/src/style.scss');
  await compile(['/src/style.scss']);
  expect(runTypeScriptGo).toHaveBeenCalledTimes(2);
});

it('continues calling custom start hooks', async () => {
  const { compile, compiler } = setup();
  const start = rs.fn((changes) => changes);
  getPluginHooks(compiler).start.tap('custom', start);
  await compile();
  await compile(['/src/style.scss']);
  expect(start).toHaveBeenCalledTimes(2);
  expect(runTypeScriptGo).toHaveBeenCalledTimes(2);
});

it('retries after the native checker fails', async () => {
  const { compile, state } = setup();
  rs.mocked(runTypeScriptGo).mockRejectedValueOnce(new Error('Cannot spawn checker'));
  await compile();
  await expect(state.issuesPromise).resolves.toBeUndefined();
  await compile(['/src/style.scss']);
  await expect(state.issuesPromise).resolves.toEqual([issue]);
  expect(runTypeScriptGo).toHaveBeenCalledTimes(2);
});

it('replaces a pending reused check when TypeScript changes', async () => {
  const { compile, state } = setup();
  rs.mocked(runTypeScriptGo).mockImplementationOnce(
    (_config, _logger, _severity, signal) =>
      new Promise((resolve) => signal!.addEventListener('abort', () => resolve([issue]))),
  );
  await compile();
  const controller = state.abortController!;
  await compile(['/src/style.scss']);
  rs.mocked(runTypeScriptGo).mockResolvedValueOnce([]);
  await compile(['/src/index.ts']);
  expect(controller.signal.aborted).toBe(true);
  await expect(state.issuesPromise).resolves.toEqual([]);
  expect(runTypeScriptGo).toHaveBeenCalledTimes(2);
});

it('does not reuse a check after a failed compilation', async () => {
  const { compile, compiler } = setup();
  await compile();
  compiler.hooks.failed.call(new Error('Build failed'));
  await compile(['/src/style.scss']);
  expect(runTypeScriptGo).toHaveBeenCalledTimes(2);
});
