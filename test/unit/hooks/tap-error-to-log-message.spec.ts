import type { Compiler } from '@rspack/core';

import { tapErrorToLogMessage } from 'src/hooks/tap-error-to-log-message';
import type { TsCheckerRspackPluginConfig } from 'src/plugin-config';
import { getPluginHooks } from 'src/plugin-hooks';
import { RpcExitError } from 'src/rpc';

describe('hooks/tap-error-to-log-message', () => {
  it.each([
    {
      signal: 'SIGTERM',
      expected: 'Issues checking service aborted - probably out of memory.',
    },
    {
      signal: 'SIGINT',
      expected:
        'Issues checking service interrupted - If running in a docker container',
    },
  ])('logs actionable worker exit guidance for $signal', ({ signal, expected }) => {
    const compiler = {} as Compiler;
    const errors: string[] = [];
    const config = {
      logger: {
        error: (message: string) => errors.push(message),
        log: () => {},
      },
    } as TsCheckerRspackPluginConfig;

    tapErrorToLogMessage(compiler, config);
    getPluginHooks(compiler).error.call(
      new RpcExitError('worker exited', null, signal),
      undefined as never,
    );

    expect(errors[0]).toBe('RpcExitError: worker exited');
    expect(errors[1]).toContain(expected);
    expect(errors[1]).toContain('memoryLimit');
  });
});
