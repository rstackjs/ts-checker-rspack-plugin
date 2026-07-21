import { rspack } from '@rspack/core';

import { interceptDoneToGetDevServerTap } from 'src/hooks/intercept-done-to-get-dev-server-tap';
import type { TsCheckerRspackPluginConfig } from 'src/plugin-config';
import { createPluginState } from 'src/plugin-state';

describe('interceptDoneToGetDevServerTap', () => {
  it('captures the rspack-dev-server done tap', () => {
    const compiler = rspack({});
    const state = createPluginState();

    interceptDoneToGetDevServerTap(
      compiler,
      { devServer: true } as TsCheckerRspackPluginConfig,
      state,
    );

    const done = () => {};
    compiler.hooks.done.tap('rspack-dev-server', done);

    expect(state.DevServerDoneTap?.name).toBe('rspack-dev-server');
    expect(state.DevServerDoneTap?.fn).toBe(done);
  });
});
